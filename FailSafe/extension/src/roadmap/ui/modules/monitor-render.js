// FailSafe Command Center — Monitor Phase Track Renderer
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
    .slice(0, 3)
    .map((c) => c.plan ? `${c.phase}: ${c.plan}` : `${c.phase}: Entry #${c.entry}`);
  return {
    line: recently.join('\n'),
    critical: countCritical(blockers, risks)
      + (gov.activeAlerts?.filter((a) => a.type === 'VETO' || a.type === 'BLOCK').length || 0),
    backlog: phases.filter((phase) => phase.status === 'pending').length,
    wishlist: milestones.filter((m) => !m.completedAt && !m.targetDate).length,
  };
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
    recently = (recentCompletions || []).slice(0, 3).map((c) => `${c.type}: ${c.phase}`);
  }

  return {
    line: recently.length > 0 ? recently.join('\n') : 'None yet',
    critical: countCritical(blockers, risks),
    backlog: phases.filter((phase) => phase.status === 'pending').length,
    wishlist: milestones.filter((m) => !m.completedAt && !m.targetDate).length,
  };
}

function countCritical(blockers, risks) {
  return blockers.filter((b) => b.severity === 'hard').length
    + risks.filter((r) => r.level === 'danger').length;
}

export function renderPhase(phaseInfo, els) {
  if (els.phaseTitle) {
    els.phaseTitle.textContent = phaseInfo.title.toUpperCase();
  }
  if (!els.phaseTrack) return;

  const rowOne = PHASE_LABELS.map((label, idx) => {
    const mappedIndex = idx >= 3 ? 4 : idx;
    const status = mappedIndex < phaseInfo.index ? 'done'
      : mappedIndex === phaseInfo.index ? 'active'
      : 'pending';
    return `<div class="step ${status}">${escapeHtml(label)}</div>`;
  }).join('');

  const debugStatus = phaseInfo.index === 3 ? 'debugging' : phaseInfo.index > 3 ? 'active' : 'pending';
  const debugLabel = phaseInfo.index === 3 ? 'Debugging...' : phaseInfo.index > 3 ? 'Debugged' : 'Debug';
  els.phaseTrack.innerHTML = `
    <div class="phase-row">${rowOne}</div>
    <div class="phase-row debug-row"><div class="step ${debugStatus}">${debugLabel}</div></div>
  `;
}
