/**
 * FX512: serveConsoleServerUI /api/hub override middleware (B-EM-4 closure).
 *
 * Asserts the harness middleware:
 *   1. When `initialHub` is set, /api/hub returns the injected payload.
 *   2. Without `initialHub`, /api/hub falls through to the real server handler.
 *   3. controller.setHub(newHub) is reflected on the next /api/hub fetch
 *      (per-request hubRef read).
 */

import { strict as assert } from "assert";
import * as http from "http";
import { serveConsoleServerUI, ConsoleServerController } from "./serveConsoleServerUI";

function fetchHub(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(`${url}/api/hub`, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`/api/hub failed: ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

suite("FX512 serveConsoleServerUI /api/hub override (B-EM-4)", () => {
  let controller: ConsoleServerController | null = null;

  teardown(async () => {
    if (controller) { await controller.close(); controller = null; }
  });

  test("initialHub injected → /api/hub returns the override payload", async () => {
    controller = await serveConsoleServerUI({
      initialHub: { version: "override-test", customField: "abc" } as any,
    });
    const body = await fetchHub(controller.url);
    assert.equal(body.version, "override-test");
    assert.equal(body.customField, "abc");
  });

  test("no initialHub → /api/hub falls through to real handler (real shape)", async () => {
    controller = await serveConsoleServerUI({});
    const body = await fetchHub(controller.url);
    // Real handler returns a hub object with version + bootstrapState shape.
    assert.equal(typeof body, "object");
    assert.equal(body.version === undefined, false, "real handler should populate `version`");
    assert.equal(typeof body.bootstrapState, "object");
  });

  test("controller.setHub(newHub) reflected on next /api/hub fetch", async () => {
    controller = await serveConsoleServerUI({
      initialHub: { version: "v1" } as any,
    });
    const before = await fetchHub(controller.url);
    assert.equal(before.version, "v1");
    controller.setHub({ version: "v2" } as any);
    const after = await fetchHub(controller.url);
    assert.equal(after.version, "v2");
  });
});
