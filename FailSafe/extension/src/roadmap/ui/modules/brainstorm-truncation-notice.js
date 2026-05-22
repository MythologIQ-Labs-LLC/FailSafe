// FailSafe Command Center — Brainstorm Truncation Notice (B132)
// Tiny leaf: builds + shows a visible, non-blocking, dismissible inline
// notice when the server truncated a brainstorm node label. No toast
// affordance exists in brainstorm-graph.js — this is the concrete element.

const NOTICE_CLASS = 'bs-truncation-notice';
const NOTICE_TEXT = 'Label shortened to 200 characters.';

/**
 * Inserts (once) and shows the truncation notice next to the graph toolbar.
 * Idempotent: a second call reuses the existing element. No-op when there is
 * no document (non-DOM test contexts) or no toolbar to anchor to.
 */
export function showTruncationNotice(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const toolbar = d.querySelector('.cc-bs-toolbar');
  const host = toolbar?.parentNode;
  if (!host) return null;
  let notice = host.querySelector('.' + NOTICE_CLASS);
  if (!notice) {
    notice = d.createElement('div');
    notice.className = NOTICE_CLASS;
    notice.setAttribute('role', 'status');
    const text = d.createElement('span');
    text.textContent = NOTICE_TEXT;
    const dismiss = d.createElement('button');
    dismiss.className = 'bs-truncation-notice-dismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => notice.remove());
    notice.appendChild(text);
    notice.appendChild(dismiss);
    host.insertBefore(notice, toolbar.nextSibling);
  }
  // Visibility is driven by the .bs-truncation-notice CSS class; clear any
  // stale inline override so a reused element re-shows after a prior hide.
  notice.style.removeProperty('display');
  return notice;
}
