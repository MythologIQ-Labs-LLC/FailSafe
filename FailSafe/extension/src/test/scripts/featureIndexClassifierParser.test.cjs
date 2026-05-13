/**
 * Unit tests for feature-index-classifier-parser.cjs (Phase 62).
 *
 * Verifies parseFeatureIndexRows extracts FX rows from a FEATURE_INDEX-shaped
 * markdown table, with correct per-row fields and skip behavior on
 * header/separator/non-FX rows.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const parser = require(path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'feature-index-classifier-parser.cjs',
));

const classifier = require(path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'feature-index-classifier.cjs',
));

const FIXTURE = [
    '# FailSafe Feature Index',
    '',
    '| FX# | Feature | Doc | Code | Cited Test | Status | Notes |',
    '|---|---|---|---|---|---|---|',
    '| FX042 | Auth | docs/auth.md | src/auth.ts | src/test/auth.test.ts | verified | covered by FX099 |',
    '| FX043 | Org | docs/org.md | src/org.ts | — | unverified | needs operator review |',
    '| not-a-row |',
    '| FX044 | Multi | docs/x.md | src/x.ts | src/test/a.test.ts + src/test/b.test.ts | verified | dual coverage |',
].join('\n');

describe('feature-index-classifier-parser: parseFeatureIndexRows', () => {
    it('returns exactly three FX rows from the fixture (skips header/separator/non-FX)', () => {
        const rows = parser.parseFeatureIndexRows(FIXTURE);
        assert.equal(rows.length, 3);
        assert.deepEqual(rows.map(r => r.entryId), ['FX042', 'FX043', 'FX044']);
    });

    it('parses per-row fields including feature/doc/code/status/notes', () => {
        const rows = parser.parseFeatureIndexRows(FIXTURE);
        const fx042 = rows[0];
        assert.equal(fx042.feature, 'Auth');
        assert.equal(fx042.docRef, 'docs/auth.md');
        assert.equal(fx042.codeRef, 'src/auth.ts');
        assert.equal(fx042.status, 'verified');
        assert.equal(fx042.notes, 'covered by FX099');
    });

    it('returns empty testPaths array when cell is em-dash placeholder', () => {
        const rows = parser.parseFeatureIndexRows(FIXTURE);
        const fx043 = rows[1];
        assert.deepEqual(fx043.testPaths, []);
    });

    it('splits multi-test cells on + into trimmed path array', () => {
        const rows = parser.parseFeatureIndexRows(FIXTURE);
        const fx044 = rows[2];
        assert.deepEqual(fx044.testPaths, ['src/test/a.test.ts', 'src/test/b.test.ts']);
    });

    it('attaches 1-based line number to each row', () => {
        const rows = parser.parseFeatureIndexRows(FIXTURE);
        assert.equal(rows[0].line, 5);
        assert.equal(rows[1].line, 6);
        assert.equal(rows[2].line, 8);
    });
});

describe('feature-index-classifier: re-export contract (V2 fix)', () => {
    it('classifier.cjs re-exports parseFeatureIndexRows from the parser sibling', () => {
        assert.equal(classifier.parseFeatureIndexRows, parser.parseFeatureIndexRows);
    });
});
