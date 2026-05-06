// FailSafe Command Center — Brainstorm Export
// JSON-export pipeline for the brainstorm graph. Extracted from brainstorm-graph.js
// per plan v4.10.1a (B130) so error toasts respect notification severity gating
// and filenames carry timezone offset for unambiguous chronological ordering.

import { showStatusGated } from './notifications.js';

export async function exportBrainstormJSON(showStatusFn, store) {
  try {
    const res = await fetch('/api/v1/brainstorm/graph');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brainstorm-${buildExportFilename(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[BrainstormExport] exportJSON failed:', err);
    showStatusGated(
      'error',
      `Export failed: ${err?.message || 'unknown'}`,
      'var(--accent-red)',
      showStatusFn,
      store,
    );
  }
}

export function buildExportFilename(d) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const offsetTotalMin = -d.getTimezoneOffset();
  const sign = offsetTotalMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetTotalMin);
  const offHh = pad2(Math.floor(absMin / 60));
  const offMm = pad2(absMin % 60);
  return `${yyyy}-${mm}-${dd}-${hh}-${mi}-${ss}${sign}${offHh}${offMm}`;
}
