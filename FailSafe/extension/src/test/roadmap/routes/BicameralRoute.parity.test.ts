// FX551 — B151 Phase 3: behavioural-parity of the 3 BicameralRoute tool
// endpoints (history/drift/ratify) after migration through McpInterceptor.
//
// Each endpoint's success body for a representative input must match the
// recorded pre-migration snapshot (after timestamp normalisation), and each
// endpoint's error envelope for a representative malformed input must match the
// recorded pre-migration error shape — HTTP status preserved on both paths.
//
// The baseline snapshot lives in __fixtures__/bicameral-route-pre-migration.json.
// Its success/error shapes were derived from the PRE-migration BicameralRoute.ts
// at git HEAD (commit 15af5a1) and verified byte-for-byte against
// `git show HEAD:.../BicameralRoute.ts` — see the fixture's _comment. The client
// stub input ('clientReturn') is a separate fixture field from the expected
// output ('success.body'), so a route-wrapper regression diverges and fails.
// The fixture is NOT mirrored into out/ by copy-ui-js, so it is resolved back
// into the src/ tree; the suite fails loud if the fixture is missing.
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import type { Request, Response } from "express";
import { setupBicameralRoutes, type BicameralRouteDeps } from "../../../roadmap/routes/BicameralRoute";
import type { BicameralMcpClient } from "../../../integrations/bicameral";
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

/** An McpInterceptor stub whose intercept() always yields an ALLOW receipt. */
function allowInterceptor(): McpInterceptor {
  const receipt: ReceiptContract = {
    receiptId: "rcpt-parity",
    evaluationRequestId: "eval-parity",
    verdict: "ALLOW",
    evidence: [],
    issuedAt: "2026-05-20T12:00:00.000Z",
    issuedBy: "did:failsafe:interceptor:mcp",
  };
  return { intercept: async () => receipt } as unknown as McpInterceptor;
}

/** Resolve a __fixtures__ path back into the src/ tree (not mirrored to out/). */
function fixturePath(): string {
  const fromOut = path.resolve(
    __dirname,
    "__fixtures__",
    "bicameral-route-pre-migration.json",
  );
  if (fs.existsSync(fromOut)) return fromOut;
  return fromOut.replace(`${path.sep}out${path.sep}`, `${path.sep}src${path.sep}`);
}

/** Recursively replace timestamp-bearing string fields with '<ts>'. */
function normaliseTimestamps(value: unknown): unknown {
  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ? "<ts>" : value;
  }
  if (Array.isArray(value)) return value.map(normaliseTimestamps);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normaliseTimestamps(v);
    return out;
  }
  return value;
}

interface EndpointSnapshot {
  /** Value the bicameral client stub yields for the success case. Separate
   *  from `success.body` so the test's input is not drawn from its expected
   *  output — a route-wrapper regression diverges and fails the suite. */
  clientReturn?: unknown[];
  success: { status: number; body: Record<string, unknown> };
  error: { status: number; body: Record<string, unknown> };
}
interface RouteSnapshot {
  history: EndpointSnapshot;
  drift: EndpointSnapshot;
  ratify: EndpointSnapshot;
}

function loadSnapshot(): RouteSnapshot {
  const fp = fixturePath();
  assert.ok(fs.existsSync(fp), `FX551 baseline fixture missing: ${fp}`);
  return JSON.parse(fs.readFileSync(fp, "utf8")) as RouteSnapshot;
}

function findHandler(handlers: CapturedHandler[], p: string): CapturedHandler {
  const h = handlers.find((c) => c.method === "post" && c.path === p);
  if (!h) throw new Error(`handler not found: POST ${p}`);
  return h;
}

function makeDeps(client: BicameralMcpClient, withInterceptor: boolean): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: "/tmp",
    getBicameralCommand: () => "bicameral-mcp",
    getBicameralClient: () => client,
    getAutoConnect: () => false,
    setAutoConnect: async () => undefined,
    getMcpInterceptor: () => (withInterceptor ? allowInterceptor() : null),
  };
}

const SNAP = loadSnapshot();

suite("FX551 BicameralRoute behavioural parity (B151 Phase 3)", () => {
  test("bicameral-history success body matches the pre-migration snapshot", async () => {
    const client = {
      isConnected: () => true,
      history: async () => SNAP.history.clientReturn,
    } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, true));
    const { res, status, body } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-history").handler(fakeReq({}), res);
    assert.equal(status(), SNAP.history.success.status);
    assert.deepEqual(normaliseTimestamps(body()), normaliseTimestamps(SNAP.history.success.body));
  });

  test("bicameral-history error envelope matches the pre-migration snapshot", async () => {
    const client = {
      isConnected: () => true,
      history: async () => {
        throw new Error("bicameral tool bicameral.history reported isError=true");
      },
    } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, true));
    const { res, status, body } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-history").handler(fakeReq({}), res);
    assert.equal(status(), SNAP.history.error.status);
    assert.deepEqual(normaliseTimestamps(body()), normaliseTimestamps(SNAP.history.error.body));
  });

  test("bicameral-drift success body matches the pre-migration snapshot", async () => {
    const client = {
      isConnected: () => true,
      drift: async () => SNAP.drift.clientReturn,
    } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, true));
    const { res, status, body } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-drift")
      .handler(fakeReq({ filePath: "src/auth/token.ts" }), res);
    assert.equal(status(), SNAP.drift.success.status);
    assert.deepEqual(normaliseTimestamps(body()), normaliseTimestamps(SNAP.drift.success.body));
  });

  test("bicameral-drift error envelope matches the pre-migration snapshot", async () => {
    const client = { isConnected: () => true, drift: async () => [] } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, true));
    const { res, status, body } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-drift").handler(fakeReq({}), res);
    assert.equal(status(), SNAP.drift.error.status);
    assert.deepEqual(normaliseTimestamps(body()), normaliseTimestamps(SNAP.drift.error.body));
  });

  test("bicameral-ratify success body matches the pre-migration snapshot", async () => {
    const client = {
      isConnected: () => true,
      ratify: async () => undefined,
    } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, true));
    const { res, status, body } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-ratify")
      .handler(fakeReq({ decisionId: "d-100", verdict: "ratify" }), res);
    assert.equal(status(), SNAP.ratify.success.status);
    assert.deepEqual(normaliseTimestamps(body()), normaliseTimestamps(SNAP.ratify.success.body));
  });

  test("bicameral-ratify error envelope matches the pre-migration snapshot", async () => {
    const client = {
      isConnected: () => true,
      ratify: async () => undefined,
    } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, true));
    const { res, status, body } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-ratify")
      .handler(fakeReq({ decisionId: "d-100", verdict: "bogus" }), res);
    assert.equal(status(), SNAP.ratify.error.status);
    assert.deepEqual(normaliseTimestamps(body()), normaliseTimestamps(SNAP.ratify.error.body));
  });
});
