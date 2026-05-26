// Functional tests for LlmStatusRenderer (FX192).
// Tests _getRowInfo decision matrix (pure logic) + reorderLlm + toggleHelp.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  LlmStatusRenderer,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/llm-status.js';

interface RowInfo { label: string; status: string; active: boolean; color: string; }

function setupDom(): { restore: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><div class="cc-bs-llm-indicator"></div>');
  const original = (globalThis as { document?: unknown }).document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  (globalThis as { document?: unknown }).document = dom.window.document;
  return {
    restore: () => {
      (globalThis as { document?: unknown }).document = original;
    },
  };
}

function makeStore(initial: { priority?: string[] } = {}): {
  priority: string[];
  getLlmPriority(): string[];
  setLlmPriority(list: string[]): void;
} {
  return {
    priority: initial.priority || ['server', 'native', 'wasm'],
    getLlmPriority() { return this.priority; },
    setLlmPriority(list) { this.priority = list; },
  };
}

function makeWebLlm(overrides: Record<string, unknown> = {}) {
  return {
    isNativeAiAvailable: false,
    pipeline: null,
    loadingStatus: 'idle',
    recheckNative: async () => false,
    ...overrides,
  };
}

function getRowInfo(renderer: unknown, id: string, state: Record<string, unknown>): RowInfo {
  return (renderer as { _getRowInfo: (id: string, state: Record<string, unknown>) => RowInfo })._getRowInfo(id, state);
}

suite('LlmStatusRenderer (FX192)', () => {
  let domR: { restore: () => void };

  setup(() => { domR = setupDom(); });
  teardown(() => { domR.restore(); });

  test('FX192 _getRowInfo native — returns Active when nativeAvailable=true', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'native', { nativeAvailable: true });
    assert.match(info.label, /Gemini Nano/);
    assert.equal(info.active, true);
    assert.match(info.status, /Active/);
  });

  test('FX192 _getRowInfo native — "Not Supported" when reason=not-supported', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'native', { nativeAvailable: false, nativeUnavailableReason: 'not-supported' });
    assert.equal(info.active, false);
    assert.match(info.status, /Not Supported/);
  });

  test('FX192 _getRowInfo native — "Unavailable" when reason=probe-error', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'native', { nativeAvailable: false, nativeUnavailableReason: 'probe-error' });
    assert.match(info.status, /Unavailable/);
  });

  test('FX192 _getRowInfo native — "Not Available" when reason=no-api', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'native', { nativeAvailable: false, nativeUnavailableReason: 'no-api' });
    assert.match(info.status, /Not Available/);
  });

  test('FX192 _getRowInfo native — "Chrome/Edge Only" when browserSupported=false', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'native', { nativeAvailable: false, browserSupported: false });
    assert.match(info.status, /Chrome\/Edge Only/);
  });

  test('FX192 _getRowInfo server — Connected when probe succeeded', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'server', { ollamaAvailable: true, ollamaUnavailableReason: null });
    assert.match(info.label, /Ollama/);
    assert.equal(info.active, true);
    assert.match(info.status, /Connected/);
  });

  test('FX192 _getRowInfo server — Not Running when probe failed (common case, Ollama not installed)', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'server', { ollamaAvailable: false, ollamaUnavailableReason: 'not-running' });
    assert.match(info.label, /Ollama/);
    assert.equal(info.active, false, 'must NOT show as active when probe failed');
    assert.match(info.status, /Not Running/);
  });

  test('FX192 _getRowInfo server — Checking… while initial probe in flight', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'server', { ollamaAvailable: false, ollamaUnavailableReason: 'not-probed' });
    assert.match(info.label, /Ollama/);
    assert.equal(info.active, false);
    assert.match(info.status, /Checking/);
  });

  test('FX192 _getRowInfo server — Unavailable for any other probe-error reason', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'server', { ollamaAvailable: false, ollamaUnavailableReason: 'probe-error' });
    assert.match(info.label, /Ollama/);
    assert.equal(info.active, false);
    assert.match(info.status, /Unavailable/);
  });

  test('FX192 _getRowInfo wasm — Standby when ready', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'wasm', { wasmReady: true });
    assert.match(info.label, /WASM Core/);
    assert.equal(info.active, true);
    assert.equal(info.status, 'Standby');
  });

  test('FX192 _getRowInfo wasm — Loading when state.loading=true', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'wasm', { wasmReady: false, loading: true });
    assert.match(info.status, /Loading/);
    assert.equal(info.active, false);
  });

  test('FX192 _getRowInfo wasm — Offline when not ready and not loading', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'wasm', { wasmReady: false, loading: false });
    assert.match(info.status, /Offline/);
  });

  test('FX192 _getRowInfo unknown id — returns the id as label with empty status', () => {
    const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
    const info = getRowInfo(r, 'mystery-engine', {});
    assert.equal(info.label, 'mystery-engine');
    assert.equal(info.status, '');
    assert.equal(info.active, false);
  });

  test('FX192 reorderLlm — moves entry up by 1 (direction=-1)', () => {
    const store = makeStore({ priority: ['a', 'b', 'c'] });
    const r = new LlmStatusRenderer(makeWebLlm(), store, () => undefined);
    r.reorderLlm(2, -1); // move 'c' up
    assert.deepEqual(store.priority, ['a', 'c', 'b']);
  });

  test('FX192 reorderLlm — moves entry down by 1 (direction=1)', () => {
    const store = makeStore({ priority: ['a', 'b', 'c'] });
    const r = new LlmStatusRenderer(makeWebLlm(), store, () => undefined);
    r.reorderLlm(0, 1);
    assert.deepEqual(store.priority, ['b', 'a', 'c']);
  });

  test('FX192 reorderLlm — moving past end is no-op', () => {
    const store = makeStore({ priority: ['a', 'b'] });
    const r = new LlmStatusRenderer(makeWebLlm(), store, () => undefined);
    r.reorderLlm(1, 1);
    assert.deepEqual(store.priority, ['a', 'b']);
  });

  test('FX192 reorderLlm — moving past start is no-op', () => {
    const store = makeStore({ priority: ['a', 'b'] });
    const r = new LlmStatusRenderer(makeWebLlm(), store, () => undefined);
    r.reorderLlm(0, -1);
    assert.deepEqual(store.priority, ['a', 'b']);
  });

  test('FX192 toggleHelp — flips _helpVisible flag', () => {
    let recheckCount = 0;
    const r = new LlmStatusRenderer(
      makeWebLlm({ recheckNative: async () => { recheckCount += 1; return false; } }),
      makeStore(), () => undefined,
    );
    assert.equal((r as unknown as { _helpVisible: boolean })._helpVisible, false);
    r.toggleHelp();
    assert.equal((r as unknown as { _helpVisible: boolean })._helpVisible, true);
    r.toggleHelp();
    assert.equal((r as unknown as { _helpVisible: boolean })._helpVisible, false);
  });

  test('FX192 render — populates .cc-bs-llm-indicator with N rows for priority list', () => {
    const r = new LlmStatusRenderer(
      makeWebLlm({ isNativeAiAvailable: true, pipeline: { ready: true } }),
      makeStore({ priority: ['native', 'server', 'wasm'] }),
      () => undefined,
    );
    r.render(null);
    const indicator = (globalThis as { document: Document }).document.querySelector('.cc-bs-llm-indicator');
    assert.ok(indicator);
    // 3 priority entries → at least 3 distinct labels in HTML
    const html = indicator!.innerHTML;
    assert.match(html, /Gemini Nano/);
    assert.match(html, /Ollama/);
    assert.match(html, /WASM/);
  });

  test('FX192 render — when client is provided, uses client.webLlmState (not local webLlm)', () => {
    const r = new LlmStatusRenderer(
      makeWebLlm({ isNativeAiAvailable: false, pipeline: null }),
      makeStore({ priority: ['native'] }),
      () => undefined,
    );
    r.render({ webLlmState: { nativeAvailable: true, wasmReady: false, loading: false, browserSupported: true } });
    const html = (globalThis as { document: Document }).document.querySelector('.cc-bs-llm-indicator')!.innerHTML;
    assert.match(html, /Active/);
  });

  test('FX192 render — when no .cc-bs-llm-indicator element exists, no-op', () => {
    domR.restore();
    const original = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = { querySelector: () => null };
    try {
      const r = new LlmStatusRenderer(makeWebLlm(), makeStore(), () => undefined);
      assert.doesNotThrow(() => r.render(null));
    } finally {
      (globalThis as { document?: unknown }).document = original;
      domR = setupDom();
    }
  });
});
