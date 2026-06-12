// FX886 — TrackerEmbedRenderer.render() is idempotent (research-brief Phase 1,
// Issue 1). The embedded Development Tracker is an iframe; rebuilding it on every
// hub payload reloaded the dashboard ("reloads a lot"). render() must keep an
// already-mounted same-src iframe and refresh only the heading, while still
// rebuilding from scratch when the container was torn down (recovery path).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { TrackerEmbedRenderer } from '../../../src/roadmap/ui/modules/tracker-embed-renderer.js';

function setupDom(): { dom: JSDOM; cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="trk"></div></body></html>');
  const prevDoc = (global as any).document;
  const prevWin = (global as any).window;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  return {
    dom,
    cleanup: () => { (global as any).document = prevDoc; (global as any).window = prevWin; },
  };
}

suite('FX886 TrackerEmbedRenderer idempotent render', () => {
  let dom: JSDOM;
  let cleanup: () => void;
  setup(() => { const s = setupDom(); dom = s.dom; cleanup = s.cleanup; });
  teardown(() => cleanup());

  test('FX886 second render keeps the SAME iframe element + src (no reload)', () => {
    const r = new TrackerEmbedRenderer('trk');
    r.render();
    const frame1 = dom.window.document.querySelector('iframe.cc-trk-frame');
    assert.ok(frame1, 'iframe mounted on first render');
    const src1 = frame1!.getAttribute('src');
    assert.ok((src1 || '').endsWith('/console/tracker'), 'iframe points at /console/tracker');
    r.render(); // hub-refresh re-render
    const frame2 = dom.window.document.querySelector('iframe.cc-trk-frame');
    assert.equal(frame2, frame1, 'same iframe element across re-render (not recreated → no reload)');
    assert.equal(frame2!.getAttribute('src'), src1, 'src unchanged (no re-navigation)');
    assert.equal(dom.window.document.querySelectorAll('iframe.cc-trk-frame').length, 1, 'exactly one iframe');
  });

  test('FX886 re-render refreshes the heading without replacing the iframe', () => {
    const r = new TrackerEmbedRenderer('trk');
    r.render();
    const frame1 = dom.window.document.querySelector('iframe.cc-trk-frame');
    const h3 = dom.window.document.querySelector('.cc-trk-bar h3')!;
    h3.textContent = 'STALE'; // simulate drift
    r.render();
    assert.equal(dom.window.document.querySelector('.cc-trk-bar h3')!.textContent, 'Development Tracker',
      'heading refreshed on idempotent re-render');
    assert.equal(dom.window.document.querySelector('iframe.cc-trk-frame'), frame1, 'iframe untouched');
  });

  test('FX886 rebuilds a fresh iframe when the container was emptied (recovery)', () => {
    const r = new TrackerEmbedRenderer('trk');
    r.render();
    const frame1 = dom.window.document.querySelector('iframe.cc-trk-frame');
    (r as any).container.innerHTML = ''; // e.g. sub-view switched away then back
    r.render();
    const frame2 = dom.window.document.querySelector('iframe.cc-trk-frame');
    assert.ok(frame2, 'iframe rebuilt after container clear');
    assert.notEqual(frame2, frame1, 'fresh element after teardown (recovery path)');
  });
});
