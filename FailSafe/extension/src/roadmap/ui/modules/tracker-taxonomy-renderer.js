/**
 * TrackerTaxonomyRenderer (FX891) — Workspace › Taxonomy sub-view.
 *
 * The operator-facing editor for the tracker's programs ∥ verticals + agent
 * mappings. Loads GET /api/v1/tracker/config (the operator config, or one
 * derived from programs.yaml), renders editable rows with add/remove, and Save
 * POSTs back — persisting docs/roadmap/tracker-config.yaml + emitting the
 * governed .failsafe/governance/tracker-taxonomy.directive.md the next cycle
 * must consult. Follows the TabGroup sub-view contract (render/destroy).
 *
 * #548: each vertical's functionality is checked against the Console navigation
 * (the server's `drift` report) and shown here; it is never edited here. Save
 * starts every row from the loaded entry and applies only the inputs the operator
 * changed, so fields the editor does not show (summary, functionality, backend,
 * agent evidence, …) are kept. Save sends the file fingerprint its load returned;
 * a file changed on disk since then answers 409 and nothing is written. Only a
 * successful Save moves the baseline (then the rows are re-stamped). A failed Save
 * keeps the operator's edits on screen only until the next hub payload repaints
 * this view (B331). A failed load shows the error and offers no Save, so an
 * unreadable file is never overwritten with an empty taxonomy.
 */

import { esc, text, isPlainObject, list, driftHtml, DRIFT_STYLE } from './tracker-taxonomy-drift.js';

const STYLE_ID = 'cc-tax-style';
const STYLE = DRIFT_STYLE + `
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
.cc-tax-status { color:#9aa5b4; font-size:.82rem; }
.cc-tax-error { border:1px solid #6b2f2f; border-radius:10px; padding:8px 12px; color:#fc8181; font-size:.86rem; }
`;

const FIELDS = {
  programs: ['key', 'name', 'accent'],
  verticals: ['key', 'name'],
  agents: ['key', 'name', 'program', 'vertical', 'patterns'],
};

const KINDS = ['programs', 'verticals', 'agents'];

const emptyConfig = () => ({ programs: [], verticals: [], agents: [] });

export class TrackerTaxonomyRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.config = emptyConfig();
    this.drift = null;
    /** sha256 of the file the editor loaded (null: absent); sent back on Save. */
    this.fingerprint = null;
    this.source = '';
    this.loadError = '';
    this._loaded = false;
  }

  ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  async render() {
    if (!this.container) return;
    this.ensureStyle();
    if (!this._loaded) await this.fetchConfig();
    this.paint();
  }

  /** A load counts only with an ok status, a JSON body and a `config` object. */
  async fetchConfig() {
    this.loadError = '';
    try {
      const res = await fetch('/api/v1/tracker/config');
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok || !isPlainObject(data) || !isPlainObject(data.config)) {
        const why = isPlainObject(data) && data.error ? String(data.error) : `HTTP ${res.status}`;
        this.loadError = `The taxonomy could not be loaded (${why}). Reload the Console to try again.`;
      } else {
        this.config = data.config;
        this.source = data.source || '';
        this.drift = isPlainObject(data.drift) ? data.drift : null;
        this.fingerprint = typeof data.fingerprint === 'string' ? data.fingerprint : null;
      }
    } catch {
      this.loadError = 'The taxonomy could not be loaded (is the Console server running?). Reload the Console to try again.';
    }
    this._loaded = true;
  }

  paint() {
    const head = `<div class="cc-tax-head">
        <h3>Tracker Taxonomy</h3>
        <span class="cc-tax-sub">operator-declared programs · verticals · agents — Save writes docs/roadmap/tracker-config.yaml + a governed directive the next cycle must consult. Each vertical's functionality is checked against the Console navigation and is not edited here.</span>
      </div>`;
    if (this.loadError) {
      this.container.innerHTML = `<div class="cc-tax">${head}<div class="cc-tax-error" role="alert">${esc(this.loadError)}</div></div>`;
      return;
    }
    this.container.innerHTML = `<div class="cc-tax">
      ${head}
      ${driftHtml(this.drift, this.source)}
      ${this._section('programs', 'Programs', list(this.config.programs))}
      ${this._section('verticals', 'Verticals', list(this.config.verticals))}
      ${this._section('agents', 'Agent mappings', list(this.config.agents))}
      <div class="cc-tax-bar">
        <button class="cc-tax-save" data-act="save" type="button">Save taxonomy</button>
        <span class="cc-tax-status" id="cc-tax-status">${this.source ? `source: ${esc(this.source)}` : ''}</span>
      </div>
    </div>`;
    this._bind();
  }

  _section(kind, label, items) {
    const rows = items.map((it, i) => this._rowHtml(kind, it, i)).join('');
    return `<div class="cc-tax-section" data-kind="${kind}">
      <div class="cc-tax-sec-head"><span>${esc(label)}</span><button class="cc-tax-add" data-add="${kind}" type="button">+ add</button></div>
      <div class="cc-tax-rows">${rows}</div>
    </div>`;
  }

  /** `index` stamps the row with its loaded entry (data-src); added rows have none. */
  _rowHtml(kind, item, index) {
    const it = isPlainObject(item) ? item : {};
    const inputs = FIELDS[kind].map((f) => {
      const raw = f === 'patterns' && Array.isArray(it[f]) ? it[f].map(text).join(', ') : text(it[f]);
      return `<input class="cc-tax-in" data-field="${f}" value="${esc(raw)}" placeholder="${f}">`;
    }).join('');
    const xc = kind === 'verticals'
      ? `<label class="cc-tax-xc"><input type="checkbox" data-field="crossCutting"${it.crossCutting ? ' checked' : ''}>cross-cutting</label>`
      : '';
    const src = index === undefined ? '' : ` data-src="${index}"`;
    return `<div class="cc-tax-row" data-kind="${kind}"${src}>${inputs}${xc}<button class="cc-tax-del" data-del type="button">×</button></div>`;
  }

  _bind() {
    this.container.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => this._addRow(b.getAttribute('data-add'))));
    this.container.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => b.closest('.cc-tax-row')?.remove()));
    this.container.querySelector('[data-act="save"]')?.addEventListener('click', () => this.save());
  }

  _addRow(kind) {
    const rowsEl = this.container.querySelector(`.cc-tax-section[data-kind="${kind}"] .cc-tax-rows`);
    if (!rowsEl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this._rowHtml(kind, {});
    const row = tmp.firstElementChild;
    row.querySelector('[data-del]')?.addEventListener('click', () => row.remove());
    rowsEl.appendChild(row);
  }

  /** Each row = a copy of its loaded entry (when that is a plain object) + only the
   *  inputs the operator changed (value differs from the rendered default). */
  _collect() {
    const read = (kind) => [...this.container.querySelectorAll(`.cc-tax-section[data-kind="${kind}"] .cc-tax-row`)]
      .map((r) => {
        const idx = r.getAttribute('data-src');
        const base = idx === null ? undefined : list(this.config[kind])[Number(idx)];
        const o = isPlainObject(base) ? JSON.parse(JSON.stringify(base)) : {};
        r.querySelectorAll('.cc-tax-in').forEach((inp) => {
          if (inp.value === inp.defaultValue) return;
          const f = inp.getAttribute('data-field');
          const v = inp.value.trim();
          if (f === 'patterns') o.patterns = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
          else if (v) o[f] = v;
          else delete o[f];
        });
        const xc = r.querySelector('[data-field="crossCutting"]');
        if (xc && xc.checked !== xc.defaultChecked) { if (xc.checked) o.crossCutting = true; else delete o.crossCutting; }
        return o;
      })
      .filter((o) => o.key);
    return Object.fromEntries(KINDS.map((k) => [k, read(k)]));
  }

  /** Only a successful Save moves the baseline; a failure (409 changed-on-disk included)
   *  leaves config, drift, fingerprint and DOM as they were. */
  async save() {
    const config = this._collect();
    const setStatus = (text) => {
      const el = this.container.querySelector('#cc-tax-status');
      if (el) el.textContent = text;
    };
    let data = null;
    let failure = '';
    try {
      const res = await fetch('/api/v1/tracker/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, fingerprint: this.fingerprint }),
      });
      try { data = await res.json(); } catch { data = null; }
      if (res.status === 409 || (isPlainObject(data) && data.error === 'changed-on-disk')) {
        failure = 'Not saved: the taxonomy file changed on disk since this view loaded it. Reload the Console to pick up the change, then edit again.';
      } else if (!res.ok || !isPlainObject(data) || data.ok !== true) {
        failure = `Error: ${(isPlainObject(data) && data.error) || `save failed (HTTP ${res.status})`}`;
      }
    } catch {
      failure = 'Save failed (is the Console server running?)';
    }
    if (failure) { setStatus(failure); return; }
    this.config = config;
    this.source = 'config';
    this.drift = isPlainObject(data.drift) ? data.drift : null;
    this.fingerprint = typeof data.fingerprint === 'string' ? data.fingerprint : null;
    this.paint();
    setStatus(`Saved → ${list(data.written).join(', ')}`);
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }

  onEvent() {}
}
