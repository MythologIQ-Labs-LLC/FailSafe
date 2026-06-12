// FX891 — Workspace › Taxonomy editor (operator taxonomy + agent mappings).
// Real Chromium (the design-reference gate for a user-facing surface): renders a
// row per program/vertical/agent, the add-handler mutates the DOM, and Save POSTs
// the edited config to /api/v1/tracker/config.

import { test, expect } from '@playwright/test';
import { serveConsoleServerUI, type ConsoleServerController } from './helpers/serveConsoleServerUI';

let controller: ConsoleServerController;
test.afterEach(async () => { await controller?.close(); });

const CONFIG = {
  config: {
    programs: [{ key: 'ci', name: 'CI', accent: '#38d6c8' }, { key: 'rt', name: 'Runtime', accent: '#f0728f' }],
    verticals: [{ key: 'ci', name: 'CI', accent: '#38d6c8' }, { key: 'rt', name: 'Runtime', accent: '#f0728f' }],
    agents: [{ key: 'ci', name: 'CI', program: 'ci', vertical: 'ci', patterns: ['ci'] }],
  },
  source: 'config',
  lint: [],
};

async function gotoTaxonomy(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator('#workspace')).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="taxonomy"]').click();
  await expect(page.locator('#workspace .cc-tax')).toBeVisible({ timeout: 10000 });
}

test('FX891 — Taxonomy editor renders one row per program/vertical/agent', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route('**/api/v1/tracker/config', (r) => r.fulfill({ json: CONFIG }));
  await gotoTaxonomy(page, controller.url);
  await expect(page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-row')).toHaveCount(2);
  await expect(page.locator('#workspace .cc-tax-section[data-kind="verticals"] .cc-tax-row')).toHaveCount(2);
  await expect(page.locator('#workspace .cc-tax-section[data-kind="agents"] .cc-tax-row')).toHaveCount(1);
});

test('FX891 — "add" program mutates the DOM (handler is wired, not static markup)', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  await page.route('**/api/v1/tracker/config', (r) => r.fulfill({ json: CONFIG }));
  await gotoTaxonomy(page, controller.url);
  await page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-add').click();
  await expect(page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-row')).toHaveCount(3);
});

test('FX891 — editing a program name + Save POSTs the updated config', async ({ page }) => {
  controller = await serveConsoleServerUI({});
  let posted: { programs?: Array<{ key: string; name: string }> } | null = null;
  await page.route('**/api/v1/tracker/config', (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON();
      return r.fulfill({ json: { ok: true, written: ['docs/roadmap/tracker-config.yaml', '.failsafe/governance/tracker-taxonomy.directive.md'] } });
    }
    return r.fulfill({ json: CONFIG });
  });
  await gotoTaxonomy(page, controller.url);
  const nameInput = page.locator('#workspace .cc-tax-section[data-kind="programs"] .cc-tax-row').first().locator('[data-field="name"]');
  await nameInput.fill('CI/CD Renamed');
  await page.locator('#workspace .cc-tax-save').click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted!.programs!.find((p) => p.key === 'ci')!.name).toBe('CI/CD Renamed');
});
