/**
 * Unit tests for feature-index-classifier-staleness.cjs (E7 / Qor #41).
 *
 * Verifies the override-staleness detector correctly identifies redundant,
 * invalid, and clean overrides + handles missing test-path-in-reason cases.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const staleness = require(path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'feature-index-classifier-staleness.cjs',
));

const classifier = require(path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'feature-index-classifier.cjs',
));

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const FEATURE_INDEX_PATH = path.join(REPO_ROOT, 'docs', 'FEATURE_INDEX.md');

describe('extractTestPath (E7)', () => {
  it('extracts .test.ts substring from reason text', () => {
    const r = staleness.extractTestPath('Phase 3: foo/bar.test.ts directly invokes baz()');
    assert.equal(r, 'foo/bar.test.ts');
  });

  it('extracts .spec.ts substring from reason text', () => {
    const r = staleness.extractTestPath('UI shell covered by ui/compact-ui.spec.ts only');
    assert.equal(r, 'ui/compact-ui.spec.ts');
  });

  it('returns null when no test-file substring present', () => {
    const r = staleness.extractTestPath('manual review per Entry #302');
    assert.equal(r, null);
  });

  it('returns null on non-string input', () => {
    assert.equal(staleness.extractTestPath(undefined), null);
    assert.equal(staleness.extractTestPath(null), null);
    assert.equal(staleness.extractTestPath(42), null);
  });
});

describe('runAudit bypassOverrides (E7)', () => {
  it('bypass=true skips applyManualOverrides; FX128 row has no manualOverride flag', () => {
    if (!fs.existsSync(FEATURE_INDEX_PATH)) {
      assert.fail(`FEATURE_INDEX.md not found at ${FEATURE_INDEX_PATH}`);
    }
    const audit = classifier.runAudit(FEATURE_INDEX_PATH, REPO_ROOT, { bypassOverrides: true });
    const fx128 = audit.rows.find(r => r.entryId === 'FX128');
    assert.ok(fx128, 'FX128 row should exist in classification');
    assert.equal(fx128.manualOverride, undefined,
      'bypass mode should NOT attach manualOverride flag');
  });

  it('default (no options) preserves manualOverride flag on FX128', () => {
    const audit = classifier.runAudit(FEATURE_INDEX_PATH, REPO_ROOT);
    const fx128 = audit.rows.find(r => r.entryId === 'FX128');
    assert.ok(fx128, 'FX128 row should exist in classification');
    assert.equal(fx128.manualOverride, true,
      'default mode preserves manualOverride flag');
  });
});

describe('detectStaleness against current FEATURE_INDEX (E7 baseline)', () => {
  it('produces summary with all 8 current overrides checked + invalid_count=0', () => {
    if (!fs.existsSync(FEATURE_INDEX_PATH)) {
      assert.fail(`FEATURE_INDEX.md not found at ${FEATURE_INDEX_PATH}`);
    }
    const result = staleness.detectStaleness(FEATURE_INDEX_PATH, REPO_ROOT);
    assert.ok(result.summary, 'summary should be present');
    assert.equal(result.summary.total_overrides_checked, 8,
      `expected 8 overrides, got ${result.summary.total_overrides_checked}`);
    assert.equal(result.summary.invalid_count, 0,
      `expected 0 invalid (regression guard); got ${result.summary.invalid_count}: ${JSON.stringify(result.findings.filter(f => f.kind === 'invalid'))}`);
    assert.ok(Array.isArray(result.findings), 'findings should be an array');
  });
});
