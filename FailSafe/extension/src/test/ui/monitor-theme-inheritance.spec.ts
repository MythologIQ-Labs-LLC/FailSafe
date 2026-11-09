// #601 (v6.0.12 P0) — one app theme for the Console, the Monitor and the SRE view.
//
// Real Chromium against a REAL ConsoleServer. The Console, the Monitor and the SRE view each run
// in their own browser context, so they share no storage at all: this is what the external
// browser and VS Code's Electron webview look like to each other. The theme must still match,
// because it lives in the extension host (here: the ConsoleServer's authority) and reaches every
// page through the Console server, never through browser storage.

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

const THEMES = ['pegasus', 'mythiq', 'midnight', 'aurora', 'crimson', 'atmosphere'] as const;

// Every context a test opens is closed after it. A context left open keeps its pages and their
// Console reconnect loops alive in the worker's shared browser for the rest of the run.
const openContexts: BrowserContext[] = [];
async function isolatedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  openContexts.push(context);
  return context;
}

async function openIsolated(browser: Browser, url: string): Promise<Page> {
  const context = await isolatedContext(browser);
  const page = await context.newPage();
  // Record the theme the document had when its DOM was ready (before any module ran).
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl = document.documentElement.getAttribute('data-theme');
    }, { once: true });
  });
  await page.goto(url);
  return page;
}

const themeOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const themeAtDcl = (page: Page) => page.evaluate(() => (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl);
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const colorOf = (page: Page, selector: string, prop: 'color' | 'backgroundColor') =>
  page.evaluate(([sel, p]) => {
    const el = document.querySelector(sel as string);
    return el ? getComputedStyle(el)[p as 'color'] : null;
  }, [selector, prop]);
/** Resolve any CSS color to the computed rgb() string in the given page. */
const rgb = (page: Page, color: string) => page.evaluate((c) => {
  const probe = document.createElement('span');
  probe.style.color = c;
  document.body.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}, color);

test.describe('#601 shared app theme — Console, Monitor and SRE view', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    // Close the pages before their server, so no page is left reconnecting to a closed port.
    await Promise.all(openContexts.splice(0).map((c) => c.close().catch(() => undefined)));
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('every theme chosen in the Console reaches the Monitor and SRE view live, with matching colors', async ({ browser }) => {
    test.setTimeout(90_000);
    controller = await serveConsoleServerUI({});
    const consolePage = await openIsolated(browser, `${controller.url}/?ui=console&fsThemeKey=${encodeURIComponent(controller.themeKey)}`);
    const monitor = await openIsolated(browser, `${controller.url}/?ui=compact`);
    const sre = await openIsolated(browser, `${controller.url}/console/sre`);

    // The key left the address bar as soon as the Console loaded.
    expect(consolePage.url()).not.toContain('fsThemeKey');
    await consolePage.locator('.tab-btn[data-target="settings"]').click();
    await expect(consolePage.locator('.cc-theme-select').first()).toBeEnabled();

    for (const theme of [...THEMES.filter((t) => t !== 'mythiq'), 'mythiq']) {
      await consolePage.locator(`.cc-theme-select[data-theme="${theme}"]`).click();
      await expect.poll(() => themeOf(consolePage)).toBe(theme);
      await expect.poll(() => themeOf(monitor)).toBe(theme);
      await expect.poll(() => themeOf(sre)).toBe(theme);
      await expect(consolePage.locator(`.cc-theme-select[data-theme="${theme}"]`)).toHaveClass(/active/);

      // Same tokens on every surface, and the Monitor and SRE view actually use them.
      const textMain = await token(consolePage, '--text-main');
      const bgDark = await token(consolePage, '--bg-dark');
      expect(await token(monitor, '--text-main')).toBe(textMain);
      expect(await token(sre, '--bg-dark')).toBe(bgDark);
      expect(await colorOf(monitor, 'body', 'color')).toBe(await rgb(monitor, textMain));
      expect(await colorOf(monitor, '.brand-title', 'color')).toBe(await rgb(monitor, textMain));
      expect(await colorOf(sre, 'body', 'backgroundColor')).toBe(await rgb(sre, bgDark));
      expect(await colorOf(sre, 'body', 'color')).toBe(await rgb(sre, textMain));
    }
  });

  test('the theme persists across reloads and is in place before any module runs', async ({ browser }) => {
    controller = await serveConsoleServerUI({});
    await controller.setTheme('pegasus');
    for (const path of ['/?ui=compact', '/?ui=console', '/console/sre']) {
      const page = await openIsolated(browser, `${controller.url}${path}`);
      expect(await themeAtDcl(page), `${path} at DOMContentLoaded`).toBe('pegasus');
      await page.reload();
      expect(await themeAtDcl(page), `${path} after reload`).toBe('pegasus');
    }
  });

  test('a change made by the extension host (sidebar, Settings UI) reaches open pages', async ({ browser }) => {
    controller = await serveConsoleServerUI({});
    const monitor = await openIsolated(browser, `${controller.url}/?ui=compact`);
    const consolePage = await openIsolated(browser, `${controller.url}/?ui=console`);
    await expect.poll(() => themeOf(monitor)).toBe('mythiq');
    await controller.setTheme('crimson');
    await expect.poll(() => themeOf(monitor)).toBe('crimson');
    await expect.poll(() => themeOf(consolePage)).toBe('crimson');
  });

  test('a page that reconnects picks up a change it missed while disconnected', async ({ browser }) => {
    test.setTimeout(60_000);
    controller = await serveConsoleServerUI({});
    const monitor = await openIsolated(browser, `${controller.url}/?ui=compact`);
    await expect.poll(() => themeOf(monitor)).toBe('mythiq');
    // Drop every socket, then change the theme before the Monitor is back.
    controller.closeAllSockets();
    await controller.setTheme('aurora');
    await expect.poll(() => themeOf(monitor), { timeout: 30_000 }).toBe('aurora');
  });

  test('a Console that VS Code did not open shows the theme read-only and cannot change it', async ({ browser }) => {
    controller = await serveConsoleServerUI({});
    const page = await openIsolated(browser, `${controller.url}/?ui=console`);
    await page.locator('.tab-btn[data-target="settings"]').click();
    const chips = page.locator('.cc-theme-select');
    await expect(chips).toHaveCount(6);
    for (let i = 0; i < 6; i += 1) await expect(chips.nth(i)).toBeDisabled();
    await expect(page.locator('.cc-theme-note')).toContainText('Open the Console from VS Code');

    // Straight at the API from the page's own origin, without the key: refused, nothing changes.
    const status = await page.evaluate(async () => (await fetch('/api/v1/ui/theme', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'crimson' }),
    })).status);
    expect(status).toBe(401);
    const wrongKey = await page.evaluate(async () => (await fetch('/api/v1/ui/theme', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': 'guess' }, body: JSON.stringify({ theme: 'crimson' }),
    })).status);
    expect(wrongKey).toBe(401);
    expect(await themeOf(page)).toBe('mythiq');
  });

  test('forged and unsupported theme messages change nothing', async ({ browser }) => {
    controller = await serveConsoleServerUI({});
    const monitor = await openIsolated(browser, `${controller.url}/?ui=compact`);
    const consolePage = await openIsolated(browser, `${controller.url}/?ui=console`);
    await expect.poll(() => themeOf(monitor)).toBe('mythiq');

    // postMessage from any window, old message shape or new: pages do not take themes from postMessage.
    for (const page of [monitor, consolePage]) {
      await page.evaluate(() => {
        window.postMessage({ type: 'ui.theme', theme: 'crimson' }, '*');
        window.postMessage({ type: 'failsafe.theme', theme: 'crimson' }, '*');
      });
    }
    // Server-sent values outside the six themes, including a selector-breaking string.
    controller.broadcast({ type: 'ui.theme', payload: 'crimson' });
    for (const theme of ['neon', 'Crimson', 'crimson"] body{display:none} [x="', '']) {
      controller.broadcast({ type: 'ui.theme', theme } as unknown as { type: string });
    }
    await monitor.waitForTimeout(500);
    expect(await themeOf(monitor)).toBe('mythiq');
    expect(await themeOf(consolePage)).toBe('mythiq');
  });

  test('a theme an older version kept in this browser is moved to the shared theme once', async ({ browser }) => {
    controller = await serveConsoleServerUI({});
    const monitor = await openIsolated(browser, `${controller.url}/?ui=compact`);
    const context = await isolatedContext(browser);
    const origin = new URL(controller.url).origin;
    await context.addInitScript((o) => {
      if (location.origin === o && !sessionStorage.getItem('seeded')) {
        localStorage.setItem('fs-theme', 'aurora');
        sessionStorage.setItem('seeded', '1');
      }
    }, origin);
    const page = await context.newPage();
    await page.goto(`${controller.url}/?ui=console&fsThemeKey=${encodeURIComponent(controller.themeKey)}`);
    await expect.poll(() => themeOf(page)).toBe('aurora');
    await expect.poll(() => themeOf(monitor)).toBe('aurora');
    expect(await page.evaluate(() => localStorage.getItem('fs-theme'))).toBeNull();
  });
});
