import { describe, it } from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EventBus } from "../shared/EventBus";
import { ConsoleServer } from "../roadmap/ConsoleServer";

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Minimal HTTP harness for inline ConsoleServer routes (no extracted route module).
// Grabs the private express app via cast, attaches an ephemeral listener, and
// drives requests like the route harness used elsewhere.
async function startServerHarness(server: ConsoleServer): Promise<{ port: number; close: () => Promise<void> }> {
  const app = (server as unknown as { app: import("express").Application }).app;
  const http = await import("http");
  const httpServer = http.createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  const addr = httpServer.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to bind harness");
  return {
    port: addr.port,
    close: () => new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

async function getJson(port: number, path: string): Promise<{ status: number; body: any }> {
  const http = await import("http");
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET" },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          let parsed: any = data;
          try { parsed = JSON.parse(data); } catch { /* keep raw */ }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("ConsoleServer workspace-root scoped reads", () => {
  it("reads risks and transparency logs from configured workspace root", () => {
    const workspaceRoot = mkTempDir("failsafe-roadmap-root-");
    try {
      const transparencyDir = path.join(workspaceRoot, ".failsafe", "logs");
      const risksDir = path.join(workspaceRoot, ".failsafe", "risks");
      fs.mkdirSync(transparencyDir, { recursive: true });
      fs.mkdirSync(risksDir, { recursive: true });

      fs.writeFileSync(
        path.join(transparencyDir, "transparency.jsonl"),
        `${JSON.stringify({ id: "evt-1", type: "prompt.dispatched" })}\n`,
        "utf8",
      );
      fs.writeFileSync(
        path.join(risksDir, "risks.json"),
        JSON.stringify({ risks: [{ id: "risk-1", title: "Example risk" }] }),
        "utf8",
      );

      const eventBus = new EventBus();
      const fakePlanManager = {
        getAllSprints: () => [],
        getCurrentSprint: () => null,
        getActivePlan: () => null,
      };
      const fakeQorelogicManager = {
        getLedgerManager: () => null,
      };
      const fakeSentinelDaemon = {
        getStatus: () => ({ running: false, queueDepth: 0 }),
      };

      const server = new ConsoleServer(
        fakePlanManager as never,
        fakeQorelogicManager as never,
        fakeSentinelDaemon as never,
        eventBus,
        { workspaceRoot },
      ) as unknown as {
        getTransparencyEvents: (
          limit: number,
        ) => Array<Record<string, unknown>>;
        getRiskRegister: () => Array<Record<string, unknown>>;
      };

      const events = server.getTransparencyEvents(10);
      const risks = server.getRiskRegister();

      assert.strictEqual(events.length, 1);
      assert.strictEqual(String(events[0].id), "evt-1");
      assert.strictEqual(risks.length, 1);
      assert.strictEqual(String(risks[0].id), "risk-1");
      eventBus.dispose();
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("FX063 GET /api/v1/workspaces — returns workspaces list + current workspaceRoot", async () => {
    const workspaceRoot = mkTempDir("failsafe-roadmap-ws-");
    let harness: { port: number; close: () => Promise<void> } | null = null;
    try {
      const eventBus = new EventBus();
      const server = new ConsoleServer(
        { getAllSprints: () => [], getCurrentSprint: () => null, getActivePlan: () => null } as never,
        { getLedgerManager: () => null } as never,
        { getStatus: () => ({ running: false, queueDepth: 0 }) } as never,
        eventBus,
        { workspaceRoot },
      );
      harness = await startServerHarness(server);
      const res = await getJson(harness.port, "/api/v1/workspaces");
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.workspaces), "workspaces should be array");
      assert.strictEqual(res.body.current, workspaceRoot);
      eventBus.dispose();
    } finally {
      if (harness) await harness.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("FX064 GET /api/v1/verdicts — returns array (empty when no checkpoints exist)", async () => {
    const workspaceRoot = mkTempDir("failsafe-roadmap-verdicts-");
    let harness: { port: number; close: () => Promise<void> } | null = null;
    try {
      const eventBus = new EventBus();
      const server = new ConsoleServer(
        { getAllSprints: () => [], getCurrentSprint: () => null, getActivePlan: () => null } as never,
        { getLedgerManager: () => null } as never,
        { getStatus: () => ({ running: false, queueDepth: 0 }) } as never,
        eventBus,
        { workspaceRoot },
      );
      harness = await startServerHarness(server);
      const res = await getJson(harness.port, "/api/v1/verdicts");
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body), "verdicts response should be a JSON array");
      eventBus.dispose();
    } finally {
      if (harness) await harness.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("FX064 GET /api/v1/verdicts — limit query is parsed and capped at 100", async () => {
    const workspaceRoot = mkTempDir("failsafe-roadmap-verdicts-cap-");
    let harness: { port: number; close: () => Promise<void> } | null = null;
    try {
      const eventBus = new EventBus();
      const server = new ConsoleServer(
        { getAllSprints: () => [], getCurrentSprint: () => null, getActivePlan: () => null } as never,
        { getLedgerManager: () => null } as never,
        { getStatus: () => ({ running: false, queueDepth: 0 }) } as never,
        eventBus,
        { workspaceRoot },
      );
      harness = await startServerHarness(server);
      // Empty store still returns 200 with [] regardless of limit; we just
      // verify the route doesn't throw under various limit inputs (the
      // service-level cap is tested in CheckpointStore.test.ts).
      const res1 = await getJson(harness.port, "/api/v1/verdicts?limit=500");
      const res2 = await getJson(harness.port, "/api/v1/verdicts?limit=abc");
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      eventBus.dispose();
    } finally {
      if (harness) await harness.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
