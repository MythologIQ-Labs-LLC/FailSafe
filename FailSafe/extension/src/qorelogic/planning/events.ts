/**
 * QorLogic Planning Events
 *
 * Event-sourced plan state management. Events are append-only, replayable,
 * and auditable. The current Plan state is derived by replaying all events.
 */

import type {
  Plan,
  PlanPhase,
  Blocker,
  RiskMarker,
  PhaseStatus,
  Milestone,
  RiskLevel,
} from "./types";

/** File operation types tracked for artifact modifications */
export type ArtifactOperation = "write" | "create" | "delete" | "rename";

/** Base event structure with timestamp and plan reference */
interface BaseEvent {
  at: string;
  planId: string;
}

/** Emitted when a new plan is created */
export interface PlanCreatedEvent extends BaseEvent {
  type: "plan.created";
  title: string;
  intentId?: string;
}

/** Emitted when a phase is added to the plan */
export interface PhaseAddedEvent extends BaseEvent {
  type: "phase.added";
  phase: PlanPhase;
}

/** Emitted when a phase begins execution */
export interface PhaseStartedEvent extends BaseEvent {
  type: "phase.started";
  phaseId: string;
}

/** Emitted when a phase completes successfully */
export interface PhaseCompletedEvent extends BaseEvent {
  type: "phase.completed";
  phaseId: string;
}

/** Emitted when a phase is intentionally skipped (detour support) */
export interface PhaseSkippedEvent extends BaseEvent {
  type: "phase.skipped";
  phaseId: string;
}

/** Emitted when an artifact is modified during a phase */
export interface ArtifactTouchedEvent extends BaseEvent {
  type: "artifact.touched";
  phaseId: string;
  path: string;
  operation: ArtifactOperation;
}

/** Emitted when a blocker is identified */
export interface BlockerAddedEvent extends BaseEvent {
  type: "blocker.added";
  blockerId: string;
  phaseId: string;
  title: string;
  reason: string;
  severity?: "hard" | "soft";
  detourPhaseId?: string;
}

/** Emitted when a blocker is resolved */
export interface BlockerResolvedEvent extends BaseEvent {
  type: "blocker.resolved";
  blockerId: string;
}

/** Emitted when a risk is identified */
export interface RiskIdentifiedEvent extends BaseEvent {
  type: "risk.identified";
  riskId: string;
  phaseId: string;
  title: string;
  level: "clear" | "caution" | "danger";
  description: string;
  mitigations?: string[];
}

/** Emitted when the entire plan completes */
export interface PlanCompletedEvent extends BaseEvent {
  type: "plan.completed";
}

/** Emitted when a milestone is added to a phase */
export interface MilestoneAddedEvent extends BaseEvent {
  type: "milestone.added";
  milestoneId: string;
  phaseId: string;
  title: string;
  targetDate?: string;
  icon?: string;
}

/** Emitted when a milestone is completed */
export interface MilestoneCompletedEvent extends BaseEvent {
  type: "milestone.completed";
  milestoneId: string;
}

/** Emitted when a risk level is updated */
export interface RiskUpdatedEvent extends BaseEvent {
  type: "risk.updated";
  riskId: string;
  level: RiskLevel;
  description?: string;
}

/** Union type of all plan events */
export type PlanEvent =
  | PlanCreatedEvent
  | PhaseAddedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | PhaseSkippedEvent
  | ArtifactTouchedEvent
  | BlockerAddedEvent
  | BlockerResolvedEvent
  | RiskIdentifiedEvent
  | PlanCompletedEvent
  | MilestoneAddedEvent
  | MilestoneCompletedEvent
  | RiskUpdatedEvent;

/** Creates an empty Plan structure for initialization */
function createEmptyPlan(planId: string, title: string, at: string): Plan {
  return {
    id: planId,
    intentId: "",
    title,
    phases: [],
    blockers: [],
    risks: [],
    milestones: [],
    currentPhaseId: "",
    createdAt: at,
    updatedAt: at,
  };
}

/** Calculates weighted progress based on touched artifacts */
function calcProgress(phase: PlanPhase): number {
  if (phase.artifacts.length === 0)
    return phase.status === "completed" ? 100 : 0;
  const total = phase.artifacts.reduce((s, a) => s + (a.weight ?? 1), 0);
  const touched = phase.artifacts
    .filter((a) => a.touched)
    .reduce((s, a) => s + (a.weight ?? 1), 0);
  return total > 0 ? Math.round((touched / total) * 100) : 0;
}

/** Maps phases, updating a specific phase by ID with new status */
function setPhaseStatus(
  phases: PlanPhase[],
  id: string,
  status: PhaseStatus,
  extra?: Partial<PlanPhase>,
): PlanPhase[] {
  return phases.map((p) => (p.id === id ? { ...p, status, ...extra } : p));
}

/** Handles artifact.touched event */
function handleArtifactTouched(base: Plan, event: ArtifactTouchedEvent): Plan {
  const phases = base.phases.map((phase) => {
    if (phase.id !== event.phaseId) return phase;
    const artifacts = phase.artifacts.map((a) =>
      a.path === event.path ? { ...a, touched: true } : a,
    );
    const updated = { ...phase, artifacts };
    return { ...updated, progress: calcProgress(updated) };
  });
  return { ...base, phases };
}

/** Handles blocker.added event */
function handleBlockerAdded(base: Plan, event: BlockerAddedEvent): Plan {
  const blocker: Blocker = {
    id: event.blockerId,
    phaseId: event.phaseId,
    title: event.title,
    reason: event.reason,
    severity: event.severity ?? "hard",
    detourPhaseId: event.detourPhaseId,
    createdAt: event.at,
  };
  const phases = setPhaseStatus(base.phases, event.phaseId, "blocked");
  return { ...base, phases, blockers: [...base.blockers, blocker] };
}

/** Handles blocker.resolved event */
function handleBlockerResolved(base: Plan, event: BlockerResolvedEvent): Plan {
  const blockers = base.blockers.map((b) =>
    b.id === event.blockerId ? { ...b, resolvedAt: event.at } : b,
  );
  const resolved = base.blockers.find((b) => b.id === event.blockerId);
  if (!resolved) return { ...base, blockers };

  const stillBlocked = blockers.some(
    (b) => b.phaseId === resolved.phaseId && !b.resolvedAt,
  );
  const phases = stillBlocked
    ? base.phases
    : setPhaseStatus(base.phases, resolved.phaseId, "active");
  return { ...base, phases, blockers };
}

/** Handles risk.identified event */
function handleRiskIdentified(base: Plan, event: RiskIdentifiedEvent): Plan {
  const risk: RiskMarker = {
    id: event.riskId,
    phaseId: event.phaseId,
    title: event.title,
    level: event.level,
    description: event.description,
    mitigations: event.mitigations ?? [],
    createdAt: event.at,
  };
  return { ...base, risks: [...base.risks, risk] };
}

/** Handles milestone.added event */
function handleMilestoneAdded(base: Plan, event: MilestoneAddedEvent): Plan {
  const milestone: Milestone = {
    id: event.milestoneId,
    phaseId: event.phaseId,
    title: event.title,
    targetDate: event.targetDate,
    icon: event.icon,
  };
  return { ...base, milestones: [...base.milestones, milestone] };
}

/** Handles milestone.completed event */
function handleMilestoneCompleted(
  base: Plan,
  event: MilestoneCompletedEvent,
): Plan {
  const milestones = base.milestones.map((m) =>
    m.id === event.milestoneId ? { ...m, completedAt: event.at } : m,
  );
  return { ...base, milestones };
}

/** Handles risk.updated event */
function handleRiskUpdated(base: Plan, event: RiskUpdatedEvent): Plan {
  const risks = base.risks.map((r) =>
    r.id === event.riskId
      ? {
          ...r,
          level: event.level,
          description: event.description ?? r.description,
          updatedAt: event.at,
        }
      : r,
  );
  return { ...base, risks };
}

/** Applies a single event to the plan state */
function applyEvent(plan: Plan, event: PlanEvent): Plan {
  const base = { ...plan, updatedAt: event.at };

  switch (event.type) {
    case "plan.created":
      return {
        ...base,
        id: event.planId,
        title: event.title,
        intentId: event.intentId ?? "",
        createdAt: event.at,
      };
    case "phase.added":
      return {
        ...base,
        phases: [...base.phases, event.phase],
        currentPhaseId: base.currentPhaseId || event.phase.id,
      };
    case "phase.started":
      return {
        ...base,
        phases: setPhaseStatus(base.phases, event.phaseId, "active"),
        currentPhaseId: event.phaseId,
      };
    case "phase.completed":
      return {
        ...base,
        phases: setPhaseStatus(base.phases, event.phaseId, "completed", {
          progress: 100,
        }),
      };
    case "phase.skipped":
      return {
        ...base,
        phases: setPhaseStatus(base.phases, event.phaseId, "skipped"),
      };
    case "artifact.touched":
      return handleArtifactTouched(base, event);
    case "blocker.added":
      return handleBlockerAdded(base, event);
    case "blocker.resolved":
      return handleBlockerResolved(base, event);
    case "risk.identified":
      return handleRiskIdentified(base, event);
    case "milestone.added":
      return handleMilestoneAdded(base, event);
    case "milestone.completed":
      return handleMilestoneCompleted(base, event);
    case "risk.updated":
      return handleRiskUpdated(base, event);
    case "plan.completed":
      return base;
    default:
      return base;
  }
}

/**
 * Derives the current Plan state by replaying all events in order.
 * This is the core of event sourcing - state is always computable from events.
 *
 * @param events - Array of plan events in chronological order
 * @returns The derived Plan state after applying all events
 */
export function replayEvents(events: PlanEvent[]): Plan {
  if (events.length === 0) {
    return createEmptyPlan("", "", new Date().toISOString());
  }
  const first = events[0];
  const initial =
    first.type === "plan.created"
      ? createEmptyPlan(first.planId, first.title, first.at)
      : createEmptyPlan("", "", new Date().toISOString());
  return events.reduce(applyEvent, initial);
}

/** Creates a timestamp string for event generation */
export function createTimestamp(): string {
  return new Date().toISOString();
}
