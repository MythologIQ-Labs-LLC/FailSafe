// FailSafe Command Center — Agent Run Replay Renderer (B146/B150)
// Run list, step timeline, governance decision cards.

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

const KIND_COLORS = {
  file_edit: 'var(--accent-cyan)',
  file_create: 'var(--accent-green)',
  file_delete: 'var(--accent-red)',
  command_run: 'var(--accent-gold)',
  governance_decision: 'var(--primary)',
  tool_call: 'var(--accent-cyan)',
  llm_request: 'var(--accent-gold)',
  llm_response: 'var(--accent-green)',
};

const ACTION_COLORS = {
  ALLOW: 'var(--accent-green)',
  BLOCK: 'var(--accent-red)',
  MODIFY: 'var(--accent-gold)',
  ESCALATE: 'var(--accent-orange)',
  QUARANTINE: 'var(--accent-red)',
};

export class ReplayRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.activeRuns = [];
    this.completedRuns = [];
    this.selectedRunId = null;
    this.selectedRun = null;
  }

  async render() {
    if (!this.container) return;
    if (this.selectedRunId) {
      await this.fetchRunDetail(this.selectedRunId);
      this.container.innerHTML = this.renderRunDetail();
    } else {
      await this.fetchRuns();
      this.container.innerHTML = this.renderRunList();
    }
    this.bindActions();
  }

  async fetchRuns() {
    try {
      const res = await fetch('/api/v1/runs');
      if (!res.ok) return;
      const data = await res.json();
      this.activeRuns = data.active || [];
      this.completedRuns = data.completed || [];
    } catch { /* non-fatal */ }
  }

  async fetchRunDetail(runId) {
    try {
      const res = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}`);
      if (!res.ok) { this.selectedRunId = null; return; }
      const data = await res.json();
      this.selectedRun = data.run || null;
    } catch { this.selectedRunId = null; }
  }

  renderRunList() {
    const hasRuns = this.activeRuns.length || this.completedRuns.length;
    if (!hasRuns) {
      return `<div class="cc-card" style="min-height:200px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:20px">
        <div style="font-size:0.95rem;font-weight:600;color:var(--text-main);margin-bottom:6px">No agent runs recorded</div>
        <div style="font-size:0.82rem;color:var(--text-muted);max-width:360px">
          Run Replay captures agent sessions for step-by-step inspection. Runs appear after AI agents execute within this workspace.
        </div>
      </div>`;
    }
    let html = '';
    if (this.activeRuns.length) {
      html += `<div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Active Runs (${this.activeRuns.length})</div>`;
      html += this.activeRuns.map(r => this.renderRunCard(r, true)).join('');
    }
    if (this.completedRuns.length) {
      html += `<div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin:16px 0 8px">Recent Runs (${this.completedRuns.length})</div>`;
      html += this.completedRuns.slice(0, 20).map(r => this.renderRunCard(r, false)).join('');
    }
    return html;
  }

  renderRunCard(run, isActive) {
    const time = run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : '';
    const stepCount = run.steps?.length || run.stepCount || 0;
    const statusColor = isActive ? 'var(--accent-green)' : 'var(--text-muted)';
    const pulse = isActive ? ';animation:pulse 2s infinite' : '';
    // Open Design v1 provenance pill — static literal per plan v3 (no escaping
    // needed). Source field is the discriminator; only "open-design" surfaces.
    const odPill = (run.provenance && run.provenance.source === 'open-design')
      ? '<span class="cc-origin-pill cc-origin-od" title="Dispatched by Open Design">Open Design</span>'
      : '';
    return `<div class="cc-card cc-replay-run" data-run-id="${esc(run.id)}" style="margin-bottom:6px;padding:12px 16px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor}${pulse}"></span>
          <span style="font-weight:600;font-size:0.85rem">${esc(run.agentName || run.id?.slice(0, 8) || 'Run')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:0.75rem;color:var(--text-muted)">${stepCount} steps</span>
          ${odPill}
          <span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${esc(time)}</span>
        </div>
      </div>
      ${run.status ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${esc(run.status)}</div>` : ''}
    </div>`;
  }

  renderRunDetail() {
    if (!this.selectedRun) return this.renderRunList();
    const run = this.selectedRun;
    const steps = run.steps || [];
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <button class="cc-btn cc-replay-back" style="padding:4px 10px;font-size:0.75rem">Back</button>
        <span style="font-weight:600">${esc(run.agentName || run.id?.slice(0, 8))}</span>
        <span class="cc-badge" style="font-size:0.65rem">${esc(run.status || 'unknown')}</span>
      </div>
      <div style="max-height:600px;overflow-y:auto">${steps.map((s, i) => this.renderStep(s, i)).join('')}</div>`;
  }

  renderStep(step, index) {
    const color = KIND_COLORS[step.kind] || 'var(--text-muted)';
    const time = step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : '';
    let govHtml = '';
    if (step.governanceDecision) {
      govHtml = this.renderGovernanceCard(step.governanceDecision);
    }
    const diffHtml = step.diffStats
      ? `<span style="font-size:0.7rem;color:var(--accent-green)">+${step.diffStats.additions || 0}</span> <span style="font-size:0.7rem;color:var(--accent-red)">-${step.diffStats.deletions || 0}</span>`
      : '';
    return `
      <div style="display:flex;gap:12px;margin-bottom:8px">
        <div style="display:flex;flex-direction:column;align-items:center;min-width:24px">
          <span style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono)">${index + 1}</span>
          <div style="flex:1;width:2px;background:var(--border-rim);margin-top:4px"></div>
        </div>
        <div class="cc-card" style="flex:1;padding:10px 14px;border-left:3px solid ${color}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="cc-badge" style="background:${color};color:#fff;font-size:0.6rem">${esc(step.kind || 'step')}</span>
              <span style="font-size:0.83rem;font-weight:500">${esc(step.title || step.kind || 'Step')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${diffHtml}
              <span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${esc(time)}</span>
            </div>
          </div>
          ${govHtml}
        </div>
      </div>`;
  }

  renderGovernanceCard(decision) {
    const actionColor = ACTION_COLORS[decision.action] || 'var(--text-muted)';
    return `
      <div style="margin-top:6px;padding:8px 10px;background:rgba(0,0,0,0.15);border-radius:6px;border-left:3px solid ${actionColor}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="cc-badge" style="background:${actionColor};color:#fff;font-size:0.6rem">${esc(decision.action)}</span>
          ${decision.riskCategory ? `<span style="font-size:0.72rem;color:var(--text-muted)">${esc(decision.riskCategory)}</span>` : ''}
          ${decision.confidence != null ? `<span style="font-size:0.65rem;color:var(--text-muted);margin-left:auto">${Math.round(decision.confidence * 100)}%</span>` : ''}
        </div>
        ${decision.mitigation ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${esc(decision.mitigation)}</div>` : ''}
      </div>`;
  }

  bindActions() {
    this.container.querySelectorAll('.cc-replay-run').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedRunId = card.dataset.runId;
        this.render();
      });
    });
    this.container.querySelector('.cc-replay-back')?.addEventListener('click', () => {
      this.selectedRunId = null;
      this.selectedRun = null;
      this.render();
    });
  }

  onEvent(evt) {
    if (evt?.type === 'agentRun') this.render();
  }

  destroy() { if (this.container) this.container.innerHTML = ''; }
}
