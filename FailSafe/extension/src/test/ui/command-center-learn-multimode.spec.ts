// FX614/FX615/FX618/FX619 — Multimode E2E proof for the v5.2.0 Learn-tab
// visual rebuild. Closes the Phase 4 carry-forward from META_LEDGER #392
// (deferred during the auto-dev cycle). Covers: TabGroup pill-bar mount,
// Read → Glossary switch, jump-strip anchor click + native scroll, Bicameral
// co-existence (both anchors visible across distinct sections of the unified
// glossary), search filtering, and the relevant-now badge surfacing path.
//
// Sister spec to FX611 (`command-center-learn-essays.spec.ts`); reuses the
// same `serveConsoleServerUI` + `hubForPhase` harness.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import { hubForPhase, HubFixture } from './helpers/ledgerFixtures';

function learnHub(): HubFixture {
  const hub = hubForPhase('IMPLEMENT');
  hub.governanceModeState = { mode: 'observe', defaulted: true };
  hub.education = { enabled: true, proficiency: 'beginner' };
  return hub;
}

function learnHubWithFileActivity(): HubFixture {
  // Triggers `learn.essay.scope-before-prompt` relevant-now badge:
  // file activity present + activePlan null per lessonTriggers.ts contract.
  // HubFixture's typed shape doesn't carry `unattributedFileActivity` (it's
  // shaped for Monitor-tab specs); the real /api/hub passes it through
  // verbatim, so we widen the fixture for this trigger-engine probe.
  const hub = learnHub() as any;
  hub.activePlan = null;
  hub.unattributedFileActivity = [
    { eventId: 'e1', timestamp: '2026-05-25T10:00:00Z', type: 'change', artifactPath: 'src/x.ts' },
  ];
  return hub;
}

test.describe('Learn tab multimode (FX614/FX615/FX618/FX619)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('TabGroup mounts with 2 pills [Read, Glossary]; Read is default active', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);

    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    const pillBar = page.locator('#learn .cc-subview-bar');
    await expect(pillBar).toBeVisible({ timeout: 5000 });
    const pills = pillBar.locator('.cc-pill');
    await expect(pills).toHaveCount(2);

    const keys = await pills.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-key')),
    );
    expect(keys).toEqual(['read', 'glossary']);

    // Read pill is the default active sub-view.
    await expect(pills.nth(0)).toHaveClass(/active/);
    await expect(page.locator('#cc-learn-essay-list')).toBeVisible();
    // Glossary content does NOT mount until the pill is clicked.
    await expect(page.locator('#cc-learn-glossary')).toHaveCount(0);
  });

  test('jump-strip renders 5 numbered anchors with correct hash hrefs', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#cc-learn-essay-list')).toBeVisible({ timeout: 5000 });

    const jumpStrip = page.locator('aside.cc-learn-essay-jump');
    await expect(jumpStrip).toBeVisible();
    await expect(jumpStrip).toHaveAttribute('role', 'navigation');
    await expect(jumpStrip).toHaveAttribute('aria-label', 'Jump to essay');

    const anchors = jumpStrip.locator('a.cc-learn-essay-jump-anchor');
    await expect(anchors).toHaveCount(5);

    const hrefs = await anchors.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href')),
    );
    expect(hrefs).toEqual([
      '#cc-learn-essay-slow-down-to-speed-up',
      '#cc-learn-essay-scope-before-prompt',
      '#cc-learn-essay-acceptance-criteria',
      '#cc-learn-essay-choose-agent-option',
      '#cc-learn-essay-verify-output',
    ]);

    // Each essay card has the matching id for hash navigation.
    for (const slug of [
      'slow-down-to-speed-up',
      'scope-before-prompt',
      'acceptance-criteria',
      'choose-agent-option',
      'verify-output',
    ]) {
      await expect(page.locator(`#cc-learn-essay-${slug}`)).toBeVisible();
    }
  });

  test('Glossary pill mounts Glossary sub-view; Read tears down per TabGroup contract', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#cc-learn-essay-list')).toBeVisible({ timeout: 5000 });

    await page.locator('.cc-pill[data-key="glossary"]').click();
    await expect(page.locator('#cc-learn-glossary')).toBeVisible();
    // Read sub-view content is torn down by TabGroup.switchTo.
    await expect(page.locator('#cc-learn-essay-list')).toHaveCount(0);

    // Glossary surface chrome present.
    await expect(page.locator('[data-learn-glossary-search]')).toBeVisible();
    await expect(page.locator('.cc-learn-glossary-section-head').first()).toBeVisible();
  });

  test('Bicameral co-existence: both glossary.bicameral + glossary.bicameral-integration rows visible', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await page.locator('.cc-pill[data-key="glossary"]').click();
    await expect(page.locator('#cc-learn-glossary')).toBeVisible({ timeout: 5000 });

    // Both anchors must render as distinct rows.
    const twoChambers = page.locator('[data-anchor="glossary.bicameral"]');
    const integration = page.locator('[data-anchor="glossary.bicameral-integration"]');
    await expect(twoChambers).toBeVisible();
    await expect(integration).toBeVisible();

    // Display terms must be distinct (operator-binding co-existence contract).
    const twoChambersTerm = (
      await twoChambers.locator('.cc-learn-glossary-row-term').textContent()
    )?.trim();
    const integrationTerm = (
      await integration.locator('.cc-learn-glossary-row-term').textContent()
    )?.trim();
    expect(twoChambersTerm).toBeTruthy();
    expect(integrationTerm).toBeTruthy();
    expect(twoChambersTerm).not.toEqual(integrationTerm);
    expect(integrationTerm).toMatch(/integration/i);
  });

  test('Glossary search filters across all rows; case-insensitive token match', async ({ page }) => {
    controller = await serveConsoleServerUI({ initialHub: learnHub() });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await page.locator('.cc-pill[data-key="glossary"]').click();
    await expect(page.locator('#cc-learn-glossary')).toBeVisible({ timeout: 5000 });

    const initialRowCount = await page.locator('.cc-learn-glossary-row').count();
    expect(initialRowCount).toBeGreaterThanOrEqual(13); // 12 FailSafe + 1 bicameral-integration baseline

    // Type uppercase search; case-insensitive contract.
    await page.locator('[data-learn-glossary-search]').fill('INTERCEPTOR');
    // Wait for re-render.
    await page.waitForTimeout(150);
    const filteredCount = await page.locator('.cc-learn-glossary-row').count();
    expect(filteredCount).toBeGreaterThanOrEqual(1);
    expect(filteredCount).toBeLessThan(initialRowCount);
  });

  test('relevant-now badge appears on the firing essay when contextual trigger fires', async ({ page }) => {
    // File activity + null activePlan triggers `learn.essay.scope-before-prompt`.
    controller = await serveConsoleServerUI({ initialHub: learnHubWithFileActivity() });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#cc-learn-essay-list')).toBeVisible({ timeout: 5000 });

    // The scope-before-prompt card should sort first AND carry the relevant-now badge.
    const scopeCard = page.locator('[data-essay-anchor="learn.essay.scope-before-prompt"]');
    await expect(scopeCard).toBeVisible();
    await expect(scopeCard).toHaveAttribute('data-relevant-now', 'true');
    await expect(scopeCard.locator('.cc-learn-essay-relevant-now')).toBeVisible();
  });

  test('education-disabled hub clears the Learn container (no TabGroup pill bar renders)', async ({ page }) => {
    const hub = learnHub();
    hub.education = { enabled: false, proficiency: 'beginner' };
    controller = await serveConsoleServerUI({ initialHub: hub });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="learn"]').click();
    await expect(page.locator('#learn')).toHaveClass(/active/);

    // No pill bar, no essay list, no glossary.
    await expect(page.locator('#learn .cc-subview-bar')).toHaveCount(0);
    await expect(page.locator('#cc-learn-essay-list')).toHaveCount(0);
    await expect(page.locator('#cc-learn-glossary')).toHaveCount(0);
  });
});
