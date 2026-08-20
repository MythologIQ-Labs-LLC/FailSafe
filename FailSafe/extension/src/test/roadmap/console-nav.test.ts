// Functional tests for console-nav openConsole (FX916).
//
// The Monitor's compact UI runs in two host contexts: embedded in the sidebar
// webview's iframe (window.parent !== window; popups sandboxed) and served
// directly in a browser tab. openConsole must relay via postMessage in the
// first and window.open in the second — a dead click in either context is the
// FX916 regression this suite pins.
//
// Pattern reference: sentinel-monitor.test.ts:14 (untyped JS module import).

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { openConsole } from '../../../src/roadmap/ui/modules/console-nav.js';

interface NavCalls {
  posted: unknown[];
  opened: Array<{ url: string; target: string }>;
}

function fakeWin(embedded: boolean): { win: any; calls: NavCalls } {
  const calls: NavCalls = { posted: [], opened: [] };
  const win: any = {
    open: (url: string, target: string) => calls.opened.push({ url, target }),
  };
  win.parent = embedded
    ? { postMessage: (msg: unknown) => calls.posted.push(msg) }
    : win;
  return { win, calls };
}

suite('console-nav openConsole (FX916)', () => {
  test('embedded window — posts failsafe.openConsole with the route, never window.open', () => {
    const { win, calls } = fakeWin(true);
    openConsole('governance:audit?verdict=2026-08-20T12%3A00%3A00.000Z', win);
    assert.deepEqual(calls.posted, [
      { type: 'failsafe.openConsole', route: 'governance:audit?verdict=2026-08-20T12%3A00%3A00.000Z' },
    ], 'relay message carries the exact route');
    assert.equal(calls.opened.length, 0, 'sandboxed window.open must not be attempted when embedded');
  });

  test('top-level window — opens /command-center.html#<route>, posts nothing', () => {
    const { win, calls } = fakeWin(false);
    openConsole('governance', win);
    assert.equal(calls.posted.length, 0);
    assert.deepEqual(calls.opened, [{ url: '/command-center.html#governance', target: '_blank' }],
      'browser-served path keeps direct navigation (hash via navigationHash)');
  });

  test('throwing parent.postMessage — falls through to window.open (no dead click)', () => {
    const { win, calls } = fakeWin(true);
    win.parent = { postMessage: () => { throw new Error('cross-origin'); } };
    openConsole('governance', win);
    assert.deepEqual(calls.opened, [{ url: '/command-center.html#governance', target: '_blank' }]);
  });
});
