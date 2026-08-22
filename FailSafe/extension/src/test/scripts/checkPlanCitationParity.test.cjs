/**
 * check-plan-citation-parity — behavioral tests.
 *
 * The gate exists because `plan_grep_lint` reported "0 citation(s)
 * truth-checked" and exited 0 against a plan with nine Locked Decisions
 * (FailSafe ledger #592/#594/#595). These tests drive the exact failing
 * condition, not just the happy path — a gate that only proves PASS on clean
 * input is the same defect it was written to catch.
 *
 * Runs standalone: node --test src/test/scripts/checkPlanCitationParity.test.cjs
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../../../scripts/check-plan-citation-parity.cjs');

const PLAN_WITH_3_LDS = [
  '# Plan: example',
  '',
  '### Changes',
  '',
  '#### Locked Decisions',
  '',
  'LD1 — first decision.',
  '',
  '> `git show HEAD:a.ts | grep -nE \'^x\' -> 1:x`',
  '',
  'LD2 — second decision.',
  '',
  '> `git show HEAD:b.ts | grep -nE \'^y\' -> 2:y`',
  '',
  'LD3 — third decision.',
  '',
  '> `git show HEAD:c.ts | grep -nE \'^z\' -> 3:z`',
  '',
].join('\n');

const PLAN_NO_LDS = '# Plan: docs only\n\nNo locked decisions here.\n';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'citation-parity-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function writePlan(text, name = 'plan.md') {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, text, 'utf8');
  return p;
}

describe('check-plan-citation-parity: counts Locked Decisions', () => {
  it('counts each LD<n> heading-line, not evidence lines or prose mentions', () => {
    assert.equal(gate.countLockedDecisions(PLAN_WITH_3_LDS), 3);
  });

  it('returns 0 for a plan that declares none', () => {
    assert.equal(gate.countLockedDecisions(PLAN_NO_LDS), 0);
  });
});

describe('check-plan-citation-parity: parses the lint count', () => {
  it('extracts N from the truth-checked line', () => {
    const out = 'plan-grep-lint: 9 citation(s) truth-checked [file:line, grep-n evidence]';
    assert.equal(gate.parseTruthCheckedCount(out), 9);
  });

  it('extracts zero as zero, not as absent', () => {
    const out = 'plan-grep-lint: 0 citation(s) truth-checked [file:line, grep-n evidence]';
    assert.equal(gate.parseTruthCheckedCount(out), 0);
  });

  it('returns null when the output carries no count at all', () => {
    assert.equal(gate.parseTruthCheckedCount('some unrelated output'), null);
  });
});

describe('check-plan-citation-parity: the discriminating cases', () => {
  // THE ORIGIN CASE. Nine LDs, lint reports zero, lint exits 0. Before this
  // gate that read as a pass. It must now fail.
  it('FAILS when the lint truth-checked zero citations against a plan that declares some', () => {
    const p = writePlan(PLAN_WITH_3_LDS);
    const r = gate.check(p, 'plan-grep-lint: 0 citation(s) truth-checked [file:line, grep-n evidence]');
    assert.equal(r.pass, false, 'zero-checked against three declared must fail');
    assert.equal(r.declared, 3);
    assert.equal(r.checked, 0);
    assert.match(r.note, /assertion, not evidence/);
  });

  it('PASSES only when every declared Locked Decision was truth-checked', () => {
    const p = writePlan(PLAN_WITH_3_LDS);
    const r = gate.check(p, 'plan-grep-lint: 3 citation(s) truth-checked [file:line, grep-n evidence]');
    assert.equal(r.pass, true);
    assert.equal(r.declared, 3);
    assert.equal(r.checked, 3);
  });

  it('FAILS on a partial check — 2 of 3 is not a pass', () => {
    const p = writePlan(PLAN_WITH_3_LDS);
    const r = gate.check(p, 'plan-grep-lint: 2 citation(s) truth-checked [file:line, grep-n evidence]');
    assert.equal(r.pass, false);
    assert.match(r.note, /verified 2 of 3/);
  });

  it('FAILS when lint output cannot be obtained for a plan that declares LDs', () => {
    const p = writePlan(PLAN_WITH_3_LDS);
    const r = gate.check(p, null);
    // null means "go run the lint"; in this sandbox the CLI may be absent, in
    // which case runLint returns null and the gate must fail closed rather
    // than treat an unobtainable check as a pass.
    if (r.checked === null) {
      assert.equal(r.pass, false, 'unobtainable lint output must fail closed');
      assert.match(r.note, /cannot confirm|no "N citation/);
    }
  });

  it('FAILS when the lint output shape changed and carries no count', () => {
    const p = writePlan(PLAN_WITH_3_LDS);
    const r = gate.check(p, 'plan-grep-lint: finished');
    assert.equal(r.pass, false);
    assert.match(r.note, /no "N citation\(s\) truth-checked" count/);
  });

  it('passes a plan with no Locked Decisions without demanding a lint run', () => {
    const p = writePlan(PLAN_NO_LDS);
    const r = gate.check(p, null);
    assert.equal(r.pass, true);
    assert.equal(r.declared, 0);
    assert.match(r.note, /nothing to verify/);
  });
});
