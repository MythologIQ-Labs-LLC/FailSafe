// FX907 (#83 Phase A) — GET /api/v1/governance/commit-check. Written FIRST
// per TDD. The pre-commit hook parses the JSON body with grep and runs curl
// with -sf, so BLOCK verdicts must be HTTP 200 (a 4xx fails open) — T10 pins
// the status explicitly.
//
// #532 part B (plan-532b LD9, B283): the route read `hub.activeIntent`, a key no hub
// builder sets, so with the hook installed in enforce mode every commit was refused. The
// active intent now comes from an injected `getActiveIntent` (the host's IntentService, read
// at request time); the hub key is no longer read. T11 is the red-first row.
import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { registerCommitCheckRoute } from "../../roadmap/routes/CommitCheckRoute";
import { ConsoleServer } from "../../roadmap/ConsoleServer";
import { EventBus } from "../../shared/EventBus";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require("../../../src/test/shared/removeTempTree.cjs") as { removeTempTree: (dir: string) => void };

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

interface Captured {
  status: number;
  body: Record<string, unknown> | null;
}

const COULD_NOT_READ = "FailSafe could not read the active intent";

function makeApp(): { app: { get: (p: string, h: Handler) => void }; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  return { app: { get: (p: string, h: Handler) => handlers.set(p, h) }, handlers };
}

function makeRes(): { res: Record<string, unknown>; captured: Captured } {
  const captured: Captured = { status: 200, body: null };
  const res: Record<string, unknown> = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
    },
  };
  return { res, captured };
}

function makeDeps(opts: {
  tokenValid: boolean;
  mode: string;
  activeIntent: Record<string, unknown> | null;
  /** What the hub snapshot carries under `activeIntent` (no hub builder sets it; the route must not read it). */
  hubActiveIntent?: Record<string, unknown> | null;
  getActiveIntent?: (() => Promise<unknown>) | null;
}) {
  return {
    validateCommitToken: (_t: string) => opts.tokenValid,
    buildHubSnapshot: async () => ({
      governanceModeState: { mode: opts.mode },
      ...(opts.hubActiveIntent !== undefined ? { activeIntent: opts.hubActiveIntent } : {}),
    }),
    ...(opts.getActiveIntent === null ? {} : { getActiveIntent: opts.getActiveIntent ?? (async () => opts.activeIntent) }),
  };
}

async function invoke(
  deps: ReturnType<typeof makeDeps>,
  token: string | undefined,
): Promise<Captured> {
  const { app, handlers } = makeApp();
  registerCommitCheckRoute(app as never, deps as never);
  const handler = handlers.get("/api/v1/governance/commit-check");
  assert.ok(handler, "route must register at the hook's exact path");
  const { res, captured } = makeRes();
  await handler!({ header: (_n: string) => token, headers: { "x-failsafe-token": token } }, res);
  return captured;
}

describe("CommitCheckRoute (FX907/#83A)", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: { id: "i1" } });
  });

  it("T7: missing/invalid token -> 401 allow:false; verdict logic never consulted", async () => {
    let hubCalls = 0;
    let intentCalls = 0;
    deps = makeDeps({ tokenValid: false, mode: "enforce", activeIntent: null, getActiveIntent: async () => { intentCalls++; return null; } });
    const inner = deps.buildHubSnapshot;
    deps.buildHubSnapshot = async () => {
      hubCalls++;
      return inner();
    };
    const out = await invoke(deps, "wrong");
    assert.equal(out.status, 401);
    assert.equal(out.body?.allow, false);
    assert.equal(hubCalls, 0, "token gate must precede any verdict work");
    assert.equal(intentCalls, 0, "token gate must precede the intent read");
  });

  it("T8: valid token + observe mode -> 200 allow:true", async () => {
    deps = makeDeps({ tokenValid: true, mode: "observe", activeIntent: null });
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, true);
  });

  it("T9: valid token + enforce + active intent (from getActiveIntent) -> 200 allow:true", async () => {
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, true);
  });

  it("T10: valid token + enforce + NO active intent -> HTTP 200 + allow:false with reason", async () => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: null });
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200, "block verdicts MUST be 2xx — curl -sf fails open on 4xx");
    assert.equal(out.body?.allow, false);
    assert.ok(
      typeof out.body?.reason === "string" && (out.body.reason as string).length > 0,
      "reason must be present for the hook's reason parser",
    );
    assert.match(String(out.body?.reason), /no active intent/);
  });

  it("T11 (B283 red-first): no hub activeIntent + an intent from getActiveIntent -> 200 allow:true", async () => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: { id: "i1" } });
    const hub = await deps.buildHubSnapshot();
    assert.equal("activeIntent" in hub, false, "the hub carries no activeIntent, as in production");
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, true);
  });

  it("T12: the hub's activeIntent is not read: a hub value with getActiveIntent null still blocks", async () => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: null, hubActiveIntent: { id: "stale" } });
    const out = await invoke(deps, "t");
    assert.equal(out.body?.allow, false);
  });

  it("T13: getActiveIntent absent -> HTTP 200 allow:false 'could not read the active intent'", async () => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: null, getActiveIntent: null, hubActiveIntent: { id: "i1" } });
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, false);
    assert.equal(out.body?.reason, COULD_NOT_READ);
  });

  it("T14: getActiveIntent throwing -> HTTP 200 allow:false 'could not read the active intent'", async () => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: null, getActiveIntent: async () => { throw new Error("locked"); } });
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, false);
    assert.equal(out.body?.reason, COULD_NOT_READ);
  });

  it("T15: ConsoleServer reads the intent service at request time: one set after construction is used", async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-commit-check-"));
    const eventBus = new EventBus();
    const server = new ConsoleServer(
      { getAllSprints: () => [], getCurrentSprint: () => null, getActivePlan: () => null } as never,
      { getLedgerManager: () => null } as never,
      { getStatus: () => ({ running: false, queueDepth: 0 }) } as never,
      eventBus,
      { workspaceRoot, validateCommitToken: () => true },
    );
    // The route deps were built in the constructor; only the hub's mode is pinned here.
    (server as unknown as { hub: { buildHubSnapshot: () => Promise<unknown> } }).hub.buildHubSnapshot =
      async () => ({ governanceModeState: { mode: "enforce" } });
    const app = (server as unknown as { app: import("express").Application }).app;
    const httpServer = http.createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (httpServer.address() as import("net").AddressInfo).port;
    const get = (): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/api/v1/governance/commit-check", headers: { "X-FailSafe-Token": "t" } }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      });
      req.on("error", reject);
      req.end();
    });
    try {
      const before = await get();
      assert.equal(before.allow, false);
      assert.equal(before.reason, COULD_NOT_READ, "no intent service wired yet");
      server.setIntentService({ getActiveIntent: async () => ({ id: "i1" }) } as never);
      const after = await get();
      assert.equal(after.allow, true, "the service set after construction is used");
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      server.stop();
      eventBus.dispose();
      removeTempTree(workspaceRoot);
    }
  });
});
