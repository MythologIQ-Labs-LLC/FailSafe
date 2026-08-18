/**
 * #263 — a tab round-trip (switch away from the Mind Map, then back) must
 * rebuild a live canvas exactly once and not leak/multiply the heartbeat
 * interval or settings-bridge listeners.
 *
 * Mechanism: TabGroup.switchTo() calls the outgoing sub-view's destroy()
 * before rendering the incoming one (tab-group.js:59). BrainstormRenderer's
 * destroy() (brainstorm.js) tears down the canvas instance via
 * `this.graph.canvas?.destroy()` but historically left `this.graph.canvas`
 * and `this._canvasInit` set. render()'s #261 in-flight guard
 * (`if (!this.container || this.graph.canvas || this._canvasInit) return;`)
 * then early-returns on re-show, so the shell is never repainted and the
 * canvas is never rebuilt — the Mind Map tab silently shows stale content.
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

async function stubGraphRoute(page: Pg): Promise<void> {
  await page.route("**/api/v1/brainstorm/graph", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nodes: [], edges: [] }),
    }),
  );
}

async function gotoMindmap(page: Pg, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });
}

test("#263 — switching away from and back to Mind Map rebuilds a live canvas exactly once", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);

  await expect.poll(() => page.evaluate(() => {
    const g = (globalThis as any).__failsafeRenderers;
    return !!g?.workspace?.subViews?.find((s: any) => s.key === "brainstorm")?.renderer?.graph?.canvas;
  }), { timeout: 10000 }).toBe(true);

  // Switch away to another sub-view in the same tab group (triggers destroy()).
  await page.locator('#workspace .cc-pill[data-key="skills"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeHidden();

  // Switch back — this must rebuild the shell + canvas, not silently no-op.
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });

  const rebuilt = await page.evaluate(() => {
    const g = (globalThis as any).__failsafeRenderers;
    const r = g?.workspace?.subViews?.find((s: any) => s.key === "brainstorm")?.renderer;
    return { canvas: !!r?.graph?.canvas, canvasInit: !!r?._canvasInit, heartbeat: !!r?._heartbeatInterval };
  });
  expect(rebuilt.canvas, "canvas must be rebuilt after re-show").toBe(true);
  expect(rebuilt.canvasInit, "in-flight guard must reflect the new construction, not a stale true").toBe(true);
  expect(rebuilt.heartbeat, "a single heartbeat interval must be re-established").toBe(true);
});

test("#263 — repeated round trips do not leak heartbeat intervals or settings-bridge listeners", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);

  await page.evaluate(() => {
    const orig = (globalThis as any).setInterval;
    (globalThis as any).__intervalCount = 0;
    (globalThis as any).setInterval = function (...args: unknown[]) {
      (globalThis as any).__intervalCount++;
      return orig.apply(globalThis, args as never);
    };
    const origAdd = (globalThis as any).window.addEventListener.bind(globalThis.window);
    (globalThis as any).__listenerAddCount = 0;
    (globalThis as any).window.addEventListener = function (...args: unknown[]) {
      const name = args[0] as string;
      if (typeof name === "string" && name.startsWith("failsafe:")) (globalThis as any).__listenerAddCount++;
      return origAdd(...(args as [string, EventListenerOrEventListenerObject]));
    };
  });

  for (let i = 0; i < 3; i++) {
    await page.locator('#workspace .cc-pill[data-key="skills"]').click();
    await expect(page.locator("#workspace .cc-bs-export")).toBeHidden();
    await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
    await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });
  }

  const state = await page.evaluate(() => {
    const g = (globalThis as any).__failsafeRenderers;
    const r = g?.workspace?.subViews?.find((s: any) => s.key === "brainstorm")?.renderer;
    return {
      heartbeatCount: (globalThis as any).__intervalCount,
      listenerAddCount: (globalThis as any).__listenerAddCount,
      hasCanvas: !!r?.graph?.canvas,
    };
  });
  // Initial mount + 3 round trips = 4 total heartbeat-interval installs; each
  // prior one must have been cleared by destroy(), so exactly one is live —
  // that liveness is asserted above. Here we assert no unbounded growth: the
  // observed install count must equal exactly the number of (re)builds.
  expect(state.hasCanvas).toBe(true);
  expect(state.heartbeatCount, "one setInterval call per (re)build, no duplicate installs per build").toBe(4);
  // 3 settings-bridge listener names registered per build (audio-device / whisper-model / stt-language).
  expect(state.listenerAddCount, "settings-bridge listeners must not accumulate beyond one set per live build").toBe(4 * 3);
});
