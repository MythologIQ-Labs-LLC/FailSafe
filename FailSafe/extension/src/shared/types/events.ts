/**
 * Event Bus Types
 *
 * FailSafe event system types.
 */

export type FailSafeEventType =
  | "failsafe.ready"
  | "evaluation.metrics"
  | "sentinel.confidence"
  | "sentinel.activityObserved"
  | "sentinel.verdict"
  | "sentinel.alert"
  | "sentinel.healthUpdate"
  | "sentinel.modeChange"
  | "sentinel.escalation_failed"
  | "qorelogic.trustUpdate"
  | "qorelogic.l3Queued"
  | "qorelogic.l3Decided"
  | "qorelogic.ledgerEntry"
  | "qorelogic.trustUpdated"
  | "qorelogic.agentQuarantined"
  | "qorelogic.agentReleased"
  | "genesis.graphUpdate"
  | "genesis.conceptCreated"
  | "genesis.streamEvent"
  | "governance.checkpointCreated"
  | "governance.driftDetected"
  | "governance.breakGlassActivated"
  | "governance.breakGlassRevoked"
  | "governance.breakGlassExpired"
  | "governance.modeChanged"
  | "prompt.dispatch"
  | "prompt.response"
  | "governance.revertInitiated"
  | "governance.revertCompleted"
  | "governance.revertFailed"
  | "ide.taskStarted"
  | "ide.taskEnded"
  | "ide.debugStarted"
  | "ide.debugEnded"
  | "diffguard.analysisReady"
  | "diffguard.approved"
  | "diffguard.rejected"
  | "timeline.entryAdded"
  | "genome.failureArchived"
  | "agentRun.started"
  | "agentRun.stepRecorded"
  | "agentRun.completed"
  | "agentRun.replaying"
  | "transparency.prompt"
  | "bicameral.verdict"
  | "substrate.run.complete";

export interface FailSafeEvent<T = unknown> {
  type: FailSafeEventType;
  timestamp: string;
  payload: T;
}

/**
 * Batch 4 (B-BIC-17/18) — payload for the `bicameral.verdict` event.
 *
 * RD-1: the event defines its OWN `verdict` enum — it does NOT reuse
 * `BicameralDriftStatus.status` (`'in-sync'|'drifted'|'unknown'`, no
 * `ratified`) nor `BicameralRatifyVerdict` (`'ratify'|'reject'`). The
 * bicameral-drift route handler maps each `BicameralDriftStatus` onto this
 * enum (`drifted`→`'drifted'`, `in-sync`→`'in-sync'`, `unknown`→skip); the
 * bicameral-ratify route handler always emits `verdict:'ratified'`.
 */
export interface BicameralVerdictEventPayload {
  decisionId: string;
  verdict: "drifted" | "in-sync" | "ratified";
  decisionTitle?: string;
  evidence?: string;
}
