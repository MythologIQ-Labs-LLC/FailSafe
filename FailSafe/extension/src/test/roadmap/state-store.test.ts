// Functional tests for StateStore (FX189 — localStorage wrapper).
// Pure-logic with localStorage stub. Sink: real Map storage assertions.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { StateStore } from '../../../src/roadmap/ui/modules/state.js';

function installStubs(): { restore: () => void; store: Map<string, string> } {
  const store = new Map<string, string>();
  const originalLs = (globalThis as { localStorage?: unknown }).localStorage;
  const originalDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.has(k) ? store.get(k) : null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };
  (globalThis as { document: unknown }).document = {
    documentElement: {
      _attrs: new Map<string, string>(),
      setAttribute(k: string, v: string) { (this as unknown as { _attrs: Map<string, string> })._attrs.set(k, v); },
      getAttribute(k: string) { return (this as unknown as { _attrs: Map<string, string> })._attrs.get(k); },
    },
  };
  return {
    store,
    restore: () => {
      (globalThis as { localStorage: unknown }).localStorage = originalLs;
      (globalThis as { document: unknown }).document = originalDoc;
    },
  };
}

suite('StateStore (FX189)', () => {
  let stubs: { restore: () => void; store: Map<string, string> };

  setup(() => { stubs = installStubs(); });
  teardown(() => { stubs.restore(); });

  test('FX189 default prefix is "fs"', () => {
    const ss = new StateStore();
    ss.set('hello', 'world');
    assert.equal(stubs.store.get('fs-hello'), 'world');
  });

  test('FX189 custom prefix scopes keys', () => {
    const ss = new StateStore('myapp');
    ss.set('hello', 'world');
    assert.equal(stubs.store.get('myapp-hello'), 'world');
    assert.equal(stubs.store.get('fs-hello'), undefined);
  });

  test('FX189 get/set round-trip', () => {
    const ss = new StateStore();
    ss.set('alpha', 'beta');
    assert.equal(ss.get('alpha'), 'beta');
  });

  test('FX189 remove deletes the key', () => {
    const ss = new StateStore();
    ss.set('temp', 'value');
    assert.equal(ss.get('temp'), 'value');
    ss.remove('temp');
    assert.equal(ss.get('temp'), null);
  });

  test('FX189 getJSON/setJSON round-trip with object', () => {
    const ss = new StateStore();
    ss.setJSON('config', { theme: 'dark', count: 5 });
    assert.deepEqual(ss.getJSON('config'), { theme: 'dark', count: 5 });
  });

  test('FX189 getJSON returns null when key missing', () => {
    const ss = new StateStore();
    assert.equal(ss.getJSON('missing'), null);
  });

  test('FX189 getJSON returns null when stored value is not valid JSON', () => {
    const ss = new StateStore();
    ss.set('bad', 'not-json{');
    assert.equal(ss.getJSON('bad'), null);
  });

  test('FX189 getActiveTab default is "overview"', () => {
    const ss = new StateStore();
    assert.equal(ss.getActiveTab(), 'overview');
  });

  test('FX189 setActiveTab persists + getActiveTab returns it', () => {
    const ss = new StateStore();
    ss.setActiveTab('skills');
    assert.equal(ss.getActiveTab(), 'skills');
  });

  test('FX189 getTheme default is "mythiq"', () => {
    const ss = new StateStore();
    assert.equal(ss.getTheme(), 'mythiq');
  });

  test('FX189 setTheme persists + applies data-theme on documentElement', () => {
    const ss = new StateStore();
    ss.setTheme('dark');
    assert.equal(ss.getTheme(), 'dark');
    const docEl = (globalThis as { document?: { documentElement: { getAttribute: (k: string) => string | undefined } } }).document!.documentElement;
    assert.equal(docEl.getAttribute('data-theme'), 'dark');
  });

  test('FX189 getLlmPriority default is server/native/wasm', () => {
    const ss = new StateStore();
    assert.deepEqual(ss.getLlmPriority(), ['server', 'native', 'wasm']);
  });

  test('FX189 setLlmPriority persists + getLlmPriority returns it', () => {
    const ss = new StateStore();
    ss.setLlmPriority(['native', 'server']);
    assert.deepEqual(ss.getLlmPriority(), ['native', 'server']);
  });
});
