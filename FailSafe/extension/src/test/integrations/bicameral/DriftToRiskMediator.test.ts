// FX583 — Batch 4 Phase 3 (B-BIC-18): DriftToRiskMediator mirrors
// `bicameral.verdict` events into the Risks Register. A `verdict:'drifted'`
// upserts a `bicameral:{decisionId}` risk; `verdict:'ratified'` closes it;
// `verdict:'in-sync'` is a no-op. The mediator is exception-isolated — a
// thrown upsertRisk/closeRisk is swallowed, never propagated.
import { strict as assert } from "assert";
import { EventBus } from "../../../shared/EventBus";
import {
  DriftToRiskMediator,
  type RiskRegisterDeps,
} from "../../../integrations/bicameral/DriftToRiskMediator";
import type { BicameralVerdictEventPayload } from "../../../shared/types/events";

interface UpsertRecord { risk: Record<string, unknown>; }

function makeRiskRegister(overrides: { upsertThrows?: boolean; closeThrows?: boolean } = {}): {
  register: RiskRegisterDeps;
  upserts: UpsertRecord[];
  closes: string[];
} {
  const upserts: UpsertRecord[] = [];
  const closes: string[] = [];
  const register: RiskRegisterDeps = {
    upsertRisk: (risk) => {
      if (overrides.upsertThrows) throw new Error("upsert-failed");
      upserts.push({ risk });
    },
    closeRisk: (id) => {
      if (overrides.closeThrows) throw new Error("close-failed");
      closes.push(id);
    },
  };
  return { register, upserts, closes };
}

function emitVerdict(bus: EventBus, payload: BicameralVerdictEventPayload): void {
  bus.emit("bicameral.verdict", payload);
}

suite("FX583 DriftToRiskMediator (Batch 4 Phase 3)", () => {
  test("a drifted verdict upserts a bicameral:{decisionId} risk with status 'open'", () => {
    const bus = new EventBus();
    const { register, upserts } = makeRiskRegister();
    new DriftToRiskMediator({ eventBus: bus, riskRegister: register });
    emitVerdict(bus, { decisionId: "d1", verdict: "drifted" });
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].risk.id, "bicameral:d1");
    assert.equal(upserts[0].risk.status, "open");
  });

  test("two drifted verdicts for distinct decisions yield two upserts with distinct ids", () => {
    const bus = new EventBus();
    const { register, upserts } = makeRiskRegister();
    new DriftToRiskMediator({ eventBus: bus, riskRegister: register });
    emitVerdict(bus, { decisionId: "d1", verdict: "drifted" });
    emitVerdict(bus, { decisionId: "d2", verdict: "drifted" });
    assert.equal(upserts.length, 2);
    assert.deepEqual(
      upserts.map((u) => u.risk.id).sort(),
      ["bicameral:d1", "bicameral:d2"],
    );
  });

  test("a repeat drifted verdict for the same decision upserts again with the same id", () => {
    const bus = new EventBus();
    const { register, upserts } = makeRiskRegister();
    new DriftToRiskMediator({ eventBus: bus, riskRegister: register });
    emitVerdict(bus, { decisionId: "d1", verdict: "drifted" });
    emitVerdict(bus, { decisionId: "d1", verdict: "drifted" });
    assert.equal(upserts.length, 2, "mediator forwards each event; RiskRegisterManager dedups");
    assert.equal(upserts[0].risk.id, "bicameral:d1");
    assert.equal(upserts[1].risk.id, "bicameral:d1");
  });

  test("a ratified verdict closes the bicameral:{decisionId} risk once", () => {
    const bus = new EventBus();
    const { register, closes, upserts } = makeRiskRegister();
    new DriftToRiskMediator({ eventBus: bus, riskRegister: register });
    emitVerdict(bus, { decisionId: "d1", verdict: "ratified" });
    assert.equal(closes.length, 1);
    assert.equal(closes[0], "bicameral:d1");
    assert.equal(upserts.length, 0, "ratify does not upsert");
  });

  test("a thrown upsertRisk/closeRisk is swallowed (the mediator never propagates)", () => {
    const upBus = new EventBus();
    const upReg = makeRiskRegister({ upsertThrows: true });
    new DriftToRiskMediator({ eventBus: upBus, riskRegister: upReg.register });
    assert.doesNotThrow(() => emitVerdict(upBus, { decisionId: "d1", verdict: "drifted" }));

    const closeBus = new EventBus();
    const closeReg = makeRiskRegister({ closeThrows: true });
    new DriftToRiskMediator({ eventBus: closeBus, riskRegister: closeReg.register });
    assert.doesNotThrow(() => emitVerdict(closeBus, { decisionId: "d1", verdict: "ratified" }));
  });
});
