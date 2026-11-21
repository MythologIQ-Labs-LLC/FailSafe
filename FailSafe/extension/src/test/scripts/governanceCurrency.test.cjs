'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkCurrency } = require('../../../scripts/check-governance-currency.cjs');
const CLI = path.join(__dirname, '..', '..', '..', 'scripts', 'check-governance-currency.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-doc-currency-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tierOne = '\n## Tier 1 — Canonical Sources\n| Path | Purpose |\n| `FailSafe/extension/package.json` | Authoritative version source |\n';
  const write = (name, contents) => {
    // Existing fixtures target release markers. Keep unrelated canonical
    // registry authority valid unless a test provides a Tier-1 table itself.
    if (name === 'docs/GOVERNANCE_INDEX.md' && !contents.includes('## Tier 1')) contents += tierOne;
    const file = path.join(root, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  write('FailSafe/extension/package.json', '{ "version": "6.0.13" }\n');
  write('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [6.0.13] - 2026-11-13\n\n## [6.0.12] - 2026-11-10\n');
  write('docs/SYSTEM_STATE.md', '# System state\n**Current Release:** v6.0.13 (2026-11-13): verified\n');
  write('docs/ARCHITECTURE_PLAN.md', '# Architecture\n**Current Release:** v6.0.13\n');
  write('docs/GOVERNANCE_INDEX.md', '# Governance index\n**Last Reviewed**: 2026-11-13 (reviewed)\n**Last Reviewed**: 2026-10-22 (historical event)\n');
  write('docs/FEATURE_INDEX.md', '# Feature Index\nSingle canonical cross-reference for FailSafe v6.0.13\n');
  return { root, write, run: (...args) => spawnSync(process.execPath, [CLI, '--repo-root', root, ...args], { encoding: 'utf8' }) };
}

test('reports zero errors on current consistent fixture without mutating any file', t => {
  const f = fixture(t);
  const before = fs.readFileSync(path.join(f.root, 'docs/GOVERNANCE_INDEX.md'), 'utf8');
  const report = checkCurrency(f.root);
  assert.deepEqual(report.summary, { errors: 0, warnings: 0 });
  assert.equal(fs.readFileSync(path.join(f.root, 'docs/GOVERNANCE_INDEX.md'), 'utf8'), before);
  assert.equal(f.run('--enforce').status, 0);
});

test('finds stale governance review marker without overwriting historical entries', t => {
  const f = fixture(t);
  f.write('docs/GOVERNANCE_INDEX.md', '# Gov\n**Last Reviewed**: 2026-10-22\n**Last Reviewed**: 2026-09-05\n');
  const report = checkCurrency(f.root);
  assert.deepEqual(report.findings.map(x => x.id), ['FC004']);
  assert.equal(f.run('--enforce').status, 1);
  assert.equal(f.run().status, 0, 'report-only mode is non-blocking');
});

test('detects stale architecture release marker without changing archived details', t => {
  const f = fixture(t);
  f.write('docs/ARCHITECTURE_PLAN.md', '# Architecture\n**Current Release:** v5.9.0\n**Active Branch:** old\n');
  assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), ['FC003']);
});

test('flags only a warning for dated Feature Index intro, not invented FX coverage', t => {
  const f = fixture(t);
  f.write('docs/FEATURE_INDEX.md', '# Feature\nSingle canonical cross-reference of every user-touchable feature in FailSafe v5.1.6 against documentation\n');
  const report = checkCurrency(f.root);
  assert.deepEqual(report.summary, { errors: 0, warnings: 1 });
  assert.equal(report.findings[0].id, 'FC005');
  assert.equal(f.run('--enforce').status, 0);
});

test('reports current-state and changelog mismatch without accepting historical section', t => {
  const f = fixture(t);
  f.write('CHANGELOG.md', '# Change\n## [6.0.12] - 2026-11-10\n## [6.0.13] - 2026-11-13\n');
  f.write('docs/SYSTEM_STATE.md', '# State\n**Current Release:** v6.0.12\n');
  assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), ['FC001', 'FC002']);
});

test('refuses duplicate current changelog release heading', t => {
  const f = fixture(t);
  f.write('CHANGELOG.md', '## [6.0.13] - 2026-11-13\n## [6.0.13] - 2026-11-14\n');
  assert.throws(() => checkCurrency(f.root), /exactly one CHANGELOG/);
  assert.equal(f.run('--enforce').status, 2);
});

test('refuses impossible release dates and ambiguous canonical release markers', t => {
  const f = fixture(t);
  f.write('CHANGELOG.md', '## [6.0.13] - 2026-02-30\n');
  assert.throws(() => checkCurrency(f.root), /Impossible release date/);
  f.write('CHANGELOG.md', '## [6.0.13] - 2026-11-13\n');
  f.write('docs/ARCHITECTURE_PLAN.md', '**Current Release:** v6.0.13\n**Current Release:** v6.0.12\n');
  assert.throws(() => checkCurrency(f.root), /exactly one ARCHITECTURE_PLAN/);
});

test('refuses missing files and symlinks outside the checked repository', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.root, 'docs/FEATURE_INDEX.md'));
  assert.throws(() => checkCurrency(f.root), /ENOENT/);
  try {
    fs.symlinkSync(path.join(f.root, 'docs/ARCHITECTURE_PLAN.md'), path.join(f.root, 'docs/FEATURE_INDEX.md'));
  } catch (error) {
    // Some Windows hosts restrict symlink creation; absence was already tested.
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return;
    throw error;
  }
  assert.throws(() => checkCurrency(f.root), /Not a regular file/);
});

test('emits machine-readable JSON with stable finding ids, never a native audit verdict', t => {
  const f = fixture(t);
  f.write('docs/GOVERNANCE_INDEX.md', '# Gov\n**Last Reviewed**: 2026-10-22\n');
  const p = f.run('--format', 'json', '--enforce');
  assert.equal(p.status, 1, p.stderr);
  const result = JSON.parse(p.stdout);
  assert.equal(result.kind, 'candidate-document-currency');
  assert.equal(result.findings[0].id, 'FC004');
  assert.equal(Object.hasOwn(result, 'governanceVerdict'), false);
});

test('rejects unknown args and duplicate options with refusal exit 2', t => {
  const f = fixture(t);
  assert.equal(f.run('--something-unsafe').status, 2);
  assert.equal(f.run('--enforce', '--enforce').status, 2);
});

test('refuses malformed SYSTEM_STATE release suffix rather than accepting matching prefix', t => {
  const f = fixture(t);
  f.write('docs/SYSTEM_STATE.md', '**Current Release:** v6.0.13.999\n');
  assert.throws(() => checkCurrency(f.root), /Malformed SYSTEM_STATE Current Release/);
  assert.equal(f.run('--enforce').status, 2);
});

test('refuses malformed ARCHITECTURE_PLAN release suffix rather than accepting matching prefix', t => {
  const f = fixture(t);
  f.write('docs/ARCHITECTURE_PLAN.md', '**Current Release:** v6.0.13junk\n');
  assert.throws(() => checkCurrency(f.root), /Malformed ARCHITECTURE_PLAN Current Release/);
});

test('refuses malformed first governance review date rather than falling through to older history', t => {
  const f = fixture(t);
  f.write('docs/GOVERNANCE_INDEX.md', '**Last Reviewed**: 2026-11-13junk\n**Last Reviewed**: 2026-10-22\n');
  assert.throws(() => checkCurrency(f.root), /Invalid ISO release date/);
  assert.equal(f.run('--format', 'json').status, 2);
});

test('refuses a canonical docs ancestor symlink even when the target remains in the repo', t => {
  const f = fixture(t);
  const canonical = path.join(f.root, 'docs');
  const moved = path.join(f.root, 'docs-original');
  fs.renameSync(canonical, moved);
  try {
    fs.symlinkSync(moved, canonical, 'dir');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return;
    throw error;
  }
  assert.throws(() => checkCurrency(f.root), /Not a regular file.*docs\//);
});

test('FC006 flags a phantom root package.json authority, preserving the index unchanged', t => {
  const f = fixture(t);
  const index = '**Last Reviewed**: 2026-11-13\n## Tier 1 — Canonical Sources\n'
    + '| Path | Purpose |\n| `package.json` (root + extension) | Authoritative version source — current |\n';
  f.write('docs/GOVERNANCE_INDEX.md', index);
  const report = checkCurrency(f.root);
  assert.deepEqual(report.findings.map(x => x.id), ['FC006']);
  assert.match(report.findings[0].message, /FailSafe\/extension\/package\.json/);
  assert.equal(f.run('--enforce').status, 1);
  assert.equal(fs.readFileSync(path.join(f.root, 'docs/GOVERNANCE_INDEX.md'), 'utf8'), index);
});

test('FC006 detects missing and duplicated version authority rows, scoped to Tier 1', t => {
  const f = fixture(t);
  const header = '**Last Reviewed**: 2026-11-13\n## Tier 1 — Canonical Sources\n| Path | Purpose |\n';
  f.write('docs/GOVERNANCE_INDEX.md', header + '| `docs/ARCHITECTURE_PLAN.md` | Current architecture |\n');
  assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), ['FC006']);
  const canonical = '| `FailSafe/extension/package.json` | Authoritative version source |\n';
  f.write('docs/GOVERNANCE_INDEX.md', header + canonical + canonical);
  assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), ['FC006']);
  f.write('docs/GOVERNANCE_INDEX.md', header + canonical + '## Tier 2 — Historical\n'
    + '| `package.json` | Authoritative version source in an archived record |\n');
  assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), [],
    'historical mentions outside the current Tier-1 table are not active authority');
});

test('FC006 refuses a missing Tier-1 section rather than silently passing', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'docs/GOVERNANCE_INDEX.md'), '**Last Reviewed**: 2026-11-13\n');
  assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), ['FC006']);
});
