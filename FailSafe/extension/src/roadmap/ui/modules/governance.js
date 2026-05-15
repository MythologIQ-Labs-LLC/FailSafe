// FailSafe Command Center — Governance Panel Renderer
// Sentinel status, verify button, policies, L3 queue, audit log.

import { renderIntegrityCard, renderUnattributedCard, derivePolicies } from './integrity.js';

export class GovernanceRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.verdictLog = [];
    
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

    this.container.innerHTML = `
      <div class="cc-grid-2" style="margin-bottom:16px">
        ${this.renderSentinelCard(sentinel, chainValid)}
        ${this.renderPoliciesCard(policies)}
      </div>
      ${renderIntegrityCard(integrity)}
      ${renderUnattributedCard(unattributed)}
      ${this.renderL3Queue(l3Queue)}
      ${this.renderAuditLog()}`;
    this.bindActions();
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
          <span class="cc-badge" style="background:var(--primary);color:#fff">${this.esc(sentinel.mode || 'observe')}</span>
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
      return `<div class="cc-card" style="margin-bottom:16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:6px">L3 Verification Queue</div>
        <div style="color:var(--text-muted);font-size:0.82rem">No pending items</div>
      </div>`;
    }
    const rows = queue.map(item => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;
        border-bottom:1px solid var(--border-rim);font-size:0.82rem">
        <div>
          <span class="cc-badge cc-badge--${(item.riskGrade || 'medium').toLowerCase()}">${item.riskGrade || '?'}</span>
          <span style="margin-left:6px">${this.esc(item.filePath || item.id)}</span>
        </div>
        <span style="color:var(--text-muted);font-size:0.7rem">${item.queuedAt || ''}</span>
      </div>`).join('');

    return `
      <div class="cc-card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
            letter-spacing:0.08em">L3 Verification Queue (${queue.length})</div>
          <button class="cc-btn cc-btn--primary cc-gov-l3-batch" style="padding:4px 12px;font-size:0.75rem">
            Process All</button>
        </div>
        ${rows}
      </div>`;
  }

  renderAuditLog() {
    const entries = this.verdictLog.slice(-50).reverse().map(v => {
      const level = this.verdictLevel(v);
      const message = this.formatAuditMessage(v);
      return `<div class="cc-verdict cc-verdict--${level}" style="margin-bottom:6px;font-size:0.8rem">
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
