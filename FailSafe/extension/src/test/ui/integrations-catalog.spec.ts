// FX839 / FX841 — Playwright coverage for the Integrations-tab Catalog sub-view
// (#167) and the Open Design live-state card (#166). Drives the REAL ConsoleServer
// via serveConsoleServerUI: the catalog route returns all-disabled (no config
// snapshot wired in the harness → the shipped default) and the Open Design status
// route returns disconnected (no MCP client wired). This is the Chrome/Playwright
// visual+behavioral gate that complements the jsdom structural tests.
//
// No external network / spawn: both routes read only injected host state.

import { test, expect } from '@playwright/test';
import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX839 — Integrations Catalog sub-view (#167)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('Catalog is the default sub-view and lists every integration as Disabled (shipped default)', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    // Catalog is the first pill → active by default.
    const cards = page.locator('.cc-intcat-card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    // 10 integrations in the catalog (9 #167 + Slack).
    await expect(cards).toHaveCount(10);
    // No config snapshot wired in the harness → all default to Disabled.
    await expect(page.locator('.cc-intcat-pill-disabled')).toHaveCount(10);
    await expect(page.locator('.cc-intcat-pill-active')).toHaveCount(0);
    await expect(page.locator('.cc-intcat-pill-needs')).toHaveCount(0);
    // Grouped by category (Agent CLI, Agent Observe, Issue Tracker, CI/Checks,
    // Error Monitoring, Notifications) → 6 group headers.
    await expect(page.locator('.cc-intcat-group')).toHaveCount(6);
  });

  test('a known integration card renders its label + a Configure affordance', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    const sentry = page.locator('.cc-intcat-card[data-id="sentry"]');
    await expect(sentry).toBeVisible({ timeout: 5000 });
    await expect(sentry).toContainText('Sentry');
    await expect(sentry.locator('.cc-intcat-configure')).toBeVisible();
  });

  test('Configure button navigates to the Settings tab', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    await page.locator('.cc-intcat-card[data-id="linear"] .cc-intcat-configure').click();
    await expect(page.locator('.tab-btn[data-target="settings"]')).toHaveClass(/active/);
  });
});

test.describe('FX841 — Open Design live state (#166)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('Open Design card probes live state and shows disconnected when no client is wired', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    // Switch to the Open Design sub-view pill.
    await page.locator('.cc-pill[data-key="opendesign"]').click();

    const statusBlock = page.locator('.cc-od-status-block');
    await expect(statusBlock).toBeVisible({ timeout: 5000 });
    // No MCP client wired in the harness → live probe reports disconnected
    // (NOT the former hard-coded literal — this is now endpoint-driven).
    await expect(statusBlock).toContainText('disconnected');
  });
});
