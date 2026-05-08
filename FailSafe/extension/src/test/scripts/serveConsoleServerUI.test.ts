// Unit tests for the Phase 2 ConsoleServer-boot fixture.
// Mirrors the mocha + node:assert pattern used elsewhere in the suite (see
// `consoleServer.test.ts`). Run via the extension's `npm test` glob; the
// compiled file lands at `out/test/scripts/serveConsoleServerUI.test.js`.

import { describe, it } from "mocha";
import * as assert from "assert";
import * as http from "http";
import { WebSocket } from "ws";

import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "../ui/helpers/serveConsoleServerUI";
import { buildVerdictRecord, buildTimelineEvent } from "../ui/helpers/consoleServerFixtures";

function getJson(url: string, urlPath: string): Promise<{ status: number; body: unknown }> {
  const u = new URL(urlPath, url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: u.hostname, port: Number(u.port), path: u.pathname + u.search, method: "GET" },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          let parsed: unknown = data;
          try { parsed = JSON.parse(data); } catch { /* keep raw string */ }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function openSocket(
  url: string,
  onMessage?: (raw: string) => void,
): Promise<WebSocket> {
  const wsUrl = url.replace(/^http/, "ws");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    if (onMessage) {
      ws.on("message", (raw) => {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        onMessage(text);
      });
    }
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

describe("serveConsoleServerUI helper (Phase 2 fixture)", () => {
  it("case 1: returns controller whose url is bound to 127.0.0.1", async () => {
    const ctrl = await serveConsoleServerUI({});
    try {
      assert.ok(ctrl.url.startsWith("http://127.0.0.1:"), `url shape: ${ctrl.url}`);
    } finally {
      await ctrl.close();
    }
  });

  it("case 2: GET /api/hub returns a JSON object", async () => {
    const ctrl = await serveConsoleServerUI({});
    try {
      const res = await getJson(ctrl.url, "/api/hub");
      assert.strictEqual(res.status, 200);
      assert.ok(res.body && typeof res.body === "object", "hub body should be JSON object");
    } finally {
      await ctrl.close();
    }
  });

  it("case 3: GET /api/transparency returns events array sourced from transparency.jsonl fixture", async () => {
    const ctrl = await serveConsoleServerUI({
      timelineEvents: [
        buildTimelineEvent("evt-1", "prompt.dispatched"),
        buildTimelineEvent("evt-2", "policy.checked"),
      ],
    });
    try {
      const res = await getJson(ctrl.url, "/api/transparency");
      assert.strictEqual(res.status, 200);
      // Real route returns `{ events: [...] }` per TransparencyRiskRoute.ts:15.
      const body = res.body as { events?: Array<{ id?: string }> };
      assert.ok(body && Array.isArray(body.events), "transparency body.events should be an array");
      const ids = (body.events || []).map((e) => e.id);
      assert.ok(ids.includes("evt-1"), `expected evt-1 in ${JSON.stringify(ids)}`);
      assert.ok(ids.includes("evt-2"), `expected evt-2 in ${JSON.stringify(ids)}`);
    } finally {
      await ctrl.close();
    }
  });

  it("case 4: WS connection emits init payload + broadcast reaches sockets", async () => {
    const ctrl = await serveConsoleServerUI({});
    let initSeen = false;
    let refreshSeen = false;
    try {
      const ws = await openSocket(ctrl.url, (text) => {
        try {
          const msg = JSON.parse(text) as { type?: string };
          if (msg.type === "init") initSeen = true;
          if (msg.type === "hub.refresh") refreshSeen = true;
        } catch { /* ignore non-JSON frames */ }
      });
      // ConsoleServer's real onConnect sends an init via buildHubSnapshot, and
      // the helper-attached onConnect also sends an init payload — either is
      // sufficient evidence that init is wired.
      await new Promise((r) => setTimeout(r, 80));
      ctrl.broadcast({ type: "hub.refresh" });
      await new Promise((r) => setTimeout(r, 80));
      ws.close();
      assert.ok(initSeen, "expected an init payload after WS connect");
      assert.ok(refreshSeen, "expected hub.refresh after broadcast");
    } finally {
      await ctrl.close();
    }
  });

  it("case 5: closeAllSockets terminates open client sockets", async () => {
    const ctrl = await serveConsoleServerUI({});
    try {
      const ws = await openSocket(ctrl.url);
      const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
      ctrl.closeAllSockets();
      // Wait up to 500ms for the close event to fire.
      const raceTimer = new Promise<string>((resolve) =>
        setTimeout(() => resolve("timeout"), 500),
      );
      const result = await Promise.race([closed.then(() => "closed"), raceTimer]);
      assert.strictEqual(result, "closed", "client socket should observe close");
    } finally {
      await ctrl.close();
    }
  });

  it("case 6: setVerdicts mutates the memory ref read by /api/v1/verdicts", async () => {
    const ctrl: ConsoleServerController = await serveConsoleServerUI({});
    try {
      const blockRecord = buildVerdictRecord({ verdict: "BLOCK", reason: "test-block" });
      ctrl.setVerdicts([blockRecord]);
      const first = await getJson(ctrl.url, "/api/v1/verdicts");
      assert.strictEqual(first.status, 200);
      assert.ok(Array.isArray(first.body), "verdicts response is an array");
      const arr = first.body as Array<{ verdict?: string }>;
      assert.strictEqual(arr.length, 1, `expected 1 verdict, got ${arr.length}`);
      assert.strictEqual(arr[0].verdict, "BLOCK");

      ctrl.setVerdicts([]);
      const second = await getJson(ctrl.url, "/api/v1/verdicts");
      assert.strictEqual(second.status, 200);
      assert.ok(Array.isArray(second.body));
      assert.strictEqual((second.body as unknown[]).length, 0, "expected empty after reset");
    } finally {
      await ctrl.close();
    }
  });

  it("case 7: close() resolves without error", async () => {
    const ctrl = await serveConsoleServerUI({});
    await ctrl.close();
    assert.ok(true, "close() promise resolved");
  });
});
