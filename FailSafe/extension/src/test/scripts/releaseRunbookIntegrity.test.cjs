/**
 * Regression tests for docs/release-runbook-v5-1-0.md (v5.1.0 lift Phase 4).
 *
 * Pins the runbook structure so a future edit can't silently drop a step or
 * cite a non-existent npm script / file path / shell command.
 *
 * Runs standalone: node --test src/test/scripts/releaseRunbookIntegrity.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const RUNBOOK_REL = path.join('docs', 'release-runbook-v5-1-0.md');
const PACKAGE_JSON_REL = path.join('FailSafe', 'extension', 'package.json');

const EXPECTED_STEP_COUNT = 13;
const STEP_HEADER_RE = /^### Step (\d+)\.\s+(.+)$/gm;
const NPM_RUN_RE = /\bnpm run\s+([a-z0-9:_-]+)/g;
const NODE_SCRIPT_RE = /\bnode\s+(\.\/[^\s)]+\.c?js)\b/g;

function loadRunbook(repoRoot) {
  const full = path.join(repoRoot, RUNBOOK_REL);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function loadPackageScripts(repoRoot) {
  const full = path.join(repoRoot, PACKAGE_JSON_REL);
  if (!fs.existsSync(full)) return {};
  const pkg = JSON.parse(fs.readFileSync(full, 'utf8'));
  return pkg.scripts || {};
}

function extractSteps(body) {
  const steps = [];
  let m;
  STEP_HEADER_RE.lastIndex = 0;
  while ((m = STEP_HEADER_RE.exec(body)) !== null) {
    steps.push({ number: Number(m[1]), title: m[2].trim() });
  }
  return steps;
}

function extractNpmScripts(body) {
  const refs = new Set();
  let m;
  NPM_RUN_RE.lastIndex = 0;
  while ((m = NPM_RUN_RE.exec(body)) !== null) refs.add(m[1]);
  return refs;
}

function extractNodeScripts(body) {
  const refs = new Set();
  let m;
  NODE_SCRIPT_RE.lastIndex = 0;
  while ((m = NODE_SCRIPT_RE.exec(body)) !== null) refs.add(m[1]);
  return refs;
}

describe('release-runbook-v5-1-0 structural integrity', () => {
  it('runbook file exists at canonical location', () => {
    const body = loadRunbook(REPO_ROOT);
    assert.notEqual(body, null, `${RUNBOOK_REL} not found at ${REPO_ROOT}`);
  });

  it('contains exactly 13 numbered runbook steps in monotonic order', () => {
    const body = loadRunbook(REPO_ROOT);
    const steps = extractSteps(body);
    assert.equal(steps.length, EXPECTED_STEP_COUNT,
      `expected ${EXPECTED_STEP_COUNT} steps, found ${steps.length}: ${steps.map((s) => s.number).join(',')}`);
    for (let i = 0; i < steps.length; i++) {
      assert.equal(steps[i].number, i + 1, `step #${i + 1} missing or out of order`);
    }
  });

  it('every `npm run <script>` reference resolves to a real script in FailSafe/extension/package.json', () => {
    const body = loadRunbook(REPO_ROOT);
    const refs = extractNpmScripts(body);
    const scripts = loadPackageScripts(REPO_ROOT);
    const missing = [];
    for (const ref of refs) {
      if (!(ref in scripts)) missing.push(ref);
    }
    assert.deepEqual(missing, [],
      `runbook cites npm scripts not present in package.json: ${missing.join(', ')}`);
  });

  it('every `node ./scripts/...` reference resolves to a real file', () => {
    const body = loadRunbook(REPO_ROOT);
    const refs = extractNodeScripts(body);
    const missing = [];
    for (const ref of refs) {
      // Resolved relative to FailSafe/extension because every "node ./scripts/..."
      // in the runbook is preceded by `cd FailSafe/extension`.
      const full = path.join(REPO_ROOT, 'FailSafe', 'extension', ref);
      if (!fs.existsSync(full)) missing.push(ref);
    }
    assert.deepEqual(missing, [],
      `runbook cites node scripts not on disk: ${missing.join(', ')}`);
  });

  it('release-class section names `.github/workflows/release.yml` (not deprecated dual-file names)', () => {
    const body = loadRunbook(REPO_ROOT);
    assert.match(body, /\.github\/workflows\/release\.yml/);
    assert.equal(body.includes('marketplace-publish.yml'), false,
      'runbook still references deprecated marketplace-publish.yml');
    assert.equal(body.includes('ovsx-publish.yml'), false,
      'runbook still references deprecated ovsx-publish.yml');
  });

  it('release-class section names both publish jobs (publish-vscode + publish-openvsx)', () => {
    const body = loadRunbook(REPO_ROOT);
    assert.match(body, /publish-vscode/);
    assert.match(body, /publish-openvsx/);
  });
});

describe('release-runbook-v5-1-0 trip-test (functional negative)', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-runbook-trip-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('removing a referenced npm script from temp package.json causes the integrity check to flag it', () => {
    // Replicate runbook + a sabotaged package.json into a temp repo.
    const body = loadRunbook(REPO_ROOT);
    const docsDir = path.join(tmp, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'release-runbook-v5-1-0.md'), body, 'utf8');
    const pkgDir = path.join(tmp, 'FailSafe', 'extension');
    fs.mkdirSync(pkgDir, { recursive: true });
    // Sabotaged package.json: completely empty scripts block.
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
    const refs = extractNpmScripts(body);
    const scripts = loadPackageScripts(tmp);
    const missing = [...refs].filter((r) => !(r in scripts));
    assert.ok(missing.length > 0, 'expected the sabotaged package.json to trip the integrity check');
    assert.ok(missing.includes('verify:publish-block') || missing.includes('test:ui'),
      `expected core scripts to be missing; got: ${missing.join(', ')}`);
  });
});
