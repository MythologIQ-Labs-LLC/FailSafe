// SentinelMonitor — Extracted from roadmap.js for Section 4 Razor compliance
// Handles sentinel status, workspace health metrics, and metric explanations

export class SentinelMonitor {
  constructor(elements) {
    this.elements = elements;
  }

  metricColor(value) {
    if (value <= 30) return '#3d7dff';
    if (value <= 60) return '#eab308';
    return '#ef4444';
  }

  renderSentinel(status, verdicts) {
    const queueDepth = Number(status.queueDepth || 0);
    const verdict = String(status.lastVerdict?.decision || 'PASS');

    let state = status.running ? 'monitoring' : 'pending';
    let label = status.running ? 'Monitoring' : 'Idle';
    if (verdict === 'WARN') { state = 'warnings'; label = 'Warnings'; }
    else if (['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(verdict)) { state = 'errors'; label = 'Errors'; }

    if (this.elements.sentinelLabel) this.elements.sentinelLabel.textContent = label;
    if (this.elements.sentinelOrb) this.elements.sentinelOrb.className = `sentinel-orb ${state}`;
    if (this.elements.queueValue) this.elements.queueValue.textContent = String(queueDepth);

    const alert = verdicts.find(v => ['WARN', 'BLOCK', 'ESCALATE', 'QUARANTINE'].includes(String(v.decision || '')));
    if (!this.elements.sentinelAlert) return;
    if (!alert) {
      this.elements.sentinelAlert.classList.add('hidden');
      this.elements.sentinelAlert.textContent = '';
      this.elements.sentinelAlert.onclick = null;
      return;
    }
    this.elements.sentinelAlert.classList.remove('hidden');
    this.elements.sentinelAlert.textContent = String(alert.summary || 'Sentinel raised a risk signal.');
    this.elements.sentinelAlert.title = 'Click to view details in Command Center';
    this.elements.sentinelAlert.onclick = () => window.open('/command-center.html#governance', '_blank');
  }

  renderWorkspaceHealth(hub, plan, blockers, risks, verdicts) {
    const phases = Array.isArray(plan?.phases) ? plan.phases : [];
    const hardBlockers = blockers.filter(b => b.severity === 'hard').length;

    const artifacts = phases.flatMap(p => p.artifacts || []);
    const touchedArtifacts = artifacts.filter(a => a.touched).length;
    const artifactBacklog = Math.max(0, artifacts.length - touchedArtifacts);
    const queueBacklog = Math.max(0, Number(hub.sentinelStatus?.queueDepth || 0));
    const unverified = artifactBacklog > 0 ? artifactBacklog : queueBacklog;
    const unverifiedPercent = Math.min(100, Math.round((unverified / Math.max(12, unverified)) * 100));

    const sorted = [...verdicts].sort((a, b) =>
      new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );
    const resolvedPhases = new Set();
    for (const v of sorted) {
      if (String(v.decision || '') === 'PASS' && v.phase) resolvedPhases.add(v.phase);
    }
    const unresolvedVerdicts = sorted.filter(v => !resolvedPhases.has(v.phase));
    const severeHits = unresolvedVerdicts.filter(v => ['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(String(v.decision || ''))).length;
    const warnHits = unresolvedVerdicts.filter(v => String(v.decision || '') === 'WARN').length;
    const dangerRisks = risks.filter(r => r.level === 'danger').length;

    const errorBudgetPoints = (hardBlockers * 20) + (dangerRisks * 16) + (queueBacklog * 3) + (severeHits * 12) + (warnHits * 4);
    const errorBudgetBurn = Math.min(100, Math.round(errorBudgetPoints));
    const trend = this.buildPolicyTrend(verdicts);

    this.renderBlockers(hardBlockers);
    this.renderUnverified(unverified, unverifiedPercent);
    this.renderErrorBudget(errorBudgetBurn);
    this.renderTrend(trend);
  }

  renderBlockers(hardBlockers) {
    if (this.elements.healthBlockers) this.elements.healthBlockers.textContent = String(hardBlockers);
    if (this.elements.blockerBar) this.elements.blockerBar.style.opacity = hardBlockers > 0 ? '1' : '0.5';
    if (this.elements.blockersGraphic) {
      this.elements.blockersGraphic.title = `Critical blockers detected: ${hardBlockers}.`;
      this.elements.blockersGraphic.style.cursor = 'pointer';
      this.elements.blockersGraphic.onclick = () => window.open('/command-center.html#governance', '_blank');
    }
  }

  renderUnverified(unverified, percent) {
    if (this.elements.bucketFill) this.elements.bucketFill.style.height = `${percent}%`;
    if (this.elements.bucketText) this.elements.bucketText.textContent = `${percent}% Full`;
    if (this.elements.bucketShell) this.elements.bucketShell.title = `Unverified changes estimate: ${unverified} item(s), ${percent}% of buffer.`;
  }

  renderErrorBudget(burn) {
    const circumference = Math.PI * 40;
    const offset = circumference - (burn / 100) * circumference;
    if (this.elements.gaugeValue) {
      this.elements.gaugeValue.style.strokeDasharray = `${circumference}`;
      this.elements.gaugeValue.style.strokeDashoffset = `${offset}`;
      this.elements.gaugeValue.style.stroke = this.metricColor(burn);
    }
    if (this.elements.errorBudget) this.elements.errorBudget.textContent = `${burn}%`;
    if (this.elements.gaugeWrap) {
      this.elements.gaugeWrap.title = `Error budget burn: ${burn}%. Derived from unresolved blockers, queue depth, and risk verdicts.`;
      this.elements.gaugeWrap.style.cursor = 'pointer';
      this.elements.gaugeWrap.onclick = () => window.open('/command-center.html#governance', '_blank');
    }
  }

  renderTrend(trend) {
    if (this.elements.trendFill) {
      this.elements.trendFill.style.width = `${trend}%`;
      this.elements.trendFill.style.background = this.metricColor(trend);
    }
    if (this.elements.trendThumb) {
      this.elements.trendThumb.style.left = `${trend}%`;
      this.elements.trendThumb.style.background = this.metricColor(trend);
    }
    if (this.elements.policyTrend) this.elements.policyTrend.textContent = `${trend}%`;
    if (this.elements.trendSlider) this.elements.trendSlider.title = `Policy trend index: ${trend}%. Lower is healthier.`;
  }

  buildPolicyTrend(verdicts) {
    const weighted = verdicts.map(v => {
      if (v.decision === 'WARN') return 45;
      if (['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(String(v.decision || ''))) return 85;
      return 15;
    });
    if (weighted.length === 0) return 0;
    const avg = weighted.reduce((sum, item) => sum + item, 0) / weighted.length;
    return Math.max(0, Math.min(100, Math.round(avg)));
  }

  getMetricExplanations() {
    return {
      blockers: {
        title: 'Critical Blockers',
        description: 'Hard blockers are issues that must be resolved before the project can proceed.',
        formula: 'Count of blockers with severity = "hard"',
        thresholds: [
          { level: 'good', text: '0 — Clear to proceed' },
          { level: 'warn', text: '1-2 — Address before continuing' },
          { level: 'bad', text: '3+ — Stop and resolve immediately' },
        ],
      },
      unverified: {
        title: 'Unverified Changes',
        description: 'Changes not yet verified by Sentinel or the governance pipeline.',
        formula: 'artifacts.length - touchedArtifacts.length\n+ sentinelQueue.depth',
        thresholds: [
          { level: 'good', text: '0-30% — Healthy pace' },
          { level: 'warn', text: '31-70% — Consider verification pass' },
          { level: 'bad', text: '71-100% — Backlog needs attention' },
        ],
      },
      errorbudget: {
        title: 'Error Budget Burn',
        description: 'Composite score of unresolved issues. Resolved verdicts (where a later PASS exists in the same phase) are excluded.',
        formula: '(hardBlockers × 20)\n+ (dangerRisks × 16)\n+ (queueBacklog × 3)\n+ (severeVerdicts × 12)\n+ (warnVerdicts × 4)',
        thresholds: [
          { level: 'good', text: '0-30% — Healthy margin' },
          { level: 'warn', text: '31-60% — Caution advised' },
          { level: 'bad', text: '61-100% — Budget exhausted' },
        ],
      },
      trend: {
        title: 'Policy Trend',
        description: 'Recent trend of Sentinel verdicts. Lower is healthier.',
        formula: 'Weighted average:\n• PASS = 15\n• WARN = 45\n• BLOCK/ESCALATE = 85',
        thresholds: [
          { level: 'good', text: '0-30% — Strong compliance' },
          { level: 'warn', text: '31-60% — Mixed signals' },
          { level: 'bad', text: '61-100% — Policy violations trending' },
        ],
      },
      compliance: {
        title: 'Repository Compliance',
        description: 'Adherence to Repository Governance Standard.',
        formula: 'max_score - (errors × 2) - (warnings × 1)',
        thresholds: [
          { level: 'good', text: 'A (90-100%) — Exemplary governance' },
          { level: 'warn', text: 'B-C (70-89%) — Minor gaps' },
          { level: 'bad', text: 'D-F (<70%) — Significant gaps' },
        ],
      },
    };
  }
}
