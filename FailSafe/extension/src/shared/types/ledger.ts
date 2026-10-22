/**
 * Ledger and Shadow Genome Types
 *
 * SOA Ledger entries, events, and shadow genome records.
 */

import type { RiskGrade } from "./risk";

// =============================================================================
// LEDGER TYPES
// =============================================================================

export type LedgerEventType =
  | "PROPOSAL"
  | "EVALUATION_ROUTED"
  | "AUDIT_PASS"
  | "AUDIT_FAIL"
  | "L3_QUEUED"
  | "L3_APPROVED"
  | "L3_REJECTED"
  | "TRUST_UPDATE"
  | "PENALTY_APPLIED"
  | "QUARANTINE_START"
  | "QUARANTINE_END"
  | "DIVERGENCE_DECLARED"
  | "DIVERGENCE_RESOLVED"
  | "SYSTEM_EVENT"
  // Sovereign Checkpoint Protocol events
  | "EXTERNAL_DRIFT" // Changes detected outside QL skill sessions
  | "USER_OVERRIDE" // User explicitly overrode a governance control
  | "CHECKPOINT_CREATED" // Skill session started, checkpoint sealed
  | "CHECKPOINT_RECONCILED" // Gap detected and reconciled
  | "GOVERNANCE_PAUSED" // User explicitly paused governance
  | "GOVERNANCE_RESUMED" // User resumed governance
  | "RELEASE_PUBLISHED" // Extension release published to marketplace
  | "DISCOVERY_RECORDED" // Discovery phase item recorded in ledger
  | "DISCOVERY_PROMOTED" // Discovery item promoted from DRAFT to CONCEIVED
  // Commit governance + provenance (v4.3.0)
  | "COMMIT_CHECKED"      // Pre-commit hook queried commit-check endpoint
  | "PROVENANCE_RECORDED" // AI authorship attribution recorded
  // Marketplace (v4.7.0)
  | "MARKETPLACE_INSTALL"   // Agent installed from marketplace
  | "MARKETPLACE_UNINSTALL" // Agent uninstalled from marketplace
  // Workspace Delivery (#532 B320/B321)
  | "DELIVERY_REVIEWED" // Operator-confirmed review verdict on one linked commit of the active intent
  // Intent decisions (B340)
  | "INTENT_DECIDED"; // Operator-confirmed PASS, VETO or SEALED on the active intent (enforce-mode approval)

export interface LedgerEntry {
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

// =============================================================================
// SHADOW GENOME
// =============================================================================

export type FailureMode =
  | "HALLUCINATION"
  | "INJECTION_VULNERABILITY"
  | "LOGIC_ERROR"
  | "SPEC_VIOLATION"
  | "HIGH_COMPLEXITY"
  | "SECRET_EXPOSURE"
  | "PII_LEAK"
  | "DEPENDENCY_CONFLICT"
  | "TRUST_VIOLATION"
  | "OTHER";

export type RemediationStatus =
  | "UNRESOLVED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "WONT_FIX"
  | "SUPERSEDED";

export interface ShadowGenomeEntry {
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
