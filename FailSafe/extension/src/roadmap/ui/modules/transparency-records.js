import { escapeSelectorValue } from './escape-selector.js';

export function eventTimestamp(entry) {
  return entry?.payload?.timestamp || entry?.time || '';
}

export function eventId(entry) {
  return entry?.payload?.id || entry?.payload?.eventId || entry?.payload?.ledgerEntryId || entry?.id || '';
}

export function eventKey(entry) {
  return eventId(entry) || [entry?.type, eventTimestamp(entry), entry?.summary].filter(Boolean).join('|');
}

export function recordLevel(entry) {
  const value = String(
    entry?.payload?.decision || entry?.payload?.verdict || entry?.payload?.policyVerdict || '',
  ).toUpperCase();
  if (['BLOCK', 'ESCALATE', 'QUARANTINE', 'VETO', 'FAIL'].includes(value)) return 'violation';
  if (value === 'WARN' || value === 'WARNING') return 'warn';
  return 'pass';
}

export function summarizeTransparencyEvent(event) {
  const payload = event?.payload || event || {};
  const type = String(event?.type || payload.type || 'unknown');
  if (/sentinel\.verdict|verdict/i.test(type)) {
    const decision = String(payload.decision || payload.verdict || payload.policyVerdict || 'VERDICT');
    const risk = payload.riskGrade ? ` ${payload.riskGrade}` : '';
    const subject = payload.filePath || payload.path || payload.phase || payload.target || payload.summary || 'workspace';
    const reason = payload.reason || payload.message || payload.matchedPattern || '';
    return `Sentinel ${decision}${risk} - ${subject}${reason ? ` (${reason})` : ''}`;
  }
  const summary = payload.message || payload.summary;
  if (summary) return String(summary);
  const raw = JSON.stringify(payload);
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

// FX917: deep-link focus latch, keyed on the target VALUE so it survives
// refilter()'s element recreation and re-arms on a hashchange to a new
// target. Module state — the highlighter re-runs on every card append
// (live events, buffer flush, refilter), and an unguarded focus() would
// repeatedly steal keyboard/AT focus (VETO #554 F1).
let focusedDeepLinkTarget = null;
let focusedDeepLinkRow = null;

export function resetDeepLinkFocusLatch() {
  focusedDeepLinkTarget = null;
  focusedDeepLinkRow = null;
}

// Fire on first landing per target, OR re-anchor when a destructive re-render
// (render()'s innerHTML rebuild — e.g. the Console's WS-init/hashchange paths)
// destroyed the focused row while focus sits idle. "Idle" includes a detached
// activeElement (jsdom may skip Chromium's focus-fixup-to-body on removal).
// Never fires while a user holds focus on a connected element. One AT
// re-announcement per destructive re-render is expected here — not focus
// flapping (audit #556 N6).
function maybeFocusDeepLinkRow(row, target) {
  const doc = row.ownerDocument;
  const active = doc ? doc.activeElement : null;
  const focusIdle = !active || active === doc.body || !active.isConnected;
  const firstLanding = focusedDeepLinkTarget !== target;
  const reAnchor = !firstLanding && focusedDeepLinkRow
    && !focusedDeepLinkRow.isConnected && focusIdle;
  if (!firstLanding && !reAnchor) return;
  focusedDeepLinkTarget = target;
  focusedDeepLinkRow = row;
  row.setAttribute('tabindex', '-1');
  row.focus?.({ preventScroll: true });
}

export function highlightRecordFromHash(container) {
  const hash = (typeof window !== 'undefined' && window.location?.hash) || '';
  const query = hash.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const idTarget = params.get('id') || params.get('eventId');
  if (idTarget) {
    container.querySelectorAll('.cc-transparency-record').forEach((row) => {
      if (row.getAttribute('data-event-id') !== idTarget) row.remove();
    });
  }
  const target = idTarget || params.get('verdict') || params.get('event');
  if (!target || !container) return;
  const safeTarget = escapeSelectorValue(target);
  const row = container.querySelector(`[data-event-id="${safeTarget}"],[data-event-ts="${safeTarget}"]`);
  if (!row) return;
  maybeFocusDeepLinkRow(row, target);
  row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  row.classList.add('cc-verdict--highlighted');
  setTimeout(() => row.classList.remove('cc-verdict--highlighted'), 3000);
}

export function hasAuditHashFilter() {
  const hash = (typeof window !== 'undefined' && window.location?.hash) || '';
  const params = new URLSearchParams(hash.split('?')[1] || '');
  // `verdict` deep links (Monitor sentinel alert) must bypass the default
  // same-day date filter like `id` links do, or older verdicts never render.
  return Boolean(params.get('id') || params.get('eventId') || params.get('verdict'));
}
