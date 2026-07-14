/**
 * #261 — BrainstormRenderer.render() must construct the Mind Map canvas at most
 * ONCE, even when render() is fired multiple times during the async
 * render→fetchGraph→initCanvas window (on load the UI fires render 2-3x: WS
 * `init` + REST /api/hub fanned to all renderers + tab activation).
 *
 * Signal: count requests to /api/v1/brainstorm/graph. render() issues exactly
 * one graph fetch per NON-guarded entry, so double-construction is observable as
 * a second graph request. The route is HELD (delayed fulfill) so a first render
 * is still in-flight when a second render() is driven explicitly; with the
 * in-flight guard the second render is a no-op → the held graph-request count
 * stays 1. Without the guard it would be 2 (red).
 *
 * Self-contained harness (per-spec copy, per #234 LD6 convention).
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

type Pg = import("@playwright/test").Page;

test("#261 — a second render() during the fetch window builds NO second canvas (single graph fetch)", async ({ page }) => {
  controller = await serveConsoleServerUI({});

  // HELD graph route: count every hit, then delay before fulfilling so the first
  // render's fetch is still in-flight when we drive the second render().
  let graphHits = 0;
  await page.route("**/api/v1/brainstorm/graph", async (r) => {
    graphHits += 1;
    await new Promise((res) => setTimeout(res, 800));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [] }) });
  });
  await page.route("**/api/v1/brainstorm/seed", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [] }) }));

  await page.addInitScript(() => {
    (globalThis as any).__bs = () => (globalThis as any).__failsafeRenderers?.workspace?.subViews
      ?.find((s: any) => s.key === "brainstorm")?.renderer;
  });

  // Navigate to the Mind Map. The shell (.cc-bs-export) renders synchronously in
  // the first render(), which dispatches the (now-held) graph fetch.
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });

  // Drive a SECOND render() while the first graph fetch is still held. With the
  // #261 guard this is a no-op; without it, it dispatches a second graph fetch.
  await page.evaluate(() => (globalThis as any).__bs()?.render({}));

  // Let the held fetch(es) resolve and the canvas settle.
  await expect.poll(() => page.evaluate(() => !!(globalThis as any).__bs?.()?.graph?.canvas),
    { timeout: 10000 }).toBe(true);

  expect(graphHits, "render() during the fetch window must not trigger a second graph fetch").toBe(1);

  // Sanity: exactly one live canvas is present after settle.
  const canvasReady = await page.evaluate(() => {
    const c = (globalThis as any).__bs?.()?.graph?.canvas;
    return !!(c && typeof c.layout === "string");
  });
  expect(canvasReady).toBe(true);
});
