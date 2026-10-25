import { strict as assert } from "assert";
import { EventEmitter } from "events";
import type { Application } from "express";
import type { ApiRouteDeps } from "../../roadmap/routes/types";
import { setupBrainstormPendingRoutes } from "../../roadmap/routes/brainstorm-pending-routes";

type Handler = (req: any, res: any) => void | Promise<void>;
type Approval = "approved" | "declined";
const ID = "a".repeat(64);
const preview = { id: ID, bytes: 7, audioDev: 1, audioIno: 9, sidecarDev: 1, sidecarIno: 10 };

function reply() {
  return Object.assign(new EventEmitter(), {
    statusCode: 200, body: null as unknown, writableEnded: false, headersSent: false,
    socket: { destroyed: false },
    status(n: number) { this.statusCode = n; return this; },
    json(value: unknown) { this.body = value; this.writableEnded = true; this.headersSent = true; return this; },
    send(value: unknown) { this.body = value; this.writableEnded = true; this.headersSent = true; return this; },
  });
}

function harness(approval: Approval | null, remote = false, result: "deleted" | "stale" | "partial" = "deleted") {
  const gets = new Map<string, Handler>(), deletes = new Map<string, Handler>();
  const app = {
    get(name: string, handler: Handler) { gets.set(name, handler); return this; },
    delete(name: string, handler: Handler) { deletes.set(name, handler); return this; },
    post() { return this; },
  } as unknown as Application;
  let removed = 0, prompts = 0, inspected = 0;
  const deps = {
    rejectIfRemote(_req: unknown, res: ReturnType<typeof reply>) {
      if (!remote) return false;
      res.status(403).json({ error: "remote-refused" }); return true;
    },
    audioVaultService: {
      async listAudio() { return [{ id: ID, bytes: 7, modifiedAt: "2026-10-25T00:00:00.000Z" }]; },
      async inspectDeletion(_id: string) { inspected++; return preview; },
      async deleteAudio(request: typeof preview) {
        assert.deepEqual(request, preview, "delete requires exact bound snapshot");
        removed++; return result;
      },
    },
    ...(approval === null ? {} : { confirmOperatorAction: async (request: { title: string; detail: string }) => {
      prompts++;
      assert.match(request.title, /Permanently delete/);
      assert.match(request.detail, /cannot be undone/);
      return approval;
    } }),
  } as unknown as ApiRouteDeps;
  setupBrainstormPendingRoutes(app, deps);
  const invoke = async (method: "get" | "delete", route: string, hash?: unknown) => {
    const handler = (method === "get" ? gets : deletes).get(route);
    assert.ok(handler);
    const res = reply();
    await handler({ params: { hash } }, res);
    return res;
  };
  return { invoke, count: () => removed, prompts: () => prompts, inspected: () => inspected };
}

suite("Mind Map audio deletion requires native approval (#465)", () => {
  test("bounded recording inventory is available only locally", async () => {
    const good = harness("approved");
    const list = await good.invoke("get", "/api/v1/brainstorm/audio");
    assert.equal(list.statusCode, 200);
    assert.deepEqual((list.body as any).recordings[0].id, ID);
    const denied = harness("approved", true);
    assert.equal((await denied.invoke("get", "/api/v1/brainstorm/audio")).statusCode, 403);
  });

  test("valid deletion is bound to a native modal and the exact recording", async () => {
    const h = harness("approved");
    const result = await h.invoke("delete", "/api/v1/brainstorm/audio/:hash", ID);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { deleted: true });
    assert.equal(h.count(), 1);
    assert.equal(h.prompts(), 1);
  });

  test("no native confirmer or explicit decline means no deletion", async () => {
    for (const approval of [null, "declined"] as const) {
      const h = harness(approval);
      const res = await h.invoke("delete", "/api/v1/brainstorm/audio/:hash", ID);
      assert.equal(res.statusCode, approval === null ? 503 : 409);
      assert.equal(h.count(), 0);
    }
  });

  test("invalid, remote, and stale requests cannot delete", async () => {
    const h = harness("approved");
    const bad = await h.invoke("delete", "/api/v1/brainstorm/audio/:hash", "../outside");
    assert.equal(bad.statusCode, 400);
    assert.equal(h.prompts(), 0);
    assert.equal(h.inspected(), 0);
    const remote = harness("approved", true);
    assert.equal((await remote.invoke("delete", "/api/v1/brainstorm/audio/:hash", ID)).statusCode, 403);
    assert.equal(remote.count(), 0);
    const stale = harness("approved", false, "stale");
    assert.equal((await stale.invoke("delete", "/api/v1/brainstorm/audio/:hash", ID)).statusCode, 409);
  });

  test("partial filesystem deletion is an error", async () => {
    const h = harness("approved", false, "partial");
    assert.equal((await h.invoke("delete", "/api/v1/brainstorm/audio/:hash", ID)).statusCode, 500);
  });
});
