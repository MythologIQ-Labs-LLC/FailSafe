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
  const safeTarget = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target) : target.replace(/"/g, '\\"');
  const row = container.querySelector(`[data-event-id="${safeTarget}"],[data-event-ts="${safeTarget}"]`);
  if (!row) return;
  row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  row.classList.add('cc-verdict--highlighted');
  setTimeout(() => row.classList.remove('cc-verdict--highlighted'), 3000);
}

export function hasAuditHashFilter() {
  const hash = (typeof window !== 'undefined' && window.location?.hash) || '';
  const params = new URLSearchParams(hash.split('?')[1] || '');
  return Boolean(params.get('id') || params.get('eventId'));
}
