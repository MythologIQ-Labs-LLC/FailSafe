/**
 * Workspace › Taxonomy — markup, styles and focus helpers (B331). Pure functions of the
 * editor's state; every server or operator string goes through esc().
 */

import { esc, driftHtml, DRIFT_STYLE } from './tracker-taxonomy-drift.js';
import { FIELDS } from './tracker-taxonomy-model.js';

export const STYLE_ID = 'cc-tax-style';
export const STYLE = DRIFT_STYLE + `
.cc-tax { display:flex; flex-direction:column; gap:14px; height:100%; overflow:auto; padding:4px 2px; }
.cc-tax-head h3 { margin:0; font-size:1.02rem; }
.cc-tax-head .cc-tax-sub { color:#9aa5b4; font-size:.82rem; }
.cc-tax-section { border:1px solid var(--border-rim,#202938); border-radius:10px; padding:10px 12px; }
.cc-tax-sec-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-weight:600; font-size:.9rem; }
.cc-tax-add { background:#141a22; color:#cfe; border:1px solid #3a4658; border-radius:7px; padding:3px 10px; cursor:pointer; font:inherit; font-size:.8rem; }
.cc-tax-add:hover { border-color:#68d391; }
.cc-tax-rows { display:flex; flex-direction:column; gap:6px; }
.cc-tax-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.cc-tax-in { background:#0c0f14; color:#f1efe7; border:1px solid #2a3340; border-radius:6px; padding:4px 8px; font:inherit; font-size:.82rem; min-width:90px; flex:1; }
.cc-tax-xc { display:inline-flex; align-items:center; gap:4px; color:#9aa5b4; font-size:.78rem; white-space:nowrap; }
.cc-tax-del { background:none; color:#e06c75; border:1px solid #3a4658; border-radius:6px; padding:2px 9px; cursor:pointer; font:inherit; }
.cc-tax-del:hover { border-color:#e06c75; }
.cc-tax-bar { display:flex; align-items:center; gap:12px; padding-top:4px; }
.cc-tax-save { background:#173a2a; color:#9ff0c0; border:1px solid #2f6b4d; border-radius:8px; padding:6px 16px; cursor:pointer; font:inherit; font-weight:600; }
.cc-tax-save:hover { border-color:#68d391; }
.cc-tax [disabled] { opacity:.55; cursor:not-allowed; }
.cc-tax-status { color:#9aa5b4; font-size:.82rem; }
.cc-tax-dirty { color:#f6ad55; font-size:.82rem; }
.cc-tax-error { border:1px solid #6b2f2f; border-radius:10px; padding:8px 12px; color:#fc8181; font-size:.86rem; }
.cc-tax-conflict { border:1px solid #6b4f2a; border-radius:10px; padding:8px 12px; color:#f6ad55; font-size:.86rem; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.cc-tax-reload { background:#141a22; color:#f6ad55; border:1px solid #6b4f2a; border-radius:7px; padding:3px 10px; cursor:pointer; font:inherit; font-size:.8rem; }
`;

const CONFLICT_TEXT = {
  disk: 'The taxonomy file changed on disk after this view loaded it. Your edits are kept here and nothing was saved.',
  elsewhere: 'The taxonomy was changed elsewhere (another Console window or the file on disk). Your edits are kept here; Save will be refused until you reload.',
};

const HEAD = `<div class="cc-tax-head">
        <h3>Tracker Taxonomy</h3>
        <span class="cc-tax-sub">operator-declared programs · verticals · agents — Save writes docs/roadmap/tracker-config.yaml + a governed directive the next cycle must consult. Each vertical's functionality is checked against the Console navigation and is not edited here.</span>
      </div>`;

export function errorHtml(message) {
  return `<div class="cc-tax">${HEAD}<div class="cc-tax-error" role="alert">${esc(message)}</div></div>`;
}

function rowHtml(kind, row, dis) {
  const inputs = FIELDS[kind].map((f) =>
    `<input class="cc-tax-in" data-field="${f}" value="${esc(row.values[f])}" placeholder="${f}"${dis}>`).join('');
  const xc = 'xc' in row
    ? `<label class="cc-tax-xc"><input type="checkbox" data-field="crossCutting"${row.xc ? ' checked' : ''}${dis}>cross-cutting</label>`
    : '';
  return `<div class="cc-tax-row" data-kind="${kind}" data-row-id="${esc(row.id)}">${inputs}${xc}<button class="cc-tax-del" data-del type="button"${dis}>×</button></div>`;
}

function sectionHtml(kind, label, rows, dis) {
  return `<div class="cc-tax-section" data-kind="${kind}">
      <div class="cc-tax-sec-head"><span>${esc(label)}</span><button class="cc-tax-add" data-add="${kind}" type="button"${dis}>+ add</button></div>
      <div class="cc-tax-rows">${rows.map((row) => rowHtml(kind, row, dis)).join('')}</div>
    </div>`;
}

/** The whole editor for `s` = { draft, dirty, saving, conflict, drift, source, status }. */
export function editorHtml(s) {
  const dis = s.saving ? ' disabled' : '';
  const conflict = s.conflict
    ? `<div class="cc-tax-conflict" role="alert"><span>${esc(CONFLICT_TEXT[s.conflict])}</span><button class="cc-tax-reload" data-act="reload" type="button"${dis}>Discard my edits and reload from disk</button></div>`
    : '';
  const status = s.status || (s.source ? `source: ${s.source}` : '');
  return `<div class="cc-tax"${s.dirty ? ' data-dirty="true"' : ''}>
      ${HEAD}
      ${conflict}
      ${driftHtml(s.drift, s.source)}
      ${sectionHtml('programs', 'Programs', s.draft.programs, dis)}
      ${sectionHtml('verticals', 'Verticals', s.draft.verticals, dis)}
      ${sectionHtml('agents', 'Agent mappings', s.draft.agents, dis)}
      <div class="cc-tax-bar">
        <button class="cc-tax-save" data-act="save" type="button"${dis}>Save taxonomy</button>
        <span class="cc-tax-dirty"${s.dirty ? '' : ' hidden'}>Unsaved changes</span>
        <span class="cc-tax-status" id="cc-tax-status">${esc(status)}</span>
      </div>
    </div>`;
}

/** The focused field of `root` (row id, field, caret), or null. */
export function focusState(root) {
  const a = root ? root.ownerDocument.activeElement : null;
  if (!a || !root.contains(a) || !a.getAttribute('data-field')) return null;
  let start = null;
  let end = null;
  try { start = a.selectionStart; end = a.selectionEnd; } catch { /* not a text field */ }
  return { id: a.closest('[data-row-id]')?.getAttribute('data-row-id'), field: a.getAttribute('data-field'), start, end };
}

/** Re-focus the same row id + field in a freshly painted `root` and restore its caret. */
export function restoreFocus(root, s) {
  if (!root || !s || !s.id) return;
  const el = root.querySelector(`[data-row-id="${s.id}"] [data-field="${s.field}"]`);
  if (!el) return;
  el.focus();
  try { if (s.start !== null) el.setSelectionRange(s.start, s.end); } catch { /* not a text field */ }
}
