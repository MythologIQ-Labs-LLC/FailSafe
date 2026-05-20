// Settings card — Bicameral MCP section.
// Plan docs/plan-qor-bicameral-mcp-integration.md Phase 3 Unit Tests called
// out two JSDOM cases for this surface. Phase 3 polish moved the card render
// into a dedicated module (`bicameral-settings-card.js`); these tests
// exercise that module directly with a stubbed status endpoint.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';

// @ts-expect-error JS module import in TS test context
import { renderBicameralSettingsCard } from '../../../src/roadmap/ui/modules/bicameral-settings-card.js';

interface BindOnceFn {
  (node: Element | null, evt: string, handler: (e: Event) => void): void;
}

function mount(): { dom: JSDOM; slot: Element; bindOnce: BindOnceFn; bindings: Array<{ evt: string; node: Element | null }> } {
  const dom = new JSDOM('<!DOCTYPE html><div id="slot"></div>');
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  const slot = dom.window.document.getElementById('slot')!;
  const bindings: Array<{ evt: string; node: Element | null }> = [];
  const bindOnce: BindOnceFn = (node, evt, handler) => {
    bindings.push({ evt, node });
    if (node) (node as HTMLElement).addEventListener(evt, handler);
  };
  return { dom, slot, bindOnce, bindings };
}

function clearDom() {
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { window?: unknown }).window = undefined;
}

interface FetchCall { url: string; init?: RequestInit }

function stubFetch(handlers: Record<string, () => unknown>): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const handler = handlers[url];
    if (!handler) return { ok: false, status: 404, json: async () => ({ ok: false }) };
    const body = handler();
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls };
}

function unstubFetch() {
  delete (globalThis as { fetch?: unknown }).fetch;
}

suite('settings — Bicameral section', () => {

  test('Settings renders Bicameral section with auto-connect toggle when status endpoint is healthy', async () => {
    const { slot, bindOnce } = mount();
    try {
      stubFetch({
        '/api/integrations/bicameral/status': () => ({
          ok: true,
          state: 'configured-not-running',
          version: '0.14.2',
          autoConnect: false,
        }),
      });

      await renderBicameralSettingsCard(slot, { bindOnce });

      // Card renders status + version + autoConnect toggle.
      assert.ok(slot.innerHTML.includes('Bicameral MCP'), 'header text');
      assert.ok(slot.innerHTML.includes('Configured'), 'state label rendered');
      assert.ok(slot.innerHTML.includes('0.14.2'), 'version line rendered');
      const toggle = slot.querySelector('.cc-bicameral-autoconnect') as HTMLInputElement | null;
      assert.ok(toggle, 'autoconnect checkbox present');
      assert.strictEqual(toggle!.checked, false, 'unchecked when autoConnect=false');
      const reinstallBtn = slot.querySelector('[data-action="bicameral-open-integrations"]');
      assert.ok(reinstallBtn, 're-install button present');
    } finally {
      unstubFetch();
      clearDom();
    }
  });

  test('toggling auto-connect persists to workspace config via POST /auto-connect', async () => {
    const { slot, bindOnce } = mount();
    try {
      const { calls } = stubFetch({
        '/api/integrations/bicameral/status': () => ({
          ok: true,
          state: 'configured-not-running',
          version: '0.14.2',
          autoConnect: false,
        }),
        '/api/integrations/bicameral/auto-connect': () => ({ ok: true, autoConnect: true }),
      });

      await renderBicameralSettingsCard(slot, { bindOnce });
      const toggle = slot.querySelector('.cc-bicameral-autoconnect') as HTMLInputElement;
      toggle.checked = true;
      // Simulate the change event the binder is listening for.
      toggle.dispatchEvent(new (globalThis as { window: { Event: typeof Event } }).window.Event('change'));
      // Allow the async POST to flush.
      await new Promise((r) => setTimeout(r, 5));

      const post = calls.find((c) => c.url === '/api/integrations/bicameral/auto-connect');
      assert.ok(post, 'POST /auto-connect was issued');
      assert.strictEqual(post!.init?.method, 'POST');
      const body = JSON.parse(String(post!.init?.body ?? '{}'));
      assert.deepStrictEqual(body, { enabled: true }, 'body shape persists checkbox state');
    } finally {
      unstubFetch();
      clearDom();
    }
  });

  test('slot is removed when status endpoint is unavailable (extension built without integration)', async () => {
    const { slot, bindOnce, dom } = mount();
    try {
      // No handler for /api/integrations/bicameral/status → fetch returns ok:false.
      stubFetch({});

      // Parent must contain the slot before render; renderBicameralSettingsCard
      // calls slot.remove() on 404 which detaches it from its parent.
      const parent = dom.window.document.body;
      assert.ok(parent.contains(slot), 'pre-render: slot in DOM');

      await renderBicameralSettingsCard(slot, { bindOnce });

      assert.ok(!parent.contains(slot), 'post-render: slot removed when probe 404s');
    } finally {
      unstubFetch();
      clearDom();
    }
  });
});
