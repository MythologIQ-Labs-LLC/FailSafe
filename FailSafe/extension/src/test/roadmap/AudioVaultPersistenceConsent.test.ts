import { strict as assert } from "assert";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import type { Application } from "express";
import type { ApiRouteDeps } from "../../roadmap/routes/types";
import { setupBrainstormPendingRoutes } from "../../roadmap/routes/brainstorm-pending-routes";

type Handler = (req: any, res: any) => Promise<void> | void;
type Outcome = "approved" | "declined" | "busy";

function response() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    statusCode: 200, body: undefined as unknown,
    socket: { destroyed: false }, writableEnded: false, headersSent: false,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) {
      this.body = value; this.writableEnded = true; this.headersSent = true; return this;
    },
    send(value: unknown) {
      this.body = value; this.writableEnded = true; this.headersSent = true; return this;
    },
  });
}

function harness(outcome: Outcome | null, remote = false) {
  const posts = new Map<string, Handler>();
  const app = {
    get() { return this; },
    post(name: string, ...handlers: Handler[]) { posts.set(name, handlers[handlers.length - 1]); return this; },
  } as unknown as Application;
  let stored = 0;
  const recordings: Buffer[] = [];
  let prompted = 0;
  const requests: Array<{ title: string; detail: string }> = [];
  let complete: ((value: Outcome) => void) | undefined;
  const deps = {
    rejectIfRemote(_req: unknown, res: ReturnType<typeof response>) {
      if (!remote) return false;
      res.status(403).json({ error: "remote-refused" });
      return true;
    },
    audioVaultService: {
      async storeAudio(bytes: Buffer) { stored++; recordings.push(Buffer.from(bytes)); return "a".repeat(64); },
    },
    ...(outcome === null ? {} : {
      confirmOperatorAction: async (request: { title: string; detail: string }) => {
        prompted++; requests.push(request);
        if (outcome !== "approved") return outcome;
        return new Promise<Outcome>((resolve) => { complete = resolve; });
      },
    }),
  } as unknown as ApiRouteDeps;
  setupBrainstormPendingRoutes(app, deps);
  const handler = posts.get("/api/v1/brainstorm/audio");
  assert.ok(handler);
  const invoke = (body: unknown, res = response()) => ({ task: Promise.resolve(handler({ body }, res)), res });
  return { invoke, reads: () => stored, recorded: () => recordings, asks: () => prompted, requests, approve: () => complete?.("approved") };
}

suite("Mind Map audio saving requires native operator consent (#465)", () => {
  test("fails closed without a wired native confirmer", async () => {
    const h = harness(null);
    const { task, res } = h.invoke(Buffer.from("voice"));
    await task;
    assert.equal(res.statusCode, 503);
    assert.equal(h.reads(), 0);
  });

  test("decline or busy confirmation never stores a capture", async () => {
    for (const outcome of ["declined", "busy"] as const) {
      const h = harness(outcome);
      const { task, res } = h.invoke(Buffer.from("voice"));
      await task;
      assert.equal(res.statusCode, outcome === "busy" ? 429 : 409);
      assert.equal(h.asks(), 1);
      assert.equal(h.reads(), 0);
    }
  });

  test("valid approval displays bytes and content digest and saves exactly once", async () => {
    const h = harness("approved");
    const content = Buffer.from("private voice capture");
    const { task, res } = h.invoke(content);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(h.asks(), 1);
    assert.equal(h.reads(), 0, "no disk write before native approval");
    assert.match(h.requests[0].detail, /even if transcription fails/);
    assert.match(h.requests[0].detail, /No automatic deletion/);
    assert.ok(h.requests[0].detail.includes(crypto.createHash("sha256").update(content).digest("hex").slice(0, 16)));
    h.approve();
    await task;
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { audioHash: "a".repeat(64) });
    assert.equal(h.reads(), 1);
  });

  test("client disconnect while modal is open means no write", async () => {
    const h = harness("approved");
    const { task, res } = h.invoke(Buffer.from("private"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    res.socket.destroyed = true;
    res.emit("close");
    h.approve();
    await task;
    assert.equal(h.reads(), 0);
  });

  test("a request-body mutation during approval cannot change saved bytes", async () => {
    const h = harness("approved");
    const body = Buffer.from("before");
    const { task, res } = h.invoke(body);
    await new Promise<void>((resolve) => setImmediate(resolve));
    body.write("after!");
    h.approve();
    await task;
    assert.equal(res.statusCode, 200);
    assert.equal(h.reads(), 1);
    assert.equal(h.recorded()[0].toString(), "before", "approved copy, not later mutation");
  });

  test("string, array and object bodies are rejected before confirmation or writing", async () => {
    const h = harness("approved");
    for (const body of ["not audio", ["not", "audio"], { data: "not audio" }]) {
      const result = h.invoke(body);
      await result.task;
      assert.equal(result.res.statusCode, 415);
    }
    assert.equal(h.asks(), 0);
    assert.equal(h.reads(), 0);
  });

  test("remote and empty bodies are rejected without operator prompt", async () => {
    const remote = harness("approved", true);
    const a = remote.invoke(Buffer.from("voice")); await a.task;
    assert.equal(a.res.statusCode, 403);
    assert.equal(remote.asks(), 0);
    assert.equal(remote.reads(), 0);
    const empty = harness("approved");
    const b = empty.invoke(Buffer.alloc(0)); await b.task;
    assert.equal(b.res.statusCode, 400);
    assert.equal(empty.asks(), 0);
    assert.equal(empty.reads(), 0);
  });
});
