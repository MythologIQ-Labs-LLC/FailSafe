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
  'CREATED', 'STATUS_CHANGED', 'EVIDENCE_UPDATED', 'SEALED', 'LINKED', 'UNLINKED', 'REVIEWED'
]);

/**
 * #532: an edge from an intent to a registered architecture document (`implements`)
 * or to a commit (`committed-under`). Written only after the operator confirms in
 * VS Code, as the `details` of a LINKED or UNLINKED intent-history entry, so the
 * history hash chain covers it. `target` is the registry row id or the full commit
 * name; it is re-validated before any use (a history line is data, not a command).
 */
export const IntentEdgeKindSchema = z.enum(['implements', 'committed-under']);
export const IntentEdgeDetailsSchema = z.object({
  edge: IntentEdgeKindSchema,
  target: z.string().min(1).max(256),
  provenance: z.record(z.string(), z.unknown()),
}).strict();
export type IntentEdgeKind = z.infer<typeof IntentEdgeKindSchema>;
export type IntentEdgeDetails = z.infer<typeof IntentEdgeDetailsSchema>;

/**
 * #532 B320 (plan-b320 LD5): the details of a REVIEWED intent-history entry, the mirror of one
 * sealed delivery-review ledger row. It names that row by id and entry hash and repeats what the
 * row bound, so the pair can be joined and compared field by field. A mirror alone proves nothing:
 * the history chain is unkeyed, so a PASS mirror counts only with its sealed row (deliveryReview).
 */
const HASH64 = /^[0-9a-f]{64}$/;
const OBJECT_NAME = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
export const ReviewVerdictSchema = z.enum(['PASS', 'VETO']);
export const ReviewCommitRefSchema = z.object({
  commitSha: z.string().regex(OBJECT_NAME),
  edgeEntryHash: z.string().regex(HASH64),
}).strict();
export const ReviewEvaluatesSchema = z.object({
  commitSha: z.string().regex(OBJECT_NAME),
  tree: z.string().regex(OBJECT_NAME),
  branch: z.string().max(256).nullable(),
  edgeEntryHash: z.string().regex(HASH64),
}).strict();
/** The kinds of review evidence that block a delivery until a later valid PASS names them (deliveryReview LD6). */
export const ReviewBlockingKindSchema = z.enum(['veto', 'unverifiable-mirror', 'unverifiable-row', 'unverifiable-evidence', 'bad-seal', 'continuity']);
export const ReviewSupersededSchema = z.object({
  kind: ReviewBlockingKindSchema,
  id: z.number().int().nonnegative(),
  hash: z.string().min(1).max(128),
}).strict();
/**
 * #532 B344 (plan-b344 LD3): one VETO superseded by a declared, git-verified rework, as the PASS
 * row and its mirror record it. Path lists are complete (at most 50 per side) for `amended` and
 * empty for `rebased`.
 */
export const ReworkRelationSchema = z.enum(['rebased', 'amended']);
export const ReworkPathStatusSchema = z.enum(['A', 'M', 'D', 'T']);
const ReworkPathSchema = z.object({ path: z.string().min(1).max(4096), status: ReworkPathStatusSchema }).strict();
const ReworkSharedPathSchema = z.object({ path: z.string().min(1).max(4096), vetoStatus: ReworkPathStatusSchema, reworkStatus: ReworkPathStatusSchema }).strict();
export const ReworkEntrySchema = z.object({
  vetoEntryId: z.number().int().positive(),
  vetoEntryHash: z.string().regex(HASH64),
  vetoCommit: z.string().regex(OBJECT_NAME),
  reworkCommit: z.string().regex(OBJECT_NAME),
  relation: ReworkRelationSchema,
  evidence: z.object({
    vetoParent: z.string().regex(OBJECT_NAME),
    reworkParent: z.string().regex(OBJECT_NAME),
    vetoDiffId: z.string().regex(HASH64).nullable(),
    reworkDiffId: z.string().regex(HASH64).nullable(),
    vetoPathCount: z.number().int().nonnegative(),
    reworkPathCount: z.number().int().nonnegative(),
    shared: z.array(ReworkSharedPathSchema).max(50),
    onlyInVeto: z.array(ReworkPathSchema).max(50),
    onlyInRework: z.array(ReworkPathSchema).max(50),
  }).strict(),
}).strict();
/** The same cap as the dialog's BATCH_LIST_LIMIT (operatorConfirmation.ts). */
export const REWORK_ENTRY_LIMIT = 20;
export const ReworksSchema = z.array(ReworkEntrySchema).min(1).max(REWORK_ENTRY_LIMIT);
export type ReworkEntry = z.infer<typeof ReworkEntrySchema>;
export type ReworkPathStatus = z.infer<typeof ReworkPathStatusSchema>;
export const IntentReviewDetailsSchema = z.object({
  reviewId: z.string().uuid(),
  verdict: ReviewVerdictSchema,
  evaluates: ReviewEvaluatesSchema,
  covers: z.array(ReviewCommitRefSchema).max(1000),
  evidenceDigest: z.string().regex(HASH64),
  supersedes: z.array(ReviewSupersededSchema).max(10000),
  ledgerEntryId: z.number().int().positive(),
  ledgerEntryHash: z.string().regex(HASH64),
  operationId: z.string().min(1).max(80),
  /** #532 B344: absent when the PASS declares no rework. */
  reworks: ReworksSchema.optional(),
}).strict();
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type ReviewBlockingKind = z.infer<typeof ReviewBlockingKindSchema>;
export type ReviewSuperseded = z.infer<typeof ReviewSupersededSchema>;
export type IntentReviewDetails = z.infer<typeof IntentReviewDetailsSchema>;

/**
 * B340 (plan-b340 LD2): the details of an intent-decision mirror, a STATUS_CHANGED entry whose
 * `newStatus` is the verdict. It names one sealed intent-decision ledger row by id and entry hash and
 * repeats what the row bound. A mirror alone proves nothing (the history chain is unkeyed): a PASS
 * counts only with its sealed row, and each row binds through at most one mirror (intentDecision).
 */
export const IntentDecisionDetailsSchema = z.object({
  decisionId: z.string().uuid(),
  ledgerEntryId: z.number().int().positive(),
  ledgerEntryHash: z.string().regex(HASH64),
  operationId: z.string().min(1).max(80),
  digestVersion: z.number().int().positive(),
  contentDigest: z.string().regex(HASH64),
}).strict();
export type IntentDecisionDetails = z.infer<typeof IntentDecisionDetailsSchema>;

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
  event: "CREATED" | "STATUS_CHANGED" | "EVIDENCE_UPDATED" | "SEALED" | "LINKED" | "UNLINKED" | "REVIEWED";
  previousStatus?: IntentStatus;
  newStatus?: IntentStatus;
  actor: string; // Agent or user who triggered the event
  details?: Record<string, unknown>;
  previousHash?: string;
  entryHash?: string;
}
