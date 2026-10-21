/**
 * Workspace › Taxonomy — the editor's draft (B331). Pure: no fetch, no timers.
 *
 * A draft is one generation of the operator's rows, built from a loaded (or just
 * saved) config. Each row keeps its loaded entry index (`src`, null for an added row),
 * the text each field showed when the generation was built (`shown`, kept in JS
 * because an <input> strips CR/LF from what it displays) and its current values.
 * Row ids come from one module-level counter that is never reset: an id is unique
 * across every generation of every editor instance, so a detached root from an
 * older generation can never be read back into a newer draft.
 */

import { text, isPlainObject, list } from './tracker-taxonomy-drift.js';

export const FIELDS = {
  programs: ['key', 'name', 'accent'],
  verticals: ['key', 'name'],
  agents: ['key', 'name', 'program', 'vertical', 'patterns'],
};

export const KINDS = ['programs', 'verticals', 'agents'];

let nextRowId = 1;

/** A JSON copy (the POST body is JSON anyway); undefined stays undefined. */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function fieldText(item, f) {
  return f === 'patterns' && Array.isArray(item[f]) ? item[f].map(text).join(', ') : text(item[f]);
}

function newRow(kind, item, src) {
  const it = isPlainObject(item) ? item : {};
  const values = {};
  for (const f of FIELDS[kind]) values[f] = src === null ? '' : fieldText(it, f);
  const row = { id: `r${nextRowId++}`, src, values, shown: { ...values } };
  if (kind === 'verticals') { row.xc = !!it.crossCutting && src !== null; row.xcShown = row.xc; }
  return row;
}

/** One generation of rows from `config`. */
export function draftFromConfig(config) {
  const draft = { loaded: {} };
  for (const kind of KINDS) {
    const items = list(config && config[kind]);
    draft[kind] = items.map((it, i) => newRow(kind, it, i));
    draft.loaded[kind] = items.length;
  }
  return draft;
}

export function addRow(draft, kind) {
  draft[kind].push(newRow(kind, {}, null));
}

export function deleteRow(draft, kind, id) {
  draft[kind] = draft[kind].filter((r) => r.id !== id);
}

/** Every row by id, across all kinds. */
export function rowsById(draft) {
  const byId = new Map();
  if (draft) for (const kind of KINDS) for (const r of draft[kind]) byId.set(r.id, r);
  return byId;
}

/** Read the live inputs of `root` into their rows (by data-row-id; unknown ids ignored).
 *  `painted(el)` is { shown, value }: what the control displayed when painted and the row
 *  value it was painted from. A control that still displays what it showed takes back
 *  that value (so an edit the operator reverted is reverted, and an untouched value the
 *  input could not display exactly, CR/LF, is kept); otherwise it takes what it displays. */
export function syncDraftFromDom(draft, root, painted) {
  if (!draft || !root) return;
  const byId = rowsById(draft);
  for (const el of root.querySelectorAll('.cc-tax-row[data-row-id]')) {
    const row = byId.get(el.getAttribute('data-row-id'));
    if (!row) continue;
    for (const inp of el.querySelectorAll('.cc-tax-in')) {
      const f = inp.getAttribute('data-field');
      const p = painted(inp);
      if (p && f in row.values) row.values[f] = inp.value !== p.shown ? inp.value : p.value;
    }
    const xc = el.querySelector('[data-field="crossCutting"]');
    const p = xc && painted(xc);
    if (p && 'xc' in row) row.xc = xc.checked !== p.shown ? xc.checked : p.value;
  }
}

/** True when any row was added, deleted or changed since the generation was built. */
export function isDirty(draft) {
  if (!draft) return false;
  return KINDS.some((kind) => {
    const rows = draft[kind];
    if (rows.filter((r) => r.src !== null).length !== draft.loaded[kind]) return true;
    return rows.some((r) => r.src === null
      || Object.keys(r.values).some((f) => r.values[f] !== r.shown[f])
      || ('xc' in r && r.xc !== r.xcShown));
  });
}

/** The config to save (#548 rules): an untouched loaded row passes through exactly as
 *  loaded; a touched row = a copy of its loaded entry + only its changed fields; a row is
 *  dropped only when it was added and given no key, or its key was cleared. */
export function collectFromDraft(config, draft) {
  const read = (kind) => {
    const out = [];
    for (const row of draft[kind]) {
      const loaded = row.src !== null;
      const base = loaded ? list(config && config[kind])[row.src] : undefined;
      const changed = Object.keys(row.values).filter((f) => row.values[f] !== row.shown[f]);
      const xcChanged = 'xc' in row && row.xc !== row.xcShown;
      if (loaded && !changed.length && !xcChanged) { out.push(clone(base)); continue; }
      const o = isPlainObject(base) ? clone(base) : {};
      let keyCleared = false;
      for (const f of changed) {
        const v = row.values[f].trim();
        if (f === 'patterns') o.patterns = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
        else if (v) o[f] = v;
        else { delete o[f]; if (f === 'key') keyCleared = true; }
      }
      if (xcChanged) { if (row.xc) o.crossCutting = true; else delete o.crossCutting; }
      if (keyCleared || (!loaded && !o.key)) continue;
      out.push(o);
    }
    return out;
  };
  return Object.fromEntries(KINDS.map((k) => [k, read(k)]));
}
