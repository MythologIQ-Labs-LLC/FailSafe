// FX548 — B151 Phase 2: EngineBackedInterceptor.
// Every EnforcementEngine Verdict variant maps to a schema-valid ReceiptContract
// with correct evidence; an engine throw → QUARANTINE receipt without rethrow.
import { strict as assert } from "assert";
import type { EvaluationRequestContract } from "../../../contracts";
import type { ProposedAction, Verdict } from "../../../governance/types/IntentTypes";
import {
  EngineBackedInterceptor,
  type EnforcementEngineLike,
} from "../../../governance/interceptor/EngineBackedInterceptor";
import { getValidator } from "../../../governance/interceptor/ajv-instance";

const REQ: EvaluationRequestContract = {
  agentDid: "did:agent:fx548",
  action: { kind: "file_write", target: "/repo/src/x.ts" },
  context: { intentId: "intent-3" },
  timestamp: "2026-05-20T12:00:00.000Z",
};

function engineReturning(verdict: Verdict): EnforcementEngineLike {
  return { evaluateAction: async (_a: ProposedAction): Promise<Verdict> => verdict };
}

function assertReceiptValid(receipt: unknown): void {
  const validate = getValidator("receipt");
  assert.equal(
    validate(receipt),
    true,
    JSON.stringify((validate as unknown as { errors?: unknown }).errors),
  );
}

suite("EngineBackedInterceptor (FX548)", () => {
  test("ALLOW verdict → receipt verdict='ALLOW' with intent evidence", async () => {
    const engine = engineReturning({ status: "ALLOW", reason: "ok", intentId: "intent-3" });
    const receipt = await new EngineBackedInterceptor(engine, "did:by").evaluate(REQ);
    assert.equal(receipt.verdict, "ALLOW");
    assert.equal(receipt.evidence?.[0].kind, "intent");
    assertReceiptValid(receipt);
  });

  test("BLOCK verdict → receipt verdict='BLOCK' with violation in evidence summary", async () => {
    const engine = engineReturning({
      status: "BLOCK",
      violation: "Out-of-scope write.",
      axiomViolated: 2,
      remediation: "Declare an Intent.",
    });
    const receipt = await new EngineBackedInterceptor(engine, "did:by").evaluate(REQ);
    assert.equal(receipt.verdict, "BLOCK");
    assert.equal(receipt.evidence?.[0].summary, "Out-of-scope write.");
    assertReceiptValid(receipt);
  });

  test("ESCALATE verdict → receipt verdict='ESCALATE' with escalationTo in evidence ref", async () => {
    const engine = engineReturning({
      status: "ESCALATE",
      escalationTo: "L3_QUEUE",
      reason: "Needs review.",
    });
    const receipt = await new EngineBackedInterceptor(engine, "did:by").evaluate(REQ);
    assert.equal(receipt.verdict, "ESCALATE");
    assert.equal(receipt.evidence?.[0].ref, "L3_QUEUE");
    assertReceiptValid(receipt);
  });

  test("engine throw → QUARANTINE receipt with error name in evidence, no rethrow", async () => {
    const engine: EnforcementEngineLike = {
      evaluateAction: async (): Promise<Verdict> => {
        throw new TypeError("engine exploded");
      },
    };
    const receipt = await new EngineBackedInterceptor(engine, "did:by").evaluate(REQ);
    assert.equal(receipt.verdict, "QUARANTINE");
    assert.equal(receipt.evidence?.[0].summary, "TypeError");
    assertReceiptValid(receipt);
  });

  test("every returned receipt validates against receipt.json", async () => {
    const verdicts: Verdict[] = [
      { status: "ALLOW", reason: "r", intentId: "i" },
      { status: "BLOCK", violation: "v", axiomViolated: 1, remediation: "fix" },
      { status: "ESCALATE", escalationTo: "TRIBUNAL_AUDIT", reason: "r" },
    ];
    for (const v of verdicts) {
      const receipt = await new EngineBackedInterceptor(engineReturning(v), "did:by").evaluate(REQ);
      assertReceiptValid(receipt);
    }
  });
});
