// FX550 — B151 Phase 1: pure contract mappers.
// Deterministic id derivation, Verdict→ReceiptContract projection with correct
// evidence objects per variant, and a ProposedAction↔EvaluationRequestContract
// round-trip. Every produced receipt validates against receipt.json.
import { strict as assert } from "assert";
import type {
  AllowVerdict,
  BlockVerdict,
  EscalateVerdict,
  ProposedAction,
} from "../../../governance/types/IntentTypes";
import {
  deriveEvaluationRequestId,
  evaluationRequestToProposedAction,
  proposedActionToEvaluationRequest,
  verdictToReceipt,
} from "../../../governance/interceptor/contractMappers";
import { getValidator } from "../../../governance/interceptor/ajv-instance";

const REQ = {
  agentDid: "did:agent:fx550",
  action: { kind: "tool_call", target: "bicameral.drift" },
  timestamp: "2026-05-20T12:00:00.000Z",
} as const;

function assertReceiptValid(receipt: unknown): void {
  const validate = getValidator("receipt");
  assert.equal(
    validate(receipt),
    true,
    JSON.stringify((validate as unknown as { errors?: unknown }).errors),
  );
}

suite("contractMappers (FX550)", () => {
  test("deriveEvaluationRequestId is deterministic and timestamp-sensitive", () => {
    const a = deriveEvaluationRequestId({ ...REQ });
    const b = deriveEvaluationRequestId({ ...REQ });
    assert.equal(a, b);
    const c = deriveEvaluationRequestId({ ...REQ, timestamp: "2026-05-20T13:00:00.000Z" });
    assert.notEqual(a, c);
    assert.match(a, /^eval-[0-9a-f]{16}$/);
  });

  test("verdictToReceipt(ALLOW) projects an intent evidence object", () => {
    const verdict: AllowVerdict = { status: "ALLOW", reason: "ok", intentId: "intent-9" };
    const receipt = verdictToReceipt(verdict, "eval-x", "did:by");
    assert.equal(receipt.verdict, "ALLOW");
    assert.deepEqual(receipt.evidence?.[0], {
      kind: "intent",
      ref: "intent-9",
      summary: "Action allowed under active intent.",
    });
    assertReceiptValid(receipt);
  });

  test("verdictToReceipt(BLOCK) projects an axiom_violation evidence object", () => {
    const verdict: BlockVerdict = {
      status: "BLOCK",
      violation: "Edited a file outside Intent scope.",
      axiomViolated: 2,
      remediation: "Declare an Intent covering this path.",
    };
    const receipt = verdictToReceipt(verdict, "eval-x", "did:by");
    assert.equal(receipt.verdict, "BLOCK");
    assert.equal(receipt.evidence?.[0].kind, "axiom_violation");
    assert.equal(receipt.evidence?.[0].summary, "Edited a file outside Intent scope.");
    assertReceiptValid(receipt);
  });

  test("verdictToReceipt(ESCALATE) projects an escalation evidence object", () => {
    const verdict: EscalateVerdict = {
      status: "ESCALATE",
      escalationTo: "L3_QUEUE",
      reason: "High-risk path requires review.",
    };
    const receipt = verdictToReceipt(verdict, "eval-x", "did:by");
    assert.equal(receipt.verdict, "ESCALATE");
    assert.deepEqual(receipt.evidence?.[0], {
      kind: "escalation",
      ref: "L3_QUEUE",
      summary: "High-risk path requires review.",
    });
    assertReceiptValid(receipt);
  });

  test("every verdict variant produces a receipt valid against receipt.json", () => {
    const allow: AllowVerdict = { status: "ALLOW", reason: "r", intentId: "i" };
    const block: BlockVerdict = {
      status: "BLOCK",
      violation: "v",
      axiomViolated: 1,
      remediation: "fix",
    };
    const escalate: EscalateVerdict = {
      status: "ESCALATE",
      escalationTo: "HUMAN_REVIEW",
      reason: "r",
    };
    for (const v of [allow, block, escalate]) {
      assertReceiptValid(verdictToReceipt(v, "eval-y", "did:by"));
    }
  });

  test("evaluationRequestToProposedAction round-trips proposedActionToEvaluationRequest", () => {
    const action: ProposedAction = {
      type: "file_write",
      targetPath: "/repo/src/auth/token.ts",
      intentId: "intent-7",
      proposedAt: "2026-05-20T12:00:00.000Z",
      proposedBy: "did:agent:round-trip",
    };
    const req = proposedActionToEvaluationRequest(action, action.proposedBy);
    const back = evaluationRequestToProposedAction(req);
    assert.deepEqual(back, action);
  });
});
