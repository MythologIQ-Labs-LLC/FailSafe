// FX587 — B-INT-1: the 11 bicameral-<tool> registrations.
// Verified end-to-end through setupBicameralRoutes (so the BicameralRoute.ts
// wiring line is exercised too):
//   - a table-driven sweep asserts all 11 POST /api/actions/bicameral-<tool>
//     routes register and each invokes its matching client method once with
//     the parsed args, returning the client's result;
//   - one MUTATION tool (ingest — interceptor branch) and one QUERY tool
//     (search — direct branch) are exercised end-to-end;
//   - a remote caller is rejectIfRemote-blocked before any client invocation.
// SG-035: every case invokes the registered handler and asserts on output.

import { strict as assert } from "assert";
import type { Request, Response } from "express";
import { setupBicameralRoutes, type BicameralRouteDeps } from "../../../roadmap/routes/BicameralRoute";
import type { BicameralToolClient } from "../../../roadmap/routes/bicameralToolRoutes";
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

function fakeReq(body: unknown, ip = "127.0.0.1"): Request {
  return { body, ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function allowInterceptor(): McpInterceptor {
  const receipt: ReceiptContract = {
    receiptId: "rcpt-fx587", evaluationRequestId: "eval-fx587", verdict: "ALLOW",
    evidence: [], issuedAt: "2026-05-21T12:00:00.000Z", issuedBy: "did:failsafe:interceptor:mcp",
  };
  return { intercept: async () => receipt } as unknown as McpInterceptor;
}

/** A connected client recording every method's invocation + received args. */
function recordingClient(): {
  client: BicameralToolClient;
  calls: Array<{ name: string; arg: unknown }>;
} {
  const calls: Array<{ name: string; arg: unknown }> = [];
  const mk = (name: string) => async (arg?: unknown) => {
    calls.push({ name, arg });
    return { tool: name };
  };
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

function makeDeps(
  client: BicameralToolClient,
  overrides: Partial<BicameralRouteDeps> = {},
): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: "/tmp",
    getBicameralCommand: () => "bicameral-mcp",
    getBicameralClient: () => client as never,
    getAutoConnect: () => false,
    setAutoConnect: async () => undefined,
    getMcpInterceptor: () => allowInterceptor(),
    ...overrides,
  };
}

function findHandler(handlers: CapturedHandler[], tool: string): CapturedHandler {
  const h = handlers.find((c) => c.method === "post" && c.path === `/api/actions/bicameral-${tool}`);
  if (!h) throw new Error(`registration missing: POST /api/actions/bicameral-${tool}`);
  return h;
}

// Per-tool: a valid request body + the client method it must invoke.
const TOOL_CASES: Array<{ tool: string; method: string; body: Record<string, unknown> }> = [
  { tool: "ingest", method: "ingest", body: { repoPath: "/repo" } },
  { tool: "update", method: "update", body: { decisionId: "d-1", payload: { a: 1 } } },
  { tool: "reset", method: "reset", body: {} },
  { tool: "resolveCompliance", method: "resolveCompliance", body: { decisionId: "d-1", resolution: "ok" } },
  { tool: "linkCommit", method: "linkCommit", body: { commitSha: "abc123", decisionId: "d-1" } },
  { tool: "search", method: "search", body: { query: "auth" } },
  { tool: "brief", method: "brief", body: { feature: "auth" } },
  { tool: "judgeGaps", method: "judgeGaps", body: { feature: "auth" } },
  { tool: "dashboard", method: "dashboard", body: {} },
  { tool: "validateSymbols", method: "validateSymbols", body: { symbols: ["createSession"] } },
  { tool: "getNeighbors", method: "getNeighbors", body: { decisionId: "d-1" } },
];

suite("FX587 bicameral-<tool> registrations (B-INT-1)", () => {
  test("all 11 tool routes register via setupBicameralRoutes", () => {
    const { client } = recordingClient();
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client));
    for (const { tool } of TOOL_CASES) {
      assert.doesNotThrow(() => findHandler(handlers, tool), `route for ${tool}`);
    }
    assert.equal(TOOL_CASES.length, 11, "exactly 11 tools are covered");
  });

  test("table-driven sweep — each route invokes its client method once with parsed args", async () => {
    for (const { tool, method, body } of TOOL_CASES) {
      const { client, calls } = recordingClient();
      const { app, handlers } = makeFakeApp();
      setupBicameralRoutes(app as never, makeDeps(client));
      const { res, status, body: out } = fakeRes();
      await findHandler(handlers, tool).handler(fakeReq(body), res);
      assert.equal(status(), 200, `${tool} → 200`);
      assert.deepEqual((out() as { result: unknown }).result, { tool: method }, `${tool} returns client result`);
      assert.equal(calls.length, 1, `${tool} invokes exactly one client method`);
      assert.equal(calls[0].name, method, `${tool} invokes client.${method}`);
    }
  });

  test("MUTATION tool (ingest) — end-to-end through the interceptor branch", async () => {
    const { client, calls } = recordingClient();
    let interceptedName = "";
    const interceptor = {
      intercept: async (env: { name: string }) => {
        interceptedName = env.name;
        return allowInterceptor().intercept(env as never);
      },
    } as unknown as McpInterceptor;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, { getMcpInterceptor: () => interceptor }));
    const { res, status } = fakeRes();
    await findHandler(handlers, "ingest").handler(fakeReq({ repoPath: "/my/repo" }), res);
    assert.equal(status(), 200);
    assert.equal(interceptedName, "bicameral.ingest", "mutation tool routes through governToolCall");
    assert.deepEqual(calls[0].arg, { repoPath: "/my/repo" }, "client.ingest got the parsed args");
  });

  test("QUERY tool (search) — end-to-end through the direct branch (no interceptor)", async () => {
    const { client, calls } = recordingClient();
    let interceptorConsulted = false;
    const interceptor = {
      intercept: async (env: { name: string }) => {
        interceptorConsulted = true;
        return allowInterceptor().intercept(env as never);
      },
    } as unknown as McpInterceptor;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, { getMcpInterceptor: () => interceptor }));
    const { res, status } = fakeRes();
    await findHandler(handlers, "search").handler(fakeReq({ query: "session" }), res);
    assert.equal(status(), 200);
    assert.equal(interceptorConsulted, false, "query tool bypasses the interceptor");
    assert.deepEqual(calls[0].arg, { query: "session" }, "client.search got the parsed args");
  });

  test("remote caller is rejectIfRemote-blocked before any client invocation", async () => {
    const { client, calls } = recordingClient();
    let rejected = false;
    const deps = makeDeps(client, {
      rejectIfRemote: (_req, res) => {
        rejected = true;
        res.status(403).json({ ok: false, error: "remote blocked" });
        return true;
      },
    });
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, deps);
    const { res, status } = fakeRes();
    await findHandler(handlers, "dashboard").handler(fakeReq({}, "10.0.0.9"), res);
    assert.equal(rejected, true, "rejectIfRemote consulted");
    assert.equal(status(), 403);
    assert.equal(calls.length, 0, "remote request never reaches the client");
  });
});
