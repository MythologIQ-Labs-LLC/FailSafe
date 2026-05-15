/**
 * Regression tests for check-e2e-coverage.cjs (Phase 60 §5).
 *
 * The script is a release-class coverage gate: when the active plan's
 * change_class is `feature` or `breaking`, every staged source-file change
 * that touches a designated UI/route/command surface must ship with a
 * matching `*.spec.ts` (or be acknowledged via `[no-e2e: <reason>]` in a
 * commit message in the push range).
 *
 * These tests pin the gate's behavior across four critical branches:
 *   1. Non-enforce change_class (hotfix / unknown) → exit 0 (skip).
 *   2. Enforce class + no staged surface files → exit 0 (no-op).
 *   3. Enforce class + staged surface file + paired *.spec.ts → exit 0.
 *   4. Enforce class + staged surface file + missing spec → exit 1 (BLOCK).
 *   5. Enforce class + staged surface file + [no-e2e: ...] override → exit 0.
 *   6. classifyStaged correctly recognizes each SURFACE_PATTERN entry.
 *
 * Runs standalone: node --test src/test/scripts/checkE2eCoverage.test.cjs
 */

'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
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

function runGate(repoRoot) {
  // Drop any inherited override so the plan is consulted.
  const prevEnv = process.env.FAILSAFE_CHANGE_CLASS;
  delete process.env.FAILSAFE_CHANGE_CLASS;
  const prevLog = console.log;
  const prevError = console.error;
  const stdout = []; const stderr = [];
  console.log = (msg) => stdout.push(String(msg));
  console.error = (msg) => stderr.push(String(msg));
  let exitCode;
  try {
    exitCode = gate.main({ repoRoot });
  } finally {
    console.log = prevLog;
    console.error = prevError;
    if (prevEnv !== undefined) process.env.FAILSAFE_CHANGE_CLASS = prevEnv;
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
    assert.match(result.stdout, /no surface files staged/);
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

  it('case 5: surface file + [no-e2e: reason] commit override → PASS (exit 0)', () => {
    writePlan(tmp, 'feature');
    // Create a prior commit with the override token. `git commit` clears the
    // index, so we land the override BEFORE staging the surface file.
    fs.writeFileSync(path.join(tmp, 'noop.txt'), 'x\n');
    execSync('git add noop.txt', { cwd: tmp });
    execSync('git commit -q -m "chore: noop [no-e2e: ui surface covered manually for v5.1]"', { cwd: tmp });
    stageFile(tmp, 'FailSafe/extension/src/roadmap/routes/SreRoute.ts', 'export {};\n');
    const result = runGate(tmp);
    assert.equal(result.exitCode, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /\[e2e-gate\] PASS/);
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

describe('check-e2e-coverage.cjs hasNoE2eOverride', () => {
  it('returns true when [no-e2e: <reason>] appears in messages', () => {
    assert.equal(
      gate.hasNoE2eOverride('feat: thing\n\n[no-e2e: covered by manual QA]\n', 'x.ts'),
      true,
    );
  });

  it('returns false on empty bracket payload', () => {
    assert.equal(
      gate.hasNoE2eOverride('feat: thing\n\n[no-e2e: ]\n', 'x.ts'),
      false,
    );
  });

  it('returns false when no token present', () => {
    assert.equal(
      gate.hasNoE2eOverride('feat: thing\nno override here\n', 'x.ts'),
      false,
    );
  });
});
