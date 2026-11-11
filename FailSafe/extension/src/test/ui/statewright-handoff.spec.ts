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

interface Legible { fontPx: number; opacity: number; textAlpha: number; contrast: number; clipped: number; lines: number; scrolled: number }

/**
 * What a reader can actually see (audit VETO #941 B1, #942 B1): every line of
 * text must be painted inside its element, every box that clips it and the
 * viewport, and the contrast is measured against the background rendered behind
 * it. Nothing is scrolled first: scrolling would bring cut-off text into view.
 */
async function readability(target: Locator): Promise<Legible> {
  return target.evaluate((el) => {
    const nums = (c: string) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = (c: string) => nums(c).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const alpha = (c: string) => (nums(c).length > 3 ? nums(c)[3] : 1);
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.push(n);
    // The backdrop is the nearest painted background: a gradient's colour stops, or a colour that is not transparent.
    const painted = chain.map((n) => getComputedStyle(n)).map((st) => st.backgroundImage.match(/rgba?\([^)]+\)/g) || (alpha(st.backgroundColor) > 0 ? [st.backgroundColor] : []));
    const backdrop = painted.find((stops) => stops.length) || ['rgb(255, 255, 255)'];
    const style = getComputedStyle(el);
    const ratio = (bg: string) => (Math.max(lum(style.color), lum(bg)) + 0.05) / (Math.min(lum(style.color), lum(bg)) + 0.05);
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    const clips = chain.filter((n) => n === el || !/^visible( visible)?$/.test(getComputedStyle(n).overflow));
    const frames = [...clips.map((n) => n.getBoundingClientRect()), new DOMRect(0, 0, window.innerWidth, window.innerHeight)];
    const inside = (r: DOMRect, f: DOMRect) => r.left >= f.left - 1 && r.top >= f.top - 1 && r.right <= f.right + 1 && r.bottom <= f.bottom + 1;
    return {
      fontPx: parseFloat(style.fontSize), textAlpha: alpha(style.color), contrast: Math.min(...backdrop.map(ratio)),
      opacity: chain.reduce((o, n) => o * Number(getComputedStyle(n).opacity), style.visibility === 'visible' ? 1 : 0),
      clipped: lines.filter((r) => !frames.every((f) => inside(r, f))).length, lines: lines.length,
      scrolled: clips.filter((n) => n.scrollTop !== 0 || n.scrollLeft !== 0).length,
    };
  });
}

/** The disclaimer, the link and the address can each be read in full. */
async function expectReadable(handoff: Locator): Promise<void> {
  for (const target of [handoff.locator('p'), handoff.locator('a.cc-intcat-web-link'), handoff.locator('.cc-intcat-web-url')]) {
    await expect.poll(async () => (await readability(target)).opacity).toBe(1); // after the tab's fade-in
    const seen = await readability(target);
    expect(seen.lines).toBeGreaterThanOrEqual(1);
    expect(seen.scrolled).toBe(0); // measured as first shown, with no clipping box scrolled
    expect(seen.clipped).toBe(0); // no line is cut off, clamped or pushed outside a clipping box or the screen
    expect(seen.fontPx).toBeGreaterThanOrEqual(12);
    expect(seen.textAlpha).toBe(1);
    expect(seen.contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA for body text, against the rendered backdrop
  }
  await expect(handoff.locator('p')).toHaveText(/FailSafe does not read Statewright history or enforce Statewright workflows\.$/);
}

const VIEWS: Array<{ name: string; width: number; theme: string | null; scheme: 'dark' | 'light' }> = [
  { name: 'default theme, wide', width: 1280, theme: null, scheme: 'dark' },
  { name: 'default theme, narrow', width: 600, theme: null, scheme: 'dark' },
  { name: 'default theme, light colour scheme', width: 1280, theme: null, scheme: 'light' },
  { name: 'light theme (Pegasus)', width: 1280, theme: 'pegasus', scheme: 'light' },
  { name: 'light theme (Pegasus), narrow', width: 600, theme: 'pegasus', scheme: 'light' },
];
for (const view of VIEWS) {
  test(`#652 Statewright handoff: the disclaimer, the link and the address are readable as rendered (${view.name})`, async ({ page, context }) => {
    await page.setViewportSize({ width: view.width, height: 900 });
    await page.emulateMedia({ colorScheme: view.scheme });
    const { handoff } = await openCard(page, context);
    if (view.theme) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), view.theme);
    await expectReadable(handoff);
  });
}

test('#652 Statewright handoff: other controls, hub events and repeated renders never reach the provider', async ({ page, context }) => {
  const { provider, handoff, link } = await openCard(page, context);
  const title = await page.title();
  await page.locator('.cc-intcat-configure').first().click(); // another integration's Configure
  await page.locator('.tab-btn[data-target="integrations"]').click();
  for (const type of ['init', 'hub.refresh', 'verdict']) controller.broadcast({ type, payload: {} });
  await page.waitForTimeout(500);
  controller.broadcast({ type: 'integration.health', payload: {} }); // reaches the catalog's onEvent without a render
  await page.waitForTimeout(500);
  await expect(handoff.locator('.cc-intcat-pill')).toHaveText('Website handoff'); // read before any re-render can repair it
  await expect(link).toHaveAttribute('href', RUNS);
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
