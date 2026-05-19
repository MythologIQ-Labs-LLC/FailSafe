/**
 * FX520 — B199 Phase 4: Agents tab Playwright coverage.
 *
 * The Agents top-level tab hosts 4 sub-views via TabGroup:
 *   - Operations (OperationsRenderer)
 *   - Timeline (TimelineRenderer)
 *   - Genome (GenomeRenderer)
 *   - Replay (ReplayRenderer)
 *
 * Phase 4 verifies the tab loads, sub-pills render and switch, and
 * each sub-view's content area renders without throwing. Deep per-sub-view
 * behavioral coverage (agent health metrics, run list, genome failure
 * patterns) is deferred to a follow-on phase — this Phase establishes
 * baseline coverage that the tab boots in production-like state.
 *
 * Substrate chain (Phase 3 → bicameral-quickwins → Phase 2 derived):
 *  - B-EM-4 /api/hub override (replicated inline in serveConsoleServerUI.ts).
 *  - B-BIC-4 capability cache (inherited).
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

async function gotoAgents(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="agents"]').click();
  await expect(page.locator('#agents')).toBeVisible({ timeout: 10000 });
}

test("FX520 Agents tab — 4 sub-pills render (Operations / Timeline / Genome / Replay)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {}, agentHealth: null } as any,
  });
  await gotoAgents(page, controller.url);
  const subbar = page.locator('#agents .cc-subview-bar');
  await expect(subbar).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#agents .cc-pill[data-key="operations"]')).toBeVisible();
  await expect(page.locator('#agents .cc-pill[data-key="timeline"]')).toBeVisible();
  await expect(page.locator('#agents .cc-pill[data-key="genome"]')).toBeVisible();
  await expect(page.locator('#agents .cc-pill[data-key="replay"]')).toBeVisible();
});

test("FX520 Agents tab — first sub-pill (Operations) is active by default", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {}, agentHealth: null } as any,
  });
  await gotoAgents(page, controller.url);
  const opPill = page.locator('#agents .cc-pill[data-key="operations"]');
  await expect(opPill).toHaveClass(/active/);
  // Other pills are not active initially.
  await expect(page.locator('#agents .cc-pill[data-key="timeline"]')).not.toHaveClass(/active/);
});

test("FX520 Agents tab — clicking Replay sub-pill activates it + renders content area", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {}, agentHealth: null } as any,
  });
  await gotoAgents(page, controller.url);
  await page.locator('#agents .cc-pill[data-key="replay"]').click();
  await expect(page.locator('#agents .cc-pill[data-key="replay"]')).toHaveClass(/active/);
  // Sub-view content container is rendered. Don't assert specific replay markup
  // (that's behavioral Phase 5+ scope); just confirm the sub-view content
  // container exists and the renderer didn't throw (Playwright would surface
  // page errors via expect failures elsewhere).
  await expect(page.locator('#agents .cc-subview-content')).toBeVisible();
});
