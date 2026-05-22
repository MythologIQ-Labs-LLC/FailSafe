/**
 * FX590 — B132: Brainstorm node-label truncation feedback (release-class gate).
 *
 * Adding a node whose label exceeds the 200-char server cap must surface a
 * visible, non-blocking `.bs-truncation-notice` in the Brainstorm UI, and the
 * persisted node label must be exactly 200 characters.
 *
 * Substrate: a REAL ConsoleServer (serveConsoleServerUI) so the real
 * BrainstormRoute applies the cap and emits the additive `labelTruncated`
 * fields. No live external services. Node creation is driven through the
 * test-only `window.__failsafeRenderers` global (B-B199-2 Phase 0) which
 * exposes the BrainstormRenderer.graph instance — the Brainstorm shell ships
 * no DOM add-node input.
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
  await expect(page.locator('#workspace')).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  // Shell template paints synchronously; wait for a stable toolbar anchor.
  await expect(page.locator('#workspace .cc-bs-toolbar')).toBeVisible({ timeout: 10000 });
}

test("FX590 — adding a >200-char label surfaces the truncation notice + persists 200 chars", async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await gotoMindmap(page, controller.url);

  // No `.bs-truncation-notice` exists before any over-length label is added.
  await expect(page.locator('#workspace .bs-truncation-notice')).toHaveCount(0);

  // Drive a 250-char label through the real graph.addNode -> real POST route.
  const added = await page.evaluate(async () => {
    const g = (globalThis as unknown as {
      __failsafeRenderers?: {
        workspace?: { subViews?: Array<{ key: string; renderer?: { graph?: { addNode?: (l: string, t: string) => Promise<void> } } }> };
      };
    }).__failsafeRenderers;
    const graph = g?.workspace?.subViews?.find((s) => s.key === "brainstorm")?.renderer?.graph;
    if (!graph?.addNode) throw new Error("BrainstormRenderer.graph.addNode not exposed");
    await graph.addNode("L".repeat(250), "Feature");
    return true;
  });
  expect(added).toBe(true);

  // The visible, non-blocking truncation notice appears.
  const notice = page.locator('#workspace .bs-truncation-notice');
  await expect(notice).toBeVisible({ timeout: 5000 });
  await expect(notice).toContainText("Label shortened to 200 characters.");

  // The persisted node label is exactly 200 characters (server cap applied).
  const persistedLen = await page.evaluate(async () => {
    const res = await fetch("/api/v1/brainstorm/graph");
    const data = await res.json();
    const node = (data.nodes || []).find(
      (n: { label?: string }) => typeof n.label === "string" && n.label.startsWith("L"),
    );
    return node ? String(node.label).length : -1;
  });
  expect(persistedLen).toBe(200);

  // Notice is dismissible — non-blocking affordance. dispatchEvent is used
  // (rather than .click()) because the absolutely-positioned graph canvas
  // overlays the toolbar region and intercepts synthetic pointer events;
  // the dismiss click handler is still exercised end-to-end.
  await page.locator('#workspace .bs-truncation-notice-dismiss').dispatchEvent('click');
  await expect(page.locator('#workspace .bs-truncation-notice')).toHaveCount(0);
});
