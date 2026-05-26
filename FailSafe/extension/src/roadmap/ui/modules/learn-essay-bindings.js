// FailSafe Command Center — Learn-tab essay event bindings (Section 4 razor
// split). Extracted from `learn-essay-list.js` to keep that renderer under
// 250L. Hosts the two event handlers wired after `renderEssayList` mounts:
//   - Mark-as-read button (suppresses the contextual relevant-now badge for
//     the rest of the session via sessionStorage flag)
//   - Acceptance-criteria template Copy button (writes the canonical template
//     string to the clipboard, best-effort)

import { ACCEPTANCE_TEMPLATE } from './learn-essay-templates.js';

const ACK_PREFIX = 'fs-learn-nudge-dismissed:';

function bindAckButtons(scope) {
  scope.querySelectorAll('[data-learn-essay-ack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const anchor = btn.getAttribute('data-learn-essay-ack') || '';
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage) {
          sessionStorage.setItem(ACK_PREFIX + anchor, '1');
        }
      } catch (_e) { /* ignore */ }
      const card = btn.closest ? btn.closest('article.cc-learn-essay-card') : null;
      if (card) {
        card.setAttribute('data-relevant-now', 'false');
        card.classList.remove('cc-learn-essay-card--relevant');
        const badge = card.querySelector('.cc-learn-essay-relevant-now');
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        if (btn.parentNode) btn.parentNode.removeChild(btn);
      }
    });
  });
}

function bindCopyButtons(scope) {
  scope.querySelectorAll('[data-acceptance-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ACCEPTANCE_TEMPLATE);
        }
      } catch (_e) { /* ignore */ }
      const original = btn.textContent || 'Copy';
      btn.textContent = 'Copied';
      btn.setAttribute('aria-label', 'Template copied');
      try {
        setTimeout(() => {
          btn.textContent = original;
          btn.setAttribute('aria-label', 'Copy template to clipboard');
        }, 1500);
      } catch (_e) { /* ignore */ }
    });
  });
}

/**
 * Wire all event handlers for a rendered essay-list scope. Idempotent —
 * subsequent calls bind to the new DOM (each `renderEssayList` call replaces
 * innerHTML so prior listeners are garbage-collected with their nodes).
 *
 * @param {Element|Document|null} root  scope to query within; defaults to document.
 */
export function bindEssayAck(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelectorAll !== 'function') return;
  bindCopyButtons(scope);
  bindAckButtons(scope);
}
