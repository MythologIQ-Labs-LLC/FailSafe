#!/usr/bin/env node
// Plan infrastructure verification lint.
//
// Enforces two discipline classes:
//   - SG-PlanInfrastructureVerificationGap (Entry #287, R1+R2): every Affected
//     Files row carries NEW-VERIFIED / MODIFIED-VERIFIED / EXISTING-VERIFIED
//     to confirm file-level presence/absence.
//   - SG-PlanFitnessVerificationGap (Entry #290, R2-bis): rows that cite a
//     route, function, method, or symbol *inside* a file additionally carry
//     FITNESS-VERIFIED, backed by a grep that returns non-empty for the cited
//     shape. Closes the sink-mechanism sub-class gap (#270/#288/#289).
//
// Re-runs the cited commands and asserts each token's claim against actual
// repo state.
//
// Invocation:
//   node FailSafe/extension/scripts/plan-grep-lint.cjs --plan <path>
//
// Exit codes:
//   0 — all tokens verified; plan-text claims match repo state.
//   1 — at least one mismatch; numbered list printed to stderr.
//   2 — usage error or unparseable plan.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PLAN_PATH_RE = /^(?:\.failsafe\/governance\/plans\/plan-[\w.-]+\.md|plan-[\w.-]+\.md)$/;
const TOKEN_VOCAB = new Set([
  'NEW-VERIFIED',
  'MODIFIED-VERIFIED',
  'EXISTING-VERIFIED',
  'FITNESS-VERIFIED',
]);

function usage(msg) {
  if (msg) process.stderr.write(`plan-grep-lint: ${msg}\n`);
  process.stderr.write('usage: plan-grep-lint --plan <path-to-plan.md>\n');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { plan: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plan') {
      out.plan = argv[++i];
    } else {
      usage(`unknown arg: ${argv[i]}`);
    }
  }
  if (!out.plan) usage('missing --plan');
  if (!PLAN_PATH_RE.test(out.plan)) {
    usage(`plan path must match ${PLAN_PATH_RE} — got ${out.plan}`);
  }
  if (!fs.existsSync(out.plan)) usage(`plan file not found: ${out.plan}`);
  return out;
}

// Parses Affected Files tables from the plan body. Returns rows:
//   { path: string, op: string, command: string, token: string, line: number }
// Row shape matches the /qor-plan SKILL.md template column ordering:
//   | Path | Op | Verification command + result | Token |
function parseAffectedRows(planText) {
  const lines = planText.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let columnOrder = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^### Affected Files/i.test(line) || /^### Unit Tests/i.test(line)) {
      inTable = true;
      columnOrder = null;
      continue;
    }
    if (inTable && /^### /.test(line)) {
      inTable = false;
      continue;
    }
    if (!inTable) continue;

    const m = line.match(/^\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[1].split('|').map(c => c.trim());
    if (cells.length < 4) continue;

    // Skip table separator rows unconditionally (---|---|...).
    if (cells.every(c => /^[-:\s]+$/.test(c))) continue;

    if (!columnOrder) {
      const lower = cells.map(c => c.toLowerCase());
      if (lower.includes('token')) {
        columnOrder = lower;
      }
      continue;
    }

    const idx = {
      path: columnOrder.findIndex(c => /path|test/.test(c)),
      op: columnOrder.findIndex(c => c === 'op'),
      cmd: columnOrder.findIndex(c => /verification/.test(c)),
      token: columnOrder.findIndex(c => c === 'token'),
    };
    if (idx.path < 0 || idx.op < 0 || idx.cmd < 0 || idx.token < 0) continue;

    const token = cells[idx.token].replace(/`/g, '').trim();
    if (!token || /^\[/.test(token)) continue; // skip template placeholder rows

    rows.push({
      path: cells[idx.path].replace(/`/g, '').trim(),
      op: cells[idx.op].trim(),
      command: cells[idx.cmd].trim(),
      token,
      line: i + 1,
    });
  }
  return rows;
}

// Re-runs the verification command shape implied by the token + command text.
// Returns { ok: boolean, observed: string }.
function reverify(row, repoRoot) {
  const cmdText = row.command;
  const pathArg = row.path.replace(/^.*?[`'"](.*?)[`'"].*$/, '$1') || row.path;

  // Detect command shape from the cited text.
  const isGitLog = /git\s+log\b/i.test(cmdText);
  const isGrep = /grep\b/i.test(cmdText);
  const isLs = /\bls\b/i.test(cmdText);

  let gitLogResult = null;
  if (isGitLog) {
    const target = pathArg.split(' ')[0];
    try {
      const out = execFileSync('git', ['log', '-1', '--oneline', '--', target], {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      gitLogResult = { isEmpty: out.length === 0, out };
    } catch (e) {
      // No commits yet OR not a git repo → treat as empty history (consistent
      // with `git log` semantics on a fresh repo).
      const msg = String(e.stderr || e.message || '');
      if (/does not have any commits|bad default revision|unknown revision/i.test(msg)) {
        gitLogResult = { isEmpty: true, out: '' };
      } else {
        return { ok: false, observed: `git log threw: ${msg.trim()}` };
      }
    }
    const { isEmpty, out } = gitLogResult;
    switch (row.token) {
      case 'NEW-VERIFIED':
        return { ok: isEmpty, observed: isEmpty ? 'empty (file has no git history)' : `commit ${out}` };
      case 'MODIFIED-VERIFIED':
      case 'EXISTING-VERIFIED':
        return { ok: !isEmpty, observed: isEmpty ? 'empty (file has no git history)' : `commit ${out}` };
      case 'FITNESS-VERIFIED':
        return { ok: false, observed: 'FITNESS-VERIFIED requires a grep command (cited shape inside a file); git log does not verify intra-file content' };
    }
  }
  if (isGrep) {
    // Permissive parse: strip backticks, find any quoted/unquoted pattern + a
    // file path. Falls back to "first non-flag token after grep is the
    // pattern; next is the target".
    const stripped = cmdText.replace(/`/g, '');
    const m = stripped.match(/grep\s+(?:-[a-zA-Z]+\s+)?(?:'([^']+)'|"([^"]+)"|(\S+))\s+(\S+)/);
    if (m) {
      const pattern = m[1] || m[2] || m[3];
      const target = m[4];
      const targetPath = path.isAbsolute(target) ? target : path.join(repoRoot, target);
      if (!fs.existsSync(targetPath)) {
        return { ok: row.token === 'NEW-VERIFIED', observed: `file not found: ${target}` };
      }
      try {
        const text = fs.readFileSync(targetPath, 'utf-8');
        const matches = text.split(/\r?\n/).filter(l => l.includes(pattern));
        const hasMatch = matches.length > 0;
        switch (row.token) {
          case 'NEW-VERIFIED':
            return { ok: !hasMatch, observed: hasMatch ? `match: ${matches[0]}` : 'no match' };
          case 'MODIFIED-VERIFIED':
          case 'EXISTING-VERIFIED':
          case 'FITNESS-VERIFIED':
            return { ok: hasMatch, observed: hasMatch ? `match: ${matches[0]}` : 'no match' };
        }
      } catch (e) {
        return { ok: false, observed: `grep file read threw: ${e.message}` };
      }
    }
  }
  if (isLs) {
    const target = pathArg.split(' ')[0];
    const targetPath = path.isAbsolute(target) ? target : path.join(repoRoot, target);
    const exists = fs.existsSync(targetPath);
    switch (row.token) {
      case 'NEW-VERIFIED':
        return { ok: !exists, observed: exists ? `file exists: ${target}` : 'no such file' };
      case 'MODIFIED-VERIFIED':
      case 'EXISTING-VERIFIED':
        return { ok: exists, observed: exists ? `file exists: ${target}` : 'no such file' };
      case 'FITNESS-VERIFIED':
        return { ok: false, observed: 'FITNESS-VERIFIED requires a grep command (cited shape inside a file); ls does not verify intra-file content' };
    }
  }

  return { ok: false, observed: `cannot infer verification command shape from cell: "${cmdText}"` };
}

function main(argv) {
  const args = parseArgs(argv);
  const planText = fs.readFileSync(args.plan, 'utf-8');
  const rows = parseAffectedRows(planText);

  if (rows.length === 0) {
    process.stderr.write('plan-grep-lint: no Affected Files rows with verification tokens found.\n');
    process.stderr.write('  Per /qor-plan Step 2.5, every Affected Files row must carry a NEW-VERIFIED / MODIFIED-VERIFIED / EXISTING-VERIFIED token.\n');
    return 1;
  }

  const repoRoot = process.cwd();
  const failures = [];
  for (const row of rows) {
    if (!TOKEN_VOCAB.has(row.token)) {
      failures.push({ row, reason: `unknown token "${row.token}" — must be one of ${[...TOKEN_VOCAB].join(', ')}` });
      continue;
    }
    const result = reverify(row, repoRoot);
    if (!result.ok) {
      failures.push({ row, reason: `${row.token} mismatch — observed: ${result.observed}` });
    }
  }

  if (failures.length === 0) {
    process.stdout.write(`plan-grep-lint: OK — ${rows.length} verification tokens checked, all match repo state.\n`);
    return 0;
  }

  process.stderr.write(`plan-grep-lint: ${failures.length} of ${rows.length} verification tokens failed:\n`);
  failures.forEach((f, i) => {
    process.stderr.write(`  ${i + 1}. line ${f.row.line}: ${f.row.path} (${f.row.op}) — ${f.reason}\n`);
  });
  process.stderr.write('\nFix: amend the plan to match actual repo state, OR correct the cited verification command.\n');
  return 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { parseAffectedRows, reverify, TOKEN_VOCAB, PLAN_PATH_RE };
