// #564 (plan-564-websocket-origin LD3, LD4): what a real browser (headless Chromium) can do with the
// Console's live-update socket and its HTTP routes.
//
//   - a page at the Console origin opens ws://<its host> and receives a message;
//   - a page from another local origin (a second HTTP server on another port) cannot open it;
//   - a DNS-rebinding origin (rebind.test mapped to 127.0.0.1 by --host-resolver-rules) gets 403
//     on /api/hub and on a late-registered route, and cannot open the socket.
//
// The harness boots WITHOUT the /api/hub fixture: it moves that fixture layer ahead of every
// middleware (serveConsoleServerUI.ts), which would answer the rebinding /api/hub itself. This
// spec demonstrates the refusals against the test harness; it is not a receipt for the installed
// extension and not a demonstration of exploitation.

import { test, expect, type Page } from '@playwright/test';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

interface SocketResult { opened: boolean; messages: number; closed: boolean }

/** Open a WebSocket from the page; settle on the first message, a close, or 3 s. */
function trySocket(page: Page, url: string): Promise<SocketResult> {
  return page.evaluate((u) => new Promise<SocketResult>((resolve) => {
    const r = { opened: false, messages: 0, closed: false };
    let ws: WebSocket;
    try { ws = new WebSocket(u); } catch { resolve({ ...r, closed: true }); return; }
    ws.onopen = () => { r.opened = true; };
    ws.onmessage = () => { r.messages += 1; ws.close(); resolve({ ...r }); };
    ws.onclose = () => { r.closed = true; resolve({ ...r }); };
    setTimeout(() => resolve({ ...r }), 3000);
  }), url);
}

// rebind.test resolves to 127.0.0.1 in this browser only (a DNS-rebinding stand-in).
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP rebind.test 127.0.0.1'] } });

test.describe('#564 Console origin policy in a real browser', () => {

  let controller: ConsoleServerController | undefined;
  let attacker: http.Server | undefined;

  test.afterEach(async () => {
    await controller?.close();
    controller = undefined;
    if (attacker) await new Promise<void>((r) => attacker!.close(() => r()));
    attacker = undefined;
  });

  test('a page at the Console origin opens the socket and receives a message', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    await page.goto(`${controller.url}/health`);
    const port = new URL(controller.url).port;
    const r = await trySocket(page, `ws://127.0.0.1:${port}`);
    expect(r.opened).toBe(true);
    expect(r.messages).toBeGreaterThanOrEqual(1);
  });

  test('a page from another local origin cannot open the Console socket', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    const port = new URL(controller.url).port;
    attacker = http.createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html><body>other origin</body></html>'); });
    await new Promise<void>((r) => attacker!.listen(0, '127.0.0.1', () => r()));
    const attackerPort = (attacker.address() as AddressInfo).port;
    await page.goto(`http://127.0.0.1:${attackerPort}/`);
    const r = await trySocket(page, `ws://127.0.0.1:${port}`);
    expect(r.opened).toBe(false);
    expect(r.messages).toBe(0);
    expect(r.closed).toBe(true);
  });

  test('a DNS-rebinding origin gets 403 on /api/hub and a late route, and cannot open the socket', async ({ page }) => {
    controller = await serveConsoleServerUI({});
    const port = new URL(controller.url).port;
    for (const p of ['/api/hub', '/api/integrations/voice-pack/status']) {
      const response = await page.goto(`http://rebind.test:${port}${p}`);
      expect(response?.status(), p).toBe(403);
      expect(JSON.parse(await response!.text()).guard, p).toBe('host');
    }
    const r = await trySocket(page, `ws://rebind.test:${port}`);
    expect(r.opened).toBe(false);
    expect(r.messages).toBe(0);
  });
});
