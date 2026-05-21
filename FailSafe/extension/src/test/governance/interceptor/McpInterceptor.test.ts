// FX549 — B151 Phase 2: McpInterceptor adapter.
// Builds a schema-valid EvaluationRequestContract from an MCP envelope and
// dispatches to a backing interceptor; malformed input short-circuits to a
// QUARANTINE receipt without invoking the backing interceptor; the AJV
// validator is served from cache across repeated intercept() calls.
import { strict as assert } from "assert";
import type { EvaluationRequestContract, ReceiptContract } from "../../../contracts";
import type { IGovernanceInterceptor } from "../../../governance/interceptor/IGovernanceInterceptor";
import {
  McpInterceptor,
  type McpInterceptorBackingClient,
} from "../../../governance/interceptor/adapters/McpInterceptor";
import { getValidator } from "../../../governance/interceptor/ajv-instance";

const STUB_CLIENT: McpInterceptorBackingClient = { isConnected: () => true };

const ALLOW_RECEIPT: ReceiptContract = {
  receiptId: "rcpt-fx549",
  evaluationRequestId: "eval-fx549",
  verdict: "ALLOW",
  evidence: [{ kind: "intent", ref: "intent-1" }],
  issuedAt: "2026-05-20T12:00:00.000Z",
  issuedBy: "did:failsafe:interceptor:mcp",
};

/** A backing interceptor that records the requests it receives. */
class RecordingBacking implements IGovernanceInterceptor {
  readonly seen: EvaluationRequestContract[] = [];
  async evaluate(req: EvaluationRequestContract): Promise<ReceiptContract> {
    this.seen.push(req);
    return ALLOW_RECEIPT;
  }
}

suite("McpInterceptor (FX549)", () => {
  test("intercept returns the backing interceptor's ALLOW receipt", async () => {
    const backing = new RecordingBacking();
    const interceptor = new McpInterceptor(STUB_CLIENT, backing);
    const receipt = await interceptor.intercept({ name: "bicameral.history", arguments: {} });
    assert.deepEqual(receipt, ALLOW_RECEIPT);
  });

  test("the EvaluationRequestContract passed to the backing interceptor is schema-valid", async () => {
    const backing = new RecordingBacking();
    const interceptor = new McpInterceptor(STUB_CLIENT, backing);
    await interceptor.intercept({ name: "bicameral.drift", arguments: { file_path: "/x.ts" } });
    assert.equal(backing.seen.length, 1);
    const validate = getValidator("evaluation_request");
    assert.equal(
      validate(backing.seen[0]),
      true,
      JSON.stringify((validate as unknown as { errors?: unknown }).errors),
    );
  });

  test("malformed input → QUARANTINE receipt and the backing interceptor is NOT invoked", async () => {
    const backing = new RecordingBacking();
    const interceptor = new McpInterceptor(STUB_CLIENT, backing);
    const receipt = await interceptor.intercept({ name: "", arguments: null });
    assert.equal(receipt.verdict, "QUARANTINE");
    assert.equal(backing.seen.length, 0, "backing interceptor must not be called");
  });

  test("the QUARANTINE receipt's evaluationRequestId is a non-empty eval-prefixed string", async () => {
    const interceptor = new McpInterceptor(STUB_CLIENT, new RecordingBacking());
    const receipt = await interceptor.intercept({ name: "", arguments: null });
    assert.ok(receipt.evaluationRequestId.length > 0);
    assert.match(receipt.evaluationRequestId, /^eval-/);
  });

  test("the AJV validator is served from cache across 100 consecutive intercept() calls", async () => {
    const interceptor = new McpInterceptor(STUB_CLIENT, new RecordingBacking());
    const before = getValidator("evaluation_request");
    for (let i = 0; i < 100; i += 1) {
      await interceptor.intercept({ name: `bicameral.tool-${i}`, arguments: {} });
    }
    const after = getValidator("evaluation_request");
    assert.equal(before, after, "validator must remain the same cached reference");
  });
});
