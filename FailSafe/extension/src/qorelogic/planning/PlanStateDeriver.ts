/**
 * PlanStateDeriver - Pure event replay + derived state helpers.
 *
 * Owns the reducer that folds PlanEvent[] into a Plan, and the
 * sprint-metrics derivation that depends on a derived Plan.
 */
import { Plan, PlanPhase, RiskLevel, SprintMetrics } from './types';
import { PlanEvent } from './PlanManager';

function emptyMetrics(): SprintMetrics {
  return {
    phasesPlanned: 0,
    phasesCompleted: 0,
    phasesSkipped: 0,
    blockersEncountered: 0,
    blockersResolved: 0,
    risksIdentified: 0,
    milestonesAchieved: 0
  };
}

function applyPlanCreated(event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const createdPhases = (p.phases as PlanPhase[]) || [];
  return {
    id: event.planId,
    intentId: p.intentId as string,
    title: p.title as string,
    phases: createdPhases.map((ph: PlanPhase) => ({ ...ph, status: ph.status || 'pending' })),
    blockers: [], risks: [], milestones: [],
    currentPhaseId: createdPhases.length > 0 ? createdPhases[0].id : '',
    createdAt: event.timestamp, updatedAt: event.timestamp
  };
}

function applyArtifactTouched(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const phaseId = p.phaseId as string;
  const artifactPath = p.path as string;
  const phase = plan.phases.find(ph => ph.id === phaseId);
  if (phase) {
    const artifact = phase.artifacts.find(a => a.path === artifactPath);
    if (artifact) { artifact.touched = true; }
  }
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyBlockerAdded(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const blockerId = p.blockerId as string;
  const phaseId = p.phaseId as string;
  const reason = p.reason as string;
  plan.blockers.push({
    id: blockerId, phaseId, title: reason, reason,
    severity: 'hard', createdAt: event.timestamp
  });
  const blockedPhase = plan.phases.find(ph => ph.id === phaseId);
  if (blockedPhase) { blockedPhase.status = 'blocked'; }
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyBlockerResolved(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const blockerId = p.blockerId as string;
  const blocker = plan.blockers.find(b => b.id === blockerId);
  if (blocker) {
    blocker.resolvedAt = event.timestamp;
    const ph = plan.phases.find(x => x.id === blocker.phaseId);
    if (ph && ph.status === 'blocked') { ph.status = 'active'; }
  }
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyPhaseSkipped(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const phaseId = p.phaseId as string;
  const skippedPhase = plan.phases.find(ph => ph.id === phaseId);
  if (skippedPhase) { skippedPhase.status = 'skipped'; }
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyPhaseStarted(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const phaseId = p.phaseId as string;
  const startedPhase = plan.phases.find(ph => ph.id === phaseId);
  if (startedPhase) {
    startedPhase.status = 'active';
    plan.currentPhaseId = phaseId;
  }
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyMilestoneAdded(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  plan.milestones.push({
    id: p.milestoneId as string, phaseId: p.phaseId as string, title: p.title as string,
    targetDate: p.targetDate as string | undefined, icon: p.icon as string | undefined
  });
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyMilestoneCompleted(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const milestoneId = p.milestoneId as string;
  const milestone = plan.milestones.find(m => m.id === milestoneId);
  if (milestone) { milestone.completedAt = event.timestamp; }
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyRiskIdentified(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  plan.risks.push({
    id: p.riskId as string, phaseId: p.phaseId as string, title: p.title as string,
    level: p.level as RiskLevel, description: p.description as string,
    mitigations: (p.mitigations as string[]) || [], createdAt: event.timestamp
  });
  plan.updatedAt = event.timestamp;
  return plan;
}

function applyRiskUpdated(plan: Plan, event: PlanEvent): Plan {
  const p = event.payload as Record<string, unknown>;
  const riskId = p.riskId as string;
  const risk = plan.risks.find(r => r.id === riskId);
  if (risk) {
    risk.level = p.level as RiskLevel;
    if (p.description) { risk.description = p.description as string; }
    risk.updatedAt = event.timestamp;
  }
  plan.updatedAt = event.timestamp;
  return plan;
}

export function applyEvent(plan: Plan | null, event: PlanEvent): Plan | null {
  if (event.type === 'plan.created') { return applyPlanCreated(event); }
  if (!plan) { return null; }
  switch (event.type) {
    case 'artifact.touched': return applyArtifactTouched(plan, event);
    case 'blocker.added': return applyBlockerAdded(plan, event);
    case 'blocker.resolved': return applyBlockerResolved(plan, event);
    case 'phase.skipped': return applyPhaseSkipped(plan, event);
    case 'phase.started': return applyPhaseStarted(plan, event);
    case 'milestone.added': return applyMilestoneAdded(plan, event);
    case 'milestone.completed': return applyMilestoneCompleted(plan, event);
    case 'risk.identified': return applyRiskIdentified(plan, event);
    case 'risk.updated': return applyRiskUpdated(plan, event);
    default: return plan;
  }
}

export function deriveState(events: PlanEvent[]): Plan | null {
  if (events.length === 0) { return null; }
  let plan: Plan | null = null;
  for (const event of events) { plan = applyEvent(plan, event); }
  return plan;
}

export function calculateSprintMetrics(plan: Plan | undefined): SprintMetrics {
  if (!plan) { return emptyMetrics(); }
  return {
    phasesPlanned: plan.phases.length,
    phasesCompleted: plan.phases.filter(p => p.status === 'completed').length,
    phasesSkipped: plan.phases.filter(p => p.status === 'skipped').length,
    blockersEncountered: plan.blockers.length,
    blockersResolved: plan.blockers.filter(b => !!b.resolvedAt).length,
    risksIdentified: plan.risks.length,
    milestonesAchieved: plan.milestones.filter(m => !!m.completedAt).length
  };
}
