// FX560 — TabGroup sub-view lifecycle cleanup (B198 Phase 3).
//
// Asserts:
//  - switchTo calls destroy() exactly once on the OUTGOING sub-view renderer
//  - a sub-view whose renderer has no destroy() does not throw on switchTo
//  - switching away from a sub-view then back re-renders it cleanly
//  - after a renderer with an open modal is destroy()-ed the overlay node
//    is removed from document.body (re-render-safe teardown)
//  - destroy() removes a window/document listener the renderer registered

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { TabGroup } from '../../../src/roadmap/ui/modules/tab-group.js';
// @ts-expect-error untyped JS module
import { openModal } from '../../../src/roadmap/ui/modules/modal-helper.js';

function setupDom(): { dom: JSDOM; cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tg-container"></div></body></html>');
  const prevDoc = (global as any).document;
  const prevWin = (global as any).window;
  const prevKbd = (global as any).KeyboardEvent;
  const prevEvt = (global as any).Event;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).KeyboardEvent = dom.window.KeyboardEvent;
  (global as any).Event = dom.window.Event;
  return {
    dom,
    cleanup: () => {
      (global as any).document = prevDoc;
      (global as any).window = prevWin;
      (global as any).KeyboardEvent = prevKbd;
      (global as any).Event = prevEvt;
    },
  };
}

interface Stub {
  renderCalls: number;
  destroyed: number;
  render(): void;
  destroy?(): void;
}

function makeStub(withDestroy = true): Stub {
  const s: Stub = {
    renderCalls: 0,
    destroyed: 0,
    render() { s.renderCalls += 1; },
  };
  if (withDestroy) s.destroy = () => { s.destroyed += 1; };
  return s;
}

suite('FX560 TabGroup sub-view lifecycle', () => {
  let dom: JSDOM;
  let cleanup: () => void;
  setup(() => { const s = setupDom(); dom = s.dom; cleanup = s.cleanup; });
  teardown(() => cleanup());

  test('FX560 switchTo destroys the outgoing sub-view renderer exactly once', () => {
    const a = makeStub();
    const b = makeStub();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    tg.switchTo('b', {});
    assert.equal(a.destroyed, 1, 'outgoing renderer A destroyed once');
    assert.equal(b.destroyed, 0, 'incoming renderer B not destroyed');
  });

  test('FX560 switchTo does not throw when outgoing renderer lacks destroy()', () => {
    const a = makeStub(false);
    const b = makeStub();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    assert.doesNotThrow(() => tg.switchTo('b', {}));
  });

  test('FX560 switching away then back re-renders the sub-view cleanly', () => {
    const a = makeStub();
    const b = makeStub();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    assert.equal(a.renderCalls, 1);
    tg.switchTo('b', {});
    assert.doesNotThrow(() => tg.switchTo('a', {}));
    assert.equal(a.renderCalls, 2, 'A re-renders cleanly on return');
    assert.equal(a.destroyed, 1, 'A destroyed once (on the away switch only)');
  });

  test('FX560 destroy() removes an open modal overlay from document.body', () => {
    const modalRenderer: Stub = {
      renderCalls: 0,
      destroyed: 0,
      render() {
        this.renderCalls += 1;
        (this as any)._modal = openModal({ title: 'X', bodyHtml: '<button>OK</button>' });
      },
      destroy() {
        this.destroyed += 1;
        (this as any)._modal?.close();
        (this as any)._modal = null;
      },
    };
    const other = makeStub();
    const tg = new TabGroup('tg-container', [
      { key: 'm', label: 'M', renderer: modalRenderer },
      { key: 'o', label: 'O', renderer: other },
    ]);
    tg.render({});
    assert.ok(dom.window.document.querySelector('.cc-modal-overlay'), 'modal open after render');
    tg.switchTo('o', {});
    assert.equal(dom.window.document.querySelector('.cc-modal-overlay'), null,
      'modal overlay removed when sub-view destroyed');
  });

  test('FX560 destroy() removes a window/document listener the renderer registered', () => {
    let handlerRuns = 0;
    const handler = () => { handlerRuns += 1; };
    const listeningRenderer: Stub = {
      renderCalls: 0,
      destroyed: 0,
      render() {
        this.renderCalls += 1;
        document.addEventListener('custom-fx560', handler);
      },
      destroy() {
        this.destroyed += 1;
        document.removeEventListener('custom-fx560', handler);
      },
    };
    const other = makeStub();
    const tg = new TabGroup('tg-container', [
      { key: 'l', label: 'L', renderer: listeningRenderer },
      { key: 'o', label: 'O', renderer: other },
    ]);
    tg.render({});
    tg.switchTo('o', {});
    dom.window.document.dispatchEvent(new dom.window.Event('custom-fx560'));
    assert.equal(handlerRuns, 0, 'listener removed by destroy(); handler must not run');
  });
});
