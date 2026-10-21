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
    await expect(cards).toHaveCount(11); // +sarif (#241C D-4, FX915)
    // No config snapshot wired in the harness → all default to Disabled.
    await expect(page.locator('.cc-intcat-pill-disabled')).toHaveCount(11);
    await expect(page.locator('.cc-intcat-pill-configured')).toHaveCount(0);
    await expect(page.locator('.cc-intcat-pill-needs')).toHaveCount(0);
    // Grouped by category (Agent CLI, Agent Observe, Issue Tracker, CI/Checks,
    // Error Monitoring, Notifications) → 6 group headers.
    await expect(page.locator('.cc-intcat-group')).toHaveCount(7); // +Security Scanning
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

// #479 H6: evidence-backed states, rendered by the real ConsoleServer route
// and the real renderer in Chromium. The screenshot is the visual check
// against the existing card design (plan v608 lane B, LD4).
test.describe('#479 — catalog status from recorded evidence', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('observed, failing, stale, parsed and unverified cards never claim live qualification', async ({ page }) => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const on = (id: string) => `failsafe.integrations.${id}.enabled`;
    controller = await serveConsoleServerUI({
      integrationConfig: {
        [on('jira')]: true, 'failsafe.integrations.jira.baseUrl': true, 'failsafe.integrations.jira.email': true, 'failsafe.integrations.jira.apiToken': true,
        [on('sentry')]: true, 'failsafe.integrations.sentry.token': true, 'failsafe.integrations.sentry.org': true, 'failsafe.integrations.sentry.project': true,
        [on('slack')]: true, 'failsafe.integrations.slack.webhookUrl': true,
        [on('linear')]: true, 'failsafe.integrations.linear.apiKey': true,
        [on('sarif')]: true,
        [on('aider')]: true,
      },
      integrationHealth: {
        jira: { result: 'contract-verified', checkedAt: now },
        sentry: { result: 'failing', category: 'auth', checkedAt: now },
        slack: { result: 'connected', checkedAt: now },
        linear: { result: 'contract-verified', checkedAt: old },
        sarif: { result: 'contract-verified', checkedAt: now },
      },
    });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();
    const card = (id: string) => page.locator(`.cc-intcat-card[data-id="${id}"]`);
    await expect(card('jira')).toBeVisible({ timeout: 5000 });
    await expect(card('jira').locator('.cc-intcat-pill-observed')).toHaveText('Last response matched expected format');
    await expect(card('sentry').locator('.cc-intcat-pill-failing')).toHaveText('Failing');
    await expect(card('sentry').locator('.cc-intcat-last')).toContainText('authentication was refused');
    await expect(card('slack').locator('.cc-intcat-pill-observed')).toHaveText('Last service reached');
    await expect(card('linear').locator('.cc-intcat-pill-stale')).toHaveText('Stale');
    await expect(card('sarif').locator('.cc-intcat-pill-observed')).toHaveText('Last import parsed');
    await expect(card('aider').locator('.cc-intcat-pill-configured')).toHaveText('Configured · unverified');
    await expect(card('sentry').locator('.cc-intcat-pill-observed')).toHaveCount(0);
    await expect(card('jira').locator('.cc-intcat-caps').first()).toHaveText('Implemented path (not live-qualified): preview issues, create intent drafts');
    await expect(page.locator('.cc-intcat-sub')).toContainText('1 failing');
    await expect(page.locator('.cc-intcat-sub')).toContainText('observed connection or format results');
    await expect(page.locator('.cc-intcat-sub')).toContainText('A recent call is not end-to-end qualification or proof of customer value');
    await expect(card('jira')).toContainText('Value impact: not measured');
    await expect(card('jira')).not.toContainText('Operational');

    const shot = process.env.FAILSAFE_SCREENSHOT_DIR;
    if (shot) {
      for (const id of ['jira', 'sentry', 'slack', 'linear', 'sarif', 'aider']) {
        await card(id).scrollIntoViewIfNeeded();
        await card(id).screenshot({ path: `${shot}/catalog-card-${id}.png` });
      }
    }
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
