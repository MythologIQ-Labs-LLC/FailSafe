// FX601 — Educational Component glossary e2e proof (v2 rebuild: Learn-tab essay set).
// Command Center → Learn tab → the "FailSafe Glossary" section. In FailSafe
// Learn v2 the glossary is the SECONDARY reference below the primary
// SWE-craft essay list. This spec drives the real UI, expands the glossary,
// opens a term, and asserts its explanation is shown. Sink: real
// page.locator() reads against rendered DOM.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';

function hubWithEducation(enabled: boolean): HubFixture {
  const hub = hubForPhase('PLAN');
  hub.governanceModeState = { mode: 'observe', defaulted: true };
  hub.education = { enabled, proficiency: 'beginner' };
  return hub;
}

test.describe('FX601 — Command Center FailSafe Glossary section (Learn tab)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('the FailSafe Glossary section expands and a term opens to its explanation', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(true) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    // The glossary section renders inside the Learn tab, collapsed by default.
    const glossary = page.locator('#learn details#cc-edu-glossary');
    await expect(glossary).toBeVisible({ timeout: 5000 });
    await expect(glossary).not.toHaveAttribute('open', /.*/);

    // Expand the section.
    await glossary.locator('summary.cc-edu-glossary-summary').click();
    await expect(glossary).toHaveAttribute('open', '');

    // Every glossary term is listed as a collapsed expander.
    const terms = glossary.locator('details.cc-edu-glossary-term');
    await expect(terms.first()).toBeVisible();
    const count = await terms.count();
    expect(count).toBeGreaterThanOrEqual(10);

    // Open the MCP server term — its explanation becomes visible.
    const mcp = glossary.locator('[data-edu-glossary-anchor="glossary.mcp-server"]');
    await expect(mcp).toBeVisible();
    await expect(mcp).not.toHaveAttribute('open', /.*/);
    await mcp.locator('summary').click();
    await expect(mcp).toHaveAttribute('open', '');

    const body = mcp.locator('.cc-edu-glossary-term-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText('helper program');
  });

  test('the FailSafe Glossary section is absent when education is disabled', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(false) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    // In v2 the essay list is also gated by `education.enabled` (single discipline);
    // both primary and secondary content are absent when disabled.
    await expect(page.locator('#cc-learn-essay-list')).toHaveCount(0);
    await expect(page.locator('#learn details#cc-edu-glossary')).toHaveCount(0);
  });
});
