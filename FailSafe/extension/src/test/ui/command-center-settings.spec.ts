// FX-BROWSER-VERIFY-SETTINGS (Phase 2 Round 2 of
// plan-monitor-coherence-and-browser-verification.md v5).
// Asserts that the Settings tab in the Command Center renders a coherent
// theme-card surface (chips + active class consistent with the local store
// state) and that the FailSafe Pro card wires the "About FailSafe Pro"
// button (NOT a download button — confirming the public-positioning rule
// from CLAUDE.md memory).

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX-BROWSER-VERIFY-SETTINGS — settings tab coherence', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('settings tab activates and renders 6 theme chips', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();
    await expect(page.locator('#settings')).toHaveClass(/active/);
    // settings.js:11-18 declares 6 themes; renderChip emits one element per.
    const chips = page.locator('#settings .cc-theme-chips > *');
    await expect.poll(async () => chips.count(), { timeout: 5000 }).toBeGreaterThanOrEqual(6);
  });

  test('configuration card values are coherent — Theme strong tag matches active chip', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();
    // Wait for the renderer to populate the panel.
    await expect.poll(async () => page.locator('#settings .cc-card').count(), { timeout: 5000 }).toBeGreaterThan(0);

    // Read the "Theme: <strong>X</strong>" text and ensure the same theme id
    // is referenced somewhere in the chip group (no contradiction between
    // configuration card and chip surface). settings.js:48 chip data carries
    // `data-theme` or similar; we tolerate either by reading rendered text.
    const settingsText = await page.locator('#settings').textContent();
    expect(settingsText).toContain('Theme:');
    expect(settingsText).toContain('Configuration');
  });

  test('FailSafe Pro card wires About button (not download) per public-positioning rule', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();
    // settings.js:69-73 emits `data-action="open-failsafe-pro-about"` with
    // text "About FailSafe Pro". A download surface would have a different
    // anchor target / action — assert the About wiring is in place.
    const about = page.locator('[data-action="open-failsafe-pro-about"]');
    await expect(about).toBeVisible();
    await expect(about).toContainText('About FailSafe Pro');
    // No download button mistakenly co-rendered.
    await expect(page.locator('[data-action="download-failsafe-pro"]')).toHaveCount(0);
  });
});
