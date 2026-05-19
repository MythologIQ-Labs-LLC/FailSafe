import { SentinelMonitor } from './modules/sentinel-monitor.js';
import { getPhaseInfo, getFeatureSummary, renderPhase } from './modules/monitor-render.js';
import { MonitorStaleness } from './modules/monitor-staleness.js';
import { installMonitorViewportFit, fitMonitorToViewport } from './modules/monitor-viewport-fit.js';

export class WebPanelClient {
  constructor() {
    this.ws = null;
    this.hub = {
      activePlan: null,
      sentinelStatus: null,
      l3Queue: [],
      recentVerdicts: [],
      qorRuntime: null,
    };
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.connectionState = 'connecting';
    this.firstHubLoaded = false;

    this.elements = {
      phaseTitle: document.getElementById('phase-title'),
      phaseTrack: document.getElementById('phase-track'),
      planTitle: document.getElementById('monitor-plan-title'),
      stalenessBanner: document.getElementById('monitor-staleness-banner'),
      recentLine: document.getElementById('recent-line'),
      nextStep: document.getElementById('next-step'),
      sentinelLabel: document.getElementById('sentinel-label'),
      sentinelOrb: document.getElementById('sentinel-orb'),
      queueValue: document.getElementById('queue-value'),
      sentinelAlert: document.getElementById('sentinel-alert'),
      modeBanner: document.getElementById('mode-banner'),
      healthBlockers: document.getElementById('health-blockers'),
      blockersGraphic: document.getElementById('blockers-graphic'),
      blockerBar: document.getElementById('blocker-bar'),
      bucketFill: document.getElementById('bucket-fill'),
      bucketShell: document.getElementById('bucket-shell'),
      bucketText: document.getElementById('bucket-text'),
      gaugeWrap: document.getElementById('gauge-wrap'),
      gaugeValue: document.getElementById('gauge-value'),
      errorBudget: document.getElementById('error-budget'),
      trendSlider: document.getElementById('trend-slider'),
      trendFill: document.getElementById('trend-fill'),
      trendThumb: document.getElementById('trend-thumb'),
      policyTrend: document.getElementById('policy-trend'),
      statusLine: document.getElementById('status-line'),
      governanceAlerts: document.getElementById('governance-alerts'),
      complianceGrade: document.getElementById('compliance-grade'),
      complianceBar: document.getElementById('compliance-bar'),
      complianceFill: document.getElementById('compliance-fill'),
      complianceScore: document.getElementById('compliance-score'),
    };

    this.sentinelMonitor = new SentinelMonitor(this.elements);
    this.staleness = new MonitorStaleness(this.elements);
    this.connect();
    this.fetchHub();
  }

  connect() {
    this.setConnectionState('connecting');
    this.ws = new WebSocket(`ws://${window.location.host}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.setConnectionState('connected');
      this.staleness?.notifyConnected();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      this.setConnectionState('disconnected');
      this.staleness?.notifyDisconnected();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setConnectionState('error');
    };
  }

  setConnectionState(state) {
    this.connectionState = state;
    const labels = {
      connecting: 'Connecting...',
      connected: 'Connected',
      disconnected: 'Disconnected - retrying...',
      error: 'Connection error',
    };
    this.setStatus(labels[state] || state);
    // Coordinate sentinel display with connection state. When the WS is
    // not yet established (connecting/error/disconnected) AND no hub data
    // has arrived, show neutral sentinel — never green by default.
    if (state !== 'connected' && !this.firstHubLoaded) {
      this.paintPendingSentinel();
    }
  }

  paintPendingSentinel() {
    if (this.elements.sentinelOrb) {
      this.elements.sentinelOrb.className = 'sentinel-orb pending';
    }
    if (this.elements.sentinelLabel) {
      this.elements.sentinelLabel.textContent = '—';
    }
    if (this.elements.queueValue) {
      this.elements.queueValue.textContent = '—';
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * (2 ** (this.reconnectAttempts - 1))) + Math.floor(Math.random() * 400);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleMessage(data) {
    if (data.type === 'init' && data.payload) {
      this.hub = data.payload;
      this.render();
      return;
    }
    if (data.type === 'hub.refresh' || data.type === 'event' || data.type === 'verdict') {
      this.fetchHub();
    }
  }

  async fetchHub() {
    try {
      const res = await fetch('/api/hub');
      if (!res.ok) throw new Error(`Hub request failed (${res.status})`);
      this.hub = await res.json();
      this.firstHubLoaded = true;
      this.render();
    } catch {
      this.setStatus('Unable to load hub data');
    }
  }

  render() {
    const plan = this.hub.activePlan || { phases: [], blockers: [], milestones: [], risks: [] };
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const blockers = (plan.blockers || []).filter((blocker) => !blocker.resolvedAt);
    const risks = (plan.risks || []);
    const milestones = (plan.milestones || []);

    const phaseInfo = getPhaseInfo(this.hub);
    const summary = getFeatureSummary(
      phases, milestones, blockers, risks,
      this.hub.governancePhase, this.hub.recentCompletions,
    );
    const nextStep = this.getNextStep(
      blockers,
      this.hub.l3Queue || [],
      this.hub.sentinelStatus || {},
      this.hub.qorRuntime || {},
    );

    renderPhase(phaseInfo, this.elements);
    this.renderFeatureSummary(summary);
    if (this.elements.planTitle) {
      this.elements.planTitle.textContent = plan.title ? `Tracking: ${plan.title}` : '—';
    }
    if (this.elements.nextStep) {
      this.elements.nextStep.textContent = nextStep;
    }

    this.sentinelMonitor.renderSentinel(this.hub.sentinelStatus || {}, this.hub.recentVerdicts || []);
    this.sentinelMonitor.renderModeBanner(this.hub.governanceModeState);
    this.sentinelMonitor.renderWorkspaceHealth(this.hub, plan, blockers, risks, this.hub.recentVerdicts || []);
    this.renderQorRuntime(this.hub.qorRuntime || {});
    this.renderGovernanceAlerts(this.hub.governancePhase?.activeAlerts || []);
    this.renderRepoCompliance(this.hub.repoCompliance || {});
  }

  getNextStep(blockers, queue, sentinelStatus, qorRuntime) {
    // Prefer governance next steps from ledger, BUT only when META_LEDGER actually
    // reflects an in-flight session. When gov.current is IDLE we must defer to the
    // active plan phase (same source the phase track uses) so the two tiles agree.
    const gov = this.hub?.governancePhase;
    const govActive = gov?.current && gov.current !== 'IDLE';
    if (govActive && gov?.nextSteps?.length > 0) {
      return gov.nextSteps[0];
    }

    const planDerived = this.deriveNextStepFromPlanPhase();
    if (planDerived) return planDerived;

    if (gov?.nextSteps?.length > 0) {
      return gov.nextSteps[0];
    }

    if (qorRuntime.enabled && !qorRuntime.connected) {
      return `Qor runtime is unreachable at ${qorRuntime.baseUrl || 'configured endpoint'}. Restore runtime connectivity first.`;
    }
    if (blockers.length > 0) {
      return `Resolve ${blockers.length} active blocker(s) before continuing.`;
    }
    if (queue.length > 0) {
      return `Review ${queue.length} pending L3 approval request(s).`;
    }
    if (!sentinelStatus.running) {
      return 'Resume Sentinel monitoring.';
    }
    return 'Continue the active build phase.';
  }

  /** Derive a next-step prompt from the active plan phase the track is showing.
   *  Returns null if no active phase is available. Mirrors indexFromTitle in
   *  monitor-render.js so the recommendation stays aligned with the highlighted
   *  step in the phase track. */
  deriveNextStepFromPlanPhase() {
    const hub = this.hub;
    if (!hub) return null;
    const runPhase = hub.runState?.currentPhase;
    const plan = hub.activePlan || { phases: [] };
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const active = phases.find((p) => p.id === plan.currentPhaseId)
      || phases.find((p) => p.status === 'active')
      || null;
    const title = String(runPhase || active?.title || '').toLowerCase();
    if (!title) return null;
    if (title.includes('substantiat') || title.includes('release')) return 'Run /qor-substantiate to seal the session.';
    if (title.startsWith('debug') || title.includes('fix')) return 'Run /qor-debug to diagnose, then re-audit.';
    if (title.startsWith('build') || title.includes('implement')) return 'Run /qor-implement to begin implementation.';
    if (title.includes('audit') || title.includes('review')) return 'Run /qor-audit to submit the plan for Gate Tribunal review.';
    if (title.includes('plan')) return 'Run /qor-plan to author the implementation plan.';
    return null;
  }

  renderFeatureSummary(summary) {
    if (this.elements.recentLine) {
      this.elements.recentLine.textContent = summary.line;
    }
  }

  // Sentinel and workspace health rendering delegated to SentinelMonitor module

  renderQorRuntime() {
    // Qor runtime data now rendered in Command Center overview; Monitor no longer owns it.
  }

  renderRepoCompliance(compliance) {
    if (!this.elements.complianceGrade) return;

    const grade = compliance.grade || '-';
    const percentage = compliance.percentage || 0;
    const errors = compliance.errors || 0;
    const warnings = compliance.warnings || 0;

    // Update grade display
    this.elements.complianceGrade.textContent = grade;
    this.elements.complianceGrade.className = 'compliance-grade grade-' + grade.toLowerCase();

    // Update progress bar
    if (this.elements.complianceFill) {
      this.elements.complianceFill.style.width = `${percentage}%`;
      this.elements.complianceFill.style.background = this.gradeColor(grade);
    }

    // Update score text
    if (this.elements.complianceScore) {
      this.elements.complianceScore.textContent = `${percentage}%`;
    }

    // Update tooltip
    if (this.elements.complianceBar) {
      const violations = compliance.topViolations || [];
      const violationText = violations.length > 0
        ? violations.map((v) => `• ${v.message}`).join('\n')
        : 'No violations';
      this.elements.complianceBar.title = `Repo Governance: ${grade} (${percentage}%)\nErrors: ${errors}, Warnings: ${warnings}\n\n${violationText}`;
    }
  }

  gradeColor(grade) {
    switch (grade) {
      case 'A': return 'var(--good)';
      case 'B': return '#22d3ee';
      case 'C': return 'var(--warn)';
      case 'D': return '#f97316';
      case 'F': return 'var(--bad)';
      default: return 'var(--muted)';
    }
  }

  renderGovernanceAlerts(alerts) {
    if (!this.elements.governanceAlerts) return;

    if (!alerts || alerts.length === 0) {
      this.elements.governanceAlerts.classList.add('hidden');
      this.elements.governanceAlerts.innerHTML = '';
      return;
    }

    this.elements.governanceAlerts.classList.remove('hidden');
    this.elements.governanceAlerts.innerHTML = alerts.map((alert) => {
      const typeClass = alert.type?.toLowerCase() || 'warning';
      const icon = alert.type === 'VETO' ? '⛔' : alert.type === 'BLOCK' ? '🚫' : '⚠️';
      return `
        <div class="governance-alert ${typeClass}" data-alert-id="${this.escapeHtml(alert.id)}" title="Click for details">
          <span class="alert-icon">${icon}</span>
          <span class="alert-message">${this.escapeHtml(alert.message)}</span>
          ${alert.entry ? `<span class="alert-entry">#${alert.entry}</span>` : ''}
        </div>
      `;
    }).join('');

    // Add click handlers for details modal
    this.elements.governanceAlerts.querySelectorAll('.governance-alert').forEach((el) => {
      el.addEventListener('click', () => {
        const alertId = el.getAttribute('data-alert-id');
        const alert = alerts.find((a) => a.id === alertId);
        if (alert) {
          this.showAlertDetails(alert);
        }
      });
    });
  }

  showAlertDetails(alert) {
    // Create modal overlay
    const existing = document.getElementById('alert-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'alert-modal';
    modal.className = 'alert-modal-overlay';
    modal.innerHTML = `
      <div class="alert-modal">
        <div class="alert-modal-header">
          <span class="alert-modal-type ${alert.type?.toLowerCase()}">${this.escapeHtml(alert.type)}</span>
          <button class="alert-modal-close">&times;</button>
        </div>
        <div class="alert-modal-body">
          <p class="alert-modal-message">${this.escapeHtml(alert.message)}</p>
          ${alert.entry ? `<p class="alert-modal-entry">Ledger Entry: #${alert.entry}</p>` : ''}
          ${alert.details ? `<pre class="alert-modal-details">${this.escapeHtml(alert.details)}</pre>` : ''}
        </div>
        <div class="alert-modal-footer">
          <button class="alert-modal-dismiss">Dismiss</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.alert-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.alert-modal-dismiss').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // buildPolicyTrend and metricColor moved to SentinelMonitor module

  setStatus(message) {
    if (!this.elements.statusLine) return;
    this.elements.statusLine.textContent = message;
  }

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  // Metric Explanations
  getMetricExplanations() {
    return this.sentinelMonitor.getMetricExplanations();
  }

  showMetricExplanation(metricKey) {
    const explanations = this.getMetricExplanations();
    const metric = explanations[metricKey];
    if (!metric) return;

    const existing = document.getElementById('metric-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'metric-modal';
    modal.className = 'metric-modal-overlay';
    modal.innerHTML = `
      <div class="metric-modal">
        <div class="metric-modal-header">
          <span class="metric-modal-title">${this.escapeHtml(metric.title)}</span>
          <button class="metric-modal-close">&times;</button>
        </div>
        <div class="metric-modal-body">
          <p class="metric-description">${this.escapeHtml(metric.description)}</p>
          <div class="metric-formula">
            <div class="metric-formula-title">How It's Calculated</div>
            <div class="metric-formula-content">${this.escapeHtml(metric.formula)}</div>
          </div>
          <div class="metric-thresholds">
            ${metric.thresholds.map(t => `
              <div class="metric-threshold">
                <span class="metric-threshold-dot ${t.level}"></span>
                <span class="metric-threshold-label">${this.escapeHtml(t.text)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="metric-modal-footer">
          <button class="metric-modal-dismiss">Got it</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.metric-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.metric-modal-dismiss').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  setupMetricClickHandlers() {
    document.querySelectorAll('.health-item[data-metric]').forEach((item) => {
      item.addEventListener('click', (e) => {
        const metricKey = item.getAttribute('data-metric');
        if (metricKey) {
          this.showMetricExplanation(metricKey);
        }
      });
    });
  }

  // Transparency and risk data now served via Command Center modules only.
}

// Guarded so this file remains importable from Node-side mocha tests
// (e.g. roadmap-connection.test.ts) which run without a real DOM. In a
// browser, `document` is always defined and the auto-instantiation runs
// exactly as before.
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const client = new WebPanelClient();

    // Set up metric click handlers for explanations
    client.setupMetricClickHandlers();

    // Compact-sidebar vertical fit: scale .stack so all contents fit
    // the viewport without an outer scroll. Re-fits on resize + hub
    // refreshes (queue size etc. change card heights).
    installMonitorViewportFit();
  });
}

// Trigger a viewport re-fit whenever WebPanelClient receives a hub payload
// — exposed for external callers (e.g., other UI modules that mutate
// .stack content imperatively).
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).__failsafeRefitMonitor = fitMonitorToViewport;
}
