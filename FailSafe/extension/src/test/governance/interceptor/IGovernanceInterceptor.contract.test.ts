// FX547 — B151 Phase 1: the IGovernanceInterceptor contract surface.
// A test-double implementation compiles + is constructible; its receipts
// validate against receipt.json, carry a request-derived evaluationRequestId,
// and expose evidence as {kind,ref} objects (never bare strings).
import { strict as assert } from "assert";
import type { EvaluationRequestContract, ReceiptContract } from "../../../contracts";
import type { IGovernanceInterceptor } from "../../../governance/interceptor/IGovernanceInterceptor";
import {
  deriveEvaluationRequestId,
} from "../../../governance/interceptor/contractMappers";
import { getValidator } from "../../../governance/interceptor/ajv-instance";

const VALID_REQ: EvaluationRequestContract = {
  agentDid: "did:agent:fx547",
  action: { kind: "tool_call", target: "bicameral.history" },
  timestamp: "2026-05-20T12:00:00.000Z",
};

/** A minimal IGovernanceInterceptor implementation for contract testing. */
class StubInterceptor implements IGovernanceInterceptor {
  async evaluate(req: EvaluationRequestContract): Promise<ReceiptContract> {
    return {
      receiptId: "rcpt-stub-0001",
      evaluationRequestId: deriveEvaluationRequestId(req),
      verdict: "ALLOW",
      evidence: [{ kind: "intent", ref: "intent-1", summary: "stub allow" }],
      issuedAt: new Date().toISOString(),
      issuedBy: "did:failsafe:interceptor:stub",
    };
  }
}

suite("IGovernanceInterceptor contract surface (FX547)", () => {
  test("StubInterceptor implements IGovernanceInterceptor and is constructible", () => {
    const interceptor: IGovernanceInterceptor = new StubInterceptor();
    assert.ok(interceptor);
    assert.equal(typeof interceptor.evaluate, "function");
  });

  test("evaluate(validReq) resolves a ReceiptContract that validates against receipt.json", async () => {
    const receipt = await new StubInterceptor().evaluate(VALID_REQ);
    const validate = getValidator("receipt");
    assert.equal(
      validate(receipt),
      true,
      JSON.stringify((validate as unknown as { errors?: unknown }).errors),
    );
  });

  test("the returned receipt's evaluationRequestId equals deriveEvaluationRequestId(req)", async () => {
    const receipt = await new StubInterceptor().evaluate(VALID_REQ);
    assert.equal(receipt.evaluationRequestId, deriveEvaluationRequestId(VALID_REQ));
  });

  test("receipt.evidence is an array of {kind,ref} objects (never a bare string array)", async () => {
    const receipt = await new StubInterceptor().evaluate(VALID_REQ);
    assert.ok(Array.isArray(receipt.evidence));
    for (const item of receipt.evidence ?? []) {
      assert.equal(typeof item, "object");
      assert.equal(typeof item.kind, "string");
      assert.equal(typeof item.ref, "string");
    }
  });

  test("receipt.issuedAt parses as an RFC3339 timestamp", async () => {
    const receipt = await new StubInterceptor().evaluate(VALID_REQ);
    const parsed = Date.parse(receipt.issuedAt);
    assert.equal(Number.isNaN(parsed), false);
    assert.match(receipt.issuedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
