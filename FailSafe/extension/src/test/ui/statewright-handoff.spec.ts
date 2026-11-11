// #652 — Playwright coverage for the Statewright website handoff card in the
// Integrations Catalog. Drives the REAL ConsoleServer via serveConsoleServerUI.
// The provider origin is fulfilled locally: this is UI wiring evidence only. The
// real destination is checked in the installed-host acceptance run.

import { test, expect, BrowserContext } from '@playwright/test';
import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

let controller: ConsoleServerController;

test.afterEach(async () => {
  if (controller) {
    await controller.close();
    await new Promise((r) => setTimeout(r, 50));
  }
});

// #652 (audit VETO #938 B2): provider traffic is observed for the whole browser
// context, because a popup's requests never reach page-level listeners.
async function watchProvider(context: BrowserContext): Promise<Array<{ url: string; referer: string | undefined }>> {
  const seen: Array<{ url: string; referer: string | undefined }> = [];
  await context.route(/^https?:\/\/([^/]*\.)?statewright\.ai\//, (route) => {
    seen.push({ url: route.request().url(), referer: route.request().headers().referer });
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Statewright test handoff</body></html>' });
  });
  return seen;
}

test('#652 Statewright handoff: nothing reaches the provider until the operator activates the link', async ({ page, context }) => {
  controller = await serveConsoleServerUI();
  const provider = await watchProvider(context);
  await page.goto(`${controller.url}/command-center.html?workspace=secret-workspace`);
  await page.locator('.tab-btn[data-target="integrations"]').click();

  const handoff = page.locator('.cc-intcat-statewright[data-id="statewright"]');
  const link = handoff.locator('a.cc-intcat-web-link');
  await expect(handoff).toHaveCount(1);
  await expect(handoff).toBeVisible();
  await expect(handoff.locator('.cc-intcat-pill')).toHaveText('Website handoff');
  await expect(handoff.locator('.cc-intcat-web-url')).toHaveText('https://statewright.ai/runs');
  await expect(link).toHaveAttribute('href', 'https://statewright.ai/runs');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.cc-intcat-card')).toHaveCount(11);
  await expect(page.locator('.cc-intcat-pill-disabled')).toHaveCount(11); // other integrations unchanged

  await page.waitForTimeout(4000); // idle: an automatic open or request would have happened by now
  expect(context.pages()).toHaveLength(1);
  expect(provider).toEqual([]);

  // Keyboard activation is the deliberate operator action.
  await link.focus();
  await expect(link).toBeFocused();
  const [opened] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('Enter')]);
  await opened.waitForURL('https://statewright.ai/runs');
  await expect(opened.locator('body')).toContainText('Statewright test handoff');
  expect(await opened.evaluate(() => window.opener)).toBeNull();
  expect(provider).toEqual([{ url: 'https://statewright.ai/runs', referer: undefined }]); // one request, no page or workspace value
  expect(context.pages()).toHaveLength(2);
  expect(page.url()).toContain('/command-center.html'); // the Console tab stays where it was
  await opened.close();
});

test('#652 Statewright handoff stays available, and silent, when the local catalog cannot be loaded', async ({ page, context }) => {
  controller = await serveConsoleServerUI();
  const provider = await watchProvider(context);
  await page.route('**/api/v1/integrations/catalog', (route) => route.abort());
  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="integrations"]').click();

  await expect(page.locator('#integrations')).toContainText('Could not load integrations');
  const link = page.locator('.cc-intcat-statewright[data-id="statewright"] a.cc-intcat-web-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://statewright.ai/runs');
  await expect(page.locator('.cc-intcat-card')).toHaveCount(0);
  expect(context.pages()).toHaveLength(1);
  expect(provider).toEqual([]);
});
