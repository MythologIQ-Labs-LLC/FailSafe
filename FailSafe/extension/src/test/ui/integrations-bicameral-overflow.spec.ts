// FX561 — B-BIC-15: the decision-row binding `<code>` must ellipsize when its
// flex container is narrow so a long file path does not push the Ratify
// control past the card's right edge. jsdom cannot compute layout/overflow,
// so this is a Playwright assertion against the real rendered layout.
//
// DEVIATION NOTE (reported in the implementation summary): the plan's FX561
// asserts truncation "at an <800px viewport". In the live ConsoleServer UI the
// Integrations panel is ~888px wide and does NOT respond to viewport width —
// a pre-existing, out-of-Batch-1-scope layout characteristic. The B-BIC-15 CSS
// (`overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block`
// on the `<code>` + `min-width:0` on the decision row) is correct and clamps
// the binding to its flex container; this spec proves that real layout
// behaviour by constraining the binding's flex container directly (the
// condition the CSS is designed for) rather than relying on the panel
// responding to viewport, which it does not.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import type { BicameralFeatureBrief, BicameralRatifyVerdict } from '../../integrations/bicameral';

function makeStubClient(features: BicameralFeatureBrief[]): { client: any } {
  let connected = false;
  const client = {
    isConnected: () => connected,
    connect: async () => { connected = true; },
    disconnect: async () => { connected = false; },
    history: async () => features,
    drift: async () => [],
    ratify: async (_id: string, _verdict: BicameralRatifyVerdict) => undefined,
    preflight: async () => ({ priorDecisions: [], drifted: [], openQuestions: [] }),
    getCapabilities: () => new Set<string>(['ingest']),
  };
  return { client };
}

// A deliberately long binding path — wide enough to overflow a narrow card.
const LONG_PATH = 'src/integrations/bicameral/very/deeply/nested/module/path/SomeLongFileName.ts';

const FEATURES: BicameralFeatureBrief[] = [
  {
    feature: 'auth-rewrite',
    decisions: [
      {
        id: 'd-long',
        title: 'Decision with a very long binding path',
        source: 'rfc-009',
        status: 'unratified',
        bindings: [{ filePath: LONG_PATH, symbol: 'createSession', startLine: 14, endLine: 47 }],
      },
    ],
  },
];

async function gotoRunningFeed(page: import('@playwright/test').Page, url: string) {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="integrations"]').click();
  await page.locator('[data-action="bicameral-connect"]').click();
  await expect(page.locator('.cc-bicameral-decision[data-decision-id="d-long"]')).toBeVisible({ timeout: 5000 });
}

test.describe('FX561 — Bicameral decision-row binding overflow (B-BIC-15)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('narrow flex container — binding ellipsizes and Ratify stays within the card', async ({ page }) => {
    const { client } = makeStubClient(FEATURES);
    controller = await serveConsoleServerUI({ bicameralClient: client, bicameralConfigured: true });
    await gotoRunningFeed(page, controller.url);
    // Settle: integrations.js re-renders the panel on each _setState (the
    // post-connect history fetch). Wait for the feed to stop re-rendering so a
    // live style mutation below is not wiped by a subsequent re-render.
    await page.waitForLoadState('networkidle');

    const row = page.locator('.cc-bicameral-decision[data-decision-id="d-long"]');
    const binding = row.locator('code').first();
    await expect(binding).toBeVisible();

    // Constrain the binding's flex container (the `flex:1;min-width:0` div) to
    // a width narrower than the path's natural width — the real narrow-card
    // condition the B-BIC-15 CSS targets — then measure synchronously so no
    // re-render intervenes between mutation and assertion.
    const result = await binding.evaluate((el) => {
      const flexParent = el.parentElement as HTMLElement;
      flexParent.style.width = '180px';
      flexParent.style.maxWidth = '180px';
      // Force layout, then read.
      void el.scrollWidth;
      const card = document.getElementById('cc-bicameral') as HTMLElement;
      const ratify = card.querySelector('[data-action="bicameral-ratify"]') as HTMLElement;
      const cardRect = card.getBoundingClientRect();
      const ratifyRect = ratify.getBoundingClientRect();
      return {
        clamped: el.scrollWidth > el.clientWidth,
        ratifyRight: ratifyRect.right,
        cardRight: cardRect.right,
      };
    });

    // The binding `<code>` clamps to its container: scrollWidth (full path)
    // exceeds clientWidth (the clamped box) — text was truncated, not expanded.
    expect(result.clamped).toBe(true);
    // The Ratify control's right edge stays inside the card's right edge — the
    // long binding did not push siblings out.
    expect(result.ratifyRight).toBeLessThanOrEqual(result.cardRight + 1);
  });

  test('roomy flex container — binding renders untruncated', async ({ page }) => {
    const { client } = makeStubClient(FEATURES);
    controller = await serveConsoleServerUI({ bicameralClient: client, bicameralConfigured: true });
    await gotoRunningFeed(page, controller.url);
    await page.waitForLoadState('networkidle');

    const row = page.locator('.cc-bicameral-decision[data-decision-id="d-long"]');
    const binding = row.locator('code').first();
    await expect(binding).toBeVisible();

    // Give the binding's flex container ample room — the whole path fits, so
    // no truncation (scrollWidth equals clientWidth within rounding).
    const untruncated = await binding.evaluate((el) => {
      const flexParent = el.parentElement as HTMLElement;
      flexParent.style.width = '900px';
      void el.scrollWidth;
      return el.scrollWidth <= el.clientWidth + 1;
    });
    expect(untruncated).toBe(true);
  });
});
