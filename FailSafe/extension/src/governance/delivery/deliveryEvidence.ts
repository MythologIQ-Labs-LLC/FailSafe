/**
 * #532 part B (plan-532b LD5): governance evidence for an intent, read from the FailSafe ledger.
 *
 * The ledger query is a prefilter (`instr(payload, ?)` over the JSON payload text); evidence is
 * exact equality on the parsed payload only: `payload.intentId` equals the intent id, or a
 * `CHECKPOINT_CREATED` entry's `payload.git_head` equals a linked full commit name. No prefix,
 * artifact-path or time-proximity match. A null, disabled or throwing ledger is `unavailable`,
 * never `missing`. The ledger chain is not re-verified per assessment (that walks and re-seals
 * every row), so each record's chain status is reported as `unknown`.
 */

import type { LedgerEntry } from '../../shared/types';

/** Rows per prefilter query; a full page means there may be more (`truncated`). */
export const EVIDENCE_PAGE = 200;

export const CHAIN_UNKNOWN_REASON = 'The ledger chain is not re-verified for each assessment.';

export interface EvidenceLedger {
  isAvailable(): boolean;
  findEntriesContaining(value: string, limit?: number): Promise<LedgerEntry[]>;
}

export interface EvidenceRecord {
  entryId: number;
  eventType: string;
  timestamp: string;
  entryHash: string;
  matchedBy: 'intentId' | 'git_head';
  value: string;
  /** Not re-verified here; see CHAIN_UNKNOWN_REASON. */
  chain: 'unknown';
}

export type GovernanceEvidence =
  | { state: 'ok'; records: EvidenceRecord[]; truncated: boolean; chain: 'unknown'; chainReason: string }
  | { state: 'unavailable'; reason: string };

export async function findGovernanceEvidence(
  _ledger: unknown, _intentId: string, _linkedShas: string[],
): Promise<GovernanceEvidence> {
  throw new Error('not implemented');
}
