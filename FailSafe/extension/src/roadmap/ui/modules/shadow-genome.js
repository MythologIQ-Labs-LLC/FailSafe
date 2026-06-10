// FailSafe Command Center — Shadow Genome dashboard (#196 Phase 2).
// A Governance sub-view over the Phase-1 /api/qor/governance-dashboard API:
// summary cards + a 4-mode navigation (Genome Map / Incidents / Trust
// Transitions / Federation), each mode rendering its REAL slice of the API
// (honest empty states; no placeholders). The structural graph visualization
// (Phase 4), incident drawer (Phase 3), and live trust/federation data
// (Phase 5) are deferred. Mythiq theme, token-only colors (spec §16).

import { renderGenomeMode, bindGenome } from './shadow-genome-graph.js';
import { renderTrustPanel, renderFederationPanel, renderMaturity } from './shadow-genome-panels.js';

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

// #454: per-record honesty badge. 'recorded' = a live event from active governance;
// 'reconstructed' = derived from governance history (META_LEDGER appendix), not a live
// shadow event. Absent provenance renders nothing (back-compat with a pure live graph).
function provBadge(p) {
  if (p !== 'recorded' && p !== 'reconstructed') return '';
  const title = p === 'reconstructed'
    ? 'Derived from governance history — not a live recorded shadow event'
    : 'Recorded in line with active governance';
  return `<span class="sg-prov sg-prov-${esc(p)}" title="${esc(title)}">${esc(p)}</span>`;
}

const MODES = [
  { key: 'map', label: 'Genome Map' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'trust', label: 'Trust Transitions' },
  { key: 'federation', label: 'Federation' },
];

const SUMMARY_CARDS = [
  { key: 'unresolvedCount', label: 'Unresolved', accent: 'var(--accent-red)' },
  { key: 'recurringPatternCount', label: 'Recurring', accent: 'var(--accent-orange)' },
  { key: 'nodeCount', label: 'Failure Nodes', accent: 'var(--accent-gold)' },
  { key: 'edgeCount', label: 'Causal Edges', accent: 'var(--accent-cyan)' },
  { key: 'trustTransitionCount', label: 'Trust Events', accent: 'var(--accent-green)' },
];

export class ShadowGenomeRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.data = null;
    this.mode = 'map';
    this.mapState = { view: 'graph', selectedId: null, zoom: 1 };
  }

  async render() {
    if (!this.container) return;
    await this.fetch();
    const d = this.data;
    if (!d || d.enabled === false) {
      this.container.innerHTML = this.renderHeader(false) + this.renderEmpty();
      return;
    }
    this.container.innerHTML =
      this.renderHeader(true) +
      this.renderSummary(d.summary || {}) +
      this.renderModeTabs() +
      `<div class="sg-mode-body">${this.renderMode(d)}</div>` +
      renderMaturity(d);
    this.bindModeSwitch();
    this.bindMode();
  }

  async fetch() {
    try {
      const res = await fetch('/api/qor/governance-dashboard');
      this.data = res.ok ? await res.json() : null;
    } catch { this.data = null; }
  }

  renderHeader(live) {
    const chip = live
      ? '<span class="sg-chip sg-chip-live">LIVE</span>'
      : '<span class="sg-chip sg-chip-degraded">DEGRADED</span>';
    return `<div class="sg-header">
      <div>
        <div class="sg-title">Shadow Genome</div>
        <div class="sg-subtitle">The architecture of discovered consequence — failures, causal edges, and governance learning.</div>
      </div>${chip}</div>`;
  }

  renderEmpty() {
    return `<div class="cc-card sg-empty">
      <div class="sg-empty-title">No failure evidence has been recorded</div>
      <div class="sg-empty-msg">The Shadow Genome will take shape as governed failures and causal relationships are observed. This does not mean the project has no error potential — only that no evidence has yet accumulated.</div>
    </div>`;
  }

  renderSummary(s) {
    const cards = SUMMARY_CARDS.map((c) => `
      <div class="sg-card">
        <div class="sg-card-num" style="color:${c.accent}">${esc(s[c.key] ?? 0)}</div>
        <div class="sg-card-label">${esc(c.label)}</div>
      </div>`).join('');
    return `<div class="sg-summary">${cards}</div>`;
  }

  renderModeTabs() {
    const pills = MODES.map((m) =>
      `<button class="sg-pill${m.key === this.mode ? ' active' : ''}" data-mode="${m.key}">${esc(m.label)}</button>`,
    ).join('');
    return `<div class="sg-pills" role="tablist">${pills}</div>`;
  }

  renderMode(d) {
    if (this.mode === 'map') return this.renderMap(d);
    if (this.mode === 'incidents') return this.renderIncidents(d);
    if (this.mode === 'trust') return renderTrustPanel(d);
    return renderFederationPanel(d);
  }

  renderMap(d) {
    return renderGenomeMode(d, this.mapState);
  }

  renderIncidents(d) {
    const items = d.incidents || [];
    if (!items.length) {
      return `<div class="sg-panel sg-incidents-wrap"><div class="sg-panel-title">Incident ledger</div><div class="sg-muted">No incidents recorded yet.</div></div>`;
    }
    const rows = items.map((i, idx) => {
      const surfaces = (i.governanceRoots || []).map((g) => esc(g.label)).join(', ') || '—';
      return `<button class="sg-incident sg-sev-${esc(i.severity)}" data-incident="${idx}" tabindex="0">
        <span class="sg-sev-spine" aria-hidden="true"></span>
        <span class="sg-incident-main"><span class="sg-incident-label">${esc(i.label)}</span>${provBadge(i.provenance)}<span class="sg-incident-surface">${surfaces}</span></span>
        <span class="sg-incident-rec" title="recurrence">×${esc(i.recurrence)}</span>
        <span class="sg-incident-sev">${esc(i.severity)}</span>
        <span class="sg-incident-chev" aria-hidden="true">›</span>
      </button>`;
    }).join('');
    const anyRecon = items.some((i) => i.provenance === 'reconstructed');
    const provNote = anyRecon
      ? 'Each record is flagged <em>recorded</em> (live, in line with active governance) or <em>reconstructed</em> (derived from governance history, not a live shadow event).'
      : 'Each row opens a case file.';
    return `<div class="sg-incidents-wrap">
      <div class="sg-panel sg-incidents">
        <div class="sg-panel-title">Incident ledger <span class="sg-count">${items.length}</span></div>
        <div class="sg-incident-table" role="list" aria-label="Incident ledger">${rows}</div>
        <div class="sg-note">${provNote}</div>
      </div>
      <div class="sg-drawer" role="dialog" aria-label="Incident detail" hidden><div class="sg-drawer-body"></div></div>
      <div class="sg-backdrop" hidden></div>
    </div>`;
  }

  renderDrawerBody(i) {
    const roots = (i.governanceRoots || []).length
      ? `<ul class="sg-surfaces">${i.governanceRoots.map((g) => `<li><span class="sg-surface-label">${esc(g.label)}</span><code class="sg-id">${esc(g.id)}</code></li>`).join('')}</ul>`
      : '<div class="sg-muted">No governance root recorded.</div>';
    return `<div class="sg-drawer-head sg-sev-${esc(i.severity)}">
        <span class="sg-sev-spine" aria-hidden="true"></span>
        <div class="sg-drawer-headtext"><div class="sg-drawer-title">${esc(i.label)}</div><div class="sg-drawer-sub">${esc(i.severity)} · recurrence ×${esc(i.recurrence)}${provBadge(i.provenance)}</div></div>
        <button class="sg-drawer-close" aria-label="Close detail">✕</button>
      </div>
      <div class="sg-drawer-section"><div class="sg-drawer-h">What failed</div><div class="sg-drawer-p">${esc(i.label)} — a governed failure observed in the causal graph.</div></div>
      <div class="sg-drawer-section"><div class="sg-drawer-h">Applies to (governance roots)</div>${roots}</div>
      <div class="sg-drawer-section"><div class="sg-drawer-h">Recurrence</div><div class="sg-drawer-p">${esc(i.recurrence)} incident edge${i.recurrence === 1 ? '' : 's'} in the governance subgraph.</div></div>
      <div class="sg-drawer-section"><div class="sg-drawer-h">Node / ledger id</div><code class="sg-id">${esc(i.id)}</code></div>
      <div class="sg-drawer-section"><div class="sg-drawer-h">Remediation &amp; trust consequence</div><span class="sg-chip sg-chip-degraded">not yet sourced</span></div>
      <button class="sg-locate" type="button">Locate in Genome &rarr;</button>`;
  }

  bindModeSwitch() {
    this.container.querySelectorAll('.sg-pill').forEach((btn) => {
      btn.addEventListener('click', () => this.switchMode(btn.getAttribute('data-mode')));
    });
  }

  switchMode(mode) {
    this.mode = mode;
    this.container.querySelectorAll('.sg-pill').forEach((b) => b.classList.toggle('active', b.getAttribute('data-mode') === mode));
    const body = this.container.querySelector('.sg-mode-body');
    if (body && this.data) { body.innerHTML = this.renderMode(this.data); this.bindMode(); }
  }

  bindMode() {
    if (this.mode === 'incidents') return this.bindIncidents();
    if (this.mode === 'map') {
      const wrap = this.container.querySelector('.sg-graph-wrap');
      if (wrap) bindGenome(wrap, this.data, this.mapState, () => this.rerenderMode());
    }
  }

  rerenderMode() {
    const body = this.container.querySelector('.sg-mode-body');
    if (body && this.data) { body.innerHTML = this.renderMode(this.data); this.bindMode(); }
  }

  bindIncidents() {
    const wrap = this.container.querySelector('.sg-incidents-wrap');
    if (!wrap) return;
    const drawer = wrap.querySelector('.sg-drawer');
    const backdrop = wrap.querySelector('.sg-backdrop');
    const close = () => { if (drawer) drawer.hidden = true; if (backdrop) backdrop.hidden = true; };
    const open = (idx) => {
      const i = (this.data.incidents || [])[idx];
      if (!i || !drawer) return;
      drawer.querySelector('.sg-drawer-body').innerHTML = this.renderDrawerBody(i);
      drawer.hidden = false; if (backdrop) backdrop.hidden = false;
      drawer.querySelector('.sg-drawer-close')?.addEventListener('click', close);
      drawer.querySelector('.sg-locate')?.addEventListener('click', () => { close(); this.switchMode('map'); });
    };
    wrap.querySelectorAll('.sg-incident').forEach((row) => {
      const idx = Number(row.getAttribute('data-incident'));
      row.addEventListener('click', () => open(idx));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(idx); }
      });
    });
    backdrop?.addEventListener('click', close);
  }
}
