// #601: pages follow the one app theme held by the extension host.
//
// The theme is applied before first paint by /api/v1/ui/theme.js, then kept current from the
// Console server's `ui.theme` WebSocket message (and a re-read after each reconnect). Pages keep
// no theme of their own: browser storage differs between VS Code's webview and the system
// browser, so a local copy would compete with the shared one.
//
// Only a Console page that VS Code opened can change the theme. Its link carries a per-process
// key, which is moved into this tab's session storage and removed from the address bar.

export const THEMES = Object.freeze(['pegasus', 'mythiq', 'midnight', 'aurora', 'crimson', 'atmosphere']);
export const DEFAULT_THEME = 'mythiq';
const KEY_PARAM = 'fsThemeKey';
const KEY_STORAGE = 'fs-theme-key';
const LEGACY_THEME_STORAGE = 'fs-theme';

export function isTheme(value) {
  return typeof value === 'string' && THEMES.includes(value);
}

export function currentTheme(doc = document) {
  const theme = doc.documentElement.getAttribute('data-theme');
  return isTheme(theme) ? theme : DEFAULT_THEME;
}

const listeners = new Set();

// The newest theme state this page has applied (see ConsoleThemeSnapshot). A response that left the
// server before a newer change (a re-read racing a broadcast) must not undo that change.
let seen = { epoch: null, revision: -1 };
function isCurrent(state) {
  if (!state || typeof state.epoch !== 'string' || typeof state.revision !== 'number') return true;
  if (state.epoch === seen.epoch && state.revision < seen.revision) return false;
  seen = { epoch: state.epoch, revision: state.revision };
  return true;
}

/** Test hook: forget the newest applied state. */
export function resetThemeRevision() {
  seen = { epoch: null, revision: -1 };
}

/** Apply a supported theme to this document. Returns false (and changes nothing) otherwise. */
export function applyTheme(theme, doc = document) {
  if (!isTheme(theme)) return false;
  const changed = doc.documentElement.getAttribute('data-theme') !== theme;
  doc.documentElement.setAttribute('data-theme', theme);
  if (changed) notifyListeners(theme);
  return true;
}

function notifyListeners(theme) {
  for (const fn of [...listeners]) callQuietly(() => fn(theme));
}

/** Run a best-effort step; a failure must not stop the caller (storage, history, listeners). */
function callQuietly(step) {
  try { return step(); } catch { return undefined; }
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Handle a Console server WebSocket message. True when it was a theme update. */
export function handleThemeMessage(data, doc = document) {
  if (!data || data.type !== 'ui.theme') return false;
  if (!isTheme(data.theme) || !isCurrent(data)) return false;
  return applyTheme(data.theme, doc);
}

/** Re-read the shared theme (after a reconnect, when a change may have been missed). */
export async function refreshTheme(fetchImpl = fetch, doc = document) {
  try {
    const res = await fetchImpl('/api/v1/ui/theme', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    if (isTheme(body?.theme) && isCurrent(body)) applyTheme(body.theme, doc);
    return body;
  } catch {
    return null;
  }
}

function safeSession(win) {
  try { return win.sessionStorage; } catch { return null; }
}

/** Move a theme key from this page's address into session storage. Returns the key or ''. */
export function captureThemeKey(win = window) {
  const session = safeSession(win);
  const url = callQuietly(() => new URL(win.location.href));
  if (!url) return '';
  const fromUrl = url.searchParams.get(KEY_PARAM);
  if (fromUrl !== null) {
    url.searchParams.delete(KEY_PARAM);
    callQuietly(() => win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash));
    if (fromUrl && session) callQuietly(() => session.setItem(KEY_STORAGE, fromUrl));
    if (fromUrl) return fromUrl;
  }
  return callQuietly(() => session?.getItem(KEY_STORAGE)) || '';
}

export function canChangeTheme(win = window) {
  return captureThemeKey(win) !== '';
}

/**
 * Ask the extension host to change the shared theme. The page re-themes when the host
 * confirms, so every open Console and Monitor changes together.
 * Resolves { ok: true, theme } or { ok: false, reason }.
 */
export async function requestTheme(theme, { win = window, fetchImpl = fetch, doc = document } = {}) {
  if (!isTheme(theme)) return { ok: false, reason: 'unsupported-theme' };
  const key = captureThemeKey(win);
  if (!key) return { ok: false, reason: 'theme-key' };
  try {
    const res = await fetchImpl('/api/v1/ui/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-FailSafe-Theme-Key': key },
      body: JSON.stringify({ theme }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return refusedTheme(res, body, win);
    if (isTheme(body.theme) && isCurrent(body)) applyTheme(body.theme, doc);
    return { ok: true, theme: body.theme };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** A refused change. A 401 means the key is stale: forget it so the page shows read-only. */
function refusedTheme(res, body, win) {
  if (res.status === 401) callQuietly(() => safeSession(win)?.removeItem(KEY_STORAGE));
  return { ok: false, reason: body?.error || `http-${res.status}` };
}

/**
 * One-time move of a theme chosen before #601, when it lived in this browser's storage.
 * Only when the shared theme was never set and this page may change it; the old copy is
 * removed either way once the shared theme is known, so it cannot compete later.
 */
export async function migrateLegacyTheme(state, { win = window, fetchImpl = fetch, doc = document } = {}) {
  let legacy = null;
  try { legacy = win.localStorage.getItem(LEGACY_THEME_STORAGE); } catch { return false; }
  if (legacy === null || !state) return false;
  let migrated = false;
  if (!state.explicit && isTheme(legacy) && legacy !== state.theme) {
    // A page VS Code did not open keeps the old copy for one that it did.
    if (!canChangeTheme(win)) return false;
    migrated = (await requestTheme(legacy, { win, fetchImpl, doc })).ok;
    if (!migrated) return false;
  }
  try { win.localStorage.removeItem(LEGACY_THEME_STORAGE); } catch { /* ignore */ }
  return migrated;
}

/** A page with no WebSocket of its own (the SRE view): follow the shared theme. */
export function followThemeStandalone(win = window) {
  let attempts = 0;
  const connect = () => {
    let ws;
    try { ws = new win.WebSocket(`ws://${win.location.host}`); } catch { return; }
    ws.onopen = () => { attempts = 0; void refreshTheme(); };
    ws.onmessage = (event) => { try { handleThemeMessage(JSON.parse(event.data)); } catch { /* ignore */ } };
    ws.onclose = () => { attempts += 1; win.setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempts, 5))); };
  };
  connect();
}
