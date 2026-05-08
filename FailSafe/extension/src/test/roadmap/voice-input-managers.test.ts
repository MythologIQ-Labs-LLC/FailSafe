// Functional tests for KeyboardManager (FX229 PTT hotkey) + WakeWordListener (FX228).
// Both are pure-state modules with persistence + lightweight integration with
// document/SpeechRecognition globals. We mock `document` (KeyboardManager) and
// rely on the absence of SpeechRecognitionCtor in Node (WakeWordListener).

import { strict as assert } from 'assert';
// @ts-expect-error JS module without .d.ts
import { KeyboardManager } from '../../../src/roadmap/ui/modules/keyboard-manager.js';
// @ts-expect-error JS module without .d.ts
import { WakeWordListener } from '../../../src/roadmap/ui/modules/wake-word-listener.js';

class MemoryStore {
  private data = new Map<string, string>();
  get(key: string): string | undefined { return this.data.get(key); }
  set(key: string, value: string): void { this.data.set(key, value); }
}

interface DocListener { type: string; handler: (e: { code: string; repeat?: boolean; target?: unknown; preventDefault: () => void }) => void; }
class MockDocument {
  listeners: DocListener[] = [];
  addEventListener(type: string, handler: DocListener['handler']): void {
    this.listeners.push({ type, handler });
  }
  removeEventListener(type: string, handler: DocListener['handler']): void {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.handler === handler));
  }
  dispatch(type: string, event: { code: string; repeat?: boolean; target?: unknown; preventDefault?: () => void }): void {
    const evt = { ...event, preventDefault: event.preventDefault || (() => undefined) };
    for (const l of this.listeners) {
      if (l.type === type) l.handler(evt);
    }
  }
}

suite('KeyboardManager (FX229 PTT hotkey)', () => {
  let originalDocument: unknown;
  let mockDoc: MockDocument;

  setup(() => {
    originalDocument = (globalThis as { document?: unknown }).document;
    mockDoc = new MockDocument();
    (globalThis as { document?: unknown }).document = mockDoc;
  });

  teardown(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  test('default pttKey is Space', () => {
    const km = new KeyboardManager(new MemoryStore());
    assert.equal(km.pttKey, 'Space');
  });

  test('loadKey() restores persisted pttKey from store', () => {
    const store = new MemoryStore();
    store.set('ptt-key', 'KeyP');
    const km = new KeyboardManager(store);
    km.loadKey();
    assert.equal(km.pttKey, 'KeyP');
  });

  test('setPttKey() updates field + persists to store', () => {
    const store = new MemoryStore();
    const km = new KeyboardManager(store);
    km.setPttKey('KeyT');
    assert.equal(km.pttKey, 'KeyT');
    assert.equal(store.get('ptt-key'), 'KeyT');
  });

  test('keydown matching pttKey fires onPttStart', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    mockDoc.dispatch('keydown', { code: 'Space' });
    assert.equal(started, 1);
  });

  test('keydown with non-matching code does NOT fire onPttStart', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    mockDoc.dispatch('keydown', { code: 'Escape' });
    assert.equal(started, 0);
  });

  test('keydown with repeat=true is ignored (key autorepeat guard)', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    mockDoc.dispatch('keydown', { code: 'Space', repeat: true });
    assert.equal(started, 0);
  });

  test('keydown while focus is on INPUT element is ignored (text-input guard)', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    mockDoc.dispatch('keydown', { code: 'Space', target: { tagName: 'INPUT' } });
    assert.equal(started, 0);
  });

  test('keydown while focus is on TEXTAREA is ignored', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    mockDoc.dispatch('keydown', { code: 'Space', target: { tagName: 'TEXTAREA' } });
    assert.equal(started, 0);
  });

  test('keydown on contenteditable is ignored', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    mockDoc.dispatch('keydown', { code: 'Space', target: { isContentEditable: true } });
    assert.equal(started, 0);
  });

  test('keyup matching pttKey fires onPttStop', () => {
    const km = new KeyboardManager(new MemoryStore());
    let stopped = 0;
    km.onPttStop = () => { stopped += 1; };
    km.bind();
    mockDoc.dispatch('keyup', { code: 'Space' });
    assert.equal(stopped, 1);
  });

  test('unbind() removes listeners and prevents further dispatch', () => {
    const km = new KeyboardManager(new MemoryStore());
    let started = 0;
    km.onPttStart = () => { started += 1; };
    km.bind();
    km.unbind();
    mockDoc.dispatch('keydown', { code: 'Space' });
    assert.equal(started, 0);
    assert.equal(mockDoc.listeners.length, 0);
  });

  test('unbind() is safe when called without prior bind()', () => {
    const km = new KeyboardManager(new MemoryStore());
    assert.doesNotThrow(() => km.unbind());
  });
});

suite('WakeWordListener (FX228)', () => {
  test('default state — disabled, default phrase "hey failsafe"', () => {
    const wwl = new WakeWordListener(new MemoryStore());
    assert.equal(wwl.enabled, false);
    assert.equal(wwl.phrase, 'hey failsafe');
  });

  test('constructor restores enabled flag from store ("true" string)', () => {
    const store = new MemoryStore();
    store.set('wake-word-enabled', 'true');
    const wwl = new WakeWordListener(store);
    assert.equal(wwl.enabled, true);
  });

  test('constructor restores enabled flag from store (boolean true)', () => {
    const store = new MemoryStore();
    // Some store implementations preserve native types
    (store as unknown as { data: Map<string, unknown> }).data.set('wake-word-enabled', true);
    const wwl = new WakeWordListener(store);
    assert.equal(wwl.enabled, true);
  });

  test('constructor restores phrase from store and lowercases it', () => {
    const store = new MemoryStore();
    store.set('wake-word-phrase', 'Hey Robot Friend');
    const wwl = new WakeWordListener(store);
    assert.equal(wwl.phrase, 'hey robot friend');
  });

  test('setEnabled(true) persists to store (native boolean preserved)', () => {
    const store = new MemoryStore();
    const wwl = new WakeWordListener(store);
    wwl.setEnabled(true);
    assert.equal(wwl.enabled, true);
    // Source passes boolean directly; constructor accepts both `true` and `'true'`
    // for forward compat with stringly-typed storage backends.
    const persisted = (store as unknown as { data: Map<string, unknown> }).data.get('wake-word-enabled');
    assert.equal(persisted, true);
  });

  test('setEnabled(false) calls stop() (no-op when no recognition)', () => {
    const wwl = new WakeWordListener(new MemoryStore());
    wwl.setEnabled(true);
    assert.doesNotThrow(() => wwl.setEnabled(false));
    assert.equal(wwl.enabled, false);
  });

  test('setPhrase normalizes input to lowercase + persists', () => {
    const store = new MemoryStore();
    const wwl = new WakeWordListener(store);
    wwl.setPhrase('Hey FailSafe');
    assert.equal(wwl.phrase, 'hey failsafe');
    assert.equal(store.get('wake-word-phrase'), 'hey failsafe');
  });

  test('setPhrase("") falls back to default phrase', () => {
    const wwl = new WakeWordListener(new MemoryStore());
    wwl.setPhrase('');
    assert.equal(wwl.phrase, 'hey failsafe');
  });

  test('start() returns false + invokes onError when SpeechRecognitionCtor unavailable (Node env)', () => {
    const wwl = new WakeWordListener(new MemoryStore());
    let errorMsg: string | null = null;
    const result = wwl.start(() => undefined, (msg: string) => { errorMsg = msg; }, () => 'idle');
    // In a Node test environment without speech recognition, ctor is null
    // so start refuses and reports the unavailable error.
    assert.equal(result, false);
    assert.match(String(errorMsg), /unavailable/i);
  });

  test('stop() is a safe no-op when no recognition is active', () => {
    const wwl = new WakeWordListener(new MemoryStore());
    assert.doesNotThrow(() => wwl.stop());
    assert.doesNotThrow(() => wwl.destroy());
  });
});
