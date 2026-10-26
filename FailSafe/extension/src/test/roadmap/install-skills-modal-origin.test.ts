// #564 follow-up: the install-skills modal must open its progress socket on the Console's own
// host. The Console WebSocket only accepts an Origin equal to http:// + the Host it was addressed
// to, so a hard-coded ws://localhost:9376 is refused whenever the page was served from
// 127.0.0.1, or from a fallback port when 9376 was taken by another workspace's Console.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  renderInstallModal,
  showInstallModal,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/install-skills-modal.js';

function captureWebSocketUrls(): { urls: string[]; restore: () => void } {
  const urls: string[] = [];
  const original = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = class FakeWebSocket {
    constructor(url: string) { urls.push(url); }
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void {}
  };
  return { urls, restore: () => { (globalThis as { WebSocket?: unknown }).WebSocket = original; } };
}

suite('#564 install-skills modal socket follows the Console origin', () => {
  for (const pageUrl of ['http://127.0.0.1:9376/', 'http://localhost:9377/', 'http://127.0.0.1:9381/']) {
    test(`a Console served from ${pageUrl} opens its socket on that same host`, () => {
      const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>', { url: pageUrl });
      const savedWindow = (globalThis as { window?: unknown }).window;
      (globalThis as { window?: unknown }).window = dom.window as unknown;
      const ws = captureWebSocketUrls();
      try {
        const root = dom.window.document.getElementById('root')!;
        root.innerHTML = renderInstallModal([], false);
        showInstallModal(root);
        assert.deepEqual(ws.urls, [`ws://${new URL(pageUrl).host}`]);
      } finally {
        ws.restore();
        (globalThis as { window?: unknown }).window = savedWindow;
      }
    });
  }
});
