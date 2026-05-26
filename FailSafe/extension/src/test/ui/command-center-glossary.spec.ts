import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';

function hubWithEducation(enabled: boolean): HubFixture {
  const hub = hubForPhase('PLAN');
  hub.governanceModeState = { mode: 'observe', defaulted: true };
  hub.education = { enabled, proficiency: 'beginner' };
  return hub;
}

test.describe('FX601 - Console Glossary sub-view (Learn tab)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('the Glossary sub-view is alphabetized and filterable by tag', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(true) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    await page.locator('.cc-pill[data-key="glossary"]').click();
    const glossary = page.locator('#cc-learn-glossary');
    await expect(glossary).toBeVisible({ timeout: 5000 });

    const terms = await glossary.locator('.cc-learn-glossary-row-term').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
    const sorted = [...terms].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(terms.length).toBeGreaterThan(10);
    expect(terms).toEqual(sorted);

    await glossary.locator('[data-learn-glossary-filter="fs"]').click();
    const tags = await glossary.locator('.cc-learn-glossary-tag').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((tag) => tag === 'FailSafe')).toBe(true);
  });

  test('the Glossary sub-view is absent when education is disabled', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: hubWithEducation(false) });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    await expect(page.locator('#cc-learn-essay-list')).toHaveCount(0);
    await expect(page.locator('#cc-learn-glossary')).toHaveCount(0);
  });
});
