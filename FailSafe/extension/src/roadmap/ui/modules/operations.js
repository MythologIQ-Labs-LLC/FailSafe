// FailSafe Command Center — Operations Tab Renderer
// Mission strip, Plan vs Actual metrics, sprint grid, action buttons.

import { normalizePhaseProgress } from './phase-progress.js';
import { sentinelModeValue } from './sentinel-mode.js';

export class OperationsRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.roadmap = null;
  }

  async render(hubData) {
    if (!this.container) return;
    // B198 (RD-4): a re-render re-arms the renderer so a subsequent destroy()
    // is not a no-op — destroy→render→destroy must tear down the second
    // render's listeners, not skip teardown on the stale _destroyed flag.
    this._destroyed = false;
    // B198: each render consumes the freshest hub argument rather than a
    // cached payload baked in at construction. Roadmap is fetched lazily once
    // (it is static across a session) but hub-derived state — including
    // ledgerSummary overrides — is re-read on every call.
    this.hubData = hubData || {};
    if (!this.roadmap && this.client) {
      this.roadmap = await this.client.fetchRoadmap();
    }
    const run = this.hubData.runState || {};
    const checks = Object.values(this.hubData.recentCheckpoints || {});
    const sentinel = this.hubData.sentinelStatus || {};

    this.container.innerHTML = `
      ${this.renderMissionStrip(run, sentinel)}
      ${this.renderMetrics(run, checks)}
      ${this.renderPhaseGrid()}
      ${this.renderActions()}
    `;
    this.bindActions();
  }

  renderMissionStrip(run, sentinel) {
    const phase = run.currentPhase || 'Plan';
    // B-EM-1: prefix the token so the operator reads it as the Sentinel
    // evaluator mode, not the governance mode of the surrounding strip.
    const mode = `Sentinel ${sentinelModeValue(sentinel.mode)}`;
    const lastVerdict = sentinel.lastVerdict;

    let running = 'Active';
    let color = 'var(--accent-green)';

    if (!sentinel.running) {
      running = 'Halted';
      color = 'var(--accent-red)';
    } else if (lastVerdict && ['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(lastVerdict.decision)) {
      running = 'Alert';
      color = 'var(--accent-red)';
    } else if (lastVerdict && lastVerdict.decision === 'WARN') {
      running = 'Warnings';
      color = 'var(--accent-gold)';
    }

    return `
      <div class="cc-card" style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};
          box-shadow:0 0 8px ${color};animation:pulse 2s infinite"></span>
        <div>
          <div style="font-family:var(--font-display);font-size:1.1rem;text-transform:uppercase;
            letter-spacing:0.08em">${phase}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${mode} · ${running}</div>
        </div>
      </div>`;
  }

  renderMetrics(run, checks) {
    const total = checks.length;
    const passed = checks.filter(c => c.policyVerdict !== 'VIOLATION').length;
    const rate = total ? Math.round((passed / total) * 100) : 0;
    // Centralized normalization (Plan A Phase 2 / issue #47): never render
    // mathematically impossible progress — completed always implies at least
    // one planned phase even if the ledger lacks gate-tribunal entries.
    // B198: hub-supplied ledgerSummary takes precedence on every render so
    // re-renders with updated hub data reflect the latest counts even when
    // the cached roadmap is still in memory.
    const summary = this.hubData?.ledgerSummary
      ?? this.roadmap?.ledgerSummary
      ?? (this.roadmap?.phases ? {
        plansStarted: this.roadmap.phases.length,
        sessionsCompleted: this.roadmap.phases.filter(p => p.status === 'complete').length,
      } : null);
    const phases = normalizePhaseProgress(summary);
    const planned = phases.planned;
    const completed = phases.completed;
    const deviation = phases.adherence;

    return `
      <div class="cc-grid-4" style="margin-bottom:16px">
        ${this.metricCard('Phases', `${completed} / ${planned}`, 'Completed vs Planned')}
        ${this.metricCard('Checkpoints', String(total), 'Total recorded')}
        ${this.metricCard('Pass Rate', `${rate}%`, `${passed} of ${total} passed`)}
        ${this.metricCard('Adherence', `${deviation}%`, this.deviationBar(deviation))}
      </div>`;
  }

  metricCard(label, value, detail) {
    return `
      <div class="cc-card" style="text-align:center">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:4px">${label}</div>
        <div style="font-size:1.6rem;font-weight:700;font-family:var(--font-display)">${value}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">${detail}</div>
      </div>`;
  }

  deviationBar(pct) {
    let color = 'var(--accent-red)';
    if (pct >= 80) color = 'var(--accent-green)';
    else if (pct >= 50) color = 'var(--accent-gold)';
    return `<div style="width:100%;height:4px;background:var(--border-rim);border-radius:2px;margin-top:6px">
      <div style="width:${Math.min(pct, 100)}%;height:100%;background:${color};border-radius:2px"></div>
    </div>`;
  }

  renderPhaseGrid() {
    const phases = this.roadmap?.phases || [];
    if (!phases.length) {
      return `<div class="cc-card" style="margin-bottom:16px;min-height:170px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:0.95rem;font-weight:600;color:var(--text-main);margin-bottom:6px">Plan phase is ready</div>
        <div style="font-size:0.82rem;color:var(--text-muted);max-width:420px">
          Mission metrics are live. Define or ingest roadmap phases to move from planning into action.
        </div>
      </div>`;
    }
    const rows = phases.map(p => {
      const badge = p.status === 'complete' ? 'var(--accent-green)' : 'var(--text-muted)';
      return `<div class="cc-card" style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 16px;margin-bottom:4px">
        <span>${p.name || p.id || 'Phase'}</span>
        <span class="cc-badge" style="background:${badge};color:#fff">${p.status || 'pending'}</span>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:16px"><h3 style="margin:0 0 8px;font-size:0.85rem;
      color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Phases</h3>${rows}</div>`;
  }

  renderActions() {
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="cc-btn cc-btn--primary" data-action="/api/actions/resume-monitoring">Resume</button>
        <button class="cc-btn cc-btn--danger" data-action="/api/actions/panic-stop">Panic Stop</button>
        <button class="cc-btn" data-action="/api/actions/verify-integrity">Verify Chain</button>
        <button class="cc-btn cc-rollback-btn">Rollback</button>
      </div>`;
  }

  bindActions() {
    if (!this.client) return;
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await this.client.postAction(btn.dataset.action);
        } catch (_) { /* logged by postAction */ }
        finally { btn.disabled = false; }
      });
    });
    this.container.querySelector('.cc-rollback-btn')?.addEventListener('click', async (e) => {
      const checkpoints = this.hubData?.recentCheckpoints;
      const latest = Array.isArray(checkpoints) ? checkpoints[0] : null;
      const id = latest?.id || prompt('Enter checkpoint ID to rollback to:');
      if (!id) return;
      e.target.disabled = true;
      try {
        await this.client.postAction('/api/actions/rollback', { checkpointId: id });
      } catch (_) { /* logged by postAction */ }
      finally { e.target.disabled = false; }
    });
  }

  onEvent() {}
  
  renderRightPanel() {
    if (!this.hubData) return '';
    const { sentinelStatus, l3Queue } = this.hubData;
    const queueLen = l3Queue?.length || 0;
    
    return `
      <div class="cc-ops-side cc-card" style="padding: 16px;">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Governance Queue</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 2px solid ${queueLen > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Pending L3 Approvals</div>
            <div style="font-size: 14px; font-weight: bold; color: var(--text-main); font-family: var(--font-mono);">${queueLen} items</div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
            Sentinel is operating in <strong>${sentinelModeValue(sentinelStatus?.mode)}</strong> mode. System integrity is checked against the last verified block.
          </div>
          <button class="cc-btn cc-btn--primary" style="font-size: 11px; padding: 6px;" onclick="window._failsafe_client.postAction('/api/actions/approve-l3-batch').then(() => window.location.reload())">
            Approve All
          </button>
        </div>
      </div>
    `;
  }

  /**
   * B198: idempotent teardown. Clears the container DOM (which detaches all
   * listeners bound via bindActions), drops cached hub + roadmap references
   * so any re-bind on a subsequent re-init starts from a clean slate, and is
   * safe to call multiple times — second invocation is a no-op.
   */
  destroy() {
    if (this._destroyed) return;
    if (this.container) this.container.innerHTML = '';
    this.hubData = null;
    this.roadmap = null;
    this._destroyed = true;
  }
}
