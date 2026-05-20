// Settings card — Voice Pack section.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 3.
// F1 remediation (audit cycle 1): error state render with Dismiss + Retry.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';

// @ts-expect-error JS module import in TS test context
import { renderVoicePackSettingsCard } from '../../../src/roadmap/ui/modules/voice-pack-settings-card.js';

interface BindOnceFn {
  (node: Element | null, evt: string, handler: (e: Event) => void): void;
}

function mount(): { dom: JSDOM; slot: Element; bindOnce: BindOnceFn } {
  const dom = new JSDOM('<!DOCTYPE html><div id="slot"></div>');
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  const slot = dom.window.document.getElementById('slot')!;
  const bindOnce: BindOnceFn = (node, evt, handler) => {
    if (node) (node as HTMLElement).addEventListener(evt, handler);
  };
  return { dom, slot, bindOnce };
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
    return { ok: true, status: 200, json: async () => handler() };
  };
  return { calls };
}

function unstubFetch() {
  delete (globalThis as { fetch?: unknown }).fetch;
}

suite('settings — Voice Pack card', () => {

  test('absent state renders Install button + version-empty line + Voice features disabled hint', async () => {
    const { slot, bindOnce } = mount();
    try {
      stubFetch({
        '/api/integrations/voice-pack/status': () => ({
          ok: true, state: 'absent', version: undefined, requiredMinVersion: '5.2.0',
        }),
      });
      await renderVoicePackSettingsCard(slot, { bindOnce });
      assert.ok(slot.innerHTML.includes('Voice Pack'), 'header text');
      assert.ok(slot.querySelector('[data-action="install-voice-pack"]'), 'install button');
      assert.ok(/voice features.*disabled/i.test(slot.textContent || ''), 'disabled hint');
      assert.strictEqual(slot.querySelector('[data-action="uninstall-voice-pack"]'), null);
    } finally {
      unstubFetch();
      clearDom();
    }
  });

  test('installed state renders version + Uninstall + disk-usage line', async () => {
    const { slot, bindOnce } = mount();
    try {
      stubFetch({
        '/api/integrations/voice-pack/status': () => ({
          ok: true, state: 'installed', version: '5.2.0', requiredMinVersion: '5.2.0',
          diskUsageBytes: 89_478_485, // ~85.3 MB
        }),
      });
      await renderVoicePackSettingsCard(slot, { bindOnce });
      assert.ok(slot.innerHTML.includes('5.2.0'), 'version rendered');
      assert.ok(slot.querySelector('[data-action="uninstall-voice-pack"]'), 'uninstall button');
      assert.strictEqual(slot.querySelector('[data-action="install-voice-pack"]'), null, 'no install button');
      // disk usage rendered as a human-readable line
      assert.ok(/\b(MB|GB|KB|bytes?)\b/i.test(slot.textContent || ''), 'disk-usage units');
    } finally {
      unstubFetch();
      clearDom();
    }
  });

  test('error state renders Dismiss + Retry buttons with last failed InstallProgressEvent.error text', async () => {
    const { slot, bindOnce } = mount();
    try {
      const { calls } = stubFetch({
        '/api/integrations/voice-pack/status': () => ({
          ok: true, state: 'absent', version: undefined, requiredMinVersion: '5.2.0',
        }),
      });
      await renderVoicePackSettingsCard(slot, { bindOnce });
      // Simulate an install failure: invoke the renderer's onInstallProgress
      // entrypoint with an error event. The card exposes this method to allow
      // the host (or this test) to drive its error-state render directly.
      const renderer = (slot as any)._voicePackRenderer;
      assert.ok(renderer, 'renderer instance exposed on slot');
      renderer.onInstallProgress({ phase: 'verify', status: 'error', error: 'sha256 mismatch' });

      const errorMsg = slot.textContent || '';
      assert.ok(/sha256 mismatch/.test(errorMsg), `error text rendered; got: ${errorMsg}`);
      assert.ok(slot.querySelector('[data-action="dismiss-voice-pack-error"]'), 'dismiss button');
      assert.ok(slot.querySelector('[data-action="retry-voice-pack-install"]'), 'retry button');
      void calls;
    } finally {
      unstubFetch();
      clearDom();
    }
  });

  test('install-button click POSTs /api/actions/install-voice-pack', async () => {
    const { slot, bindOnce } = mount();
    try {
      const { calls } = stubFetch({
        '/api/integrations/voice-pack/status': () => ({
          ok: true, state: 'absent', version: undefined, requiredMinVersion: '5.2.0',
        }),
        '/api/actions/install-voice-pack': () => ({ ok: true }),
      });
      await renderVoicePackSettingsCard(slot, { bindOnce });
      const btn = slot.querySelector('[data-action="install-voice-pack"]') as HTMLElement;
      btn.dispatchEvent(new (globalThis as { window: { Event: typeof Event } }).window.Event('click'));
      await new Promise((r) => setTimeout(r, 5));
      const post = calls.find((c) => c.url === '/api/actions/install-voice-pack');
      assert.ok(post, 'POST /install-voice-pack issued');
      assert.strictEqual(post!.init?.method, 'POST');
    } finally {
      unstubFetch();
      clearDom();
    }
  });

  test('slot is removed when /api/integrations/voice-pack/status returns 404 (build without voice substrate)', async () => {
    const { slot, bindOnce, dom } = mount();
    try {
      stubFetch({});
      const parent = dom.window.document.body;
      assert.ok(parent.contains(slot), 'pre-render: slot in DOM');
      await renderVoicePackSettingsCard(slot, { bindOnce });
      assert.ok(!parent.contains(slot), 'post-render: slot removed when probe 404s');
    } finally {
      unstubFetch();
      clearDom();
    }
  });
});
