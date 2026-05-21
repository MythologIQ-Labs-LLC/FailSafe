// Phase 6 of plan-qor-voice-substrate-extraction. Closes the B199
// release-class coverage gate for FX495 — the Voice Pack Settings card.
// Stubs the actual install/uninstall POSTs via page.route() so no real
// GitHub Releases download happens; the harness's VoicePackRoute is wired
// against a temp globalStoragePath that voicePackInstalled fixture controls.
//
// ===========================================================================
// STUB-ONLY — see docs/TEST_COVERAGE_TRADEOFFS.md (B-B199-3 / B-B199-6).
// This spec exercises the Voice Pack Settings-card UI wiring against
// page.route() stubs. It does NOT download the real voice-pack tarball and
// would NOT pass against a real install. The supply-chain trust boundary
// (URL resolution + redirect allowlist + SHA-256 verify) is unit-covered in
// voice-pack-install.test.ts; live Whisper/Piper behavior is a deliberate,
// documented coverage trade-off (binaries ship as a separate companion
// download).
// ===========================================================================

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX495 — Voice Pack Settings card (Phase 6)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('not-installed state: Settings card renders Install button + disabled hint', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();

    const installBtn = page.locator('[data-action="install-voice-pack"]');
    await expect(installBtn).toBeVisible({ timeout: 5000 });
    // Disabled-feature hint surfaces somewhere in the card body.
    await expect(page.locator('#cc-voice-pack-settings-slot')).toContainText(/voice features.*disabled/i);
    // Install action is the only voice-pack button; no Uninstall in absent state.
    await expect(page.locator('[data-action="uninstall-voice-pack"]')).toHaveCount(0);
  });

  test('installed state: Settings card renders version + Uninstall + disk usage', async ({ page }) => {
    controller = await serveConsoleServerUI({ voicePackInstalled: true, voicePackVersion: '5.2.0' });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="settings"]').click();

    const slot = page.locator('#cc-voice-pack-settings-slot');
    await expect(slot).toContainText('5.2.0', { timeout: 5000 });
    await expect(page.locator('[data-action="uninstall-voice-pack"]')).toBeVisible();
    // Disk usage line uses a human-readable unit.
    await expect(slot).toContainText(/bytes|KB|MB|GB/);
    // No Install button in installed state.
    await expect(page.locator('[data-action="install-voice-pack"]')).toHaveCount(0);
  });

  test('install flow: button click POSTs install + transitions to installed state', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/command-center.html`);

    // Intercept the install POST so no real GitHub download happens.
    let installPostCount = 0;
    await page.route('**/api/actions/install-voice-pack', (route) => {
      installPostCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, report: { ok: true, version: '5.2.0', finalPath: '/tmp/voice-pack' } }),
      });
    });
    // Flip the status response to "installed" after the install POST.
    let statusInstalled = false;
    await page.route('**/api/integrations/voice-pack/status', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          statusInstalled
            ? { ok: true, state: 'installed', version: '5.2.0', requiredMinVersion: '5.2.0', diskUsageBytes: 1024 }
            : { ok: true, state: 'absent', requiredMinVersion: '5.2.0' },
        ),
      });
    });

    await page.locator('.tab-btn[data-target="settings"]').click();
    const installBtn = page.locator('[data-action="install-voice-pack"]');
    await expect(installBtn).toBeVisible({ timeout: 5000 });

    // Click → POST fires.
    statusInstalled = true; // Subsequent status calls return installed.
    await installBtn.click();
    await expect.poll(() => installPostCount).toBeGreaterThanOrEqual(1);

    // Re-render the Settings tab to pick up the new status state. The card
    // re-fetches /status on tab activation.
    await page.locator('.tab-btn[data-target="overview"]').click();
    await page.locator('.tab-btn[data-target="settings"]').click();
    await expect(page.locator('[data-action="uninstall-voice-pack"]')).toBeVisible({ timeout: 5000 });
  });

  test('uninstall flow: button click POSTs uninstall + transitions to absent state', async ({ page }) => {
    controller = await serveConsoleServerUI({ voicePackInstalled: true, voicePackVersion: '5.2.0' });
    await page.goto(`${controller.url}/command-center.html`);

    let uninstallPostCount = 0;
    await page.route('**/api/actions/uninstall-voice-pack', (route) => {
      uninstallPostCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    let statusInstalled = true;
    await page.route('**/api/integrations/voice-pack/status', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          statusInstalled
            ? { ok: true, state: 'installed', version: '5.2.0', requiredMinVersion: '5.2.0', diskUsageBytes: 1024 }
            : { ok: true, state: 'absent', requiredMinVersion: '5.2.0' },
        ),
      });
    });

    await page.locator('.tab-btn[data-target="settings"]').click();
    const uninstallBtn = page.locator('[data-action="uninstall-voice-pack"]');
    await expect(uninstallBtn).toBeVisible({ timeout: 5000 });

    statusInstalled = false;
    await uninstallBtn.click();
    await expect.poll(() => uninstallPostCount).toBeGreaterThanOrEqual(1);

    await page.locator('.tab-btn[data-target="overview"]').click();
    await page.locator('.tab-btn[data-target="settings"]').click();
    await expect(page.locator('[data-action="install-voice-pack"]')).toBeVisible({ timeout: 5000 });
  });
});
