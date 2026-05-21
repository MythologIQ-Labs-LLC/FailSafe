#!/usr/bin/env node
// CI gate: when the active plan's change_class is `feature` or `breaking`,
// every changed source-file in a designated surface must ship with a
// corresponding `*.spec.ts` (or be acknowledged via a per-file scoped
// `[no-e2e: <path-fragment> — <reason>]` token in a commit message in range).
//
// Modes:
//   prepush  (default) — file set = staged index; range = @{u}..HEAD.
//   release            — file set = merge-commit range; fails CLOSED if the
//                        range cannot be resolved (B-B199-5 hardening).
//
// Override scoping (B-B199-5):
//   `[no-e2e: <path-fragment> — <reason>]`  excuses only files whose path
//                                           contains <path-fragment>.
//   `[no-e2e: * — <reason>]`                explicit opt-in blanket override.
//   `[no-e2e: <reason>]` (legacy, no ` — `) NO LONGER grants a blanket pass.
//
// Exit 0 = coverage satisfied (or gate not applicable).
// Exit 1 = block; missing E2E coverage for one or more changed files.

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const SURFACE_PATTERNS = [
  { match: /^FailSafe\/extension\/src\/roadmap\/ui\//, kind: 'playwright' },
  { match: /^FailSafe\/extension\/src\/roadmap\/routes\//, kind: 'integration' },
  { match: /^FailSafe\/extension\/src\/extension\/commands\.ts$/, kind: 'vscode-test' },
  { match: /^FailSafe\/extension\/src\/extension\/bootstrapServers\.ts$/, kind: 'integration' },
];

const ENFORCE_CLASSES = new Set(['feature', 'breaking']);

// Em-dash or double-hyphen separates the scope fragment from the reason.
const SCOPE_SEPARATOR = /\s+(?:—|--)\s+/;

function readChangeClass(repoRoot) {
  if (process.env.FAILSAFE_CHANGE_CLASS) return process.env.FAILSAFE_CHANGE_CLASS.trim();
  const plansDir = path.join(repoRoot, '.failsafe', 'governance', 'plans');
  if (!fs.existsSync(plansDir)) return null;
  const candidates = fs.readdirSync(plansDir)
    .filter((name) => name.startsWith('plan-') && name.endsWith('.md'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(plansDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const cand of candidates) {
    const body = fs.readFileSync(path.join(plansDir, cand.name), 'utf8');
    const match = body.match(/\*\*change_class\*\*\s*:\s*([a-z]+)/i)
      || body.match(/^change_class\s*:\s*([a-z]+)/im);
    if (match) return match[1].trim().toLowerCase();
  }
  return null;
}

function gitOutput(cmd, repoRoot) {
  try {
    return execSync(cmd, { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return '';
  }
}

function stagedFiles(repoRoot) {
  const out = gitOutput('git diff --cached --name-only --diff-filter=ACMR', repoRoot);
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function commitMessagesInRange(repoRoot) {
  const range = gitOutput('git rev-parse --abbrev-ref --symbolic-full-name @{u}', repoRoot).trim();
  const cmd = range
    ? 'git log @{u}..HEAD --pretty=%B'
    : 'git log -n 20 --pretty=%B';
  return gitOutput(cmd, repoRoot);
}

// --- release-mode range resolution (B-B199-5) -----------------------------
// Returns { ok: true, base, head } or { ok: false, reason } so callers can
// fail CLOSED when the merge-commit range cannot be determined.
function resolveReleaseRange(repoRoot) {
  const base = (process.env.FAILSAFE_RELEASE_BASE || '').trim();
  const head = (process.env.FAILSAFE_RELEASE_HEAD || 'HEAD').trim();
  const effectiveBase = base || 'origin/main';
  const baseSha = gitOutput(`git rev-parse --verify --quiet ${effectiveBase}`, repoRoot).trim();
  const headSha = gitOutput(`git rev-parse --verify --quiet ${head}`, repoRoot).trim();
  if (!baseSha || !headSha) {
    return {
      ok: false,
      reason: `cannot resolve release range (base=${effectiveBase}, head=${head})`,
    };
  }
  return { ok: true, base: effectiveBase, head };
}

function releaseRangeFiles(repoRoot, range) {
  const out = gitOutput(
    `git diff --name-only --diff-filter=ACMR ${range.base}...${range.head}`,
    repoRoot,
  );
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function releaseMessages(repoRoot, range) {
  return gitOutput(`git log ${range.base}..${range.head} --pretty=%B`, repoRoot);
}

function classifyStaged(files) {
  const requires = [];
  const specChanges = [];
  for (const file of files) {
    if (file.endsWith('.spec.ts')) specChanges.push(file);
    for (const { match, kind } of SURFACE_PATTERNS) {
      if (match.test(file)) requires.push({ file, kind });
    }
  }
  return { requires, specChanges };
}

// Parse every `[no-e2e: ...]` token into { scope, reason }. A token with a
// ` — ` (or ` -- `) separator is scoped: scope is the left side. A legacy
// token with no separator is recorded with scope === null (matches nothing).
function parseOverrideTokens(messages) {
  const tokenPattern = /\[no-e2e:\s*([^\]]+)\]/g;
  const tokens = [];
  let m;
  while ((m = tokenPattern.exec(messages)) !== null) {
    const payload = m[1].trim();
    if (payload.length === 0) continue;
    const parts = payload.split(SCOPE_SEPARATOR);
    if (parts.length >= 2 && parts[0].trim().length > 0) {
      tokens.push({ scope: parts[0].trim(), reason: parts.slice(1).join(' — ').trim() });
    } else {
      // Legacy unscoped token: retained for parsing, but grants no override.
      tokens.push({ scope: null, reason: payload });
    }
  }
  return tokens;
}

// Returns the matching token for `file`, or null. `*` is an explicit blanket.
function overrideAppliesTo(tokens, file) {
  for (const token of tokens) {
    if (token.scope === null) continue;
    if (token.scope === '*') return token;
    if (file.includes(token.scope)) return token;
  }
  return null;
}

function emitAudit(lines) {
  for (const line of lines) console.log(`[e2e-gate] AUDIT: ${line}`);
}

// Resolve the (files, messages) pair for the active mode. release mode fails
// CLOSED: an unresolvable range yields ok:false so main() can block.
function resolveInputs(repoRoot, mode) {
  if (mode === 'release') {
    const range = resolveReleaseRange(repoRoot);
    if (!range.ok) return { ok: false, reason: range.reason };
    return {
      ok: true,
      files: releaseRangeFiles(repoRoot, range),
      messages: releaseMessages(repoRoot, range),
    };
  }
  return { ok: true, files: stagedFiles(repoRoot), messages: commitMessagesInRange(repoRoot) };
}

// Partition surface requirements into { missing, audited } given the spec
// changes and parsed override tokens. A surface file is satisfied by ANY spec
// change in range, or by a scoped/wildcard override token.
function evaluateCoverage(requires, specChanges, tokens) {
  const missing = [];
  const audited = [];
  for (const { file, kind } of requires) {
    if (specChanges.length > 0) continue;
    const token = overrideAppliesTo(tokens, file);
    if (token) {
      audited.push(`${file} excused by [no-e2e: ${token.scope}] — ${token.reason}`);
      continue;
    }
    missing.push(`${file} (${kind})`);
  }
  return { missing, audited };
}

function main(opts) {
  const repoRoot = (opts && opts.repoRoot) || DEFAULT_REPO_ROOT;
  const mode = (opts && opts.mode) || process.env.FAILSAFE_GATE_MODE || 'prepush';
  const changeClass = readChangeClass(repoRoot);
  if (!changeClass || !ENFORCE_CLASSES.has(changeClass)) {
    console.log(`[e2e-gate] skipped (change_class=${changeClass || 'unknown'})`);
    return 0;
  }
  if (process.env.FAILSAFE_GATE_BYPASS) {
    emitAudit([`gate bypassed via FAILSAFE_GATE_BYPASS (--no-verify equivalent), mode=${mode}`]);
    console.log('[e2e-gate] bypassed (FAILSAFE_GATE_BYPASS set)');
    return 0;
  }
  const inputs = resolveInputs(repoRoot, mode);
  if (!inputs.ok) {
    console.error(`[e2e-gate] BLOCK — ${inputs.reason}`);
    console.error('release mode fails CLOSED when the commit range is unresolvable.');
    return 1;
  }
  if (inputs.files.length === 0) {
    console.log(`[e2e-gate] no changed files (mode=${mode})`);
    return 0;
  }
  const { requires, specChanges } = classifyStaged(inputs.files);
  if (requires.length === 0) {
    console.log(`[e2e-gate] no surface files changed (mode=${mode})`);
    return 0;
  }
  const tokens = parseOverrideTokens(inputs.messages);
  const { missing, audited } = evaluateCoverage(requires, specChanges, tokens);
  if (audited.length > 0) emitAudit(audited);
  if (missing.length > 0) {
    console.error(`[e2e-gate] BLOCK (mode=${mode}) — changed surface files lack a corresponding *.spec.ts:`);
    for (const m of missing) console.error(`  - ${m}`);
    console.error('Add a spec, or include `[no-e2e: <path-fragment> — <reason>]` in a commit message.');
    return 1;
  }
  console.log(`[e2e-gate] PASS (change_class=${changeClass}, mode=${mode}, surfaces=${requires.length}, specs=${specChanges.length})`);
  return 0;
}

module.exports = {
  main,
  classifyStaged,
  parseOverrideTokens,
  overrideAppliesTo,
  resolveReleaseRange,
  readChangeClass,
};

if (require.main === module) process.exit(main());
