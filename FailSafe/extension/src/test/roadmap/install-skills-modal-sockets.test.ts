// Socket-lifecycle tests for install-skills-modal (plan-test-harness-truthfulness-240 LD3).
// (a) window-less host: tryNewWebSocket must return null so openSubscription
//     sets no __installSkillsWsHandler — RED before the modal.js guard lands.
// (b) jsdom host with a healthy window.__failsafeWebSocket: openSubscription
//     adopts it with owned:false and constructs no real socket — GREEN
//     characterization pin guarding the branch the fixture fix depends on.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  renderInstallModal,
  showInstallModal,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/install-skills-modal.js';

type WsHandlerHost = Element & { __installSkillsWsHandler?: { ws: unknown; owned: boolean } | null };

function buildContainer(dom: JSDOM): WsHandlerHost {
  const root = dom.window.document.getElementById('root');
  if (!root) throw new Error('root mount missing');
  root.innerHTML = renderInstallModal([], false);
  return root as WsHandlerHost;
}

function stubGlobalWebSocket(): { constructed: () => number; restore: () => void } {
  let count = 0;
  const original = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = class FakeWebSocket {
    constructor() { count += 1; }
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void {}
  };
  return {
    constructed: () => count,
    restore: () => { (globalThis as { WebSocket?: unknown }).WebSocket = original; },
  };
}

suite('install-skills-modal socket lifecycle (plan-240 LD3)', () => {
  test('window-less host: openSubscription constructs no socket and sets no handler', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
    const container = buildContainer(dom);
    const savedWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = undefined;
    const ws = stubGlobalWebSocket();
    try {
      showInstallModal(container);
      assert.equal(ws.constructed(), 0, 'tryNewWebSocket must return null when window is undefined');
      assert.equal(container.__installSkillsWsHandler ?? null, null, 'no handler set on window-less host');
    } finally {
      ws.restore();
      (globalThis as { window?: unknown }).window = savedWindow;
    }
  });

  test('jsdom host with healthy shared fake socket: adopted with owned:false, no real socket', () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
    const savedWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = dom.window as unknown;
    const fake = { readyState: 1, addEventListener() {}, removeEventListener() {} };
    (dom.window as unknown as { __failsafeWebSocket?: unknown }).__failsafeWebSocket = fake;
    const ws = stubGlobalWebSocket();
    try {
      const container = buildContainer(dom);
      showInstallModal(container);
      const sub = container.__installSkillsWsHandler;
      assert.ok(sub, 'subscription handler recorded');
      assert.equal(sub!.ws, fake, 'adopts the shared fake socket');
      assert.equal(sub!.owned, false, 'shared socket is adopted, not owned');
      assert.equal(ws.constructed(), 0, 'no real WebSocket constructed under jsdom');
    } finally {
      ws.restore();
      (globalThis as { window?: unknown }).window = savedWindow;
    }
  });
});
