// Functional tests for KeyboardManager (FailSafe#305).
// jsdom-driven: reproduces the Space push-to-talk / focused-interactive-control
// conflict and verifies the fix's guard + stuck-state boundaries.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  KeyboardManager,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/keyboard-manager.js';

let dom: JSDOM;

function setupDom(html: string): JSDOM {
  dom = new JSDOM(`<!DOCTYPE html>${html}`);
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent = dom.window.KeyboardEvent;
  return dom;
}

function teardownDom() {
  (globalThis as { window?: unknown }).window = undefined;
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent = undefined;
}

function space(type: 'keydown' | 'keyup', opts: { repeat?: boolean } = {}) {
  return new dom.window.KeyboardEvent(type, { code: 'Space', bubbles: true, cancelable: true, repeat: !!opts.repeat });
}

function byId(doc: Document, id: string): HTMLElement {
  const found = doc.getElementById(id);
  assert.ok(found, `expected #${id} to exist`);
  return found as HTMLElement;
}

interface Callbacks { starts: number; stops: number; }

function wire(km: InstanceType<typeof KeyboardManager>): Callbacks {
  const cb: Callbacks = { starts: 0, stops: 0 };
  km.onPttStart = () => { cb.starts += 1; };
  km.onPttStop = () => { cb.stops += 1; };
  return cb;
}

suite('KeyboardManager (FailSafe#305)', () => {
  teardown(() => { teardownDom(); });

  test('#305 Space PTT still activates on a non-interactive surface (canvas)', () => {
    setupDom('<div id="canvas" tabindex="-1"></div>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const canvas = byId(doc, 'canvas');
    canvas.focus();
    const down = space('keydown');
    canvas.dispatchEvent(down);
    assert.equal(cb.starts, 1, 'PTT starts on a non-interactive focused target');
    assert.equal(down.defaultPrevented, true, 'PTT keydown is prevented on the allowed target');

    canvas.dispatchEvent(space('keyup'));
    assert.equal(cb.stops, 1, 'PTT stops on key-up');
  });

  test('#305 Space on a focused native <button> preserves native activation (does not start PTT)', () => {
    setupDom('<button id="btn">Undo</button>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const btn = byId(doc, 'btn');
    btn.focus();
    const down = space('keydown');
    btn.dispatchEvent(down);
    assert.equal(cb.starts, 0, 'PTT must not start when a native button is focused');
    assert.equal(down.defaultPrevented, false, 'native Space activation must not be suppressed on a button');

    const up = space('keyup');
    btn.dispatchEvent(up);
    assert.equal(cb.stops, 0, 'no PTT stop for a PTT that never started');
    assert.equal(up.defaultPrevented, false, 'native Space activation (keyup) must not be suppressed on a button');
  });

  test('#305 Space on a focused ARIA role="button" widget is also guarded', () => {
    setupDom('<div id="w" role="button" tabindex="0">Node</div>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const widget = byId(doc, 'w');
    widget.focus();
    widget.dispatchEvent(space('keydown'));
    assert.equal(cb.starts, 0, 'PTT must not start on a role="button" widget');
  });

  test('#305 Space on a modal button over the Mind Map surface is guarded', () => {
    setupDom(`
      <div id="canvas"></div>
      <div class="cc-modal-overlay" role="dialog" aria-modal="true">
        <div class="cc-modal">
          <button id="confirm">Confirm</button>
        </div>
      </div>
    `);
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const confirmBtn = byId(doc, 'confirm');
    confirmBtn.focus();
    confirmBtn.dispatchEvent(space('keydown'));
    assert.equal(cb.starts, 0, 'PTT must not steal Space from a modal confirm button');
  });

  test('#305 key-up cannot leave PTT stuck when focus moves to a button between down and up', () => {
    setupDom('<div id="canvas"></div><button id="btn">Undo</button>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const canvas = byId(doc, 'canvas');
    const btn = byId(doc, 'btn');
    canvas.focus();
    canvas.dispatchEvent(space('keydown'));
    assert.equal(cb.starts, 1, 'PTT started on the non-interactive target');

    // Focus moved to the button before key-up (e.g. a click/Tab mid-hold).
    btn.focus();
    const up = space('keyup');
    btn.dispatchEvent(up);
    assert.equal(cb.stops, 1, 'the PTT that was started must still be stopped, regardless of key-up target');
    assert.equal(up.defaultPrevented, true, 'the key-up that legitimately ends an active PTT is still consumed');
  });

  test('#305 key-up on a guarded target with no active PTT is a no-op (cannot fabricate a stop)', () => {
    setupDom('<button id="btn">Undo</button>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const btn = byId(doc, 'btn');
    btn.focus();
    btn.dispatchEvent(space('keyup'));
    assert.equal(cb.stops, 0, 'no stray onPttStop without a matching PTT-starting key-down');
  });

  test('#305 held-key repeat events do not restart PTT', () => {
    setupDom('<div id="canvas"></div>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const canvas = byId(doc, 'canvas');
    canvas.focus();
    canvas.dispatchEvent(space('keydown'));
    canvas.dispatchEvent(space('keydown', { repeat: true }));
    canvas.dispatchEvent(space('keydown', { repeat: true }));
    assert.equal(cb.starts, 1, 'repeat key-down events must not fire additional PTT starts');
  });

  test('#305 unbind() clears in-flight PTT state and detaches listeners', () => {
    setupDom('<div id="canvas"></div>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);
    km.bind();

    const canvas = byId(doc, 'canvas');
    canvas.focus();
    canvas.dispatchEvent(space('keydown'));
    assert.equal(cb.starts, 1);

    km.unbind();
    canvas.dispatchEvent(space('keyup'));
    assert.equal(cb.stops, 0, 'listeners removed by unbind() must not fire');
  });

  test('#305 repeated bind()/unbind() cycles do not multiply listeners or leak stale PTT state', () => {
    setupDom('<div id="canvas"></div>');
    const doc = dom.window.document;
    const km = new KeyboardManager(null);
    const cb = wire(km);

    km.bind();
    km.unbind();
    km.bind();
    km.unbind();
    km.bind();

    const canvas = byId(doc, 'canvas');
    canvas.focus();
    canvas.dispatchEvent(space('keydown'));
    assert.equal(cb.starts, 1, 'exactly one PTT start after repeated mount/unmount cycles, not one per stale listener');
    canvas.dispatchEvent(space('keyup'));
    assert.equal(cb.stops, 1);

    km.unbind();
  });
});
