// FailSafe Command Center — Governance Panel Renderer
// Sentinel status, verify button, policies, L3 queue, audit log.

import { renderIntegrityCard, renderUnattributedCard, derivePolicies } from './integrity.js';
import { sentinelModeValue } from './sentinel-mode.js';
import { escapeSelectorValue } from './escape-selector.js';

export class GovernanceRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.verdictLog = [];
    // FailSafe#367 tranche 2: filter state for the durable, ledger-backed
    // resolution-status list (separate from the live verdictLog above it).
    this.resolutionFilter = 'All';

    if (this.client) {
      this.client.on('webLlmStatus', () => {
        if (this._lastHub) this.render(this._lastHub);
      });
    }
  }

  render(hubData) {
    if (!this.container) return;
    this._lastHub = hubData;
    const sentinel = hubData.sentinelStatus || {};
    const l3Queue = hubData.l3Queue || [];
    const policies = derivePolicies(hubData);
    const chainValid = hubData.chainValid ?? null;
    const integrity = hubData.metricIntegrity || [];
    const unattributed = hubData.unattributedFileActivity || { count: 0, recent: [] };

    const modeTransitions = Array.isArray(hubData.recentModeTransitions) ? hubData.recentModeTransitions : [];
    this.container.innerHTML = `
      <div class="cc-grid-2" style="margin-bottom:16px">
        ${this.renderSentinelCard(sentinel, chainValid)}
        ${this.renderPoliciesCard(policies)}
      </div>
      ${this.renderModeTransitions(modeTransitions)}
      ${renderIntegrityCard(integrity)}
      ${renderUnattributedCard(unattributed)}
      ${this.renderL3Queue(l3Queue)}
      ${this.renderAuditLog()}
      ${this.renderResolutionLog(hubData.auditLog)}`;
    this.bindActions();
    this.bindModeTransitionRows();
    this.highlightDeepLinkedVerdict();
  }

  /**
   * B194: Mode-transition feed renders `recentModeTransitions` from the
   * hub payload. Each row carries `data-transition-ts` for deep-linking;
   * click handler reuses the verdict-highlight pattern with the
   * `.cc-mode-transition--highlighted` class.
   */
  renderModeTransitions(transitions) {
    if (!Array.isArray(transitions) || transitions.length === 0) {
      return `<div class="cc-card" style="margin-bottom:16px"><div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Mode Transitions</div><div style="font-size:0.85rem;color:var(--text-muted)">No transitions recorded this session.</div></div>`;
    }
    const rows = transitions.map((t) => {
      const ts = this.esc(String(t.timestamp || ''));
      const prev = this.esc(String(t.previousMode || ''));
      const next = this.esc(String(t.newMode || ''));
      const reason = this.esc(String(t.reason || ''));
      const actor = this.esc(String(t.actor || 'unknown'));
      return `<div class="cc-mode-transition" data-transition-ts="${ts}" style="padding:6px 8px;border-bottom:1px solid var(--border-rim);font-size:0.85rem;cursor:pointer"><span style="color:var(--text-muted)">${ts}</span> · <strong>${prev}</strong> → <strong>${next}</strong> · reason: <em>${reason}</em>, by ${actor}</div>`;
    }).join('');
    return `<div class="cc-card" style="margin-bottom:16px"><div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Mode Transitions</div>${rows}</div>`;
  }

  bindModeTransitionRows() {
    if (!this.container) return;
    const rows = this.container.querySelectorAll('.cc-mode-transition');
    rows.forEach((row) => {
      row.onclick = () => {
        row.classList.add('cc-mode-transition--highlighted');
        setTimeout(() => row.classList.remove('cc-mode-transition--highlighted'), 3000);
      };
    });
  }

  /**
   * If the URL hash carries `?verdict=<iso-timestamp>` (Sentinel-alert
   * deep-link from the Monitor sidebar), scroll the matching audit-log row
   * into view and flash it. Falls back to scrolling to the Sentinel card
   * when no matching row exists — typical when the alert came from a
   * `hub.recentVerdicts` checkpoint that hasn't replayed into the live
   * `verdictLog` event stream yet.
   */
  highlightDeepLinkedVerdict() {
    if (!this.container) return;
    const hash = (typeof window !== 'undefined' && window.location?.hash) || '';
    const queryStr = hash.split('?')[1] || '';
    if (!queryStr) return;
    const params = new URLSearchParams(queryStr);
    const section = params.get('section');
    if (section) {
      const safeSection = escapeSelectorValue(section);
      const target = this.container.querySelector(`[data-section="${safeSection}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.classList.add('cc-section--highlighted');
      setTimeout(() => target?.classList.remove('cc-section--highlighted'), 3000);
      return;
    }
    const ts = params.get('verdict');
    if (!ts) return;
    const row = this.container.querySelector(`[data-verdict-ts="${escapeSelectorValue(ts)}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('cc-verdict--highlighted');
      setTimeout(() => row.classList.remove('cc-verdict--highlighted'), 3000);
      return;
    }
    // Row missing — fall back to scrolling the Sentinel card into view.
    const sentinelCard = this.container.querySelector('.cc-gov-verify')?.closest('.cc-card');
    sentinelCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  renderSentinelCard(sentinel, chainValid) {
    const running = sentinel.running;
    const statusColor = running ? 'var(--accent-green)' : 'var(--accent-red)';
    const statusText = running ? 'Active' : 'Halted';
    const chainLabels = { true: 'Valid', false: 'Broken' };
    const chainText = chainLabels[String(chainValid)] || 'Unknown';
    const chainColor = chainValid === true
      ? 'var(--accent-green)'
      : (chainValid === false ? 'var(--accent-red)' : 'var(--text-muted)');
    
    // AI Badge for Sentinel
    let aiBadge = '';
    if (this.client?.webLlmState) {
      const { nativeAvailable, wasmReady } = this.client.webLlmState;
      if (nativeAvailable) {
        aiBadge = `<span class="cc-badge" style="background:linear-gradient(90deg, #10b981, #059669); color: white; border: none; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);"><svg style="width:10px;height:10px;margin-right:4px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z"/></svg>Gemini Nano</span>`;
      } else if (wasmReady) {
        aiBadge = `<span class="cc-badge" style="background:var(--primary); color: white;">WASM Core</span>`;
      } else {
        aiBadge = `<span class="cc-badge" style="background:rgba(255,255,255,0.1); color: var(--text-muted);">Hybrid Server</span>`;
      }
    }

    return `
      <div class="cc-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px">
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
            letter-spacing:0.08em">Sentinel</div>
          ${aiBadge}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor}"></span>
          <span style="font-weight:600">${statusText}</span>
          <span class="cc-badge" style="background:var(--primary);color:#fff">Sentinel: ${this.esc(sentinelModeValue(sentinel.mode))}</span>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted)">
          Events: ${sentinel.eventsProcessed || 0} ·
          Chain: <span style="color:${chainColor}">${chainText}</span>
        </div>
        <button class="cc-btn cc-btn--primary cc-gov-verify" style="margin-top:10px">Verify Integrity</button>
      </div>`;
  }

  renderPoliciesCard(policies) {
    const items = policies.length
      ? policies.map(p => `<div style="padding:4px 0;border-bottom:1px solid var(--border-rim);
          font-size:0.82rem">${p.name || p.id || 'Policy'}</div>`).join('')
      : '<div style="color:var(--text-muted);font-size:0.82rem">No active policies</div>';
    return `
      <div class="cc-card">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">Active Policies</div>
        <div style="max-height:180px;overflow-y:auto">${items}</div>
      </div>`;
  }

  renderL3Queue(queue) {
    if (!queue.length) {
      return `<div class="cc-card" data-section="l3-chain" style="margin-bottom:16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:6px">L3 Verification Queue</div>
        <div style="color:var(--text-muted);font-size:0.82rem">No pending items</div>
      </div>`;
    }
    const rows = queue.map(item => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border-rim);font-size:0.82rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span class="cc-badge cc-badge--${(item.riskGrade || 'medium').toLowerCase()}">${item.riskGrade || '?'}</span>
            <span style="margin-left:6px">${this.esc(item.filePath || item.id)}</span>
          </div>
          <span style="color:var(--text-muted);font-size:0.7rem">${item.queuedAt || ''}</span>
        </div>
        ${this.renderL3PreflightConflicts(item)}
        ${this.renderL3OpenDesignItem(item)}
      </div>`).join('');

    return `
      <div class="cc-card" data-section="l3-chain" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
            letter-spacing:0.08em">L3 Verification Queue (${queue.length})</div>
          <button class="cc-btn cc-btn--primary cc-gov-l3-batch" style="padding:4px 12px;font-size:0.75rem">
            Process All</button>
        </div>
        ${rows}
      </div>`;
  }

  /**
   * B-INT-2: render a bicameral-preflight conflict line per drifted decision
   * attached to an L3 entry's `meta.preflight`. Empty string when absent.
   * Decision titles are escaped via `esc` (XSS guard).
   */
  renderL3PreflightConflicts(item) {
    const drifted = item && item.meta && item.meta.preflight
      && item.meta.preflight.driftedDecisions;
    if (!Array.isArray(drifted) || drifted.length === 0) return '';
    return drifted.map((d) => {
      const title = this.esc(String((d && d.title) || 'unknown decision'));
      return `<div class="l3-preflight-conflict" style="margin-top:4px;font-size:0.75rem;color:var(--accent-red)">Conflicts with decision: ${title}</div>`;
    }).join('');
  }

  /**
   * B-OD-8: render a pending Open Design create_artifact L3 item — the buffered
   * tool + an args summary (from meta) + per-item Approve/Reject controls wired
   * to POST /api/actions/decide-l3. Empty string for any other kind.
   */
  renderL3OpenDesignItem(item) {
    if (!item || item.kind !== 'open-design-create-artifact') return '';
    const meta = item.meta || {};
    const tool = this.esc(String(meta.tool || 'create_artifact'));
    let argsSummary = '';
    try { argsSummary = this.esc(JSON.stringify(meta.args || {})); } catch { argsSummary = '{}'; }
    return `
      <div class="cc-l3-opendesign" style="margin-top:6px;font-size:0.78rem">
        <div style="color:var(--text-main)">Open Design write: <code>${tool}</code></div>
        <div style="color:var(--text-muted);font-size:0.72rem;margin:2px 0 6px">${argsSummary}</div>
        <div style="display:flex;gap:6px">
          <button class="cc-btn cc-btn--primary cc-l3-decide" data-id="${this.esc(String(item.id))}" data-decision="APPROVED"
            style="padding:3px 10px;font-size:0.72rem">Approve</button>
          <button class="cc-btn cc-l3-decide" data-id="${this.esc(String(item.id))}" data-decision="REJECTED"
            style="padding:3px 10px;font-size:0.72rem">Reject</button>
        </div>
      </div>`;
  }

  renderAuditLog() {
    const entries = this.verdictLog.slice(-50).reverse().map(v => {
      const level = this.verdictLevel(v);
      const message = this.formatAuditMessage(v);
      // Carry the verdict's payload timestamp so the Sentinel-alert deep-link
      // (#governance?verdict=<iso>) can locate and highlight this row.
      const ts = this.esc(v.payload?.timestamp || v.timestamp || '');
      return `<div class="cc-verdict cc-verdict--${level}" data-verdict-ts="${ts}" style="margin-bottom:6px;font-size:0.8rem">
        <span style="color:var(--text-muted);font-size:0.7rem">${v.time || ''}</span>
        <span style="margin-left:8px">${message}</span>
      </div>`;
    }).join('');
    return `
      <div style="padding:0 10px 8px 10px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">Protocol Audit Log</div>
        <div style="max-height:200px;overflow-y:auto">${entries || `
          <div class="cc-card" style="min-height:150px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:14px">
            <div style="font-size:0.9rem;font-weight:600;color:var(--text-main);margin-bottom:6px">Governance chain ready</div>
            <div style="font-size:0.8rem;color:var(--text-muted);max-width:360px">
              No verdicts yet because no policy decisions have been processed in this cycle.
            </div>
          </div>
        `}</div>
      </div>`;
  }

  formatAuditMessage(v) {
    if (v.type === 'transparency') {
      const p = v.payload || {};
      const eventType = p.type || 'prompt';
      if (eventType.includes('build_started')) return 'Prompt build started';
      if (eventType.includes('build_completed')) return `Prompt completed (${p.tokenCount || '?'} tokens)`;
      if (eventType.includes('dispatched')) return 'Prompt dispatched';
      if (eventType.includes('blocked')) return `Blocked: ${p.blockedReason || 'policy'}`;
      return eventType;
    }
    return v.payload?.message || v.payload?.type || 'Verdict';
  }

  verdictLevel(v) {
    const verdict = v.payload?.policyVerdict || v.payload?.verdict || '';
    if (/violation|fail/i.test(verdict)) return 'violation';
    if (/warn/i.test(verdict)) return 'warn';
    return 'pass';
  }

  /**
   * FailSafe#367 tranche 2: durable, ledger-backed resolution status for
   * WARN/BLOCK/ESCALATE findings. Deliberately separate from `renderAuditLog()`
   * above (which stays live/`verdictLog`-driven and untouched, preserving its
   * `data-verdict-ts` deep-link contract) because resolution state can only be
   * computed from `hubData.auditLog` — the durable `soa_ledger` read via
   * `AuditResolutionProjector`, refreshed on every hub snapshot. A live event
   * push has no ledger id yet, so it cannot carry a resolution badge.
   */
  renderResolutionLog(auditLog) {
    const entries = Array.isArray(auditLog) ? auditLog : [];
    const needsAttention = (state) => state === 'LIVE' || state === 'ESCALATED_UNDECIDED';
    const visible = entries.filter((e) => {
      if (this.resolutionFilter === 'Needs attention') return needsAttention(e.resolution?.state);
      if (this.resolutionFilter === 'Resolved') return !needsAttention(e.resolution?.state);
      return true;
    });
    const chips = ['All', 'Needs attention', 'Resolved'].map((key) => `
      <button class="cc-chip cc-resolution-filter${key === this.resolutionFilter ? ' active' : ''}"
        data-filter="${key}" style="font-size:0.7rem;padding:2px 8px">${key}</button>`).join('');
    const rows = visible.map((e) => {
      const ts = this.esc(String(e.timestamp || ''));
      const what = this.esc(`${e.eventType || ''}${e.verificationResult ? ` (${e.verificationResult})` : ''}`);
      const where = this.esc(String(e.artifactPath || 'unknown path'));
      return `<div class="cc-verdict-resolution" data-resolution-entry-id="${this.esc(String(e.id))}"
        style="padding:6px 0;border-bottom:1px solid var(--border-rim);font-size:0.8rem">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span>${what} — ${where}</span>
          ${this.resolutionBadge(e.resolution?.state)}
        </div>
        <div style="color:var(--text-muted);font-size:0.7rem;margin-top:2px">${ts}</div>
      </div>`;
    }).join('');
    return `
      <div style="padding:0 10px 8px 10px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
            letter-spacing:0.08em">Resolution Status (${entries.length})</div>
          <div style="display:flex;gap:4px">${chips}</div>
        </div>
        <div style="max-height:220px;overflow-y:auto">${rows || `
          <div style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">
            ${entries.length ? 'No entries match this filter.' : 'No WARN/BLOCK/ESCALATE findings recorded yet.'}
          </div>`}</div>
      </div>`;
  }

  /**
   * Maps `AuditResolutionProjector`'s state enum to an operator-facing badge.
   * `DECIDED_APPROVED` is deliberately styled distinctly from a clean/resolved
   * color — an accepted-risk override is not the same thing as a verified-
   * clean re-scan (AuditResolutionProjector.ts authority boundary).
   */
  resolutionBadge(state) {
    const styles = {
      LIVE: { label: 'Live', bg: 'var(--accent-red)' },
      ESCALATED_UNDECIDED: { label: 'Escalated · awaiting decision', bg: '#d97706' },
      DECIDED_APPROVED: { label: 'Approved (override)', bg: '#7c3aed' },
      DECIDED_REJECTED: { label: 'Rejected', bg: 'var(--text-muted)' },
    };
    const cfg = styles[state] || { label: state || 'Unknown', bg: 'var(--text-muted)' };
    return `<span class="cc-badge" style="background:${cfg.bg};color:#fff;white-space:nowrap">${this.esc(cfg.label)}</span>`;
  }

  bindActions() {
    this.container.querySelector('.cc-gov-verify')?.addEventListener('click', async (e) => {
      if (!this.client) return;
      e.target.disabled = true;
      try { await this.client.postAction('/api/actions/verify-integrity'); }
      finally { e.target.disabled = false; }
    });
    this.container.querySelector('.cc-gov-l3-batch')?.addEventListener('click', async (e) => {
      if (!this.client) return;
      e.target.disabled = true;
      try { await this.client.postAction('/api/actions/approve-l3-batch', { decision: 'APPROVED' }); }
      finally { e.target.disabled = false; }
    });
    // FailSafe#367 tranche 2: resolution-status filter chips (All / Needs
    // attention / Resolved). Re-renders from `this._lastHub` rather than
    // re-fetching, so the click is instant and never drops the live
    // verdictLog feed above it.
    this.container.querySelectorAll('.cc-resolution-filter').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.resolutionFilter = chip.dataset.filter || 'All';
        this.render(this._lastHub || {});
      });
    });
    // B-OD-8: per-item L3 decide (Open Design create_artifact Approve/Reject).
    this.container.querySelectorAll('.cc-l3-decide').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (!this.client) return;
        const el = e.currentTarget;
        const id = el.dataset.id;
        const decision = el.dataset.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
        if (!id) return;
        el.disabled = true;
        try { await this.client.postAction('/api/actions/decide-l3', { id, decision }); }
        finally { el.disabled = false; }
      });
    });
  }

  onEvent(event) {
    if (!event) return;
    const isVerdict = event.type === 'verdict' || /verdict/i.test(event.type);
    const isTransparency = event.type === 'transparency';
    if (isVerdict || isTransparency) {
      this.verdictLog.push({
        ...event,
        time: event.time || new Date().toISOString().slice(11, 19),
      });
      const logEl = this.container?.querySelector('.cc-verdict')?.parentElement;
      if (logEl) this.render(this._lastHub || {});
    }
  }

  esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  destroy() { if (this.container) this.container.innerHTML = ''; }
}
