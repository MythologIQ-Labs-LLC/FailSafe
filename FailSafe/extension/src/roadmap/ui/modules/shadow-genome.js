// FailSafe Command Center — Shadow Genome dashboard (#196 Phase 2).
// A Governance sub-view over the Phase-1 /api/qor/governance-dashboard API:
// summary cards + a 4-mode navigation (Genome Map / Incidents / Trust
// Transitions / Federation), each mode rendering its REAL slice of the API
// (honest empty states; no placeholders). The structural graph visualization
// (Phase 4), incident drawer (Phase 3), and live trust/federation data
// (Phase 5) are deferred. Mythiq theme, token-only colors (spec §16).

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
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
      `<div class="sg-mode-body">${this.renderMode(d)}</div>`;
    this.bindModeSwitch();
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
    if (this.mode === 'trust') return this.renderTrust(d);
    return this.renderFederation(d);
  }

  renderMap(d) {
    const types = Object.entries(d.typeDistribution || {});
    const max = types.reduce((m, [, n]) => Math.max(m, n), 0) || 1;
    const bars = types.length
      ? types.map(([t, n]) => `
        <div class="sg-bar-row">
          <span class="sg-bar-label">${esc(t)}</span>
          <span class="sg-bar"><span class="sg-bar-fill" style="width:${Math.round((n / max) * 100)}%"></span></span>
          <span class="sg-bar-num">${esc(n)}</span>
        </div>`).join('')
      : '<div class="sg-muted">No graph nodes yet.</div>';
    const surfaces = (d.projectSurfaces || []).map((p) =>
      `<li><span class="sg-surface-label">${esc(p.label)}</span><span class="sg-surface-meta">${esc(p.failureCount)} failure surface${p.failureCount === 1 ? '' : 's'}</span></li>`,
    ).join('');
    return `<div class="sg-panel"><div class="sg-panel-title">Node distribution</div>${bars}</div>
      <div class="sg-panel"><div class="sg-panel-title">Project surfaces</div>
        ${surfaces ? `<ul class="sg-surfaces">${surfaces}</ul>` : '<div class="sg-muted">No governed surfaces yet.</div>'}
        <div class="sg-note">The structural causal map arrives in a later phase; this is its evidence summary.</div>
      </div>`;
  }

  renderIncidents(d) {
    const chains = (d.recentChains || []).map((c) =>
      `<li><code class="sg-id">${esc(c.rootId)}</code> → <code class="sg-id sg-id-fail">${esc(c.failureId)}</code><span class="sg-surface-meta">depth ${esc(c.depth)}</span></li>`,
    ).join('');
    return `<div class="sg-panel"><div class="sg-panel-title">Recent governance → failure chains</div>
      ${chains ? `<ul class="sg-surfaces">${chains}</ul>` : '<div class="sg-muted">No incidents recorded yet.</div>'}
      <div class="sg-note">Per-incident detail, remediation, and the causal drawer arrive in a later phase.</div></div>`;
  }

  renderTrust() {
    return `<div class="sg-panel"><div class="sg-panel-title">Trust transitions</div>
      <div class="sg-muted">No trust transitions recorded yet.</div>
      <div class="sg-note">Evidence-backed CBT/KBT/IBT promotion + demotion chains arrive in a later phase.</div></div>`;
  }

  renderFederation(d) {
    const f = d.federation || { sourced: false };
    return `<div class="sg-panel"><div class="sg-panel-title">Federation</div>
      <div class="sg-muted">${f.sourced ? 'Connected peers' : esc(f.note || 'Federation peer status is not yet sourced.')}</div>
      <div class="sg-note">Peer health + causal-origin provenance arrive in a later phase.</div></div>`;
  }

  bindModeSwitch() {
    this.container.querySelectorAll('.sg-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.getAttribute('data-mode');
        this.container.querySelectorAll('.sg-pill').forEach((b) => b.classList.toggle('active', b === btn));
        const body = this.container.querySelector('.sg-mode-body');
        if (body && this.data) body.innerHTML = this.renderMode(this.data);
      });
    });
  }
}
