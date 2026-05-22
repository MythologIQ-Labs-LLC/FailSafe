// FX586 — B-INT-1: bicameralToolRoute factory behaviour.
// Verifies the governance split + the disconnected/malformed-body guards:
//   1. a governed:true spec routes the call through governToolCall — a
//      non-ALLOW receipt short-circuits the route (no client invocation);
//   2. a governed:false spec calls the client method directly (no interceptor);
//   3. a disconnected client → 409 before any invocation;
//   4. a malformed body → 400 from the spec's parse() guard.
// SG-035: each test invokes the registered handler and asserts on the response.

import { strict as assert } from "assert";
import type { Request, Response } from "express";
import {
  bicameralToolRoute,
  type BicameralToolSpec,
  type BicameralToolClient,
} from "../../../roadmap/routes/bicameralToolRoutes";
import type { BicameralRouteDeps } from "../../../roadmap/routes/BicameralRoute";
import type { McpInterceptor } from "../../../governance/interceptor";
import type { ReceiptContract } from "../../../contracts";

interface CapturedHandler {
  method: "get" | "post";
  path: string;
  handler: (req: Request, res: Response) => Promise<void> | void;
}

function makeFakeApp(): { app: unknown; handlers: CapturedHandler[] } {
  const handlers: CapturedHandler[] = [];
  const app = {
    get(p: string, h: unknown) { handlers.push({ method: "get", path: p, handler: h as never }); },
    post(p: string, h: unknown) { handlers.push({ method: "post", path: p, handler: h as never }); },
  };
  return { app, handlers };
}

function fakeRes(): { res: Response; status: () => number; body: () => unknown } {
  let st = 200;
  let bd: unknown = null;
  const res = {
    status(code: number) { st = code; return res; },
    json(b: unknown) { bd = b; return res; },
  } as unknown as Response;
  return { res, status: () => st, body: () => bd };
}

function fakeReq(body: unknown): Request {
  return { body, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as unknown as Request;
}

/** An interceptor whose intercept() yields the given verdict. */
function interceptorWith(verdict: ReceiptContract["verdict"]): McpInterceptor {
  const receipt: ReceiptContract = {
    receiptId: "rcpt-fx586",
    evaluationRequestId: "eval-fx586",
    verdict,
    evidence: [],
    issuedAt: "2026-05-21T12:00:00.000Z",
    issuedBy: "did:failsafe:interceptor:mcp",
  };
  return { intercept: async () => receipt } as unknown as McpInterceptor;
}

function makeDeps(
  client: BicameralToolClient | null,
  interceptor: McpInterceptor | null,
): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: "/tmp",
    getBicameralCommand: () => "bicameral-mcp",
    getBicameralClient: () => client as never,
    getAutoConnect: () => false,
    setAutoConnect: async () => undefined,
    getMcpInterceptor: () => interceptor,
  };
}

/** A connected client recording which method names were invoked. */
function recordingClient(): { client: BicameralToolClient; calls: string[] } {
  const calls: string[] = [];
  const mk = (name: string) => async () => { calls.push(name); return { [name]: true }; };
  const client = {
    isConnected: () => true,
    ingest: mk("ingest"), search: mk("search"), brief: mk("brief"),
    judgeGaps: mk("judgeGaps"), resolveCompliance: mk("resolveCompliance"),
    linkCommit: mk("linkCommit"), update: mk("update"), reset: mk("reset"),
    dashboard: mk("dashboard"), validateSymbols: mk("validateSymbols"),
    getNeighbors: mk("getNeighbors"),
  } as unknown as BicameralToolClient;
  return { client, calls };
}

const GOVERNED_SPEC: BicameralToolSpec = {
  tool: "ingest", governed: true,
  parse: (b) => (typeof b.repoPath === "string" && b.repoPath ? null : "repoPath required"),
  toArgs: (b) => ({ repo_path: b.repoPath }),
  invoke: (c, b) => c.ingest({ repoPath: b.repoPath as string }),
};

const QUERY_SPEC: BicameralToolSpec = {
  tool: "dashboard", governed: false,
  parse: () => null,
  toArgs: () => ({}),
  invoke: (c) => c.dashboard(),
};

function register(spec: BicameralToolSpec, deps: BicameralRouteDeps): CapturedHandler {
  const { app, handlers } = makeFakeApp();
  bicameralToolRoute(app as never, deps, spec);
  const h = handlers.find((c) => c.path === `/api/actions/bicameral-${spec.tool}`);
  if (!h) throw new Error(`route not registered for ${spec.tool}`);
  return h;
}

suite("FX586 bicameralToolRoute factory (B-INT-1)", () => {
  test("governed:true spec — non-ALLOW receipt short-circuits via governToolCall", async () => {
    const { client, calls } = recordingClient();
    const handler = register(GOVERNED_SPEC, makeDeps(client, interceptorWith("BLOCK")));
    const { res, status, body } = fakeRes();
    await handler.handler(fakeReq({ repoPath: "/repo" }), res);
    assert.equal(status(), 403, "BLOCK verdict maps to 403");
    assert.equal((body() as { ok: boolean }).ok, false);
    assert.equal(calls.length, 0, "client method NOT invoked when interceptor blocks");
  });

  test("governed:false spec — calls the client directly, no interceptor consulted", async () => {
    const { client, calls } = recordingClient();
    let interceptorConsulted = false;
    const interceptor = {
      intercept: async () => { interceptorConsulted = true; return interceptorWith("ALLOW"); },
    } as unknown as McpInterceptor;
    const handler = register(QUERY_SPEC, makeDeps(client, interceptor));
    const { res, status, body } = fakeRes();
    await handler.handler(fakeReq({}), res);
    assert.equal(status(), 200);
    assert.deepEqual((body() as { result: unknown }).result, { dashboard: true });
    assert.deepEqual(calls, ["dashboard"], "query tool invokes the client method once");
    assert.equal(interceptorConsulted, false, "query tool bypasses the interceptor seam");
  });

  test("disconnected client → 409 before any invocation", async () => {
    const { client, calls } = recordingClient();
    const disconnected = { ...client, isConnected: () => false } as BicameralToolClient;
    const handler = register(QUERY_SPEC, makeDeps(disconnected, null));
    const { res, status, body } = fakeRes();
    await handler.handler(fakeReq({}), res);
    assert.equal(status(), 409);
    assert.match((body() as { error: string }).error, /not connected/);
    assert.equal(calls.length, 0, "no client method runs while disconnected");
  });

  test("malformed body → 400 from the spec parse() guard", async () => {
    const { client, calls } = recordingClient();
    const handler = register(GOVERNED_SPEC, makeDeps(client, interceptorWith("ALLOW")));
    const { res, status, body } = fakeRes();
    await handler.handler(fakeReq({}), res); // missing repoPath
    assert.equal(status(), 400);
    assert.equal((body() as { error: string }).error, "repoPath required");
    assert.equal(calls.length, 0, "invalid body never reaches the client");
  });
});
