// FX-monitor-theme-inheritance — the Monitor sidebar chrome inherits the
// Console theme. Proves the full loop in real Chromium: a host page that
// faithfully mirrors FailSafeSidebarProvider.getHtml() (the shared design
// tokens inlined in <head>, a default data-theme, a chrome element bound to a
// token, the embedded compact Console, and the failsafe.theme postMessage
// handler) embeds the LIVE Console; changing the Console theme must re-theme
// the host chrome via the postMessage emit (state.js emitTheme).

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

test.describe('FX-monitor-theme-inheritance — sidebar chrome follows the Console theme', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('changing the Console theme re-themes the embedding sidebar chrome via postMessage', async ({ page }) => {
    controller = await serveConsoleServerUI({});

    // Mirror the provider: inline the same shared tokens the real sidebar reads
    // from disk, default data-theme=mythiq, a chrome bound to --bg-panel, the
    // live Console in an iframe, and the failsafe.theme handler.
    const tokens = fs.readFileSync(
      path.resolve(__dirname, '../../../src/roadmap/ui/theme-tokens.css'),
      'utf8',
    );
    const host = `<!DOCTYPE html><html lang="en" data-theme="mythiq"><head>
      <style>${tokens}</style>
      <style>#chrome { background: var(--bg-panel, #0a1f4a); height: 40px; }</style>
    </head><body>
      <div id="chrome">toolbar</div>
      <iframe id="frame" src="${controller.url}/command-center.html" style="width:520px;height:640px;border:0"></iframe>
      <script>
        window.addEventListener('message', (e) => {
          const d = e && e.data; if (!d || typeof d !== 'object') return;
          if (d.type === 'failsafe.theme' && typeof d.theme === 'string') {
            document.documentElement.setAttribute('data-theme', d.theme);
          }
        });
      </script>
    </body></html>`;
    await page.setContent(host, { waitUntil: 'load' });

    const chromeBg = () =>
      page.evaluate(() => getComputedStyle(document.getElementById('chrome')!).backgroundColor);

    // Drive the real Console inside the iframe: open Config, pick Crimson.
    const frame = page.frameLocator('#frame');
    await frame.locator('.tab-btn[data-target="settings"]').click();
    await frame.locator('[data-theme="crimson"]').first().click();

    // Crimson --bg-panel is #1a0505 = rgb(26, 5, 5). The host chrome must follow
    // the Console selection through the failsafe.theme emit.
    await expect.poll(chromeBg, { timeout: 6000 }).toBe('rgb(26, 5, 5)');

    // And the host's data-theme mirrors the Console's selection.
    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(themeAttr).toBe('crimson');

    await page.screenshot({ path: 'test-results/monitor-theme-inheritance-crimson.png' });
  });
});
