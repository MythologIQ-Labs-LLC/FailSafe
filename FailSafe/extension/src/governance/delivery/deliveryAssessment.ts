/**
 * #532 part B (plan-532b LD6): the delivery assessment rule, a pure function.
 *
 * Five steps for one intent: the issue it came from, the architecture documents it
 * implements, the commits it was committed under, governance evidence already in the
 * FailSafe ledger, and a receipt. Every input is gathered elsewhere (deliveryService.ts);
 * this module only decides each step's status from what it is given and lists the
 * records behind it. Nothing is inferred: a step without a recorded link is `missing`.
 */

import type { GovernanceEvidence } from './deliveryEvidence';

export type StepStatus = 'recorded' | 'stale' | 'missing' | 'unavailable';
export type StepKey = 'issue' | 'architecture' | 'code' | 'governance' | 'receipt';
export type DeliveryOutcome = 'evidence-complete-except-receipt' | 'incomplete';

export interface DeliveryStep {
  key: StepKey;
  label: string;
  status: StepStatus;
  reason: string;
  records: Array<Record<string, unknown>>;
}

export interface DeliveryAssessment {
  intentId: string;
  overall: DeliveryOutcome;
  /** The first four steps that are not `recorded`, in step order. The receipt is never a gap. */
  gaps: StepKey[];
  steps: DeliveryStep[];
}

export const RECEIPT_REASON = 'Blocked on the damaged ledger (#467), B216.';

export interface ArchitectureEdgeCheck {
  target: string;
  docPath: string;
  docSha256: string;
  /** HEAD at link time (null in an unborn repository). */
  sourceSha: string | null;
  status: 'recorded' | 'stale' | 'missing';
  reason?: string;
  currentSha256?: string;
}

export interface CodeEdgeCheck {
  sha: string;
  tree: string;
  branch: string | null;
  status: 'recorded' | 'missing';
  reason?: string;
  /** Display only; never an edge. */
  files?: { files: string[]; truncated: boolean } | null;
}

export type EdgeChecks<T> = { state: 'checked'; edges: T[] } | { state: 'unavailable'; reason: string };

export interface DeliveryInputs {
  intentId: string;
  /** The CREATED entry's provenance (null when the intent was not imported) and its entry hash. */
  issue: { provenance: Record<string, unknown> | null; createdEntryHash: string | null };
  architecture: EdgeChecks<ArchitectureEdgeCheck>;
  code: EdgeChecks<CodeEdgeCheck>;
  governance: GovernanceEvidence;
}

export function assessDelivery(_input: DeliveryInputs): DeliveryAssessment {
  throw new Error('not implemented');
}
