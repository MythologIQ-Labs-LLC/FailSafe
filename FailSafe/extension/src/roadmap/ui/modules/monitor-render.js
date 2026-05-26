// FailSafe Console - Monitor Phase Track Renderer.
// Extracted from roadmap.js per audit Entry #278 Amendment 2.
// Pure functions over hub data + element handles. The Monitor's compact UI
// shell (`roadmap.js`) wires these into its render() pipeline.

const PHASE_INDEX_MAP = { PLAN: 0, GATE: 1, IMPLEMENT: 2, SUBSTANTIATE: 4, SEALED: 5 };
const PHASE_LABELS = ['Plan', 'Audit', 'Implement', 'Substantiate'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function getPhaseInfo(hub) {
  const gov = hub?.governancePhase;
  if (gov?.current && gov.current !== 'IDLE') {
    return { title: gov.current, index: PHASE_INDEX_MAP[gov.current] ?? 0 };
  }

  const runState = hub?.runState;
  if (runState && runState.currentPhase && runState.currentPhase !== 'Plan') {
    return { title: runState.currentPhase, index: indexFromTitle(runState.currentPhase) };
  }

  if (gov?.recentCompletions?.length > 0) {
    return { title: 'Plan', index: 0 };
  }

  const plan = hub?.activePlan || { phases: [] };
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const active = phases.find((phase) => phase.id === plan.currentPhaseId)
    || phases.find((phase) => phase.status === 'active')
    || phases[0]
    || null;

  if (!active && gov?.current === 'IDLE') {
    return { title: 'IDLE', index: -1 };
  }

  const title = String(active?.title || 'Plan');
  return { title, index: indexFromTitle(title) };
}

function indexFromTitle(title) {
  const normalized = String(title).toLowerCase();
  if (normalized.includes('substantiat') || normalized.includes('release')) return 4;
  if (normalized.startsWith('debug') || normalized.includes('fix')) return 3;
  if (normalized.startsWith('build') || normalized.includes('implement')) return 2;
  if (normalized.includes('audit') || normalized.includes('review')) return 1;
  return 0;
}

export function getFeatureSummary(phases, milestones, blockers, risks, governancePhase, recentCompletions) {
  const gov = governancePhase;
  if (gov?.recentCompletions?.length > 0) {
    return summaryFromGovernance(gov, phases, milestones, blockers, risks);
  }
  return summaryFromPlanData(phases, milestones, blockers, risks, recentCompletions);
}

function summaryFromGovernance(gov, phases, milestones, blockers, risks) {
  const recently = gov.recentCompletions
    .map((c) => formatGovernanceCompletion(c))
    .filter(Boolean)
    .slice(0, 3);
  return {
    line: recently.length > 0 ? recently.join('\n') : 'None recorded',
    critical: countCritical(blockers, risks)
      + (gov.activeAlerts?.filter((a) => a.type === 'VETO' || a.type === 'BLOCK').length || 0),
    backlog: phases.filter((phase) => phase.status === 'pending').length,
    wishlist: milestones.filter((m) => !m.completedAt && !m.targetDate).length,
  };
}

function formatGovernanceCompletion(c) {
  if (!c) return null;
  const phase = c.phase ? String(c.phase) : '';
  const plan = c.plan ? String(c.plan) : '';
  const entry = (c.entry !== undefined && c.entry !== null) ? String(c.entry) : '';
  if (phase && plan) return `${phase}: ${plan}`;
  if (phase && entry) return `${phase}: Entry #${entry}`;
  if (plan) return plan;
  if (phase) return phase;
  if (entry) return `Entry #${entry}`;
  return null;
}

function summaryFromPlanData(phases, milestones, blockers, risks, recentCompletions) {
  const completedMilestones = milestones
    .filter((m) => !!m.completedAt)
    .sort((a, b) => new Date(String(b.completedAt)).getTime() - new Date(String(a.completedAt)).getTime());
  const completedPhases = phases.filter((phase) => phase.status === 'completed');
  let recently = completedMilestones.length > 0
    ? completedMilestones.slice(0, 3).map((m) => m.title)
    : completedPhases.slice(-3).reverse().map((phase) => phase.title);

  if (recently.length === 0) {
    recently = (recentCompletions || [])
      .map((c) => formatPlanDataCompletion(c))
      .filter(Boolean)
      .slice(0, 3);
  }

  return {
    line: recently.length > 0 ? recently.join('\n') : 'None yet',
    critical: countCritical(blockers, risks),
    backlog: phases.filter((phase) => phase.status === 'pending').length,
    wishlist: milestones.filter((m) => !m.completedAt && !m.targetDate).length,
  };
}

function formatPlanDataCompletion(c) {
  if (!c) return null;
  const type = c.type ? String(c.type) : '';
  const phase = c.phase ? String(c.phase) : '';
  if (type && phase) return `${type}: ${phase}`;
  if (phase) return phase;
  if (type) return type;
  return null;
}

function countCritical(blockers, risks) {
  return blockers.filter((b) => b.severity === 'hard').length
    + risks.filter((r) => r.level === 'danger').length;
}

/**
 * Render the SHIELD phase track.
 *
 * @param {{title:string, index:number}} phaseInfo resolved phase state.
 * @param {object} els element handles (`phaseTitle`, `phaseTrack`, `debugStatus`).
 */
export function renderPhase(phaseInfo, els) {
  if (els.phaseTitle) {
    els.phaseTitle.textContent = phaseInfo.title.toUpperCase();
  }
  if (els.debugStatus) {
    const debugState = getDebugState(phaseInfo.index);
    els.debugStatus.textContent = debugState.label;
    els.debugStatus.className = `debug-status ${debugState.className}`;
  }
  if (!els.phaseTrack) return;

  const rowOne = PHASE_LABELS.map((label, idx) => {
    const mappedIndex = idx >= 3 ? 4 : idx;
    const status = mappedIndex < phaseInfo.index ? 'done'
      : mappedIndex === phaseInfo.index ? 'active'
      : 'pending';
    return `<div class="step ${status}">${escapeHtml(label)}</div>`;
  }).join('');

  els.phaseTrack.innerHTML = `
    <div class="phase-row">${rowOne}</div>
  `;
}

function getDebugState(index) {
  if (index === 3) return { label: 'Debugging', className: 'debugging' };
  if (index > 3) return { label: 'Debugged', className: 'resolved' };
  return { label: 'Debug', className: 'pending' };
}
