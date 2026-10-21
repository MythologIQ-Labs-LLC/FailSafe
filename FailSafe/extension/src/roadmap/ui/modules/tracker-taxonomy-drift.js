/**
 * Workspace › Taxonomy — the Console drift block (#548).
 *
 * Renders the server's `drift` report (GET/POST /api/v1/tracker/config): where each
 * declared vertical's functionality differs from the Console navigation. A report
 * only; it never edits the taxonomy. Every server string is escaped for both text
 * and attribute contexts.
 */

export const DRIFT_STYLE = `
.cc-tax-drift { border:1px solid #6b4f2a; border-radius:10px; padding:8px 12px; font-size:.84rem; color:#f6ad55; display:flex; flex-direction:column; gap:4px; }
.cc-tax-drift[data-state="clean"] { border-color:#2f5e44; color:#68d391; }
.cc-tax-drift[data-state="partial"] { border-color:#273140; color:#9aa5b4; }
.cc-tax-drift-row { color:#c9d1dc; }
.cc-tax-drift-row strong { color:#f1efe7; font-weight:600; }
`;

/** Any value as display text, never throwing: strings as is, other primitives via
 *  String, objects as JSON (an object with an odd `toString` cannot break a paint). */
export function text(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  try { return JSON.stringify(v) ?? ''; } catch { return ''; }
}

/** Escape for both text and attribute contexts (quotes included). */
export function esc(v) {
  return text(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
export const list = (v) => (Array.isArray(v) ? v : []);

const SOURCE_FILE = {
  config: 'docs/roadmap/tracker-config.yaml',
  derived: 'docs/roadmap/programs.yaml',
};

const isDrifted = (v) => isPlainObject(v)
  && (!v.declared || list(v.missing).length || list(v.extra).length || v.outOfOrder);

function driftRow(v) {
  const parts = [];
  if (!v.declared) parts.push('not declared');
  if (list(v.missing).length) parts.push(`missing: ${list(v.missing).map(text).join(', ')}`);
  if (list(v.extra).length) parts.push(`extra: ${list(v.extra).map(text).join(', ')}`);
  if (v.outOfOrder) parts.push('order differs');
  return `<div class="cc-tax-drift-row" data-drift-key="${esc(v.key)}"><strong>${esc(v.name || v.key)}</strong>: ${esc(parts.join(' · '))}</div>`;
}

/** The drift block for `drift` (or '' when there is nothing to compare). */
export function driftHtml(drift, source) {
  if (!isPlainObject(drift)) return '';
  const total = Number(drift.consoleVerticals) || 0;
  const matched = Number(drift.matched) || 0;
  if (!drift.applies) {
    if (matched < 1) return '';
    return `<div class="cc-tax-drift" data-state="partial">Not compared with the Console navigation: only ${esc(matched)} of ${esc(total)} vertical keys match.</div>`;
  }
  const rows = list(drift.verticals).filter(isDrifted);
  const unmatched = list(drift.unmatched);
  const tail = unmatched.length ? `<div class="cc-tax-drift-row">Not Console verticals: ${esc(unmatched.map(text).join(', '))}</div>` : '';
  if (!rows.length) {
    return `<div class="cc-tax-drift" data-state="clean">Verticals match the Console navigation (${esc(total)} of ${esc(total)}).${tail}</div>`;
  }
  const file = SOURCE_FILE[source] || 'the taxonomy file';
  return `<div class="cc-tax-drift" data-state="drift" role="status">
      <div>${esc(Number(drift.drifted) || rows.length)} of ${esc(total)} verticals differ from the Console navigation. Saving does not change functionality; edit ${esc(file)} to match.</div>
      ${rows.map(driftRow).join('')}${tail}
    </div>`;
}
