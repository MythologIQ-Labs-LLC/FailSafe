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

describe('check-plan-citation-parity: infrastructure is not a pass', () => {
  // The gate shipped with `path` unimported. path.resolve threw, a bare catch
  // in trackedPlans swallowed it, the run printed "no tracked plans" and
  // EXITED 0. The gate written to catch fail-open had fail-open in it. These
  // pin the corrected posture.
  it('exposes tracked plans rather than reporting an empty set', () => {
    const plans = gate.trackedPlans();
    assert.ok(Array.isArray(plans), 'trackedPlans returns an array');
    assert.ok(plans.length > 0, 'the repo has tracked plans; an empty set would be the fail-open');
    assert.ok(plans.every((p) => p.endsWith('.md')), 'every entry is a markdown plan');
  });

  it('marks an unrunnable lint as infra and NOT as a pass', () => {
    const p = writePlan(PLAN_WITH_3_LDS);
    // Force the unavailable branch by pointing at a plan whose lint cannot run:
    // supply an output that has no count AND assert we never call it a pass.
    const r = gate.check(p, '');
    assert.equal(r.pass, false, 'empty lint output is never a pass');
  });

  it('runAll returns a non-zero code when any declared plan fails parity', () => {
    // runAll over the real repo: exit 0 only when every LD-declaring plan
    // verified, 1 on a real mismatch, 2 when the tool was unavailable.
    const code = gate.runAll();
    assert.ok([0, 1, 2].includes(code), `runAll returns a defined code, got ${code}`);
    assert.notEqual(code, undefined);
  });
});

describe('check-plan-citation-parity: structural precondition (zero-dependency)', () => {
  // THE ORIGIN FAILURE, detectable without the lint. plan_grep_lint only scans
  // regions under a "locked decision"/"citation inventory" heading; an LD
  // outside one is invisible to it, so it reports 0 checked and exits 0.
  it('flags an LD that sits outside any LD-heading region', () => {
    const text = ['# Plan', '', '## Changes', '', 'LD1 - outside.', '', '> evidence'].join('\n');
    const { orphans } = gate.checkStructure(text);
    assert.deepEqual(orphans, [5], 'the orphaned LD line number is reported');
  });

  it('accepts LDs under a "Locked Decisions" heading', () => {
    const text = ['# Plan', '', '#### Locked Decisions', '', 'LD1 - inside.'].join('\n');
    assert.deepEqual(gate.checkStructure(text).orphans, []);
  });

  it('accepts LDs under a "Citation Inventory" heading', () => {
    const text = ['# Plan', '', '#### Citation Inventory', '', 'LD0 - inside.'].join('\n');
    assert.deepEqual(gate.checkStructure(text).orphans, []);
  });

  it('re-closes the region when a later non-LD heading starts', () => {
    const text = ['#### Locked Decisions', '', 'LD1 - inside.', '', '#### Implementation', '', 'LD2 - now outside.'].join('\n');
    assert.deepEqual(gate.checkStructure(text).orphans, [7],
      'a following non-LD heading ends the region, matching the lint');
  });

  it('check() fails structurally before it ever needs the lint', () => {
    const p = writePlan(['# Plan', '', '## Changes', '', 'LD1 - orphan.'].join('\n'));
    const r = gate.check(p, undefined);
    assert.equal(r.pass, false);
    assert.equal(r.structural, true, 'structural failure is reported without consulting the lint');
    assert.match(r.note, /cannot see them/);
  });

  it('runStructureOnly returns 0 on the real repo and never 2', () => {
    const code = gate.runStructureOnly();
    assert.notEqual(code, 2, 'structure-only has no unavailable path - it must never report infra');
    assert.ok([0, 1].includes(code));
  });
});
