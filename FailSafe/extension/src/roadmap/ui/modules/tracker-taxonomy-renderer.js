/**
 * TrackerTaxonomyRenderer (FX891) — Workspace › Taxonomy sub-view.
 *
 * The operator-facing editor for the tracker's programs ∥ verticals + agent
 * mappings. Loads GET /api/v1/tracker/config (the operator config, or one
 * derived from programs.yaml), renders editable rows with add/remove, and Save
 * POSTs back — persisting docs/roadmap/tracker-config.yaml + emitting the
 * governed .failsafe/governance/tracker-taxonomy.directive.md the next cycle
 * must consult. Follows the TabGroup sub-view contract (render/destroy).
 */

const STYLE_ID = 'cc-tax-style';
const STYLE = `
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
`;

const FIELDS = {
  programs: ['key', 'name', 'accent'],
  verticals: ['key', 'name'],
  agents: ['key', 'name', 'program', 'vertical', 'patterns'],
};

function esc(v) {
  const d = document.createElement('div');
  d.textContent = String(v ?? '');
  return d.innerHTML;
}

export class TrackerTaxonomyRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.config = { programs: [], verticals: [], agents: [] };
    this.source = '';
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

  async fetchConfig() {
    try {
      const res = await fetch('/api/v1/tracker/config');
      const data = await res.json();
      this.config = data.config || { programs: [], verticals: [], agents: [] };
      this.source = data.source || '';
    } catch { /* offline — keep empties */ }
    this._loaded = true;
  }

  paint() {
    this.container.innerHTML = `<div class="cc-tax">
      <div class="cc-tax-head">
        <h3>Tracker Taxonomy</h3>
        <span class="cc-tax-sub">operator-declared programs · verticals · agents — Save writes docs/roadmap/tracker-config.yaml + a governed directive the next cycle must consult</span>
      </div>
      ${this._section('programs', 'Programs', this.config.programs || [])}
      ${this._section('verticals', 'Verticals', this.config.verticals || [])}
      ${this._section('agents', 'Agent mappings', this.config.agents || [])}
      <div class="cc-tax-bar">
        <button class="cc-tax-save" data-act="save" type="button">Save taxonomy</button>
        <span class="cc-tax-status" id="cc-tax-status">${this.source ? `source: ${esc(this.source)}` : ''}</span>
      </div>
    </div>`;
    this._bind();
  }

  _section(kind, label, items) {
    const rows = items.map((it) => this._rowHtml(kind, it)).join('');
    return `<div class="cc-tax-section" data-kind="${kind}">
      <div class="cc-tax-sec-head"><span>${esc(label)}</span><button class="cc-tax-add" data-add="${kind}" type="button">+ add</button></div>
      <div class="cc-tax-rows">${rows}</div>
    </div>`;
  }

  _rowHtml(kind, it) {
    const inputs = FIELDS[kind].map((f) => {
      const raw = f === 'patterns' && Array.isArray(it[f]) ? it[f].join(', ') : (it[f] ?? '');
      return `<input class="cc-tax-in" data-field="${f}" value="${esc(raw)}" placeholder="${f}">`;
    }).join('');
    const xc = kind === 'verticals'
      ? `<label class="cc-tax-xc"><input type="checkbox" data-field="crossCutting"${it.crossCutting ? ' checked' : ''}>cross-cutting</label>`
      : '';
    return `<div class="cc-tax-row" data-kind="${kind}">${inputs}${xc}<button class="cc-tax-del" data-del type="button">×</button></div>`;
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

  _collect() {
    const read = (kind) => [...this.container.querySelectorAll(`.cc-tax-section[data-kind="${kind}"] .cc-tax-row`)]
      .map((r) => {
        const o = {};
        r.querySelectorAll('.cc-tax-in').forEach((inp) => {
          const f = inp.getAttribute('data-field');
          const v = inp.value.trim();
          if (f === 'patterns') o.patterns = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
          else if (v) o[f] = v;
        });
        const xc = r.querySelector('[data-field="crossCutting"]');
        if (xc && xc.checked) o.crossCutting = true;
        return o;
      })
      .filter((o) => o.key);
    return { programs: read('programs'), verticals: read('verticals'), agents: read('agents') };
  }

  async save() {
    const config = this._collect();
    const status = this.container.querySelector('#cc-tax-status');
    try {
      const res = await fetch('/api/v1/tracker/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (status) status.textContent = data.ok ? `Saved → ${(data.written || []).join(', ')}` : `Error: ${data.error || 'save failed'}`;
      this.config = config;
    } catch {
      if (status) status.textContent = 'Save failed (is the Console server running?)';
    }
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }

  onEvent() {}
}
