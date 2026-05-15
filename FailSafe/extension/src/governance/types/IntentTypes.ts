/**
 * Intent Type Definitions
 *
 * AXIOM 1: "No action without intent. No intent without verification."
 *
 * This module defines the immutable schema for Intent artifacts,
 * which bind every proposed action to a verified purpose.
 */

import { z } from 'zod';

// ============================================================
// ZOD SCHEMAS (D1: Runtime Validation)
// ============================================================

export const IntentIdSchema = z.string().uuid();
export const IntentTypeSchema = z.enum(['feature', 'refactor', 'bugfix', 'security', 'docs']);
export const RiskGradeSchema = z.enum(['L1', 'L2', 'L3']);
export const IntentStatusSchema = z.enum(['PULSE', 'PASS', 'VETO', 'SEALED']);

export const IntentScopeSchema = z.object({
  files: z.array(z.string()),
  modules: z.array(z.string()),
  riskGrade: RiskGradeSchema,
  maxLinesOfCode: z.number().optional(),
});

export const IntentEvidenceSchema = z.object({
  testsPassed: z.boolean(),
  buildSucceeded: z.boolean(),
  visualVerified: z.boolean(),
  sentinelPassed: z.boolean(),
  verifiedAt: z.string().optional(),
});

export const AgentIdentitySchema = z.object({
  agentDid: z.string(),
  workflow: z.enum(['qor-plan', 'auto-create', 'manual']),
  createdVia: z.string().optional(),
});

export const IntentMetadataSchema = z.object({
  author: z.string(),
  tags: z.array(z.string()),
  parentIntentId: z.string().uuid().optional(),
  externalRef: z.string().optional(),
  agentIdentity: AgentIdentitySchema.optional(),
});

export const IntentSchema = z.object({
  id: IntentIdSchema,
  type: IntentTypeSchema,
  createdAt: z.string(),
  purpose: z.string().max(200),
  scope: IntentScopeSchema,
  status: IntentStatusSchema,
  blueprint: z.string().optional(),
  planId: z.string().optional(),
  evidence: IntentEvidenceSchema.optional(),
  merkleRef: z.string().optional(),
  metadata: IntentMetadataSchema,
  updatedAt: z.string(),
  sealedAt: z.string().optional(),
  schemaVersion: z.number().optional(),
});

export const IntentHistoryEventSchema = z.enum([
  'CREATED', 'STATUS_CHANGED', 'EVIDENCE_UPDATED', 'SEALED'
]);

export const IntentHistoryEntrySchema = z.object({
  intentId: IntentIdSchema,
  timestamp: z.string(),
  event: IntentHistoryEventSchema,
  previousStatus: IntentStatusSchema.optional(),
  newStatus: IntentStatusSchema.optional(),
  actor: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  previousHash: z.string().optional(),
  entryHash: z.string().optional(),
});

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Unique identifier for an Intent.
 * Format: UUID v4
 */
export type IntentId = string;

/**
 * Classification of the intent's purpose.
 */
export type IntentType =
  | "feature" // New functionality
  | "refactor" // Code improvement without behavior change
  | "bugfix" // Defect remediation
  | "security" // Security hardening or vulnerability fix
  | "docs"; // Documentation updates

/**
 * QorLogic Risk Grade assignment.
 */
export type RiskGrade = "L1" | "L2" | "L3";

/**
 * Governance gate status for the Intent.
 */
export type IntentStatus =
  | "PULSE" // Alignment in progress
  | "PASS" // Approved for implementation
  | "VETO" // Blocked; remediation required
  | "SEALED"; // Implementation complete and verified

/**
 * Scope definition for the Intent.
 * Defines the boundary of permissible modifications.
 */
export interface IntentScope {
  /**
   * Absolute paths to files that may be created or modified.
   * Any write outside this list triggers Drift detection.
   */
  files: string[];

  /**
   * Module or component names affected by this intent.
   * Used for Living Graph visualization.
   */
  modules: string[];

  /**
   * Risk grade assigned by QorLogic analysis.
   */
  riskGrade: RiskGrade;

  /**
   * Maximum lines of code permitted (§4 Razor enforcement).
   * null = no specific limit beyond standard §4 rules.
   */
  maxLinesOfCode?: number;
}

/**
 * Evidence of successful implementation.
 * Populated during SUBSTANTIATE phase.
 */
export interface IntentEvidence {
  /**
   * Test suite execution status.
   */
  testsPassed: boolean;

  /**
   * Build/compilation status.
   */
  buildSucceeded: boolean;

  /**
   * Visual verification (screenshots, E2E) completed.
   */
  visualVerified: boolean;

  /**
   * Sentinel verification status.
   */
  sentinelPassed: boolean;

  /**
   * Timestamp of verification completion.
   */
  verifiedAt?: string; // ISO 8601
}

/**
 * Metadata for traceability and context.
 */
export interface AgentIdentity {
  agentDid: string;
  workflow: 'qor-plan' | 'auto-create' | 'manual';
  createdVia?: string;
}

export interface IntentMetadata {
  /**
   * Human or agent who initiated the intent.
   */
  author: string;

  /**
   * Tags for categorization and search.
   */
  tags: string[];

  /**
   * Parent Intent ID if this is a sub-intent.
   */
  parentIntentId?: IntentId;

  /**
   * External reference (e.g., GitHub issue, JIRA ticket).
   */
  externalRef?: string;

  /**
   * Agent identity binding (B68).
   */
  agentIdentity?: AgentIdentity;
}

/**
 * Core Intent artifact.
 *
 * IMMUTABILITY CONTRACT:
 * - Once status is 'SEALED', the Intent becomes read-only.
 * - Field modifications require a new Intent with parentIntentId reference.
 */
export interface Intent {
  /**
   * Unique identifier for this Intent.
   */
  id: IntentId;

  /**
   * Classification of the intent's purpose.
   */
  type: IntentType;

  /**
   * Creation timestamp (ISO 8601).
   */
  createdAt: string;

  /**
   * One-sentence "why" statement.
   * Max 200 characters.
   */
  purpose: string;

  /**
   * Scope boundary definition.
   */
  scope: IntentScope;

  /**
   * Current governance gate status.
   */
  status: IntentStatus;

  /**
   * Absolute path to the ARCHITECTURE_PLAN.md blueprint.
   * Required for L2/L3 intents.
   */
  blueprint?: string;

  /**
   * Plan ID linking this Intent to an approved plan (B66).
   * Required in enforce mode.
   */
  planId?: string;

  /**
   * Evidence of successful implementation.
   * Populated during SUBSTANTIATE phase.
   */
  evidence?: IntentEvidence;

  /**
   * Reference to the SOA Ledger entry.
   * Links Intent to Merkle chain.
   */
  merkleRef?: string;

  /**
   * Traceability metadata.
   */
  metadata: IntentMetadata;

  /**
   * Timestamp of last status change (ISO 8601).
   */
  updatedAt: string;

  /**
   * Timestamp when status became 'SEALED' (ISO 8601).
   */
  sealedAt?: string;

  /**
   * Schema version for migration (B77).
   */
  schemaVersion?: number;
}

/**
 * Proposed action awaiting verdict.
 */
export interface ProposedAction {
  /**
   * Type of action.
   */
  type: "file_write" | "file_create" | "file_delete" | "file_rename";

  /**
   * Target file path (absolute).
   */
  targetPath: string;

  /**
   * Intent ID this action claims to belong to.
   * null = no active Intent (Drift).
   */
  intentId: IntentId | null;

  /**
   * Timestamp of proposal (ISO 8601).
   */
  proposedAt: string;

  /**
   * Agent or user proposing the action.
   */
  proposedBy: string;
}

/**
 * Enforcement verdict result.
 */
export type Verdict = AllowVerdict | BlockVerdict | EscalateVerdict;

export interface AllowVerdict {
  status: "ALLOW";
  reason: string;
  intentId: IntentId;
}

export interface BlockVerdict {
  status: "BLOCK";
  violation: string;
  axiomViolated: 1 | 2 | 3 | 4 | 5; // Which Axiom was violated
  remediation: string;
  diagnostics?: {
    offendingFiles?: string[];
    scopeFiles?: string[];
    intentId?: string;
    message?: string;
  };
}

export interface EscalateVerdict {
  status: "ESCALATE";
  escalationTo: "L3_QUEUE" | "HUMAN_REVIEW" | "TRIBUNAL_AUDIT";
  reason: string;
  intentId?: IntentId;
}

/**
 * Intent history entry (append-only log).
 */
export interface IntentHistoryEntry {
  intentId: IntentId;
  timestamp: string; // ISO 8601
  event: "CREATED" | "STATUS_CHANGED" | "EVIDENCE_UPDATED" | "SEALED";
  previousStatus?: IntentStatus;
  newStatus?: IntentStatus;
  actor: string; // Agent or user who triggered the event
  details?: Record<string, unknown>;
  previousHash?: string;
  entryHash?: string;
}
