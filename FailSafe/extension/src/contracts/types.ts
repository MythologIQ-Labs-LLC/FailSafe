// B190: hand-written TypeScript mirror of the 8 governance contract JSON Schemas.
// Maintained by hand to avoid pulling json-schema-to-typescript into the build
// pipeline. Drift between schema + TS is caught by FX546 (fixtures validate
// against schemas).

import type { LedgerEventType, FailureMode, RemediationStatus } from "../shared/types/ledger";
import type { RiskGrade } from "../shared/types/risk";
import type { L3ApprovalState } from "../shared/types/l3-approval";

// ── evaluation_request.json ─────────────────────────────────────────────

export interface EvaluationRequestContract {
  agentDid: string;
  action: {
    kind: string;
    target?: string;
    payload?: Record<string, unknown>;
  };
  context?: {
    intentId?: string;
    riskGrade?: RiskGrade;
    modelVersion?: string;
  };
  timestamp: string;
}

// ── ledger_entry.json ───────────────────────────────────────────────────

export interface LedgerEntryContract {
  id: number;
  timestamp: string;
  eventType: LedgerEventType;
  agentDid: string;
  agentTrustAtAction: number;
  modelVersion?: string;
  artifactPath?: string;
  artifactHash?: string;
  riskGrade?: RiskGrade;
  verificationMethod?: string;
  verificationResult?: string;
  sentinelConfidence?: number;
  overseerDid?: string;
  overseerDecision?: string;
  gdprTrigger: boolean;
  payload: Record<string, unknown>;
  entryHash: string;
  prevHash: string;
  signature: string;
}

// ── intent.json ─────────────────────────────────────────────────────────

export type IntentStatus =
  | "DRAFT"
  | "CONCEIVED"
  | "PULSE"
  | "PASS"
  | "VETO"
  | "SEALED"
  | "EXPIRED";

export interface IntentContract {
  id: string;
  declarer: string;
  scope: string;
  files?: string[];
  status: IntentStatus;
  createdAt: string;
  expiresAt?: string;
  linkedLedgerEntries?: number[];
}

// ── failure_mode.json ───────────────────────────────────────────────────

export interface FailureModeContract {
  schemaVersion: string;
  id: number;
  createdAt: string;
  updatedAt?: string;
  ledgerRef?: number;
  agentDid: string;
  inputVector: string;
  decisionRationale?: string;
  environmentContext?: string;
  failureMode: FailureMode;
  causalVector?: string;
  negativeConstraint?: string;
  remediationStatus: RemediationStatus;
  remediationNotes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ── approval.json ───────────────────────────────────────────────────────

export interface ApprovalContract {
  id: string;
  state: L3ApprovalState;
  filePath: string;
  riskGrade: RiskGrade;
  agentDid: string;
  agentTrust: number;
  sentinelSummary: string;
  flags: string[];
  queuedAt: string;
  reviewStartedAt?: string;
  decidedAt?: string;
  overseerDid?: string;
  decision?: string;
  conditions?: string[];
  slaDeadline: string;
  /** B-BIC-16 discriminator for integration-sourced entries. */
  kind?: string;
  meta?: Record<string, unknown>;
}

// ── checkpoint.json ─────────────────────────────────────────────────────

export type CheckpointType =
  | "snapshot.created"
  | "snapshot.reconciled"
  | "drift.detected"
  | "user.override"
  | "release.published";

export type CheckpointStatus = "pending" | "validated" | "rejected" | "expired";

export type PolicyVerdict = "PASS" | "FAIL" | "VETO" | "PASS_WITH_CONDITIONS";

export interface CheckpointContract {
  id: string;
  checkpointType: CheckpointType;
  actor: string;
  phase: string;
  status: CheckpointStatus;
  policyVerdict: PolicyVerdict;
  evidenceRefs: string[];
  payload: Record<string, unknown>;
  timestamp: string;
}

// ── receipt.json ────────────────────────────────────────────────────────

export type ReceiptVerdict = "ALLOW" | "BLOCK" | "ESCALATE" | "MODIFY" | "QUARANTINE";

export interface ReceiptEvidence {
  kind: string;
  ref: string;
  summary?: string;
}

export interface ReceiptContract {
  receiptId: string;
  evaluationRequestId: string;
  verdict: ReceiptVerdict;
  verdictRationale?: string;
  riskGrade?: RiskGrade;
  evidence?: ReceiptEvidence[];
  conditions?: string[];
  ledgerEntryRef?: number;
  signature?: string;
  issuedAt: string;
  issuedBy: string;
}

// ── governance_config.json ──────────────────────────────────────────────

export type GovernanceMode = "observe" | "assist" | "enforce";

export interface GovernanceConfigContract {
  mode: GovernanceMode;
  l3SLAseconds?: number;
  trustThresholds?: {
    l2?: number;
    l3?: number;
  };
  breakGlassEnabled?: boolean;
  policyTags?: string[];
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
}
