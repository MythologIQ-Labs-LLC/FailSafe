// FX580 — Batch 4 Phase 1 (B-BIC-17/18): the BicameralRoute drift/ratify
// handlers emit one `bicameral.verdict` event per drifted/in-sync decision
// (skipping `unknown`) and one `ratified` verdict on ratify. The emit is
// additive, non-blocking, and absent-eventBus-safe — with no eventBus wired
// both handlers still succeed and emit nothing (no throw).
import { strict as assert } from "assert";
import type { Request, Response } from "express";
import { setupBicameralRoutes, type BicameralRouteDeps } from "../../../roadmap/routes/BicameralRoute";
import type { BicameralMcpClient } from "../../../integrations/bicameral";
import type { BicameralDriftStatus } from "../../../integrations/bicameral/types";
import type { BicameralVerdictEventPayload } from "../../../shared/types/events";

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

interface EmitRecord {
  type: string;
  payload: unknown;
}

/** A minimal eventBus stub capturing every emit. */
function makeEventBusStub(): { eventBus: BicameralRouteDeps["eventBus"]; emits: EmitRecord[] } {
  const emits: EmitRecord[] = [];
  const eventBus = {
    emit: (type: string, payload: unknown) => { emits.push({ type, payload }); },
  };
  return { eventBus, emits };
}

const driftRow = (
  id: string,
  status: "in-sync" | "drifted" | "unknown",
  evidence?: string,
): BicameralDriftStatus => ({ decisionId: id, filePath: "/foo.ts", status, evidence });

function makeDeps(
  client: BicameralMcpClient,
  eventBus?: BicameralRouteDeps["eventBus"],
): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: "/tmp",
    getBicameralCommand: () => "bicameral-mcp",
    getBicameralClient: () => client,
    getAutoConnect: () => false,
    setAutoConnect: async () => undefined,
    eventBus,
  };
}

function findHandler(handlers: CapturedHandler[], p: string): CapturedHandler {
  const h = handlers.find((c) => c.method === "post" && c.path === p);
  if (!h) throw new Error(`handler not found: POST ${p}`);
  return h;
}

function verdictEmits(emits: EmitRecord[]): BicameralVerdictEventPayload[] {
  return emits
    .filter((e) => e.type === "bicameral.verdict")
    .map((e) => e.payload as BicameralVerdictEventPayload);
}

suite("FX580 BicameralRoute bicameral.verdict event emit (Batch 4 Phase 1)", () => {
  test("drift handler with two drifted decisions emits two verdict:'drifted' events", async () => {
    const drift = [driftRow("d1", "drifted"), driftRow("d2", "drifted")];
    const client = {
      isConnected: () => true,
      drift: async () => drift,
    } as unknown as BicameralMcpClient;
    const { eventBus, emits } = makeEventBusStub();
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, eventBus));
    const { res } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-drift")
      .handler(fakeReq({ filePath: "/foo.ts" }), res);
    const verdicts = verdictEmits(emits);
    assert.equal(verdicts.length, 2);
    assert.deepEqual(
      verdicts.map((v) => ({ decisionId: v.decisionId, verdict: v.verdict })).sort(
        (a, b) => a.decisionId.localeCompare(b.decisionId),
      ),
      [
        { decisionId: "d1", verdict: "drifted" },
        { decisionId: "d2", verdict: "drifted" },
      ],
    );
  });

  test("drift handler emits verdict:'in-sync' for in-sync rows and nothing for unknown", async () => {
    const drift = [driftRow("d1", "in-sync"), driftRow("d2", "unknown")];
    const client = {
      isConnected: () => true,
      drift: async () => drift,
    } as unknown as BicameralMcpClient;
    const { eventBus, emits } = makeEventBusStub();
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, eventBus));
    const { res } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-drift")
      .handler(fakeReq({ filePath: "/foo.ts" }), res);
    const verdicts = verdictEmits(emits);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].decisionId, "d1");
    assert.equal(verdicts[0].verdict, "in-sync");
  });

  test("ratify handler emits one verdict:'ratified' carrying the decisionId", async () => {
    const client = {
      isConnected: () => true,
      ratify: async () => undefined,
    } as unknown as BicameralMcpClient;
    const { eventBus, emits } = makeEventBusStub();
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, eventBus));
    const { res } = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-ratify")
      .handler(fakeReq({ decisionId: "d-100", verdict: "ratify" }), res);
    const verdicts = verdictEmits(emits);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].decisionId, "d-100");
    assert.equal(verdicts[0].verdict, "ratified");
  });

  test("with no eventBus wired both handlers succeed and emit nothing (no throw)", async () => {
    const client = {
      isConnected: () => true,
      drift: async () => [driftRow("d1", "drifted")],
      ratify: async () => undefined,
    } as unknown as BicameralMcpClient;
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app as never, makeDeps(client, undefined));
    const driftRes = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-drift")
      .handler(fakeReq({ filePath: "/foo.ts" }), driftRes.res);
    assert.equal(driftRes.status(), 200);
    const ratifyRes = fakeRes();
    await findHandler(handlers, "/api/actions/bicameral-ratify")
      .handler(fakeReq({ decisionId: "d-100", verdict: "ratify" }), ratifyRes.res);
    assert.equal(ratifyRes.status(), 200);
  });
});
