/**
 * L3 Approval Types
 *
 * Human-in-the-loop approval workflow types.
 */

import type { RiskGrade } from "./risk";

export type L3ApprovalState =
  | "QUEUED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "APPROVED_WITH_CONDITIONS"
  | "REJECTED"
  | "DEFERRED"
  | "EXPIRED";

export interface L3ApprovalRequest {
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
  /** B-BIC-16: optional discriminator for integration-sourced entries.
   *  Allows the DriftToL3Mediator to identify its own entries on the
   *  l3Decided event without affecting other L3 consumers. */
  kind?: string;
  /** B-BIC-16: opaque per-kind metadata. For bicameral-drift-resolution
   *  entries this carries {decisionId: string}. */
  meta?: Record<string, unknown>;
  /** FailSafe#367: id of the soa_ledger AUDIT_FAIL entry (WARN/BLOCK/
   *  ESCALATE) whose escalation produced this L3 request, when known.
   *  Carried through to the L3_QUEUED/L3_APPROVED/L3_REJECTED ledger
   *  entries' payload so a later decision can be linked back to the exact
   *  originating verdict by id rather than inferred from artifactPath
   *  alone. Absent when the request did not originate from a single
   *  identifiable Sentinel verdict (e.g. EvaluationRouter tier-3 routing). */
  sourceLedgerEntryId?: number;
}
