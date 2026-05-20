/**
 * FX521 — B199 Phase 5: Workspace tab Playwright coverage.
 *
 * The Workspace top-level tab hosts 2 sub-views via TabGroup:
 *   - Skills (SkillsRenderer) — QorLogic skill catalog
 *   - Mindmap (BrainstormRenderer) — Brainstorm canvas
 *
 * Phase 5 verifies the tab loads, sub-pills render and switch, content area
 * renders. Deep per-sub-view behavioral coverage (skills install flow,
 * brainstorm canvas drawing) deferred to future phases.
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

async function gotoWorkspace(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator('#workspace')).toBeVisible({ timeout: 10000 });
}

test("FX521 Workspace tab — 2 sub-pills render (Skills / Mindmap)", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoWorkspace(page, controller.url);
  await expect(page.locator('#workspace .cc-subview-bar')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#workspace .cc-pill[data-key="skills"]')).toBeVisible();
  await expect(page.locator('#workspace .cc-pill[data-key="brainstorm"]')).toBeVisible();
});

test("FX521 Workspace tab — Skills active by default", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoWorkspace(page, controller.url);
  await expect(page.locator('#workspace .cc-pill[data-key="skills"]')).toHaveClass(/active/);
  await expect(page.locator('#workspace .cc-pill[data-key="brainstorm"]')).not.toHaveClass(/active/);
});

test("FX521 Workspace tab — Mindmap click activates pill + renders subview", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await gotoWorkspace(page, controller.url);
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator('#workspace .cc-pill[data-key="brainstorm"]')).toHaveClass(/active/);
  await expect(page.locator('#workspace .cc-subview-content')).toBeVisible();
});
