// B233: a governance receipt cannot authorize a different MCP client.
import { strict as assert } from "assert";
import type { Response } from "express";
import type { ReceiptContract } from "../../../contracts";
import type { BicameralRouteDeps } from "../../../roadmap/routes/BicameralRoute";
import { governToolCall } from "../../../roadmap/routes/bicameralRouteShared";
import type { McpInterceptor } from "../../../governance/interceptor";

const ALLOW: ReceiptContract = {
  receiptId: "b233-allow", evaluationRequestId: "b233-evaluation", verdict: "ALLOW",
  evidence: [], issuedAt: "2026-10-20T12:00:00.000Z", issuedBy: "did:failsafe:interceptor:mcp",
};
const ENVELOPE = { name: "bicameral.update", arguments: { decision_id: "d1" } };

function response(): { res: Response; status: () => number; body: () => any } {
  let code = 200;
  let body: unknown;
  const res = {
    status(next: number) { code = next; return res; },
    json(value: unknown) { body = value; return res; },
  } as Response;
  return { res, status: () => code, body: () => body };
}

function client() { return { isConnected: () => true }; }

function depsFor(
  getClient: () => ReturnType<typeof client>,
  getInterceptor: () => McpInterceptor | null,
): BicameralRouteDeps {
  return {
    getBicameralClient: getClient,
    getMcpInterceptor: getInterceptor,
  } as unknown as BicameralRouteDeps;
}

function interceptorFor(
  bound: ReturnType<typeof client>,
  evaluate: () => Promise<ReceiptContract> = async () => ALLOW,
): McpInterceptor {
  return { getClient: () => bound, intercept: evaluate } as unknown as McpInterceptor;
}

suite("B233 Bicameral client/interceptor binding", () => {
  test("production accessor without interceptor refuses rather than allowing", async () => {
    const active = client();
    const r = response();
    const blocked = await governToolCall(depsFor(() => active, () => null), ENVELOPE, r.res, active);
    assert.equal(blocked, true);
    assert.equal(r.status(), 503);
    assert.match(r.body().error, /interceptor unavailable/);
  });

  test("stale interceptor for a different client refuses before evaluation", async () => {
    const active = client();
    let evaluated = 0;
    const stale = interceptorFor(client(), async () => { evaluated++; return ALLOW; });
    const r = response();
    assert.equal(await governToolCall(depsFor(() => active, () => stale), ENVELOPE, r.res, active), true);
    assert.equal(r.status(), 503);
    assert.equal(evaluated, 0);
  });

  test("matching interceptor evaluates and allows the bound client", async () => {
    const active = client();
    let evaluated = 0;
    const bound = interceptorFor(active, async () => { evaluated++; return ALLOW; });
    const r = response();
    assert.equal(await governToolCall(depsFor(() => active, () => bound), ENVELOPE, r.res, active), false);
    assert.equal(evaluated, 1);
    assert.equal(r.status(), 200);
  });

  test("client replaced during pending evaluation refuses the old request", async () => {
    const initial = client();
    const replacement = client();
    let active = initial;
    let finish!: (receipt: ReceiptContract) => void;
    let started!: () => void;
    const called = new Promise<void>((resolve) => { started = resolve; });
    const bound = interceptorFor(initial, () => {
      started();
      return new Promise<ReceiptContract>((resolve) => { finish = resolve; });
    });
    const r = response();
    const pending = governToolCall(depsFor(() => active, () => bound), ENVELOPE, r.res, initial);
    await called;
    active = replacement;
    finish(ALLOW);
    assert.equal(await pending, true);
    assert.equal(r.status(), 409);
    assert.match(r.body().error, /changed during governance/);
  });

  test("route-captured stale client is rejected even if the current interceptor is valid", async () => {
    const previous = client();
    const current = client();
    const bound = interceptorFor(current);
    const r = response();
    assert.equal(await governToolCall(depsFor(() => current, () => bound), ENVELOPE, r.res, previous), true);
    assert.equal(r.status(), 409);
  });
});
