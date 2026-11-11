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
  const generated = await page.locator('#integrations').evaluate((el) => [el, ...Array.from(el.querySelectorAll('*'))]
    .flatMap((n) => [getComputedStyle(n, '::before').content, getComputedStyle(n, '::after').content]));
  expect(generated.filter((c) => c !== 'none' && c !== 'normal')).toEqual([]); // no generated text anywhere in the tab
  expect(await page.title()).not.toMatch(/statewright|connected/i);
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

/** What a reader can actually see: size, opacity through every ancestor, contrast with the backdrop, and position. */
async function readability(target: Locator, backdrops: string[]): Promise<{ fontPx: number; opacity: number; contrast: number; onScreen: boolean; height: number }> {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((el, colours) => {
    const lum = (rgb: number[]) => rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const parse = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const style = getComputedStyle(el);
    const text = lum(parse(style.color));
    const ratio = (bg: number) => (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05);
    let opacity = 1;
    for (let n: Element | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const box = el.getBoundingClientRect();
    const onScreen = box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight && style.visibility === 'visible';
    return { fontPx: parseFloat(style.fontSize), opacity, contrast: Math.min(...colours.map((c) => ratio(lum(hex(c))))), onScreen, height: box.height };
  }, backdrops);
}

test('#652 Statewright handoff: the disclaimer, the link and the address are readable as rendered', async ({ page, context }) => {
  const { handoff, link } = await openCard(page, context);
  const card = ['#182332', '#111a25']; // the two stops of the card background
  for (const [target, backdrops] of [[handoff.locator('p'), card], [link, ['#141a22']], [handoff.locator('.cc-intcat-web-url'), card]] as Array<[Locator, string[]]>) {
    await expect.poll(async () => (await readability(target, backdrops)).opacity).toBe(1); // after the tab's fade-in
    const seen = await readability(target, backdrops);
    expect(seen.fontPx).toBeGreaterThanOrEqual(12);
    expect(seen.height).toBeGreaterThanOrEqual(12);
    expect(seen.contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA for body text
    expect(seen.onScreen).toBe(true);
  }
  await expect(handoff.locator('p')).toHaveText(/FailSafe does not read Statewright history or enforce Statewright workflows\.$/);
});

test('#652 Statewright handoff: other controls, hub events and repeated renders never reach the provider', async ({ page, context }) => {
  const { provider, handoff, link } = await openCard(page, context);
  const title = await page.title();
  await page.locator('.cc-intcat-configure').first().click(); // another integration's Configure
  await page.locator('.tab-btn[data-target="integrations"]').click();
  for (const type of ['init', 'hub.refresh', 'verdict', 'integration.health']) controller.broadcast({ type, payload: {} });
  const pills = page.locator('#integrations .cc-subview-bar .cc-pill');
  for (let i = 0; i < 6; i += 1) { // each return to the Catalog renders it again
    await pills.nth(1).click();
    await pills.nth(0).click();
    await expect(handoff).toHaveCount(1);
  }
  await handoff.hover();
  await page.mouse.wheel(0, 400);
  await link.click({ button: 'right' }); // a context menu is not an activation
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  expect(provider).toEqual([]);
  expect(context.pages()).toHaveLength(1);
  await expect(link).toHaveAttribute('href', RUNS);
  await expect(handoff.locator('.cc-intcat-pill')).toHaveText('Website handoff');
  await expect(page.locator('#integrations h3').first()).toHaveText('Integration Catalog');
  expect(await page.title()).toBe(title);
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
