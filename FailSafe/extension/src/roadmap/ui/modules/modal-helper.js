// FailSafe Command Center — Shared accessible modal helper (B198 Phase 2).
//
// One overlay implementation for every modal in the roadmap UI. Provides
// role="dialog" + aria-modal, focus save/restore, a Tab/Shift+Tab focus
// trap, and Escape-to-close. Renderers import this; it imports no renderer
// (one-way dependency — RD-2 / Boundary rule 1).

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Collect the focusable elements inside an element, in DOM order. */
function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE));
}

/** Trap Tab/Shift+Tab focus within the modal's focusable elements. */
function trapTab(event, modal) {
  const items = focusables(modal);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Open an accessible modal.
 * @param {{title:string, bodyHtml:string, onClose?:() => void}} opts
 *   bodyHtml is caller-controlled markup; callers escape any dynamic strings.
 * @returns {{ close: () => void }}
 */
export function openModal({ title, bodyHtml, onClose }) {
  const previousFocus = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'cc-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', String(title || 'Dialog'));

  const modal = document.createElement('div');
  modal.className = 'cc-modal';
  modal.innerHTML = bodyHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    onClose?.();
  };

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      trapTab(event, modal);
    }
  }
  document.addEventListener('keydown', onKeydown, true);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  const initial = focusables(modal)[0] || modal;
  initial.focus?.();

  return { close };
}
