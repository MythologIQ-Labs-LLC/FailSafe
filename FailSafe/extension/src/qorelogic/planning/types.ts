/**
 * QorLogic Planning Types
 *
 * Type definitions for roadmap visualization and plan tracking.
 * Supports weighted progress metrics, dependency chains, and risk management.
 */

/**
 * Status of a plan phase in the execution lifecycle.
 * - pending: Not yet started
 * - active: Currently being worked on
 * - completed: Successfully finished
 * - blocked: Cannot proceed due to a blocker
 * - skipped: Intentionally bypassed
 */
export type PhaseStatus =
  | "pending"
  | "active"
  | "completed"
  | "blocked"
  | "skipped";

/**
 * Risk level indicator for visual display.
 * - clear: No significant risks identified
 * - caution: Potential issues that need monitoring
 * - danger: Critical risks requiring immediate attention
 */
export type RiskLevel = "clear" | "caution" | "danger";

/**
 * Weighted artifact for honest progress metrics.
 * Artifacts represent files or resources affected by a phase.
 * Weight allows larger modules to contribute more to progress calculations.
 */
export interface Artifact {
  /** File path relative to workspace root */
  path: string;

  /** Relative weight for progress calculation. Default 1.0. Larger modules can have higher weight. */
  weight?: number;

  /** Whether this artifact has been modified during the phase */
  touched?: boolean;
}

/**
 * A discrete phase within a plan.
 * Phases represent logical units of work with dependencies and progress tracking.
 */
export interface PlanPhase {
  /** Unique identifier for this phase */
  id: string;

  /** Human-readable phase title */
  title: string;

  /** Detailed description of what this phase accomplishes */
  description: string;

  /** Current execution status */
  status: PhaseStatus;

  /** Progress percentage 0-100, derived from weighted artifact completion */
  progress: number;

  /** Relative size for visual width display, capped between 8%-40% */
  estimatedScope: number;

  /** Phase IDs that must complete before this phase can start */
  dependencies: string[];

  /** Weighted file paths this phase affects */
  artifacts: Artifact[];
}

/**
 * A blocker preventing phase progression.
 * Blockers can be hard (must resolve) or soft (can workaround).
 */
export interface Blocker {
  /** Unique identifier for this blocker */
  id: string;

  /** ID of the phase this blocker affects */
  phaseId: string;

  /** Brief title describing the blocker */
  title: string;

  /** Detailed explanation of why this is blocking */
  reason: string;

  /** Severity level: hard = cannot proceed, soft = can workaround */
  severity: "hard" | "soft";

  /** Alternative phase ID if a detour path is available */
  detourPhaseId?: string;

  /** ISO timestamp when the blocker was identified */
  createdAt: string;

  /** ISO timestamp when the blocker was resolved, if applicable */
  resolvedAt?: string;
}

/**
 * A risk marker associated with a phase.
 * Risks provide visibility into potential issues and their mitigations.
 */
export interface RiskMarker {
  /** Unique identifier for this risk */
  id: string;

  /** ID of the phase this risk is associated with */
  phaseId: string;

  /** Brief title describing the risk */
  title: string;

  /** Risk severity level for visual indicator */
  level: RiskLevel;

  /** Detailed description of the risk and its potential impact */
  description: string;

  /** List of mitigation strategies to address this risk */
  mitigations: string[];

  /** ISO timestamp when the risk was identified */
  createdAt: string;

  /** ISO timestamp when the risk was last updated, if applicable */
  updatedAt?: string;
}

/**
 * A milestone marker for tracking key checkpoints in a plan.
 * Milestones represent significant progress points or deliverables.
 */
export interface Milestone {
  /** Unique identifier for this milestone */
  id: string;

  /** ID of the phase this milestone is associated with */
  phaseId: string;

  /** Brief title describing the milestone */
  title: string;

  /** Optional target date for milestone completion */
  targetDate?: string;

  /** ISO timestamp when the milestone was completed, if applicable */
  completedAt?: string;

  /** Optional icon/emoji for visual display */
  icon?: string;
}

/**
 * A complete execution plan with phases, blockers, risks, and milestones.
 * Plans are tied to intents and track overall progress through phases.
 */
export interface Plan {
  /** Unique identifier for this plan */
  id: string;

  /** ID of the intent this plan fulfills */
  intentId: string;

  /** Human-readable plan title */
  title: string;

  /** Ordered list of phases in this plan */
  phases: PlanPhase[];

  /** Active and resolved blockers affecting this plan */
  blockers: Blocker[];

  /** Identified risks across all phases */
  risks: RiskMarker[];

  /** Key milestones across all phases */
  milestones: Milestone[];

  /** ID of the currently active phase */
  currentPhaseId: string;

  /** ISO timestamp when the plan was created */
  createdAt: string;

  /** ISO timestamp when the plan was last modified */
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint Types (v3.1.0 Cumulative Roadmap)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metrics for tracking sprint performance.
 * Accumulated across the sprint lifecycle.
 */
export interface SprintMetrics {
  /** Total phases planned in this sprint */
  phasesPlanned: number;

  /** Phases successfully completed */
  phasesCompleted: number;

  /** Phases intentionally skipped */
  phasesSkipped: number;

  /** Total blockers encountered during sprint */
  blockersEncountered: number;

  /** Blockers that were resolved */
  blockersResolved: number;

  /** Risks identified during sprint */
  risksIdentified: number;

  /** Milestones achieved during sprint */
  milestonesAchieved: number;
}

/**
 * A sprint represents one planning cycle.
 * Sprints accumulate to form the cumulative roadmap.
 */
export interface Sprint {
  /** Unique identifier for this sprint */
  id: string;

  /** Human-readable sprint name */
  name: string;

  /** ID of the plan associated with this sprint */
  planId: string;

  /** Current sprint status */
  status: "active" | "completed" | "archived";

  /** ISO timestamp when the sprint started */
  startedAt: string;

  /** ISO timestamp when the sprint completed, if applicable */
  completedAt?: string;

  /** ISO timestamp when the sprint was archived, if applicable */
  archivedAt?: string;

  /** Accumulated sprint metrics */
  metrics: SprintMetrics;
}

/**
 * Cumulative roadmap aggregating all sprints.
 * Provides a historical view of project progress.
 */
export interface CumulativeRoadmap {
  /** Unique identifier for this project */
  projectId: string;

  /** Human-readable project name */
  projectName: string;

  /** All sprints in chronological order */
  sprints: Sprint[];

  /** ID of the currently active sprint, or null if none */
  currentSprintId: string | null;

  /** ISO timestamp when the roadmap was created */
  createdAt: string;

  /** ISO timestamp when the roadmap was last modified */
  updatedAt: string;
}

export type { WorkflowStage, WorkflowGate, WorkflowRun, EvidenceRecord, RunStatus } from './workflowTypes';
