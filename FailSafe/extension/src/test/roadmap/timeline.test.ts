// Functional tests for TimelineRenderer (FX399, FX400, FX401, FX402).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { TimelineRenderer } from '../../../src/roadmap/ui/modules/timeline.js';

function setupDom(): { dom: JSDOM; cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tl-root"></div></body></html>');
  const prevDoc = (global as any).document;
  const prevWin = (global as any).window;
  const prevFetch = (global as any).fetch;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).URLSearchParams = dom.window.URLSearchParams;
  return {
    dom,
    cleanup: () => {
      (global as any).document = prevDoc;
      (global as any).window = prevWin;
      (global as any).fetch = prevFetch;
    },
  };
}

function stubFetch(entries: any[]): void {
  (global as any).fetch = async () => ({
    ok: true,
    json: async () => ({ entries }),
  });
}

suite('TimelineRenderer (FX399 + FX400 + FX401 + FX402)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX399 render — emits all 5 category filter buttons (All/Verdict/Trust/Approval/DiffGuard)', async () => {
    stubFetch([]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const cats = document.querySelectorAll('.cc-tl-cat');
    assert.equal(cats.length, 5);
    const labels = Array.from(cats).map(b => b.textContent);
    assert.deepEqual(labels, ['All', 'Verdict', 'Trust', 'Approval', 'DiffGuard']);
  });

  test('FX400 render — emits 3 severity toggles (info/warning/error)', async () => {
    stubFetch([]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const sevs = document.querySelectorAll('.cc-tl-sev');
    assert.equal(sevs.length, 3);
    const labels = Array.from(sevs).map(b => b.textContent);
    assert.deepEqual(labels, ['info', 'warning', 'error']);
  });

  test('FX399 — clicking category button updates activeCategory + re-renders', async () => {
    stubFetch([]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const verdict = Array.from(document.querySelectorAll('.cc-tl-cat')).find(b => b.textContent === 'Verdict')!;
    (verdict as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 5));
    assert.equal((r as any).activeCategory, 'Verdict');
  });

  test('FX400 — clicking severity button toggles activeSeverity', async () => {
    stubFetch([]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const errBtn = Array.from(document.querySelectorAll('.cc-tl-sev')).find(b => b.textContent === 'error')!;
    (errBtn as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 5));
    assert.equal((r as any).activeSeverity, 'error');
    // Click again toggles off
    const errBtn2 = Array.from(document.querySelectorAll('.cc-tl-sev')).find(b => b.textContent === 'error')!;
    (errBtn2 as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 5));
    assert.equal((r as any).activeSeverity, null);
  });

  test('FX399 — empty entries renders "No timeline entries" placeholder', async () => {
    stubFetch([]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    assert.match(document.getElementById('tl-root')!.innerHTML, /No timeline entries/);
  });

  test('FX399 — populated entries render category badge + summary + timestamp', async () => {
    stubFetch([
      { category: 'verdict', severity: 'error', summary: 'Test failed', timestamp: '2026-05-07T10:00:00Z' },
    ]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const html = document.getElementById('tl-root')!.innerHTML;
    assert.match(html, />verdict</);
    assert.match(html, /Test failed/);
  });

  test('FX401 — entries have hidden detail pre element with payload JSON', async () => {
    stubFetch([
      { category: 'verdict', severity: 'info', summary: 'X', payload: { foo: 42 }, timestamp: '2026-05-07T00:00:00Z' },
    ]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const detail = document.querySelector('.cc-timeline-detail') as HTMLElement;
    assert.ok(detail, 'detail pre should exist');
    assert.equal(detail.style.display, 'none', 'detail should start collapsed');
    assert.match(detail.textContent ?? '', /"foo":\s*42/);
  });

  test('FX401 — clicking timeline entry expands detail pre', async () => {
    stubFetch([
      { category: 'trust', severity: 'warning', summary: 'Y', payload: {}, timestamp: '2026-05-07T00:00:00Z' },
    ]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const entry = document.querySelector('.cc-timeline-entry') as HTMLElement;
    const detail = entry.querySelector('.cc-timeline-detail') as HTMLElement;
    assert.equal(detail.style.display, 'none');
    entry.click();
    assert.equal(detail.style.display, 'block');
    entry.click();
    assert.equal(detail.style.display, 'none');
  });

  test('FX402 — entries are bounded to 50 rows in render', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      category: 'verdict', severity: 'info', summary: `Event ${i}`, timestamp: '2026-05-07T00:00:00Z',
    }));
    stubFetch(many);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    const rendered = document.querySelectorAll('.cc-timeline-entry');
    assert.equal(rendered.length, 50);
  });

  test('FX399 onEvent — timeline.entryAdded triggers re-render', async () => {
    let renderCount = 0;
    stubFetch([]);
    const r = new TimelineRenderer('tl-root');
    const origRender = r.render.bind(r);
    r.render = async () => { renderCount++; return origRender(); };
    await r.render();
    assert.equal(renderCount, 1);
    r.onEvent({ type: 'timeline.entryAdded' });
    await new Promise(rs => setTimeout(rs, 5));
    assert.equal(renderCount, 2);
  });

  test('FX399 destroy — clears container HTML', async () => {
    stubFetch([{ category: 'verdict', severity: 'info', summary: 'X', timestamp: '2026-05-07T00:00:00Z' }]);
    const r = new TimelineRenderer('tl-root');
    await r.render();
    assert.ok(document.getElementById('tl-root')!.innerHTML.length > 0);
    r.destroy();
    assert.equal(document.getElementById('tl-root')!.innerHTML, '');
  });
});
