import { strict as assert } from "assert";
import type { Application } from "express";
import type { ApiRouteDeps } from "../../roadmap/routes/types";
import { setupBrainstormPendingRoutes } from "../../roadmap/routes/brainstorm-pending-routes";

suite("Audio vault HTTP boundary (#465)", () => {
  function harness(denyRemote = false) {
    const handlers = new Map<string, (req: any, res: any) => Promise<void> | void>();
    const app = {
      get(name: string, callback: (req: any, res: any) => Promise<void> | void) {
        handlers.set(name, callback);
        return this;
      },
      post() { return this; },
      delete() { return this; },
    } as unknown as Application;
    let readCount = 0;
    const deps = {
      rejectIfRemote(_req: unknown, res: any) {
        if (!denyRemote) return false;
        res.status(403).send("Remote denied");
        return true;
      },
      audioVaultService: {
        async getAudio(_id: string) { readCount++; return Buffer.from("sample"); },
      },
      brainstormService: { getPendingTranscripts: () => [], retryPending: async () => [] },
      broadcast: () => undefined,
    } as unknown as ApiRouteDeps;
    setupBrainstormPendingRoutes(app, deps);
    const invoke = async (hash: unknown) => {
      const res = {
        statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
        status(code: number) { this.statusCode = code; return this; },
        send(value: unknown) { this.body = value; return this; },
        setHeader(name: string, value: string) { this.headers[name] = value; },
      };
      const handler = handlers.get("/api/v1/brainstorm/audio/:hash");
      assert.ok(handler, "audio GET route registered");
      await handler({ params: { hash } }, res);
      return res;
    };
    return { invoke, reads: () => readCount };
  }

  test("rejects encoded paths, uppercase and oversized identifiers before storage", async () => {
    const route = harness();
    for (const value of ["../", "%2f", "a".repeat(63), "A".repeat(64), "a".repeat(65), ""]) {
      const response = await route.invoke(value);
      assert.equal(response.statusCode, 400, JSON.stringify(value));
    }
    assert.equal(route.reads(), 0);
  });

  test("valid ID passes only after the existing remote-request refusal", async () => {
    const good = harness();
    const response = await good.invoke("b".repeat(64));
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Content-Type"], "audio/webm");
    assert.equal(good.reads(), 1);
    const remote = harness(true);
    assert.equal((await remote.invoke("b".repeat(64))).statusCode, 403);
    assert.equal(remote.reads(), 0);
  });
});
