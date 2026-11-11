// #652 — Playwright coverage for the Statewright website handoff card in the
// Integrations Catalog. Drives the REAL ConsoleServer via serveConsoleServerUI.
// The provider origin is fulfilled locally: this is UI wiring evidence only. The
// real destination is checked in the installed-host acceptance run.

import { test, expect, BrowserContext, Locator, Page } from '@playwright/test';
import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

const RUNS = 'https://statewright.ai/runs';
type Seen = Array<{ url: string; referer: string | undefined }>;
let controller: ConsoleServerController;

test.afterEach(async () => {
  if (controller) {
    await controller.close();
    await new Promise((r) => setTimeout(r, 50));
  }
});

// Audit VETO #938 B2 and #939 R1: provider traffic is observed for the whole
// browser context, because a popup's requests never reach page-level listeners,
// and WebSockets bypass route(), so they are refused and recorded separately.
async function watchProvider(context: BrowserContext): Promise<Seen> {
  const seen: Seen = [];
  await context.routeWebSocket(/statewright\.ai/, (ws) => {
    seen.push({ url: ws.url(), referer: 'websocket' });
    return ws.close();
  });
  await context.route(/^https?:\/\/([^/]*\.)?statewright\.ai\//, (route) => {
    seen.push({ url: route.request().url(), referer: route.request().headers().referer });
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Statewright test handoff</body></html>' });
  });
  return seen;
}

/** Open the Integrations tab of a Console whose address carries a workspace value. */
async function openCard(page: Page, context: BrowserContext): Promise<{ provider: Seen; handoff: Locator; link: Locator }> {
  controller = await serveConsoleServerUI();
  const provider = await watchProvider(context);
  await page.goto(`${controller.url}/command-center.html?workspace=secret-workspace`);
  await page.locator('.tab-btn[data-target="integrations"]').click();
  const handoff = page.locator('.cc-intcat-statewright[data-id="statewright"]');
  await expect(handoff).toHaveCount(1);
  await expect(handoff).toBeVisible();
  await expect(page.locator('.cc-intcat-card')).toHaveCount(11);
  return { provider, handoff, link: handoff.locator('a.cc-intcat-web-link') };
}

test('#652 Statewright handoff: rendering, hovering and waiting reach nothing and claim nothing', async ({ page, context }) => {
  const { provider, handoff, link } = await openCard(page, context);
  await expect(link).toHaveAttribute('href', RUNS);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(handoff.locator('.cc-intcat-web-url')).toHaveText(RUNS);
  await expect(page.locator('.cc-intcat-pill-disabled')).toHaveCount(11); // other integrations unchanged

  await handoff.hover(); // pointer movement is not an operator decision
  await link.hover();
  await page.waitForTimeout(4000); // idle: an automatic open or request would have happened by now
  expect(context.pages()).toHaveLength(1);
  expect(provider).toEqual([]);
  await expect(link).toHaveAttribute('href', RUNS);

  await expect(handoff.locator('.cc-intcat-pill')).toHaveText('Website handoff');
  const generated = await handoff.evaluate((el) => [el, ...Array.from(el.querySelectorAll('*'))]
    .flatMap((n) => [getComputedStyle(n, '::before').content, getComputedStyle(n, '::after').content]));
  expect(generated.filter((c) => c !== 'none' && c !== 'normal')).toEqual([]); // no generated status text
  await expect(handoff.locator('p')).toBeVisible(); // the disclaimer is shown
  const mentions = await page.locator('body').evaluate((b) => (b as HTMLElement).innerText.match(/statewright[^\n]*/gi));
  expect(mentions).toHaveLength(4); // heading, disclaimer, link and address: no other line names Statewright
});

test('#652 Statewright handoff: keyboard activation opens the fixed address once, with no page or workspace value', async ({ page, context }) => {
  const { provider, link } = await openCard(page, context);
  await link.focus();
  await expect(link).toBeFocused();
  const [opened] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('Enter')]);
  await opened.waitForURL(RUNS);
  await expect(opened.locator('body')).toContainText('Statewright test handoff');
  expect(await opened.evaluate(() => window.opener)).toBeNull();
  expect(provider).toEqual([{ url: RUNS, referer: undefined }]);
  expect(context.pages()).toHaveLength(2);
  expect(page.url()).toContain('/command-center.html'); // the Console tab stays where it was
});

test('#652 Statewright handoff: a mouse click opens the same fixed address once', async ({ page, context }) => {
  const { provider, link } = await openCard(page, context);
  const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await opened.waitForURL(RUNS);
  expect(await opened.evaluate(() => window.opener)).toBeNull();
  expect(provider).toEqual([{ url: RUNS, referer: undefined }]);
  expect(context.pages()).toHaveLength(2);
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
  await expect(link).toHaveAttribute('href', RUNS);
  await expect(page.locator('.cc-intcat-card')).toHaveCount(0);
  expect(context.pages()).toHaveLength(1);
  expect(provider).toEqual([]);
});
