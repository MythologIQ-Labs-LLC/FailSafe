/**
 * Regression tests for check-e2e-coverage.cjs (Phase 60 §5 + B-B199-5).
 *
 * The script is a release-class coverage gate: when the active plan's
 * change_class is `feature` or `breaking`, every changed source-file that
 * touches a designated UI/route/command surface must ship with a matching
 * `*.spec.ts` (or be acknowledged via a per-file scoped
 * `[no-e2e: <path-fragment> — <reason>]` token in a commit message in range).
 *
 * These tests pin the gate's behavior across its critical branches:
 *   1. Non-enforce change_class (hotfix / unknown) → exit 0 (skip).
 *   2. Enforce class + no staged surface files → exit 0 (no-op).
 *   3. Enforce class + staged surface file + paired *.spec.ts → exit 0.
 *   4. Enforce class + staged surface file + missing spec → exit 1 (BLOCK).
 *   5. Enforce class + surface file + scoped [no-e2e: <frag> — ...] → exit 0.
 *   6. classifyStaged correctly recognizes each SURFACE_PATTERN entry.
 *
 * B-B199-5 hardening (FX570-FX574):
 *   FX570 — per-file override scoping: a token naming file A does NOT excuse B.
 *   FX571 — explicit `[no-e2e: * — reason]` wildcard restores blanket override.
 *   FX572 — legacy unscoped `[no-e2e: reason]` no longer blanket-overrides.
 *   FX573 — `mode:'release'` checks a merge-commit range; fails CLOSED if the
 *           range cannot be resolved.
 *   FX574 — gate emits a greppable `[e2e-gate] AUDIT:` line for excused/bypassed
 *           files.
 *
 * Runs standalone: node --test src/test/scripts/checkE2eCoverage.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require(path.resolve(
  __dirname, '..', '..', '..', 'scripts', 'check-e2e-coverage.cjs',
));

function mkTempRepo(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git commit -q --allow-empty -m "init"', { cwd: dir });
  return dir;
}

function writePlan(repoRoot, changeClass) {
  const plansDir = path.join(repoRoot, '.failsafe', 'governance', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(
    path.join(plansDir, 'plan-test.md'),
    `# Plan: test\n\n**change_class**: ${changeClass}\n\n## Phase 1\n`,
    'utf8',
  );
}

function stageFile(repoRoot, relPath, content = '// stub\n') {
  const full = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  execSync(`git add "${relPath}"`, { cwd: repoRoot });
}

function commitOverride(repoRoot, message) {
  // `git commit` clears the index; land override commits BEFORE staging the
  // surface file under test so the token sits in the push range.
  const marker = `noop-${Math.random().toString(36).slice(2)}.txt`;
  fs.writeFileSync(path.join(repoRoot, marker), 'x\n');
  execSync(`git add "${marker}"`, { cwd: repoRoot });
  execSync(`git commit -q -m "${message}"`, { cwd: repoRoot });
}

const GATE_ENV_KEYS = [
  'FAILSAFE_CHANGE_CLASS', 'FAILSAFE_GATE_MODE', 'FAILSAFE_GATE_BYPASS',
  'FAILSAFE_RELEASE_BASE', 'FAILSAFE_RELEASE_HEAD',
];

// Run the gate against `repoRoot` in a hermetic env. `opts.main` is forwarded
// to gate.main(); `opts.env` sets gate env vars for the duration of the call.
function runGate(repoRoot, opts) {
  const o = opts || {};
  const saved = {};
  for (const key of GATE_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  const envOverride = o.env || {};
  for (const [key, value] of Object.entries(envOverride)) process.env[key] = value;
  const prevLog = console.log;
  const prevError = console.error;
  const stdout = []; const stderr = [];
  console.log = (msg) => stdout.push(String(msg));
  console.error = (msg) => stderr.push(String(msg));
  let exitCode;
  try {
    exitCode = gate.main(Object.assign({ repoRoot }, o.main || {}));
  } finally {
    console.log = prevLog;
    console.error = prevError;
    for (const key of GATE_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('check-e2e-coverage.cjs release-class coverage gate', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-e2e-gate-test-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('case 1: non-enforce change_class (hotfix) → skipped (exit 0)', () => {
    writePlan(tmp, 'hotfix');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /\[e2e-gate\] skipped/);
  });

  it('case 1b: no plan / unknown change_class → skipped (exit 0)', () => {
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /skipped/);
  });

  it('case 2: enforce class + no surface files staged → no-op (exit 0)', () => {
    writePlan(tmp, 'feature');
    stageFile(tmp, 'docs/NOTES.md', '# notes\n');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /no surface files changed/);
  });

  it('case 3: surface file paired with *.spec.ts → PASS (exit 0)', () => {
    writePlan(tmp, 'feature');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/routes/AgentsRoute.ts', 'export {};\n');
    stageFile(tmp, 'FailSafe/extension/src/test/playwright/agents.spec.ts', 'test.skip("x", () => {});\n');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
    assert.match(result.stdout, /surfaces=1/);
    assert.match(result.stdout, /specs=1/);
  });

  it('case 4: surface file with no spec → BLOCK (exit 1)', () => {
    writePlan(tmp, 'feature');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /\[e2e-gate\] BLOCK/);
    assert.match(result.stderr, /roadmap\/ui\/index\.html/);
  });

  it('case 4b: breaking change_class also enforces (exit 1)', () => {
    writePlan(tmp, 'breaking');
    stageFile(tmp, 'FailSafe/extension/src/extension/commands.ts', 'export {};\n');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /BLOCK/);
  });

  it('case 5: surface file + scoped [no-e2e: <frag> — reason] override → PASS (exit 0)', () => {
    writePlan(tmp, 'feature');
    commitOverride(tmp, 'chore: noop [no-e2e: roadmap/routes — covered manually for v5.1]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/routes/SreRoute.ts', 'export {};\n');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
  });
});

describe('check-e2e-coverage.cjs B-B199-5 override scoping (FX570-FX572)', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-e2e-gate-scope-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('FX570: a scoped token naming file A does NOT excuse unrelated file B', () => {
    writePlan(tmp, 'feature');
    // Override scopes to `commands.ts`; the staged surface file is roadmap/ui.
    commitOverride(tmp, 'chore: noop [no-e2e: commands.ts — vscode-test covers this]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /\[e2e-gate\] BLOCK/);
    assert.match(result.stderr, /roadmap\/ui\/index\.html/);
  });

  it('FX570b: a scoped token DOES excuse a file whose path contains the fragment', () => {
    writePlan(tmp, 'feature');
    commitOverride(tmp, 'chore: noop [no-e2e: roadmap/ui — playwright covers this surface]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
  });

  it('FX571: explicit [no-e2e: * — reason] wildcard restores a blanket override', () => {
    writePlan(tmp, 'feature');
    commitOverride(tmp, 'chore: noop [no-e2e: * — full-surface manual sign-off]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
  });

  it('FX572: legacy unscoped [no-e2e: reason] no longer grants a blanket override', () => {
    writePlan(tmp, 'feature');
    // Legacy form — no ` — ` separator. Under the old gate this passed; now BLOCKs.
    commitOverride(tmp, 'chore: noop [no-e2e: covered by manual QA]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /\[e2e-gate\] BLOCK/);
  });

  it('FX572b: double-hyphen separator [no-e2e: frag -- reason] is also recognized', () => {
    writePlan(tmp, 'feature');
    commitOverride(tmp, 'chore: noop [no-e2e: roadmap/ui -- ascii separator variant]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
  });
});

describe('check-e2e-coverage.cjs B-B199-5 release mode (FX573)', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-e2e-gate-release-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('FX573: release mode checks the merge-commit range, not the staged index', () => {
    writePlan(tmp, 'feature');
    // Tag the base, then COMMIT (not stage) an uncovered surface file.
    execSync('git tag e2e-base', { cwd: tmp });
    const surface = 'FailSafe/extension/src/roadmap/ui/index.html';
    const full = path.join(tmp, surface);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '<html></html>', 'utf8');
    execSync(`git add "${surface}"`, { cwd: tmp });
    execSync('git commit -q -m "feat: add uncovered surface"', { cwd: tmp });
    const result = runGate(tmp, {
      main: { mode: 'release' },
      env: { FAILSAFE_RELEASE_BASE: 'e2e-base', FAILSAFE_RELEASE_HEAD: 'HEAD' },
    });
    assert.equal(result.exitCode, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /\[e2e-gate\] BLOCK/);
    assert.match(result.stdout + result.stderr, /mode=release|release/);
  });

  it('FX573b: release mode PASSES when the ranged surface file ships a spec', () => {
    writePlan(tmp, 'feature');
    execSync('git tag e2e-base2', { cwd: tmp });
    for (const rel of [
      'FailSafe/extension/src/roadmap/routes/AgentsRoute.ts',
      'FailSafe/extension/src/test/playwright/agents.spec.ts',
    ]) {
      const full = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, 'export {};\n', 'utf8');
      execSync(`git add "${rel}"`, { cwd: tmp });
    }
    execSync('git commit -q -m "feat: surface + spec"', { cwd: tmp });
    const result = runGate(tmp, {
      main: { mode: 'release' },
      env: { FAILSAFE_RELEASE_BASE: 'e2e-base2' },
    });
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
  });

  it('FX573c: release mode FAILS CLOSED when the commit range is unresolvable', () => {
    writePlan(tmp, 'feature');
    // No base tag, no origin/main ref in this throwaway repo → unresolvable.
    const result = runGate(tmp, {
      main: { mode: 'release' },
      env: { FAILSAFE_RELEASE_BASE: 'refs/heads/does-not-exist' },
    });
    assert.equal(result.exitCode, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /\[e2e-gate\] BLOCK/);
    assert.match(result.stderr, /unresolvable|cannot resolve|fails CLOSED/i);
  });
});

describe('check-e2e-coverage.cjs B-B199-5 audit trail (FX574)', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-e2e-gate-audit-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('FX574: emits a greppable [e2e-gate] AUDIT: line for an excused file', () => {
    writePlan(tmp, 'feature');
    commitOverride(tmp, 'chore: noop [no-e2e: roadmap/ui — manual sign-off]');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] AUDIT:/);
    assert.match(result.stdout, /roadmap\/ui\/index\.html excused by/);
  });

  it('FX574b: emits an AUDIT line when the gate is bypassed via FAILSAFE_GATE_BYPASS', () => {
    writePlan(tmp, 'feature');
    stageFile(tmp, 'FailSafe/extension/src/roadmap/ui/index.html', '<html></html>');
    // Sanity: without the bypass var the same staged state BLOCKs.
    const blocked = runGate(tmp);
    assert.equal(blocked.exitCode, 1);
    // With FAILSAFE_GATE_BYPASS the gate exits 0 and emits an audit line.
    const bypassed = runGate(tmp, { env: { FAILSAFE_GATE_BYPASS: '1' } });
    assert.equal(bypassed.exitCode, 0, `stdout=${bypassed.stdout} stderr=${bypassed.stderr}`);
    assert.match(bypassed.stdout, /\[e2e-gate\] AUDIT: gate bypassed/);
  });
});

describe('check-e2e-coverage.cjs classifyStaged surface coverage', () => {
  it('roadmap/ui paths classify as playwright', () => {
    const { requires } = gate.classifyStaged([
      'FailSafe/extension/src/roadmap/ui/index.html',
      'FailSafe/extension/src/roadmap/ui/modules/settings.js',
    ]);
    assert.equal(requires.length, 2);
    for (const r of requires) assert.equal(r.kind, 'playwright');
  });

  it('roadmap/routes paths classify as integration', () => {
    const { requires } = gate.classifyStaged([
      'FailSafe/extension/src/roadmap/routes/AgentsRoute.ts',
    ]);
    assert.equal(requires.length, 1);
    assert.equal(requires[0].kind, 'integration');
  });

  it('commands.ts classifies as vscode-test', () => {
    const { requires } = gate.classifyStaged([
      'FailSafe/extension/src/extension/commands.ts',
    ]);
    assert.equal(requires.length, 1);
    assert.equal(requires[0].kind, 'vscode-test');
  });

  it('bootstrapServers.ts classifies as integration', () => {
    const { requires } = gate.classifyStaged([
      'FailSafe/extension/src/extension/bootstrapServers.ts',
    ]);
    assert.equal(requires.length, 1);
    assert.equal(requires[0].kind, 'integration');
  });

  it('non-surface paths produce no requirements', () => {
    const { requires, specChanges } = gate.classifyStaged([
      'docs/notes.md',
      'FailSafe/extension/scripts/helper.cjs',
      'FailSafe/extension/src/test/scripts/x.test.cjs',
    ]);
    assert.equal(requires.length, 0);
    assert.equal(specChanges.length, 0);
  });

  it('.spec.ts files are recognized as spec changes', () => {
    const { specChanges } = gate.classifyStaged([
      'FailSafe/extension/src/test/playwright/monitor.spec.ts',
    ]);
    assert.equal(specChanges.length, 1);
  });
});

describe('check-e2e-coverage.cjs parseOverrideTokens + overrideAppliesTo', () => {
  it('parses a scoped token into { scope, reason }', () => {
    const tokens = gate.parseOverrideTokens('feat: x\n\n[no-e2e: roadmap/ui — manual QA]\n');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].scope, 'roadmap/ui');
    assert.equal(tokens[0].reason, 'manual QA');
  });

  it('records a legacy unscoped token with scope=null (matches nothing)', () => {
    const tokens = gate.parseOverrideTokens('feat: x\n\n[no-e2e: covered manually]\n');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].scope, null);
  });

  it('ignores an empty bracket payload', () => {
    const tokens = gate.parseOverrideTokens('feat: x\n\n[no-e2e: ]\n');
    assert.equal(tokens.length, 0);
  });

  it('overrideAppliesTo: scope substring match excuses the file', () => {
    const tokens = gate.parseOverrideTokens('[no-e2e: roadmap/routes — x]');
    assert.ok(gate.overrideAppliesTo(tokens, 'FailSafe/extension/src/roadmap/routes/A.ts'));
  });

  it('overrideAppliesTo: scope mismatch does not excuse the file', () => {
    const tokens = gate.parseOverrideTokens('[no-e2e: commands.ts — x]');
    assert.equal(gate.overrideAppliesTo(tokens, 'FailSafe/extension/src/roadmap/ui/index.html'), null);
  });

  it('overrideAppliesTo: wildcard scope excuses any file', () => {
    const tokens = gate.parseOverrideTokens('[no-e2e: * — x]');
    assert.ok(gate.overrideAppliesTo(tokens, 'anything/at/all.ts'));
  });

  it('overrideAppliesTo: legacy unscoped token excuses nothing', () => {
    const tokens = gate.parseOverrideTokens('[no-e2e: legacy reason]');
    assert.equal(gate.overrideAppliesTo(tokens, 'FailSafe/extension/src/roadmap/ui/x.html'), null);
  });
});

describe('check-e2e-coverage.cjs resolveReleaseRange', () => {
  let tmp;
  beforeEach(() => { tmp = mkTempRepo('failsafe-e2e-gate-range-'); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  // withReleaseBase sets FAILSAFE_RELEASE_BASE for one call, restoring after.
  function withReleaseBase(value, fn) {
    const saved = process.env.FAILSAFE_RELEASE_BASE;
    process.env.FAILSAFE_RELEASE_BASE = value;
    try {
      return fn();
    } finally {
      if (saved === undefined) delete process.env.FAILSAFE_RELEASE_BASE;
      else process.env.FAILSAFE_RELEASE_BASE = saved;
    }
  }

  it('resolves a valid base ref', () => {
    execSync('git tag range-base', { cwd: tmp });
    const range = withReleaseBase('range-base', () => gate.resolveReleaseRange(tmp));
    assert.equal(range.ok, true);
    assert.equal(range.base, 'range-base');
  });

  it('fails CLOSED (ok:false) when the base ref does not exist', () => {
    const range = withReleaseBase('no-such-ref-xyz', () => gate.resolveReleaseRange(tmp));
    assert.equal(range.ok, false);
    assert.match(range.reason, /cannot resolve/i);
  });
});
