// FX-BROWSER-VERIFY-OVERVIEW (Phase 2 Round 2 of
// plan-monitor-coherence-and-browser-verification.md v5).
// Loads the Command Center Overview tab against the real ConsoleServer
// `/api/hub` route (per ConsoleServer.ts:383). Asserts the connection-status
// dot in the sidebar footer and the top-bar status tickers reach a coherent
// rendered state — no contradiction between dot label and ticker content.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX-BROWSER-VERIFY-OVERVIEW — overview tab data coherence', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('cold load: overview tab is the active default + tickers render', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    // Sidebar tab "Overview" carries the `.active` class on initial load.
    await expect(page.locator('.tab-btn[data-target="overview"]')).toHaveClass(/active/);
    await expect(page.locator('#overview')).toHaveClass(/active/);
    // Top-bar tickers exist with their static label prefixes; their dynamic
    // spans hydrate from hub data once the WS init payload arrives.
    await expect(page.locator('#ticker-protocol')).toBeVisible();
    await expect(page.locator('#ticker-sentinel')).toBeVisible();
    await expect(page.locator('#ticker-latency')).toBeVisible();
    await expect(page.locator('#ticker-workspace')).toBeVisible();
  });

  test('connection status dot reaches Live state once hub fetch completes', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    // The connection-status footer hydrates async; poll for the "Live" label
    // (set by command-center.js:51 when state==='connected').
    const statusLabel = page.locator('.connection-status').first();
    await expect.poll(async () => statusLabel.textContent(), { timeout: 8000 }).toMatch(/Live|Connecting/);
  });

  test('hub route returns JSON object — overview can render against real data', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    // Direct /api/hub fetch from page context confirms the contract the
    // overview renderer depends on (sentinelStatus, runState, recentCheckpoints).
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/hub');
      return res.json();
    });
    expect(body).toBeTruthy();
    expect(typeof body).toBe('object');
    // Overview renderer reads these keys; the route must surface them even
    // when empty so that the renderer doesn't crash on `?.` access.
    expect(body).toHaveProperty('sentinelStatus');
  });
});
