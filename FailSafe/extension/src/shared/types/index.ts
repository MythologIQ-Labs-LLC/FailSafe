/**
 * Shared Type Definitions - Barrel Export
 *
 * Domain-grouped type modules for FailSafe extension.
 */

// Risk Grading
export type { RiskGrade, RiskClassification } from "./risk";

// Trust Dynamics & Agent Identity
export type {
  TrustStage,
  TrustScore,
  TrustUpdate,
  PersonaType,
  AgentIdentity,
} from "./trust";

// Sentinel Types
export type {
  SentinelMode,
  OperationalMode,
  VerdictDecision,
  SentinelStatus,
  SentinelEvent,
  SentinelEventType,
  SentinelVerdict,
  HeuristicResult,
  LLMEvaluation,
  VerdictAction,
  PatternCategory,
  HeuristicPattern,
} from "./sentinel";

// Ledger & Shadow Genome
export type {
  LedgerEventType,
  LedgerEntry,
  FailureMode,
  RemediationStatus,
  ShadowGenomeEntry,
} from "./ledger";

// L3 Approval
export type { L3ApprovalState, L3ApprovalRequest } from "./l3-approval";

// Genesis UI
export type {
  NodeState,
  LivingGraphNode,
  LivingGraphEdge,
  LivingGraphData,
  CortexIntent,
  CortexStreamEvent,
  StreamAction,
  GenesisConcept,
} from "./genesis";

// Event Bus
export type {
  FailSafeEventType,
  FailSafeEvent,
  BicameralVerdictEventPayload,
} from "./events";

// Governance Decision Contract
export type {
  GovernanceAction,
  RiskCategory,
  GovernanceDecision,
} from "./governance";
export { toGovernanceDecision } from "./governance";

// Agent Run Types
export type {
  RunStepKind,
  RunStep,
  AgentRunSource,
  AgentRun,
} from "./agentRun";

// Configuration
export type { FailSafeConfig } from "./config";

// Database
export type { CheckpointDb } from "./database";
