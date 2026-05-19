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
  | "transparency.prompt";

export interface FailSafeEvent<T = unknown> {
  type: FailSafeEventType;
  timestamp: string;
  payload: T;
}
