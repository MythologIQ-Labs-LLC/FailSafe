/**
 * #532 part B (plan-532b LD5, plan-532c LD3/LD4): governance evidence for an intent, read from the
 * FailSafe ledger.
 *
 * The ledger query is a prefilter (`instr(payload, ?)` over the JSON payload text); evidence is
 * exact equality on the parsed payload only: `payload.intentId` equals the intent id. No prefix,
 * artifact-path or time-proximity match. A checkpoint's `git_head` equal to a linked commit is not
 * evidence (B285 retired that match: it is HEAD when a session ended, not an evaluation). Each
 * record says what it is: a `policy-decision` (an action allowed or denied under the intent) or
 * `presence`; neither is a review, so presence never reads as passed. A null, disabled or throwing
 * ledger is `unavailable`, never `missing`. The ledger chain is not re-verified per assessment
 * (that walks and re-seals every row), so each record's chain status is reported as `unknown`.
 */

import type { LedgerEntry } from '../../shared/types';

/** Rows per prefilter query; a full page means there may be more (`truncated`). */
export const EVIDENCE_PAGE = 200;

export const CHAIN_UNKNOWN_REASON = 'The ledger chain is not re-verified for each assessment.';

export interface EvidenceLedger {
  isAvailable(): boolean;
  findEntriesContaining(value: string, limit?: number): Promise<LedgerEntry[]>;
}

export type EvidenceKind = 'presence' | 'policy-decision';

export interface EvidenceRecord {
  entryId: number;
  eventType: string;
  timestamp: string;
  entryHash: string;
  matchedBy: 'intentId';
  value: string;
  /** plan-532c LD4: a policy decision (allowed / denied action under the intent) or mere presence. */
  kind: EvidenceKind;
  outcome: 'allowed' | 'denied' | null;
  /** Not re-verified here; see CHAIN_UNKNOWN_REASON. */
  chain: 'unknown';
}

export type GovernanceEvidence =
  | { state: 'ok'; records: EvidenceRecord[]; truncated: boolean; chain: 'unknown'; chainReason: string }
  | { state: 'unavailable'; reason: string };

/** What each event type means as evidence: LedgerRecorder writes RESUMED for an allowed action and PAUSED for a denied one. */
const POLICY_OUTCOME: Readonly<Record<string, 'allowed' | 'denied'>> = {
  GOVERNANCE_RESUMED: 'allowed',
  GOVERNANCE_PAUSED: 'denied',
};

function usableEvidenceLedger(ledger: unknown): EvidenceLedger | null {
  const l = ledger as Partial<EvidenceLedger> | null | undefined;
  if (!l || typeof l.isAvailable !== 'function' || typeof l.findEntriesContaining !== 'function') return null;
  try { return l.isAvailable() ? (l as EvidenceLedger) : null; } catch { return null; }
}

function namesIntent(entry: LedgerEntry, intentId: string): boolean {
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload as Record<string, unknown> : {};
  return payload.intentId === intentId;
}

/** Entries whose payload names the intent id exactly, newest first. */
export async function findGovernanceEvidence(ledger: unknown, intentId: string): Promise<GovernanceEvidence> {
  const usable = usableEvidenceLedger(ledger);
  if (!usable) return { state: 'unavailable', reason: 'The FailSafe ledger is unavailable, so governance evidence cannot be read.' };
  const byId = new Map<number, EvidenceRecord>();
  let truncated = false;
  try {
    const entries = await usable.findEntriesContaining(intentId, EVIDENCE_PAGE);
    if (entries.length >= EVIDENCE_PAGE) truncated = true;
    for (const entry of entries) {
      if (!namesIntent(entry, intentId) || byId.has(entry.id)) continue;
      const outcome = POLICY_OUTCOME[String(entry.eventType)] ?? null;
      byId.set(entry.id, {
        entryId: entry.id, eventType: String(entry.eventType), timestamp: entry.timestamp, entryHash: entry.entryHash,
        matchedBy: 'intentId', value: intentId, kind: outcome ? 'policy-decision' : 'presence', outcome, chain: 'unknown',
      });
    }
  } catch {
    return { state: 'unavailable', reason: 'The FailSafe ledger could not be read.' };
  }
  const records = [...byId.values()].sort((a, b) => b.entryId - a.entryId);
  return { state: 'ok', records, truncated, chain: 'unknown', chainReason: CHAIN_UNKNOWN_REASON };
}
