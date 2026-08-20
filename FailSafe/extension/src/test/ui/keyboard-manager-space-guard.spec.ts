/**
 * FailSafe#305 — real-browser evidence for the Mind Map KeyboardManager
 * Space push-to-talk / focused-interactive-control conflict.
 *
 * jsdom-level behavioral proof lives in
 * src/test/roadmap/keyboard-manager.test.ts. This spec proves the same fix
 * against real browser default-action semantics (native <button> Space
 * activation only fires if nothing upstream called preventDefault()), which
 * jsdom does not implement.
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

async function gotoMindmap(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });
}

async function stubGraphRoute(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/v1/brainstorm/graph", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nodes: [], edges: [] }),
    }),
  );
}

type RendererGlobal = {
  __failsafeRenderers?: {
    workspace?: {
      subViews?: Array<{
        key: string;
        renderer?: {
          graph?: { undo?: () => void; __undoCalls?: number };
          voice?: { startPtt?: () => void; stopPtt?: () => void; __pttStarts?: number; __pttStops?: number };
        };
      }>;
    };
  };
};

async function installSpies(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const g = (globalThis as unknown as RendererGlobal).__failsafeRenderers;
    const sub = g?.workspace?.subViews?.find((s) => s.key === "brainstorm");
    const renderer = sub?.renderer;
    if (!renderer?.graph || !renderer?.voice) throw new Error("BrainstormRenderer graph/voice not exposed");

    renderer.graph.__undoCalls = 0;
    const originalUndo = renderer.graph.undo?.bind(renderer.graph);
    renderer.graph.undo = () => {
      renderer.graph!.__undoCalls!++;
      return originalUndo?.();
    };

    renderer.voice.__pttStarts = 0;
    renderer.voice.__pttStops = 0;
    const originalStart = renderer.voice.startPtt?.bind(renderer.voice);
    const originalStop = renderer.voice.stopPtt?.bind(renderer.voice);
    renderer.voice.startPtt = () => { renderer.voice!.__pttStarts!++; return originalStart?.(); };
    renderer.voice.stopPtt = () => { renderer.voice!.__pttStops!++; return originalStop?.(); };
  });
}

async function readCounters(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const g = (globalThis as unknown as RendererGlobal).__failsafeRenderers;
    const renderer = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer;
    return {
      undoCalls: renderer?.graph?.__undoCalls ?? 0,
      pttStarts: renderer?.voice?.__pttStarts ?? 0,
      pttStops: renderer?.voice?.__pttStops ?? 0,
    };
  });
}

test("FailSafe#305 — Space on the focused Mind Map UNDO button retains native activation, not PTT", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await installSpies(page);

  await page.locator("#workspace .cc-bs-undo").focus();
  await page.keyboard.press("Space");

  const counters = await readCounters(page);
  expect(counters.undoCalls).toBe(1);
  expect(counters.pttStarts).toBe(0);
});

test("FailSafe#305 — Space push-to-talk still activates when focus is on the Mind Map canvas", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await stubGraphRoute(page);
  await gotoMindmap(page, controller.url);
  await installSpies(page);

  const canvas = page.locator("#workspace .cc-brainstorm-canvas");
  await canvas.click({ position: { x: 10, y: 10 } });

  await page.keyboard.down("Space");
  await expect.poll(async () => (await readCounters(page)).pttStarts).toBe(1);

  await page.keyboard.up("Space");
  await expect.poll(async () => (await readCounters(page)).pttStops).toBe(1);
});
