// FX559 — modal-helper.openModal accessible modal (B198 Phase 2).
//
// Asserts:
//  - openModal produces an overlay with role="dialog" + aria-modal="true"
//  - focus moves into the modal on open
//  - Escape keydown closes the modal (overlay removed) + restores focus
//  - Tab at the last focusable element wraps to the first (focus trap)
//  - Shift+Tab at the first focusable element wraps to the last
//  - the returned close() removes the overlay and restores focus

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { openModal } from '../../../src/roadmap/ui/modules/modal-helper.js';

function setupDom(): { dom: JSDOM; cleanup: () => void } {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><button id="trigger">Trigger</button></body></html>',
    { url: 'http://localhost/' },
  );
  const prevDoc = (global as any).document;
  const prevWin = (global as any).window;
  const prevKbd = (global as any).KeyboardEvent;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).KeyboardEvent = dom.window.KeyboardEvent;
  return {
    dom,
    cleanup: () => {
      (global as any).document = prevDoc;
      (global as any).window = prevWin;
      (global as any).KeyboardEvent = prevKbd;
    },
  };
}

const BODY = '<input id="f1" /><input id="f2" /><button id="f3">OK</button>';

suite('FX559 modal-helper.openModal', () => {
  let dom: JSDOM;
  let cleanup: () => void;
  setup(() => { const s = setupDom(); dom = s.dom; cleanup = s.cleanup; });
  teardown(() => cleanup());

  test('FX559 produces an overlay with role="dialog" + aria-modal="true"', () => {
    openModal({ title: 'Test', bodyHtml: BODY });
    const overlay = dom.window.document.querySelector('[role="dialog"]') as HTMLElement;
    assert.ok(overlay, 'overlay with role=dialog should exist');
    assert.equal(overlay.getAttribute('aria-modal'), 'true');
    assert.equal(overlay.getAttribute('aria-label'), 'Test');
  });

  test('FX559 focus moves into the modal on open', () => {
    openModal({ title: 'Test', bodyHtml: BODY });
    const active = dom.window.document.activeElement;
    const overlay = dom.window.document.querySelector('[role="dialog"]') as HTMLElement;
    assert.ok(active && overlay.contains(active), 'active element must be inside the modal');
  });

  test('FX559 Escape closes the modal and restores focus', () => {
    const trigger = dom.window.document.getElementById('trigger') as HTMLElement;
    trigger.focus();
    openModal({ title: 'Test', bodyHtml: BODY });
    assert.ok(dom.window.document.querySelector('[role="dialog"]'));
    dom.window.document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null, 'overlay removed');
    assert.equal(dom.window.document.activeElement, trigger, 'focus restored to trigger');
  });

  test('FX559 Tab at the last focusable element wraps to the first', () => {
    openModal({ title: 'Test', bodyHtml: BODY });
    const overlay = dom.window.document.querySelector('[role="dialog"]') as HTMLElement;
    const focusables = overlay.querySelectorAll('input, button');
    const last = focusables[focusables.length - 1] as HTMLElement;
    const first = focusables[0] as HTMLElement;
    last.focus();
    overlay.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(dom.window.document.activeElement, first, 'Tab from last wraps to first');
  });

  test('FX559 Shift+Tab at the first focusable element wraps to the last', () => {
    openModal({ title: 'Test', bodyHtml: BODY });
    const overlay = dom.window.document.querySelector('[role="dialog"]') as HTMLElement;
    const focusables = overlay.querySelectorAll('input, button');
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    first.focus();
    overlay.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    assert.equal(dom.window.document.activeElement, last, 'Shift+Tab from first wraps to last');
  });

  test('FX559 returned close() removes the overlay and restores focus', () => {
    const trigger = dom.window.document.getElementById('trigger') as HTMLElement;
    trigger.focus();
    const handle = openModal({ title: 'Test', bodyHtml: BODY });
    assert.ok(dom.window.document.querySelector('[role="dialog"]'));
    handle.close();
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.equal(dom.window.document.activeElement, trigger);
  });
});
