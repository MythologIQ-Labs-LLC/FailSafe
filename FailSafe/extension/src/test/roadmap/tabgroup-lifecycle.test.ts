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

  // FX812 — B-INT-12: an inactive sub-view's event-driven render must write to
  // its detached scratch container, not the shared live pane.
  function makeDomStub(tag: string) {
    // A renderer that paints `tag` into whatever container TabGroup assigns it.
    const s: any = {
      renderCalls: 0,
      render() { s.renderCalls += 1; if (s.container) s.container.innerHTML = `<span class="mark">${tag}</span>`; },
      onEvent() { s.render(); }, // event-driven full re-render (the clobber vector)
    };
    return s;
  }

  test('FX812 inactive sub-view event-render writes to a detached node, not the live pane', () => {
    const a = makeDomStub('A');
    const b = makeDomStub('B');
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({}); // A active
    const contentEl = dom.window.document.querySelector('.cc-subview-content')!;
    assert.equal(contentEl.textContent, 'A', 'A painted into the live pane');
    // B is inactive; fire an event that makes B re-render.
    tg.onEvent({ type: 'whatever' });
    assert.equal(contentEl.textContent, 'A', 'live pane still shows A — B did not clobber it');
    assert.notEqual(b.container, contentEl, 'inactive B has a detached container, not the live contentEl');
    assert.equal(b.container, b._tgDetached, 'B renders into its persistent detached scratch node');
    assert.equal(b._tgDetached.textContent, 'B', 'B rendered off-DOM into its detached node');
  });

  test('FX812 reactivation rebuilds the live pane from the previously-inactive sub-view', () => {
    const a = makeDomStub('A');
    const b = makeDomStub('B');
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    tg.onEvent({ type: 'x' }); // B renders off-DOM while inactive
    tg.switchTo('b', {});
    const contentEl = dom.window.document.querySelector('.cc-subview-content')!;
    assert.equal(contentEl.textContent, 'B', 'reactivation re-rendered B into the live pane');
    assert.equal(b.container, contentEl, 'active B now owns the live contentEl');
  });

  test('FX812 active sub-view still paints the live pane (regression guard)', () => {
    const a = makeDomStub('A');
    const b = makeDomStub('B');
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    assert.equal(a.container, dom.window.document.querySelector('.cc-subview-content'),
      'active A owns the live contentEl, not a detached node');
  });

  test('FX812 detached scratch node is stable across away→back→away switches', () => {
    const a = makeDomStub('A');
    const b = makeDomStub('B');
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    const firstDetached = b._tgDetached;
    tg.switchTo('b', {});   // B active
    tg.switchTo('a', {});   // B inactive again
    assert.equal(b._tgDetached, firstDetached, 'B reuses the same detached node (no per-switch leak)');
  });

  test('FX812 cache-node sub-view (Transparency pattern): inactive events accumulate + replay on reactivation, live pane unclobbered', () => {
    // Mimics TransparencyRenderer: render() rebuilds container.innerHTML + caches
    // a child `streamEl` + replays an in-memory backlog; onEvent() appends to the
    // cached child (NOT a full render) + accumulates the backlog unconditionally.
    function makeStreamStub(tag: string) {
      const doc = () => (global as any).document;
      const s: any = {
        events: [] as string[],
        streamEl: null,
        render() {
          if (!s.container) return;
          s.container.innerHTML = `<div class="stream ${tag}"></div>`;
          s.streamEl = s.container.querySelector('.stream');
          s.events.forEach((id: string) => {
            const c = doc().createElement('span'); c.className = 'rec'; c.textContent = id;
            s.streamEl.appendChild(c);
          });
        },
        onEvent(id: string) {
          s.events.push(id); // accumulate unconditionally (mount-independent)
          if (s.streamEl) {
            const c = doc().createElement('span'); c.className = 'rec'; c.textContent = id;
            s.streamEl.appendChild(c);
          }
        },
      };
      return s;
    }
    const trans = makeStreamStub('T');
    const other = makeDomStub('O');
    const tg = new TabGroup('tg-container', [
      { key: 't', label: 'T', renderer: trans },
      { key: 'o', label: 'O', renderer: other },
    ]);
    tg.render({}); // T active — streamEl lives in the live contentEl
    const contentEl = dom.window.document.querySelector('.cc-subview-content')!;
    tg.switchTo('o', {}); // O overwrites contentEl (orphans T.streamEl) + T.container → detached
    assert.equal(contentEl.textContent, 'O', 'live pane shows O');
    trans.onEvent('bg-0'); trans.onEvent('bg-1'); trans.onEvent('bg-2');
    assert.equal(contentEl.querySelectorAll('.rec').length, 0, 'live pane (O) unclobbered by background T events');
    assert.equal(trans.events.length, 3, 'T accumulated the backlog while inactive');
    tg.switchTo('t', {}); // reactivate → render() replays backlog into the live pane
    assert.equal(contentEl.querySelectorAll('.rec').length, 3, 'all 3 background events replayed on reactivation');
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
