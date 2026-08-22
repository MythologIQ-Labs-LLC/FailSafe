#!/usr/bin/env node
/**
 * #326 Phase D — operator probe for the worktree commit-hook row.
 *
 * The Agents-window matrix has to be validated by a human in a live window:
 * there is no `--extensionDevelopmentPath` route into it
 * (microsoft/vscode#318103). Most rows are a glance. The commit-hook row is
 * the fiddly one — it needs a second worktree, a mode flip, and two commit
 * attempts whose EXPECTED outcomes are opposite. This automates the setup and
 * the attempts so the operator reads a result instead of performing a
 * procedure.
 *
 * It does NOT decide anything. It prints observations and the paste-back block
 * for the issue. Deciding whether a row is DURABLE/FRAGILE/BROKEN is the
 * human's call, which is the whole point of Phase D.
 *
 * Usage (from a live Agents-window terminal, inside the repo):
 *   node FailSafe/extension/scripts/agents-window-phase-d-probe.cjs
 *   node FailSafe/extension/scripts/agents-window-phase-d-probe.cjs --keep
 *
 * --keep leaves the scratch worktree in place for manual poking.
 *
 * Exit code is always 0: this is an evidence collector, not a gate. A non-zero
 * exit would imply it had judged something, and it has not.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KEEP = process.argv.includes('--keep');
const REPO = path.resolve(__dirname, '..', '..', '..');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd || REPO, ...opts });
  return {
    ok: r.status === 0,
    status: r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`.trim(),
    spawnFailed: typeof r.status !== 'number',
    error: r.error,
  };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function observe(label, value) {
  console.log(`  ${label}: ${value}`);
}

// --- environment ------------------------------------------------------------

section('Environment');
const codeVer = run('code', ['--version']);
observe('VS Code', codeVer.ok ? codeVer.out.split(/\r?\n/)[0] : `NOT CAPTURED (${codeVer.spawnFailed ? 'code CLI not on PATH' : codeVer.out.slice(0, 80)})`);
observe('platform', `${os.platform()} ${os.release()}`);
observe('node', process.version);
const headSha = run('git', ['rev-parse', '--short', 'HEAD']);
observe('repo HEAD', headSha.ok ? headSha.out : 'unknown');

const extVer = (() => {
  try {
    return require(path.join(REPO, 'FailSafe', 'extension', 'package.json')).version;
  } catch { return 'unknown'; }
})();
observe('workspace extension version', extVer);
console.log('  NOTE: the INSTALLED extension version is what matters for this matrix.');
console.log('        Confirm it in the Extensions view; a repo checkout can differ from it.');

// --- commit-hook governance in a second worktree ----------------------------

section('Worktree commit-hook probe (#326 checklist row 3)');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-phaseD-'));
const wt = path.join(scratch, 'wt');
let created = false;

try {
  // A real branch, not --detach: on a detached HEAD git reports "Not currently
  // on any branch", which muddies the commit output the operator has to read.
  const branch = `phase-d-probe-${Date.now()}`;
  const add = run('git', ['worktree', 'add', '-b', branch, wt]);
  if (!add.ok) {
    observe('worktree add', `FAILED — ${add.out.slice(0, 200)}`);
    console.log('  Cannot probe the commit hook without a second worktree. Report this line as the observation.');
  } else {
    created = true;
    observe('worktree', wt);

    const hookPath = path.join(wt, '.git');
    observe('.git in worktree', fs.existsSync(hookPath) ? 'present (file or dir)' : 'MISSING');

    // Two attempts with opposite expectations. Both are ATTEMPTS — the script
    // reports what happened; it does not assert which is correct.
    for (const mode of ['enforce', 'observe']) {
      console.log(`\n  --- mode: ${mode} ---`);
      console.log(`  Set governance mode to "${mode}" in the live window now, then press Enter.`);
      console.log('  (FailSafe: Configure VS Code Agents Window Governance, or the Console mode picker.)');
      try {
        // Block for the operator without requiring a TTY library.
        fs.readSync(0, Buffer.alloc(1024), 0, 1024, null);
      } catch { /* no stdin (piped run): continue without pausing */ }

      // A governed source path, not a scratch .txt: root *.txt is gitignored
      // (.gitignore:121), and more importantly the commit guard evaluates
      // changes under src/ — probing with an ignored file would not exercise
      // the path the matrix row is about.
      const rel = `FailSafe/extension/src/phase-d-probe-${mode}.ts`;
      const f = path.join(wt, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      // Valid, lint-clean TypeScript on purpose. Garbage content could be
      // rejected by a pre-commit lint hook, and the operator would read that
      // as governance blocking the commit — a confound in the one row this
      // probe exists to measure.
      fs.writeFileSync(
        f,
        `// #326 Phase D probe (${mode}) — ${new Date().toISOString()}\nexport const phaseDProbe = '${mode}';\n`,
        'utf8',
      );

      const added = run('git', ['add', '--', rel], { cwd: wt });
      if (!added.ok) {
        observe('SETUP FAILED', `git add rejected the probe file — ${added.out.slice(0, 160)}`);
        console.log('  No commit was attempted. This row is UNPROBED, not "blocked".');
        continue;
      }
      // Confirm something is actually staged. Without this, "nothing to commit"
      // exits 1 and reads identically to "the hook rejected the commit" — a
      // false positive that would put a fabricated block into the evidence.
      const staged = run('git', ['diff', '--cached', '--name-only'], { cwd: wt });
      if (!staged.out.trim()) {
        observe('SETUP FAILED', 'nothing staged after git add — commit not attempted');
        console.log('  This row is UNPROBED, not "blocked".');
        continue;
      }
      observe('staged for commit', staged.out.trim());

      const commit = run('git', ['commit', '-m', `probe: phase D ${mode}`], { cwd: wt });
      const nothingToCommit = /nothing to commit|no changes added/i.test(commit.out);

      observe('commit exit status', String(commit.status));
      if (commit.ok) {
        observe('commit blocked?', 'NO — commit succeeded');
      } else if (nothingToCommit) {
        // Distinguished deliberately: a non-zero exit here is a probe setup
        // problem, not governance rejecting anything.
        observe('commit blocked?', 'UNPROBED — git had nothing to commit (setup issue, NOT a hook block)');
      } else {
        observe('commit blocked?', 'YES — commit rejected while changes were staged');
      }
      const reason = commit.out.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6).join('\n      ');
      console.log(`      output:\n      ${reason || '(no output)'}`);
      console.log(`  EXPECTED for ${mode}: ${mode === 'enforce'
        ? 'blocked WITH a stated reason (enforce + no intent)'
        : 'allowed'}`);
    }

    // Where did governance state land for this worktree session?
    section('Ledger topology in the worktree session (#326 checklist row 6)');
    for (const rel of ['docs/META_LEDGER.md', '.failsafe/governance']) {
      const p = path.join(wt, rel);
      observe(rel, fs.existsSync(p) ? `present in worktree (${p})` : 'not present in worktree');
    }
    observe('main checkout ledger', fs.existsSync(path.join(REPO, 'docs/META_LEDGER.md'))
      ? 'present in main checkout' : 'absent in main checkout');
    console.log('  Record which path actually received writes during the session — split-state is parked, not fixed.');
  }
} finally {
  if (created && !KEEP) {
    run('git', ['worktree', 'remove', '--force', wt]);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log('\n  (scratch worktree removed; pass --keep to retain it)');
  } else if (created) {
    console.log(`\n  (worktree kept at ${wt} — remove with: git worktree remove --force "${wt}")`);
  }
}

// --- paste-back template ----------------------------------------------------

section('Paste this into #326');
console.log(`
VS Code version: ${codeVer.ok ? codeVer.out.split(/\r?\n/)[0] : '<fill in from Help > About>'}
Installed FailSafe version: <fill in from the Extensions view>
Platform: ${os.platform()} ${os.release()}

- [ ] Opt-in via extensions.supportAgentsWindow + FailSafe activates in an Agents-window session:  YES / NO  — notes:
- [ ] failsafe.* palette commands operate (expected DURABLE):  YES / NO  — notes:
- [ ] Commit hook, enforce + no intent -> blocked with reason:  YES / NO  — (see probe output above)
- [ ] Commit hook, observe -> allowed:  YES / NO  — (see probe output above)
- [ ] @failsafe chat participant (expected BROKEN in Agent Host) — ACTUAL observed:
- [ ] Sidebar webview + status bar (expected FRAGILE) — ACTUAL observed:
- [ ] Ledger write location observed this session:
`);
console.log('  Anything that behaved differently from the EXPECTED column is the valuable part —');
console.log('  the matrix rows are engineering expectations, not upstream guarantees.\n');
