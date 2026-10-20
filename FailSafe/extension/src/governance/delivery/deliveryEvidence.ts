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
  /** plan-532c LD4: a policy decision (allowed / denied action under the intent) or mere presence. */
  kind: EvidenceKind;
  outcome: 'allowed' | 'denied' | null;
  /** Not re-verified here; see CHAIN_UNKNOWN_REASON. */
  chain: 'unknown';
}

export type EvidenceKind = 'presence' | 'policy-decision';

export type GovernanceEvidence =
  | { state: 'ok'; records: EvidenceRecord[]; truncated: boolean; chain: 'unknown'; chainReason: string }
  | { state: 'unavailable'; reason: string };

function usableEvidenceLedger(ledger: unknown): EvidenceLedger | null {
  const l = ledger as Partial<EvidenceLedger> | null | undefined;
  if (!l || typeof l.isAvailable !== 'function' || typeof l.findEntriesContaining !== 'function') return null;
  try { return l.isAvailable() ? (l as EvidenceLedger) : null; } catch { return null; }
}

function matchOf(entry: LedgerEntry, intentId: string, shas: Set<string>): Pick<EvidenceRecord, 'matchedBy' | 'value'> | null {
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload as Record<string, unknown> : {};
  if (payload.intentId === intentId) return { matchedBy: 'intentId', value: intentId };
  const head = payload.git_head;
  if (entry.eventType === 'CHECKPOINT_CREATED' && typeof head === 'string' && shas.has(head)) return { matchedBy: 'git_head', value: head };
  return null;
}

/** Entries that name the intent id or carry a linked commit as their checkpoint git_head, newest first. */
export async function findGovernanceEvidence(ledger: unknown, intentId: string, linkedShas: string[]): Promise<GovernanceEvidence> {
  const usable = usableEvidenceLedger(ledger);
  if (!usable) return { state: 'unavailable', reason: 'The FailSafe ledger is unavailable, so governance evidence cannot be read.' };
  const shas = new Set(linkedShas);
  const byId = new Map<number, EvidenceRecord>();
  let truncated = false;
  try {
    for (const value of [intentId, ...shas]) {
      const entries = await usable.findEntriesContaining(value, EVIDENCE_PAGE);
      if (entries.length >= EVIDENCE_PAGE) truncated = true;
      for (const entry of entries) {
        const match = matchOf(entry, intentId, shas);
        if (!match || byId.has(entry.id)) continue;
        byId.set(entry.id, {
          entryId: entry.id, eventType: String(entry.eventType), timestamp: entry.timestamp, entryHash: entry.entryHash,
          ...match, kind: 'presence', outcome: null, chain: 'unknown', // RED STUB
        });
      }
    }
  } catch {
    return { state: 'unavailable', reason: 'The FailSafe ledger could not be read.' };
  }
  const records = [...byId.values()].sort((a, b) => b.entryId - a.entryId);
  return { state: 'ok', records, truncated, chain: 'unknown', chainReason: CHAIN_UNKNOWN_REASON };
}
