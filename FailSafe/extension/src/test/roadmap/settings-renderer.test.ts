// Functional tests for SettingsRenderer (FX241 + FX230 + FX242).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module — resolved from the compiled out/ tree so
// settings.js's transitive `education-lesson.js → education/lessons.js` import
// chain resolves at runtime (no .js sibling exists under src/).
import { SettingsRenderer } from '../../roadmap/ui/modules/settings.js';

interface MockStore {
  theme: string;
  voice?: any;
  notifications?: any;
  brainstorm?: any;
  getTheme: () => string;
  setTheme: (t: string) => void;
  getVoiceSettings?: () => any;
  setVoiceSettings?: (v: any) => void;
  getNotificationSettings?: () => any;
  setNotificationSettings?: (v: any) => void;
  getBrainstormSettings?: () => any;
  setBrainstormSettings?: (v: any) => void;
}

function makeStore(initial: string = 'mythiq'): MockStore {
  const data: Record<string, any> = {
    theme: initial,
    voice: { language: 'en-US' },
    notifications: { enabled: true },
    brainstorm: { autoExtract: false },
    audio: { input: 'default', output: 'default' },
  };
  const store: any = {
    get theme() { return data.theme; },
    set theme(v: string) { data.theme = v; },
    get: (key: string) => data[key],
    set: (key: string, value: any) => { data[key] = value; },
    getTheme: () => data.theme,
    setTheme: (t: string) => { data.theme = t; },
    getVoiceSettings: () => data.voice,
    setVoiceSettings: (v: any) => { data.voice = v; },
    getNotificationSettings: () => data.notifications,
    setNotificationSettings: (v: any) => { data.notifications = v; },
    getBrainstormSettings: () => data.brainstorm,
    setBrainstormSettings: (v: any) => { data.brainstorm = v; },
  };
  return store as MockStore;
}

function setupDom(): { cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="set-root"></div></body></html>', { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  return {
    cleanup: () => {
      (global as any).window = prevWin;
      (global as any).document = prevDoc;
    },
  };
}

suite('SettingsRenderer (FX241 + FX230 + FX242)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX230 render — emits theme chip buttons (cc-theme-select class)', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore('mythiq') });
    r.render({ version: '5.1.0' });
    const chips = document.querySelectorAll('.cc-theme-select');
    assert.ok(chips.length > 0, 'theme chips should render');
  });

  test('FX230 render — current theme has "active" class', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore('aurora') });
    r.render({ version: '5.1.0' });
    const active = document.querySelector('.cc-theme-select.active') as HTMLElement;
    assert.ok(active, 'one active chip expected');
    assert.equal(active.dataset.theme, 'aurora');
  });

  test('FX230 — clicking a chip calls store.setTheme + toggles active class', () => {
    const store = makeStore('mythiq');
    const r = new SettingsRenderer('set-root', { store });
    r.render({});
    const chips = document.querySelectorAll('.cc-theme-select');
    let target: HTMLElement | null = null;
    for (const c of Array.from(chips)) {
      if ((c as HTMLElement).dataset.theme !== 'mythiq') { target = c as HTMLElement; break; }
    }
    if (!target) {
      // Only one theme available — test skipped
      return;
    }
    const newTheme = target.dataset.theme!;
    target.click();
    assert.equal(store.theme, newTheme);
    assert.ok(target.classList.contains('active'));
  });

  test('FX242 render — Configuration card shows current theme + version + server', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore('mythiq') });
    r.render({ version: '5.1.0' });
    const html = document.getElementById('set-root')!.innerHTML;
    assert.match(html, /Theme:.*<strong>mythiq<\/strong>/);
    assert.match(html, /Version:.*<strong>5\.1\.0<\/strong>/);
    assert.match(html, /Server:.*localhost:9999/);
  });

  test('FX242 render — missing version falls back to "unknown"', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({});
    assert.match(document.getElementById('set-root')!.innerHTML, /Version:.*<strong>unknown<\/strong>/);
  });

  test('FX241 render — caches hubData for subsequent renders without args', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({ version: '1.0' });
    r.render({}); // empty hub — should reuse last cached
    assert.match(document.getElementById('set-root')!.innerHTML, /Version:.*<strong>1\.0<\/strong>/);
  });

  test('FX241 onEvent — skills.install.progress accumulates invocations', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({});
    r.onEvent({ type: 'skills.install.progress', invocation: { step: 'a' } });
    r.onEvent({ type: 'skills.install.progress', invocation: { step: 'b' } });
    assert.equal(r._installState.running, true);
    assert.equal(r._installState.invocations.length, 2);
  });

  test('FX241 onEvent — skills.install.complete sets running=false + lastReport', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({});
    const report = {
      invocations: [{ step: 'a' }],
      ok: true,
      totalInstalled: 1,
      destinations: ['.claude/skills'],
      failures: [],
    };
    r.onEvent({ type: 'skills.install.complete', report });
    assert.equal(r._installState.running, false);
    assert.equal(r._installState.lastReport.totalInstalled, 1);
  });

  test('FX241 onEvent — null/non-object event ignored without crash', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({});
    assert.doesNotThrow(() => r.onEvent(null));
    assert.doesNotThrow(() => r.onEvent('not-an-object'));
    assert.doesNotThrow(() => r.onEvent({}));
  });

  test('FX241 destroy — clears container HTML', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({});
    assert.ok(document.getElementById('set-root')!.innerHTML.length > 0);
    r.destroy();
    assert.equal(document.getElementById('set-root')!.innerHTML, '');
  });

  test('FX242 — FailSafe Pro card has About button (not download link)', () => {
    const r = new SettingsRenderer('set-root', { store: makeStore() });
    r.render({});
    const html = document.getElementById('set-root')!.innerHTML;
    assert.match(html, /About FailSafe Pro/);
    assert.match(html, /open-failsafe-pro-about/);
  });
});
