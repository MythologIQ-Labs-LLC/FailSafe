// Popout UI shell coverage — every top-level tab button is present, clicking
// the workspace/governance/settings tabs activates the matching panel, and the
// Settings panel renders the 6 theme select rows.
//
// FX621 (v5.2.1 hotfix): migrated from the legacy in-process static-file
// server to `serveConsoleServerUI` because `learn.js` / `learn-essay-list.js`
// / `learn-glossary.js` (added in v5.2.0) import `../../../education/lessons.js`
// and `lessonTriggers.js`. Those imports require the ConsoleServer's module
// resolution to load as proper ES modules; serving the source tree as raw
// static files makes the browser fail to import the CommonJS-compiled output,
// the module chain aborts, `command-center.js` never bootstraps, and the
// `.tab-btn` click handlers are never attached (silent break that masked the
// v5.2.0 Release Pipeline failure until v5.2.1's unit-test fixes made the
// Build & Test job reach the Playwright phase).

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

test("popout UI shell renders required sections", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {}, agentHealth: null } as any,
  });
  await page.goto(`${controller.url}/command-center.html`);

  await expect(page.locator('.tab-btn[data-target="overview"]')).toBeVisible();
  await expect(page.locator('.tab-btn[data-target="agents"]')).toBeVisible();
  await expect(page.locator('.tab-btn[data-target="governance"]')).toBeVisible();
  await expect(page.locator('.tab-btn[data-target="workspace"]')).toBeVisible();
  await expect(page.locator('.tab-btn[data-target="settings"]')).toBeVisible();
  await expect(page.locator("#theme-select")).toBeHidden();

  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator("#workspace")).toHaveClass(/active/);

  await page.locator('.tab-btn[data-target="governance"]').click();
  await expect(page.locator("#governance")).toHaveClass(/active/);

  await page.locator('.tab-btn[data-target="settings"]').click();
  await expect(page.locator("#settings")).toHaveClass(/active/);
  await expect(page.locator(".cc-theme-select")).toHaveCount(6);
});
