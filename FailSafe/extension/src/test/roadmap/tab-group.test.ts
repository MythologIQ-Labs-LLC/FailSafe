// Functional tests for TabGroup (FX188 sub-view pill switcher).
// jsdom-driven: instantiates with stub subviews, exercises render/switchTo/onEvent.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  TabGroup,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/tab-group.js';

interface RendererStub {
  container?: Element;
  renderCalls: unknown[];
  rightPanelCalls: number;
  toolbarBound: number;
  events: unknown[];
  destroyed: number;
  render(hubData: unknown): void;
  renderRightPanel?(): string;
  bindToolbar?(): void;
  onEvent?(evt: unknown): void;
  destroy?(): void;
}

function makeRenderer(opts: { withRightPanel?: boolean; withToolbar?: boolean } = {}): RendererStub {
  const stub: RendererStub = {
    renderCalls: [],
    rightPanelCalls: 0,
    toolbarBound: 0,
    events: [],
    destroyed: 0,
    render(hubData) { stub.renderCalls.push(hubData); },
    onEvent(evt) { stub.events.push(evt); },
    destroy() { stub.destroyed += 1; },
  };
  if (opts.withRightPanel) {
    stub.renderRightPanel = () => { stub.rightPanelCalls += 1; return '<div>right</div>'; };
  }
  if (opts.withToolbar) {
    stub.bindToolbar = () => { stub.toolbarBound += 1; };
  }
  return stub;
}

function setupDom(): JSDOM {
  const dom = new JSDOM('<!DOCTYPE html><div id="tg-container"></div>');
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  (globalThis as { document?: unknown }).document = dom.window.document;
  return dom;
}

function teardownDom() {
  (globalThis as { window?: unknown }).window = undefined;
  (globalThis as { document?: unknown }).document = undefined;
}

suite('TabGroup (FX188)', () => {
  setup(() => { setupDom(); });
  teardown(() => { teardownDom(); });

  test('FX188 constructor — defaults active key to first subview', () => {
    const subviews = [
      { key: 'a', label: 'Alpha', renderer: makeRenderer() },
      { key: 'b', label: 'Beta', renderer: makeRenderer() },
    ];
    const tg = new TabGroup('tg-container', subviews);
    assert.equal(tg.activeKey, 'a');
  });

  test('FX188 constructor with empty subviews — active key is empty string', () => {
    const tg = new TabGroup('tg-container', []);
    assert.equal(tg.activeKey, '');
  });

  test('FX188 render() — creates pill bar with one pill per subview + active marker on first', () => {
    const subviews = [
      { key: 'a', label: 'Alpha', renderer: makeRenderer() },
      { key: 'b', label: 'Beta', renderer: makeRenderer() },
      { key: 'c', label: 'Gamma', renderer: makeRenderer() },
    ];
    const tg = new TabGroup('tg-container', subviews);
    tg.render({ hub: 1 });
    const pills = (globalThis as { document: Document }).document.querySelectorAll('.cc-pill');
    assert.equal(pills.length, 3);
    assert.ok(pills[0].classList.contains('active'));
    assert.equal(pills[0].textContent, 'Alpha');
    assert.ok(!pills[1].classList.contains('active'));
  });

  test('FX188 render() — calls active subview\'s renderer.render with hub data', () => {
    const renderer = makeRenderer();
    const tg = new TabGroup('tg-container', [{ key: 'a', label: 'A', renderer }]);
    tg.render({ marker: 'first-call' });
    assert.equal(renderer.renderCalls.length, 1);
    assert.deepEqual(renderer.renderCalls[0], { marker: 'first-call' });
  });

  test('FX188 render() — when container is missing, no-op', () => {
    const tg = new TabGroup('does-not-exist', [{ key: 'a', label: 'A', renderer: makeRenderer() }]);
    assert.doesNotThrow(() => tg.render({}));
  });

  test('FX188 switchTo(key) — flips active flag + invokes new renderer', () => {
    const a = makeRenderer();
    const b = makeRenderer();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({ phase: 1 });
    assert.equal(b.renderCalls.length, 0);
    tg.switchTo('b', { phase: 2 });
    assert.equal(tg.activeKey, 'b');
    assert.equal(b.renderCalls.length, 1);
    assert.deepEqual(b.renderCalls[0], { phase: 2 });
    const pills = (globalThis as { document: Document }).document.querySelectorAll('.cc-pill');
    assert.ok(!pills[0].classList.contains('active'));
    assert.ok(pills[1].classList.contains('active'));
  });

  test('FX188 switchTo() fires onSubViewSwitch hook when set', () => {
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: makeRenderer() },
      { key: 'b', label: 'B', renderer: makeRenderer() },
    ]);
    tg.render({});
    let fired = 0;
    tg.onSubViewSwitch = () => { fired += 1; };
    tg.switchTo('b', {});
    assert.equal(fired, 1);
  });

  test('FX188 click on a non-active pill triggers switchTo', () => {
    const a = makeRenderer();
    const b = makeRenderer();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    const pills = (globalThis as { document: Document }).document.querySelectorAll('.cc-pill');
    (pills[1] as HTMLElement).click();
    assert.equal(tg.activeKey, 'b');
    assert.equal(b.renderCalls.length, 1);
  });

  test('FX188 renderRightPanel() — delegates to active subview when defined', () => {
    const aWith = makeRenderer({ withRightPanel: true });
    const bWithout = makeRenderer();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: aWith },
      { key: 'b', label: 'B', renderer: bWithout },
    ]);
    tg.render({});
    const result = tg.renderRightPanel();
    assert.equal(result, '<div>right</div>');
    assert.equal(aWith.rightPanelCalls, 1);

    tg.switchTo('b', {});
    const result2 = tg.renderRightPanel();
    assert.equal(result2, null, 'subview without renderRightPanel returns null');
  });

  test('FX188 bindToolbar() — delegates when active subview has it', () => {
    const a = makeRenderer({ withToolbar: true });
    const tg = new TabGroup('tg-container', [{ key: 'a', label: 'A', renderer: a }]);
    tg.render({});
    tg.bindToolbar();
    assert.equal(a.toolbarBound, 1);
  });

  test('FX188 bindToolbar() — safe no-op when active subview does not have it', () => {
    const tg = new TabGroup('tg-container', [{ key: 'a', label: 'A', renderer: makeRenderer() }]);
    tg.render({});
    assert.doesNotThrow(() => tg.bindToolbar());
  });

  test('FX188 onEvent() — fans out to ALL subviews', () => {
    const a = makeRenderer();
    const b = makeRenderer();
    const c = makeRenderer();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
      { key: 'c', label: 'C', renderer: c },
    ]);
    tg.render({});
    tg.onEvent({ type: 'hub.refresh' });
    assert.equal(a.events.length, 1);
    assert.equal(b.events.length, 1);
    assert.equal(c.events.length, 1);
  });

  test('FX188 destroy() — destroys all subviews + clears container', () => {
    const a = makeRenderer();
    const b = makeRenderer();
    const tg = new TabGroup('tg-container', [
      { key: 'a', label: 'A', renderer: a },
      { key: 'b', label: 'B', renderer: b },
    ]);
    tg.render({});
    tg.destroy();
    assert.equal(a.destroyed, 1);
    assert.equal(b.destroyed, 1);
    assert.equal((globalThis as { document: Document }).document.getElementById('tg-container')!.innerHTML, '');
  });
});
