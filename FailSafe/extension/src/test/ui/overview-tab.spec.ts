/**
 * FX523 — B199 Phase 7: Overview tab Playwright structural coverage.
 *
 * Overview is the default tab (loaded on page open). Single renderer
 * (OverviewRenderer, no sub-pills). Phase 7 verifies the tab loads as
 * default + renders content from injected hub payload.
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

test("FX523 Overview tab — active by default on page load", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await page.goto(`${controller.url}/command-center.html`);
  await expect(page.locator('.tab-btn[data-target="overview"]')).toHaveClass(/active/, { timeout: 10000 });
  await expect(page.locator('#overview')).toBeVisible({ timeout: 10000 });
});

test("FX523 Overview tab — clicking another tab and clicking back returns to overview", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: 'test', bootstrapState: {} } as any,
  });
  await page.goto(`${controller.url}/command-center.html`);
  // Switch to Workspace
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator('.tab-btn[data-target="workspace"]')).toHaveClass(/active/);
  // Switch back to Overview
  await page.locator('.tab-btn[data-target="overview"]').click();
  await expect(page.locator('.tab-btn[data-target="overview"]')).toHaveClass(/active/);
  await expect(page.locator('#overview')).toBeVisible();
});

test("FX523 Overview tab — renders without runtime errors on minimal hub payload", async ({ page }) => {
  // Page errors will fail the test via Playwright's default unhandled-error
  // surfaces. Asserting visibility on a known top-level chrome element
  // confirms the page didn't crash mid-render.
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  controller = await serveConsoleServerUI({
    initialHub: { version: 'minimal', bootstrapState: {} } as any,
  });
  await page.goto(`${controller.url}/command-center.html`);
  await expect(page.locator('.tab-nav')).toBeVisible({ timeout: 10000 });
  // No runtime errors swallowed
  expect(errors).toEqual([]);
});
