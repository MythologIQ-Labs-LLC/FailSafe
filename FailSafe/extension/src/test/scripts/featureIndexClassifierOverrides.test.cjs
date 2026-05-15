/**
 * Unit tests for feature-index-classifier-overrides.cjs (Phase 62).
 *
 * Phase 1 verifies: extracted MANUAL_OVERRIDES map readable + applyManualOverrides
 * applies the override via function call (not via map presence-check). Plus
 * regression that classifier.cjs re-exports the same symbols so downstream
 * consumers (staleness.cjs + tests) need no changes.
 *
 * Phase 2 verifies: redundancy cleanup (FX128/FX359 removed; map size 28 → 26).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const overrides = require(path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'feature-index-classifier-overrides.cjs',
));

const classifier = require(path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'feature-index-classifier.cjs',
));

describe('feature-index-classifier-overrides: applyManualOverrides', () => {
    it('applies the override status when entryId is in the map', () => {
        const entry = { entryId: 'FX133', currentStatus: 'unverified', suggestedStatus: 'unverified' };
        const out = overrides.applyManualOverrides(entry);
        assert.equal(out.suggestedStatus, overrides.MANUAL_OVERRIDES.FX133.status);
        assert.equal(out.manualOverride, true);
        assert.equal(out.manualOverrideReason, overrides.MANUAL_OVERRIDES.FX133.reason);
    });

    it('passes through entries not in the map unchanged', () => {
        const entry = { entryId: 'FX999', currentStatus: 'unverified', suggestedStatus: 'unverified' };
        const out = overrides.applyManualOverrides(entry);
        assert.equal(out, entry);
        assert.equal(out.manualOverride, undefined);
    });
});

describe('feature-index-classifier-overrides: MANUAL_OVERRIDES map (Phase 2 post-cleanup)', () => {
    it('has 26 entries after FX128 + FX359 redundancy cleanup', () => {
        assert.equal(Object.keys(overrides.MANUAL_OVERRIDES).length, 26);
    });

    it('does not contain FX128 (removed in Phase 2)', () => {
        assert.equal(overrides.MANUAL_OVERRIDES.FX128, undefined);
    });

    it('does not contain FX359 (removed in Phase 2)', () => {
        assert.equal(overrides.MANUAL_OVERRIDES.FX359, undefined);
    });

    it('preserved entries have non-empty status and reason fields', () => {
        for (const id of ['FX133', 'FX212', 'FX473']) {
            const entry = overrides.MANUAL_OVERRIDES[id];
            assert.ok(entry, `${id} should be present`);
            assert.ok(entry.status && entry.status.length > 0, `${id} status non-empty`);
            assert.ok(entry.reason && entry.reason.length > 0, `${id} reason non-empty`);
        }
    });
});

describe('feature-index-classifier: re-export contract (V2 fix)', () => {
    it('classifier.cjs re-exports MANUAL_OVERRIDES from the overrides sibling', () => {
        assert.equal(classifier.MANUAL_OVERRIDES, overrides.MANUAL_OVERRIDES);
    });

    it('classifier.cjs re-exports applyManualOverrides from the overrides sibling', () => {
        assert.equal(classifier.applyManualOverrides, overrides.applyManualOverrides);
    });
});
