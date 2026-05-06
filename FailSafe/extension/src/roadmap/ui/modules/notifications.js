// FailSafe Command Center — Toast Severity Gating
// Tier-aware wrapper around showStatus. Reads the matching `notifications-*-toasts`
// store key for the supplied severity. Default behaviour is enabled — only the
// literal string 'false' silences the toast. Extracted per plan v4.10.1a so that
// info and error tiers can be configured independently from a single Settings UI.

const SEVERITY_KEYS = {
  info: 'notifications-info-toasts',
  error: 'notifications-error-toasts',
};

export function showStatusGated(severity, text, color, showStatusFn, store) {
  const key = SEVERITY_KEYS[severity];
  if (!key) return;
  const value = store?.get?.(key);
  const enabled = value !== 'false';
  if (enabled) showStatusFn?.(text, color);
}
