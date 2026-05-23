// FailSafe Command Center — Education micro-lesson affordance (Phase 3).
//
// RD-3: leaf webview module. Depends only on the lesson registry. Renders an
// opt-in, dismissible, collapsed-by-default "What does this mean?" expander
// as an HTML STRING so it is safe to interpolate directly into host
// innerHTML templates. Returns the empty string when education is disabled
// or no lesson exists for the anchor.

import { getLesson } from '../../../education/lessons.js';

const DISMISS_PREFIX = 'fs-edu-dismissed:';

// HTML-escape lesson body text before interpolation (lesson copy is static
// today, but escaping keeps the affordance safe if content ever varies).
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Read the webview storage backend. Prefer localStorage; fall back to
// sessionStorage; tolerate environments where neither exists.
function getStore() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (_e) { /* access can throw in sandboxed webviews */ }
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage;
  } catch (_e) { /* ignore */ }
  return null;
}

function isDismissed(anchor) {
  const store = getStore();
  if (!store) return false;
  try {
    return store.getItem(DISMISS_PREFIX + anchor) === '1';
  } catch (_e) {
    return false;
  }
}

function markDismissed(anchor) {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(DISMISS_PREFIX + anchor, '1');
  } catch (_e) { /* ignore quota / access errors */ }
}

/**
 * Render the micro-lesson expander for `anchor` as an HTML string.
 *
 * @param {string} anchor                       stable governance-moment key.
 * @param {{enabled?:boolean, proficiency?:string}} cfg  education settings.
 * @returns {string} collapsed <details> expander markup, or '' when
 *          education is disabled, no lesson exists, or it was dismissed.
 */
export function renderLesson(anchor, cfg) {
  const enabled = !!(cfg && cfg.enabled);
  if (!enabled) return '';
  if (!anchor) return '';
  if (isDismissed(anchor)) return '';

  const proficiency = (cfg && cfg.proficiency) || 'beginner';
  const body = getLesson(anchor, proficiency);
  if (!body) return '';

  const safeAnchor = escapeHtml(anchor);
  const safeBody = escapeHtml(body);

  return [
    `<details class="cc-edu-lesson" data-edu-anchor="${safeAnchor}">`,
    '<summary class="cc-edu-lesson-summary">',
    '<span class="cc-edu-lesson-icon" aria-hidden="true">?</span>',
    '<span class="cc-edu-lesson-label">What does this mean?</span>',
    '</summary>',
    '<div class="cc-edu-lesson-body">',
    `<p class="cc-edu-lesson-text">${safeBody}</p>`,
    `<button type="button" class="cc-edu-lesson-dismiss" data-edu-dismiss="${safeAnchor}">`,
    'Dismiss',
    '</button>',
    '</div>',
    '</details>',
  ].join('');
}

/**
 * Wire dismiss controls within `root`. Clicking a dismiss button removes its
 * expander from the DOM and persists the dismissed state per-anchor so the
 * lesson does not re-render on the next renderLesson() call.
 *
 * @param {Document|Element} root  scope to bind within (defaults to document).
 */
export function bindLessonDismiss(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelectorAll !== 'function') return;

  const buttons = scope.querySelectorAll('[data-edu-dismiss]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      const anchor = btn.getAttribute('data-edu-dismiss');
      if (anchor) markDismissed(anchor);
      const expander = btn.closest
        ? btn.closest('.cc-edu-lesson')
        : null;
      if (expander && expander.parentNode) {
        expander.parentNode.removeChild(expander);
      }
    });
  });
}
