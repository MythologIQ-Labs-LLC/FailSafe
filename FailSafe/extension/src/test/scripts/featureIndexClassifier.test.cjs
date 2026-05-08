/**
 * Unit tests for feature-index-classifier.cjs (Phase 1 of
 * plan-feature-index-baseline-audit.md v2).
 *
 * Covers the test functionality classifier heuristics applied per
 * SG-035 acceptance question to FEATURE_INDEX.md row classifications.
 *
 * Runs standalone: node --test src/test/scripts/featureIndexClassifier.test.cjs
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

let TMP_DIR;

before(() => {
  TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fic-test-'));
});

after(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('parseFeatureIndexRows', () => {
  it('parses a standard verified row', () => {
    const text = [
      '| ID | Feature | Doc | Code | Test | Status | Notes |',
      '|---|---|---|---|---|---|---|',
      '| FX001 | failsafe.openSidebar | F001 | C001 | extension/commands-dispatch.test.ts | verified | dispatch chain |',
      '',
    ].join('\n');
    const rows = classifier.parseFeatureIndexRows(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entryId, 'FX001');
    assert.equal(rows[0].feature, 'failsafe.openSidebar');
    assert.deepEqual(rows[0].testPaths, ['extension/commands-dispatch.test.ts']);
    assert.equal(rows[0].status, 'verified');
  });

  it('splits multi-test row on `+`', () => {
    const text = [
      '| ID | Feature | Doc | Code | Test | Status | Notes |',
      '|---|---|---|---|---|---|---|',
      '| FX002 | failsafe.foo | F002 | C002 | extension/a.test.ts + governance/b.test.ts | verified | multi |',
    ].join('\n');
    const rows = classifier.parseFeatureIndexRows(text);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].testPaths, ['extension/a.test.ts', 'governance/b.test.ts']);
  });

  it('em-dash test cell yields empty testPaths array', () => {
    const text = [
      '| ID | Feature | Doc | Code | Test | Status | Notes |',
      '|---|---|---|---|---|---|---|',
      '| FX013 | failsafe.openProjectOverview | F013 | C003 | — | verified |  |',
    ].join('\n');
    const rows = classifier.parseFeatureIndexRows(text);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].testPaths, []);
  });

  it('skips header + separator rows + non-FX rows', () => {
    const text = [
      '# title',
      '',
      '| ID | Feature | Doc | Code | Test | Status | Notes |',
      '|---|---|---|---|---|---|---|',
      '| FX001 | feat | F1 | C1 | a.test.ts | verified |  |',
      '',
      'Random prose',
      '',
      '| ID | Feature | Doc | Code | Test | Status | Notes |',
      '|---|---|---|---|---|---|---|',
      '| FX002 | feat2 | F2 | C2 | b.test.ts | verified |  |',
    ].join('\n');
    const rows = classifier.parseFeatureIndexRows(text);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].entryId, 'FX001');
    assert.equal(rows[1].entryId, 'FX002');
  });

  it('smoke test: returns 476 rows when given the actual FEATURE_INDEX.md', () => {
    if (!fs.existsSync(FEATURE_INDEX_PATH)) {
      assert.fail(`FEATURE_INDEX.md not found at ${FEATURE_INDEX_PATH}`);
    }
    const text = fs.readFileSync(FEATURE_INDEX_PATH, 'utf-8');
    const rows = classifier.parseFeatureIndexRows(text);
    assert.equal(rows.length, 476);
  });
});

describe('classifyTestFile', () => {
  it('null input → unrunnable', () => {
    const result = classifier.classifyTestFile(null, 'someSymbol');
    assert.equal(result.kind, 'unrunnable');
  });

  it('comments only with no test blocks → no-test-blocks', () => {
    const text = [
      '// only comments here',
      '/* nothing else */',
      'const x = 1;',
    ].join('\n');
    const result = classifier.classifyTestFile(text, 'someSymbol');
    assert.equal(result.kind, 'no-test-blocks');
  });

  it('only presence-style assertions → presence-only', () => {
    const text = [
      'const fs = require("fs");',
      'describe("things", () => {',
      '  it("exists", () => {',
      '    assert.ok(fs.existsSync(targetPath));',
      '  });',
      '});',
    ].join('\n');
    const result = classifier.classifyTestFile(text, 'someSymbol');
    assert.equal(result.kind, 'presence-only');
  });

  it('invokes unit + asserts equality on return → functional', () => {
    const text = [
      'describe("unit", () => {',
      '  it("returns true", () => {',
      '    const r = unit();',
      '    assert.equal(r, true);',
      '  });',
      '});',
    ].join('\n');
    const result = classifier.classifyTestFile(text, 'unit');
    assert.equal(result.kind, 'functional');
  });

  it('expect spy toHaveBeenCalledWith after method invocation → functional', () => {
    const text = [
      'describe("svc", () => {',
      '  it("calls collaborator", () => {',
      '    svc.doThing(input);',
      '    expect(spy).toHaveBeenCalledWith(input);',
      '  });',
      '});',
    ].join('\n');
    const result = classifier.classifyTestFile(text, 'doThing');
    assert.equal(result.kind, 'functional');
  });

  it('attribute-presence checks only (no real invocation) → presence-only', () => {
    const text = [
      'describe("shape", () => {',
      '  it("does X", () => {',
      '    expect(obj.X).toBeDefined();',
      '  });',
      '});',
    ].join('\n');
    const result = classifier.classifyTestFile(text, 'X');
    assert.equal(result.kind, 'presence-only');
  });
});

describe('classifyEntry', () => {
  let fixtureRoot;

  before(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fic-entry-'));
    const testDir = path.join(fixtureRoot, 'FailSafe', 'extension', 'src', 'test');
    fs.mkdirSync(path.join(testDir, 'a'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'b'), { recursive: true });

    fs.writeFileSync(
      path.join(testDir, 'a', 'functional.test.ts'),
      [
        'describe("u", () => {',
        '  it("returns ok", () => {',
        '    const r = thing();',
        '    assert.equal(r, "ok");',
        '  });',
        '});',
      ].join('\n'),
    );

    fs.writeFileSync(
      path.join(testDir, 'b', 'presence.test.ts'),
      [
        'describe("p", () => {',
        '  it("exists", () => {',
        '    assert.ok(fs.existsSync(p));',
        '  });',
        '});',
      ].join('\n'),
    );

    fs.writeFileSync(
      path.join(testDir, 'b', 'presence2.test.ts'),
      [
        'describe("p2", () => {',
        '  it("defined", () => {',
        '    expect(thing).toBeDefined();',
        '  });',
        '});',
      ].join('\n'),
    );
  });

  after(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('multi-test row, one functional + one presence-only → suggestedStatus verified', () => {
    const row = {
      entryId: 'FX900',
      feature: 'foo',
      docRef: 'F900',
      codeRef: 'C900',
      testPaths: ['a/functional.test.ts', 'b/presence.test.ts'],
      status: 'verified',
      notes: '',
      line: 1,
    };
    const result = classifier.classifyEntry(row, fixtureRoot);
    assert.equal(result.suggestedStatus, 'verified');
    assert.equal(result.classifications.length, 2);
    const kinds = result.classifications.map(c => c.kind).sort();
    assert.deepEqual(kinds, ['functional', 'presence-only']);
  });

  it('multi-test row, all presence-only → suggestedStatus unverified', () => {
    const row = {
      entryId: 'FX901',
      feature: 'bar',
      docRef: 'F901',
      codeRef: 'C901',
      testPaths: ['b/presence.test.ts', 'b/presence2.test.ts'],
      status: 'verified',
      notes: '',
      line: 2,
    };
    const result = classifier.classifyEntry(row, fixtureRoot);
    assert.equal(result.suggestedStatus, 'unverified');
    assert.equal(result.classifications.length, 2);
    for (const c of result.classifications) {
      assert.equal(c.kind, 'presence-only');
    }
  });
});

describe('runAudit', () => {
  it('smoke test against actual docs/FEATURE_INDEX.md — returns total 476', () => {
    if (!fs.existsSync(FEATURE_INDEX_PATH)) {
      assert.fail(`FEATURE_INDEX.md not found at ${FEATURE_INDEX_PATH}`);
    }
    const audit = classifier.runAudit(FEATURE_INDEX_PATH, REPO_ROOT);
    assert.ok(audit.summary, 'audit.summary missing');
    assert.equal(audit.summary.total, 476);
    assert.ok(Array.isArray(audit.rows), 'audit.rows must be array');
    assert.equal(audit.rows.length, 476);
  });
});

describe('resolveTestPath path-form variants (E2)', () => {
  const SAMPLE = 'extension/commands-dispatch.test.ts';

  it('bare path resolves under FailSafe/extension/src/test/', () => {
    const r = classifier.resolveTestPath(REPO_ROOT, SAMPLE);
    assert.ok(r, `expected non-null, got ${r}`);
    assert.ok(r.endsWith(path.normalize(SAMPLE)), `expected suffix ${SAMPLE}, got ${r}`);
  });

  it('src/test/-prefixed path resolves (prefix stripped)', () => {
    const r = classifier.resolveTestPath(REPO_ROOT, `src/test/${SAMPLE}`);
    assert.ok(r, `expected non-null, got ${r}`);
    assert.ok(r.endsWith(path.normalize(SAMPLE)), `expected suffix ${SAMPLE}, got ${r}`);
  });

  it('full-repo prefix resolves (prefix stripped)', () => {
    const r = classifier.resolveTestPath(REPO_ROOT, `FailSafe/extension/src/test/${SAMPLE}`);
    assert.ok(r, `expected non-null, got ${r}`);
    assert.ok(r.endsWith(path.normalize(SAMPLE)), `expected suffix ${SAMPLE}, got ${r}`);
  });
});

describe('applyManualOverrides (E2)', () => {
  it('FX128 entry flips to unverified with manualOverride flag', () => {
    const entry = {
      entryId: 'FX128',
      currentStatus: 'verified',
      suggestedStatus: 'verified',
      classifications: [{ testPath: 'roadmap/AgentCoverageRoute.test.ts', kind: 'functional', reasoning: 'invokes' }],
      notes: '',
    };
    const r = classifier.applyManualOverrides(entry);
    assert.equal(r.suggestedStatus, 'unverified');
    assert.equal(r.manualOverride, true);
    assert.match(r.manualOverrideReason, /Phase 3/);
    assert.equal(r.entryId, 'FX128');
  });

  it('non-overridden entry passes through unchanged', () => {
    const entry = {
      entryId: 'FX001',
      currentStatus: 'verified',
      suggestedStatus: 'verified',
      classifications: [{ testPath: 'extension/commands-dispatch.test.ts', kind: 'functional', reasoning: 'invokes' }],
      notes: '',
    };
    const r = classifier.applyManualOverrides(entry);
    assert.equal(r.suggestedStatus, 'verified');
    assert.equal(r.manualOverride, undefined);
    assert.equal(r.manualOverrideReason, undefined);
    assert.equal(r.entryId, 'FX001');
  });
});
