// #601: page side of the shared app theme (ui/modules/theme-sync.js). Pages apply only supported
// theme names from the Console server, move the per-process theme key out of the address bar,
// change the theme only through the extension host, and retire the pre-#601 browser copy.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import * as themeSync from '../../../src/roadmap/ui/modules/theme-sync.js';

type Attrs = Map<string, string>;
function fakeDoc(initial?: string): { documentElement: { setAttribute(k: string, v: string): void; getAttribute(k: string): string | null }; attrs: Attrs } {
  const attrs: Attrs = new Map();
  if (initial) attrs.set('data-theme', initial);
  return {
    attrs,
    documentElement: {
      setAttribute: (k: string, v: string) => { attrs.set(k, v); },
      getAttribute: (k: string) => (attrs.has(k) ? attrs.get(k)! : null),
    },
  };
}

function fakeWin(href: string, opts: { legacy?: string | null } = {}) {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  if (opts.legacy !== undefined && opts.legacy !== null) local.set('fs-theme', opts.legacy);
  const replaced: string[] = [];
  return {
    session, local, replaced,
    location: { href },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
    sessionStorage: {
      getItem: (k: string) => (session.has(k) ? session.get(k)! : null),
      setItem: (k: string, v: string) => { session.set(k, v); },
      removeItem: (k: string) => { session.delete(k); },
    },
    localStorage: {
      getItem: (k: string) => (local.has(k) ? local.get(k)! : null),
      setItem: (k: string, v: string) => { local.set(k, v); },
      removeItem: (k: string) => { local.delete(k); },
    },
  };
}

interface Call { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }
function fakeFetch(reply: (call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: Call['init']) => {
    const call = { url, init };
    calls.push(call);
    const r = reply(call);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, impl };
}

suite('#601 theme-sync (page side of the shared theme)', () => {
  test('the supported themes are exactly the six Console themes', () => {
    assert.deepEqual([...themeSync.THEMES], ['pegasus', 'mythiq', 'midnight', 'aurora', 'crimson', 'atmosphere']);
  });

  test('applies every supported theme from a ui.theme message', () => {
    const doc = fakeDoc();
    for (const theme of themeSync.THEMES) {
      assert.equal(themeSync.handleThemeMessage({ type: 'ui.theme', theme }, doc), true);
      assert.equal(doc.attrs.get('data-theme'), theme);
    }
  });

  test('ignores forged, unknown and malformed theme messages', () => {
    const doc = fakeDoc('mythiq');
    const forged = [
      null, 'ui.theme', { type: 'failsafe.theme', theme: 'crimson' }, { type: 'ui.theme' },
      { type: 'ui.theme', theme: 'Crimson' }, { type: 'ui.theme', theme: 'dark' },
      { type: 'ui.theme', theme: 'crimson"] body { display:none } [x="' }, { type: 'ui.theme', theme: ['crimson'] },
      { type: 'ui.theme', theme: { toString: () => 'crimson' } },
    ];
    for (const msg of forged) themeSync.handleThemeMessage(msg, doc);
    assert.equal(doc.attrs.get('data-theme'), 'mythiq');
  });

  test('currentTheme falls back to the default for a missing or unsupported attribute', () => {
    assert.equal(themeSync.currentTheme(fakeDoc()), 'mythiq');
    assert.equal(themeSync.currentTheme(fakeDoc('neon')), 'mythiq');
    assert.equal(themeSync.currentTheme(fakeDoc('pegasus')), 'pegasus');
  });

  test('moves the theme key from the address bar into session storage', () => {
    const win = fakeWin('http://localhost:9376/?workspace=w&ui=console&fsThemeKey=abc123#governance:audit');
    assert.equal(themeSync.captureThemeKey(win), 'abc123');
    assert.equal(win.session.get('fs-theme-key'), 'abc123');
    assert.deepEqual(win.replaced, ['/?workspace=w&ui=console#governance:audit']);
    // A reload of the cleaned URL keeps the key for this tab only.
    const reloaded = { ...win, location: { href: 'http://localhost:9376/?workspace=w&ui=console' } };
    assert.equal(themeSync.captureThemeKey(reloaded), 'abc123');
  });

  test('requestTheme sends the key with a JSON POST and applies the confirmed theme', async () => {
    const win = fakeWin('http://localhost:9376/?ui=console&fsThemeKey=k1');
    const doc = fakeDoc('mythiq');
    const fetch = fakeFetch(() => ({ status: 200, body: { ok: true, theme: 'pegasus' } }));
    const result = await themeSync.requestTheme('pegasus', { win, doc, fetchImpl: fetch.impl });
    assert.deepEqual(result, { ok: true, theme: 'pegasus' });
    assert.equal(fetch.calls.length, 1);
    const { url, init } = fetch.calls[0];
    assert.equal(url, '/api/v1/ui/theme');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.headers?.['Content-Type'], 'application/json');
    assert.equal(init?.headers?.['X-FailSafe-Theme-Key'], 'k1');
    assert.deepEqual(JSON.parse(init?.body ?? '{}'), { theme: 'pegasus' });
    assert.equal(doc.attrs.get('data-theme'), 'pegasus');
    assert.equal(win.local.has('fs-theme'), false, 'no browser-local theme copy is written');
  });

  test('requestTheme rejects an unsupported theme without a request', async () => {
    const win = fakeWin('http://localhost:9376/?fsThemeKey=k1');
    const fetch = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    assert.deepEqual(await themeSync.requestTheme('neon', { win, doc: fakeDoc(), fetchImpl: fetch.impl }), { ok: false, reason: 'unsupported-theme' });
    assert.equal(fetch.calls.length, 0);
  });

  test('a refused key leaves the theme alone and is forgotten', async () => {
    const win = fakeWin('http://localhost:9376/?fsThemeKey=stale');
    const doc = fakeDoc('mythiq');
    const fetch = fakeFetch(() => ({ status: 401, body: { ok: false, error: 'theme-key' } }));
    assert.deepEqual(await themeSync.requestTheme('crimson', { win, doc, fetchImpl: fetch.impl }), { ok: false, reason: 'theme-key' });
    assert.equal(doc.attrs.get('data-theme'), 'mythiq');
    assert.equal(win.session.has('fs-theme-key'), false);
  });

  test('migrates a pre-#601 browser theme once, only when the shared theme was never set', async () => {
    const win = fakeWin('http://localhost:9376/?fsThemeKey=k1', { legacy: 'aurora' });
    const fetch = fakeFetch(() => ({ status: 200, body: { ok: true, theme: 'aurora' } }));
    const doc = fakeDoc('mythiq');
    assert.equal(await themeSync.migrateLegacyTheme({ theme: 'mythiq', explicit: false }, { win, doc, fetchImpl: fetch.impl }), true);
    assert.equal(fetch.calls.length, 1);
    assert.equal(doc.attrs.get('data-theme'), 'aurora');
    assert.equal(win.local.has('fs-theme'), false);
  });

  test('an explicit shared theme wins over the old browser copy, which is removed', async () => {
    const win = fakeWin('http://localhost:9376/?fsThemeKey=k1', { legacy: 'aurora' });
    const fetch = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    assert.equal(await themeSync.migrateLegacyTheme({ theme: 'crimson', explicit: true }, { win, doc: fakeDoc('crimson'), fetchImpl: fetch.impl }), false);
    assert.equal(fetch.calls.length, 0);
    assert.equal(win.local.has('fs-theme'), false);
  });

  test('a page without a key does not migrate, and keeps the old copy for one that can', async () => {
    const win = fakeWin('http://localhost:9376/', { legacy: 'aurora' });
    const fetch = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    assert.equal(await themeSync.migrateLegacyTheme({ theme: 'mythiq', explicit: false }, { win, doc: fakeDoc(), fetchImpl: fetch.impl }), false);
    assert.equal(fetch.calls.length, 0);
    assert.equal(win.local.get('fs-theme'), 'aurora');
  });

  test('refreshTheme applies only a supported theme from the server', async () => {
    const doc = fakeDoc('mythiq');
    await themeSync.refreshTheme(fakeFetch(() => ({ status: 200, body: { theme: 'midnight', explicit: true } })).impl, doc);
    assert.equal(doc.attrs.get('data-theme'), 'midnight');
    await themeSync.refreshTheme(fakeFetch(() => ({ status: 200, body: { theme: '<script>' } })).impl, doc);
    assert.equal(doc.attrs.get('data-theme'), 'midnight');
  });
});
