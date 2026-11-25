'use strict';
/** #722 currency check: inputs it must refuse (exit 2) rather than report on. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkCurrency } = require('../../../scripts/check-governance-currency.cjs');
const { DIR_LINK, fixture } = require('./governanceCurrencyFixture.cjs');

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
    // Some Windows hosts restrict symlink creation; absence was already tested. Report it as skipped.
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('symlink creation not permitted on this host');
    throw error;
  }
  assert.throws(() => checkCurrency(f.root), /Not a regular file/);
});

test('rejects unknown args and duplicate options with refusal exit 2', t => {
  const f = fixture(t);
  assert.equal(f.run('--something-unsafe').status, 2);
  assert.equal(f.run('--enforce', '--enforce').status, 2);
  assert.equal(f.run('--format', 'text').status, 2, 'only --format json is accepted');
  for (const inherited of [['constructor'], ['--enforce', 'toString'], ['hasOwnProperty'], ['--format', 'json', 'valueOf']]) {
    assert.equal(f.run(...inherited).status, 2, `inherited name accepted as an option: ${inherited.join(' ')}`);
  }
  assert.equal(f.run('--repo-root').status, 2, '--repo-root needs a value');
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
    fs.symlinkSync(moved, canonical, DIR_LINK);
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('symlink creation not permitted on this host');
    throw error;
  }
  assert.throws(() => checkCurrency(f.root), /Not a regular file.*docs\//);
});

test('refuses an oversized source, a malformed manifest version and a symlinked repository root', t => {
  const f = fixture(t);
  f.write('docs/FEATURE_INDEX.md', 'x'.repeat(3 * 1024 * 1024 + 1));
  assert.throws(() => checkCurrency(f.root), /Oversized source: docs\/FEATURE_INDEX\.md/);
  const g = fixture(t);
  g.write('FailSafe/extension/package.json', '{ "version": "6.0" }\n');
  assert.throws(() => checkCurrency(g.root), /does not declare an unambiguous SemVer version/);
  const link = path.join(os.tmpdir(), `failsafe-doc-currency-link-${process.pid}-${Date.now()}`);
  try {
    fs.symlinkSync(g.root, link, DIR_LINK);
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('symlink creation not permitted on this host');
    throw error;
  }
  t.after(() => fs.rmSync(link, { force: true }));
  assert.throws(() => checkCurrency(link), /Repository root must be a real directory/);
});
