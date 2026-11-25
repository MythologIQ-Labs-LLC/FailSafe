'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkCurrency } = require('../../../scripts/check-governance-currency.cjs');
const { fixture } = require('./governanceCurrencyFixture.cjs');

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
  // Near misses of the exact authority cell, one per class; each must be FC006, never accepted.
  const nearMisses = [
    ['a prefix and suffix around the path', '`legacy/FailSafe/extension/package.json.bak`'],
    ['a trailing extra path', '`FailSafe/extension/package.json` and `package.json` (root)'],
    ['a leading extra path', '`package.json` (root) and `FailSafe/extension/package.json`'],
    ['a case variant', '`failsafe/extension/package.json`'],
    ['an inserted character', '`FailSafe/extension/ package.json`'],
    ['a changed character', '`FailSafe/extensiom/package.json`'],
    ['the path without code quotes', 'FailSafe/extension/package.json'],
  ];
  for (const [kind, cell] of nearMisses) {
    f.write('docs/GOVERNANCE_INDEX.md', header + `| ${cell} | Authoritative version source |\n`);
    assert.deepEqual(checkCurrency(f.root).findings.map(x => x.id), ['FC006'], `near miss accepted (${kind}): ${cell}`);
  }
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


test('current checked-out Tier-1 governance version authority matches the real manifest', t => {
  // Read the actual candidate Tier-1 authority with otherwise-consistent
  // release fixtures: only the Governance Index is under test here.
  const repo = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const index = fs.readFileSync(path.join(repo, 'docs', 'GOVERNANCE_INDEX.md'), 'utf8');
  const f = fixture(t);
  f.write('docs/GOVERNANCE_INDEX.md', index);
  const report = checkCurrency(f.root);
  assert.equal(report.findings.some(f => f.id === 'FC006'), false,
    'current Tier-1 manifest declaration must match the nested manifest');
  assert.equal(fs.readFileSync(path.join(f.root, 'docs', 'GOVERNANCE_INDEX.md'), 'utf8'), index,
    'read-only validation must never update the governance review marker');
});

test('#722: the checked-out repository has no current-release marker error (prospective stale-marker guard)', () => {
  // Holds the real Tier-1 documents current: a release that leaves SYSTEM_STATE, ARCHITECTURE_PLAN,
  // the Governance Index review marker or the Tier-1 version authority behind fails here.
  const repo = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const report = checkCurrency(repo);
  const errors = report.findings.filter((f) => f.severity === 'error');
  assert.deepEqual(errors, [], `Tier-1 release markers disagree with v${report.version}: ${errors.map((e) => e.id + ' ' + e.message).join('; ')}`);
});

test('reads the current-release marker only from the head of SYSTEM_STATE, not from its history', t => {
  const f = fixture(t);
  const history = '\n## History\n' + 'x'.repeat(12000) + '\n**Current Release:** v6.0.12 (2026-11-10)\n';
  f.write('docs/SYSTEM_STATE.md', '# System state\n**Current Release:** v6.0.13 (2026-11-13): verified\n' + history);
  assert.deepEqual(checkCurrency(f.root).findings, [], 'a historical release line deep in the document is not the current marker');
});
