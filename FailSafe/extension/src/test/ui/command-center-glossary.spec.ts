// FX601 — Educational Component Phase 6c e2e proof.
// Command Center → Settings → the "FailSafe Glossary" section. This spec
// drives the real Command Center UI, expands the glossary section, opens a
// term, and asserts its explanation is shown. Sink: real page.locator() reads
// against rendered DOM.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';

function hubWithEducation(enabled: boolean): HubFixture {
  const hub = hubForPhase('PLAN');
  hub.governanceModeState = { mode: 'observe', defaulted: true };
  hub.education = { enabled, proficiency: 'beginner' };
  return hub;
}

test.describe('FX601 — Command Center FailSafe Glossary section', () => {
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
    await page.locator('.tab-btn[data-target="settings"]').click();
    await expect(page.locator('#settings')).toHaveClass(/active/);

    // The glossary section renders, collapsed by default.
    const glossary = page.locator('details#cc-edu-glossary');
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
    await page.locator('.tab-btn[data-target="settings"]').click();
    await expect(page.locator('#settings')).toHaveClass(/active/);

    // Settings still renders; only the glossary is gated.
    await expect(page.locator('#cc-governance-mode')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('details#cc-edu-glossary')).toHaveCount(0);
  });
});
