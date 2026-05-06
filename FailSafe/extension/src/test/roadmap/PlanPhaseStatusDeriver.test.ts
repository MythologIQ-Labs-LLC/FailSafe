import { strict as assert } from "assert";
import {
  derivePlanPhaseStatuses,
  phaseToCompletionFloor,
  type ShieldPhaseStatus,
} from "../../roadmap/services/PlanPhaseStatusDeriver";

const EXPECTED_IDS = ["plan", "audit", "implement", "substantiate"];

function expectShape(result: ShieldPhaseStatus[]): void {
  assert.strictEqual(result.length, 4, "must always return 4 elements");
  result.forEach((p, i) => assert.strictEqual(p.id, EXPECTED_IDS[i], `index ${i} id`));
}

suite("PlanPhaseStatusDeriver", () => {
  test("IDLE → all 4 phases pending", () => {
    const r = derivePlanPhaseStatuses("IDLE", undefined);
    expectShape(r);
    r.forEach(p => assert.strictEqual(p.status, "pending", `${p.id} status`));
  });

  test("PLAN with no verdict → plan active, others pending", () => {
    const r = derivePlanPhaseStatuses("PLAN", undefined);
    expectShape(r);
    assert.strictEqual(r[0].status, "active");
    assert.strictEqual(r[1].status, "pending");
    assert.strictEqual(r[2].status, "pending");
    assert.strictEqual(r[3].status, "pending");
  });

  test("GATE with PASS verdict → plan completed, audit active", () => {
    const r = derivePlanPhaseStatuses("GATE", "PASS");
    assert.strictEqual(r[0].status, "completed");
    assert.strictEqual(r[1].status, "active");
    assert.strictEqual(r[2].status, "pending");
    assert.strictEqual(r[3].status, "pending");
  });

  test("GATE with VETO verdict → no advancement (audit still active)", () => {
    const r = derivePlanPhaseStatuses("GATE", "VETO — security finding");
    assert.strictEqual(r[0].status, "completed");
    assert.strictEqual(r[1].status, "active");
    assert.strictEqual(r[2].status, "pending");
    assert.strictEqual(r[3].status, "pending");
  });

  test("IMPLEMENT → plan/audit completed, implement active, substantiate pending", () => {
    const r = derivePlanPhaseStatuses("IMPLEMENT", undefined);
    assert.strictEqual(r[0].status, "completed");
    assert.strictEqual(r[1].status, "completed");
    assert.strictEqual(r[2].status, "active");
    assert.strictEqual(r[3].status, "pending");
  });

  test("SUBSTANTIATE with PASS verdict → all completed", () => {
    const r = derivePlanPhaseStatuses("SUBSTANTIATE", "PASS — Reality matches Promise");
    r.forEach(p => assert.strictEqual(p.status, "completed", `${p.id} status`));
  });

  test("SUBSTANTIATE with SEAL verdict → all completed", () => {
    const r = derivePlanPhaseStatuses("SUBSTANTIATE", "SESSION SEAL — sealed");
    r.forEach(p => assert.strictEqual(p.status, "completed", `${p.id} status`));
  });

  test("SEALED → all completed", () => {
    const r = derivePlanPhaseStatuses("SEALED", undefined);
    r.forEach(p => assert.strictEqual(p.status, "completed", `${p.id} status`));
  });

  test("SUBSTANTIATE with VETO verdict → substantiate active, prior phases completed", () => {
    const r = derivePlanPhaseStatuses("SUBSTANTIATE", "VETO — Reality != Promise");
    assert.strictEqual(r[0].status, "completed");
    assert.strictEqual(r[1].status, "completed");
    assert.strictEqual(r[2].status, "completed");
    assert.strictEqual(r[3].status, "active");
  });

  test("output shape stable: 4 elements with ids in order across all inputs", () => {
    const cases: Array<["IDLE" | "PLAN" | "GATE" | "IMPLEMENT" | "SUBSTANTIATE" | "SEALED", string | undefined]> = [
      ["IDLE", undefined],
      ["PLAN", undefined],
      ["GATE", "PASS"],
      ["GATE", "VETO"],
      ["IMPLEMENT", undefined],
      ["SUBSTANTIATE", "PASS"],
      ["SUBSTANTIATE", "VETO"],
      ["SEALED", undefined],
    ];
    for (const [phase, verdict] of cases) {
      const r = derivePlanPhaseStatuses(phase, verdict);
      assert.strictEqual(r.length, 4, `case ${phase}/${verdict ?? "—"}: length`);
      assert.deepStrictEqual(r.map(p => p.id), EXPECTED_IDS, `case ${phase}/${verdict ?? "—"}: ids order`);
      assert.deepStrictEqual(r.map(p => p.label), ["Plan", "Audit", "Implement", "Substantiate"], `case ${phase}/${verdict ?? "—"}: labels`);
    }
  });

  test("phaseToCompletionFloor returns -1 for IDLE", () => {
    assert.strictEqual(phaseToCompletionFloor("IDLE", undefined), -1);
  });

  test("phaseToCompletionFloor returns 4 for SUBSTANTIATE PASS", () => {
    assert.strictEqual(phaseToCompletionFloor("SUBSTANTIATE", "PASS"), 4);
  });

  test("phaseToCompletionFloor returns 3 for SUBSTANTIATE VETO", () => {
    assert.strictEqual(phaseToCompletionFloor("SUBSTANTIATE", "VETO"), 3);
  });
});
