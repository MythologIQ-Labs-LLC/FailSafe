/**
 * Regression tests for ghost-ui-live-progress-lint.cjs (Phase 5 of
 * plan-qor-install-skills-ux-expansion). Validates the four canonical
 * cases mirrored in upstream Qor-logic#58.
 *
 * Runs standalone: node --test src/test/scripts/ghostUiLiveProgressLint.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { analyzeProgressElements } = require(path.resolve(
  __dirname, '..', '..', '..', 'scripts', 'lib', 'ghost-ui-live-progress-lint.cjs',
));

function fakeJumpFixture() {
  return [
    '<div class="cc-modal-progress-bar" id="progressBar"></div>',
    '<script>',
    "  progressBar.style.width = '0%';",
    "  doWork().then(() => { progressBar.style.width = '100%'; });",
    '</script>',
  ].join('\n');
}

function okFixture() {
  return [
    '<div class="progress-bar" id="progressBar"></div>',
    '<script>',
    "  progressBar.style.width = '0%';",
    "  onStep(() => { progressBar.style.width = '50%'; });",
    "  onDone(() => { progressBar.style.width = '100%'; });",
    '</script>',
  ].join('\n');
}

function staticFixture() {
  return [
    '<div class="progress-bar css-only" id="progressBar"></div>',
    '<style>.css-only { animation: pulse 2s linear infinite; }</style>',
  ].join('\n');
}

function malformedFixture() {
  return [
    '<div class="progress-label">Loading...</div>',
    '<script>console.log("no width manipulation here");</script>',
  ].join('\n');
}

describe('analyzeProgressElements', () => {
  it('flags FAKE_JUMP when only 0% and 100% writes exist for one context', () => {
    const results = analyzeProgressElements(fakeJumpFixture());
    assert.ok(Array.isArray(results), 'returns an array');
    const flagged = results.find((r) => r.livenessRule === 'FAKE_JUMP');
    assert.ok(flagged, 'at least one FAKE_JUMP entry');
    assert.equal(flagged.element, 'progress-bar');
    assert.match(flagged.selector, /progressBar/);
    assert.ok(typeof flagged.evidence === 'string' && flagged.evidence.length > 0,
      'evidence string present');
  });

  it('returns OK when intermediate writes are present', () => {
    const results = analyzeProgressElements(okFixture());
    assert.ok(Array.isArray(results));
    const okEntry = results.find((r) => r.livenessRule === 'OK');
    assert.ok(okEntry, 'one OK entry expected');
    assert.equal(okEntry.element, 'progress-bar');
    const anyFake = results.some((r) => r.livenessRule === 'FAKE_JUMP');
    assert.equal(anyFake, false, 'no FAKE_JUMP entries when intermediate writes exist');
  });

  it('returns STATIC when progress-bar selector exists with no width writes', () => {
    const results = analyzeProgressElements(staticFixture());
    assert.ok(Array.isArray(results));
    const anyFake = results.some((r) => r.livenessRule === 'FAKE_JUMP');
    assert.equal(anyFake, false, 'no FAKE_JUMP for purely CSS-animated bars');
    const allStatic = results.every((r) => r.livenessRule === 'STATIC');
    assert.equal(allStatic, true,
      'every detected entry should be STATIC when no width writes exist');
  });

  it('does not flag MALFORMED fixtures lacking width manipulation', () => {
    const results = analyzeProgressElements(malformedFixture());
    assert.ok(Array.isArray(results));
    const anyFake = results.some((r) => r.livenessRule === 'FAKE_JUMP');
    assert.equal(anyFake, false, 'no FAKE_JUMP without width manipulation');
    const anyOk = results.some((r) => r.livenessRule === 'OK');
    assert.equal(anyOk, false, 'no OK entries without width manipulation');
  });
});
