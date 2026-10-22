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
 *
 * #532 B320 (plan-b320 LD2/LD4): the read is complete (no row cap) and tolerant: each row comes
 * with its own seal result, and a payload that is not JSON is reported instead of failing the whole
 * read. DELIVERY_REVIEWED rows are reviews, not governance evidence (deliveryReview reads them).
 * The evidence set (every other row naming the intent exactly) is digested so a review can bind
 * it; the view lists at most EVIDENCE_PAGE records and says how many more there are. A row naming
 * the intent whose seal fails, or whose payload is not JSON but whose text names the intent, is
 * `unverifiable` and blocks the delivery until a review names it.
 */

import { createHash } from 'crypto';
import type { SealedLedgerRow } from '../../qorelogic/ledger/LedgerManager';
import { isIntentDecisionRecord } from '../intentDecision';

/** Records listed in the view; the digest and the count always cover the complete set. */
export const EVIDENCE_PAGE = 200;
export const REVIEW_EVENT_TYPE = 'DELIVERY_REVIEWED';

export const CHAIN_UNKNOWN_REASON = 'The ledger chain is not re-verified for each assessment.';

export interface EvidenceLedger {
  isAvailable(): boolean;
  findSealedEntriesContaining(value: string): Promise<SealedLedgerRow[]>;
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
  /** #532 B320: this row's own seal verified under its declared version. */
  sealOk: boolean;
}

/** #532 B320: a row naming the intent that cannot be trusted as evidence. */
export interface UnverifiableEvidence {
  entryId: number;
  entryHash: string;
  eventType: string;
  reason: string;
}

export type GovernanceEvidence =
  | {
    state: 'ok'; records: EvidenceRecord[]; truncated: boolean; chain: 'unknown'; chainReason: string;
    /** #532 B320: the complete evidence set: its size and SHA-256 over the sorted [entryId, entryHash] pairs. */
    total: number; digest: string; unverifiable: UnverifiableEvidence[];
  }
  | { state: 'unavailable'; reason: string };

/** What each event type means as evidence: LedgerRecorder writes RESUMED for an allowed action and PAUSED for a denied one. */
const POLICY_OUTCOME: Readonly<Record<string, 'allowed' | 'denied'>> = {
  GOVERNANCE_RESUMED: 'allowed',
  GOVERNANCE_PAUSED: 'denied',
};

function usableEvidenceLedger(ledger: unknown): EvidenceLedger | null {
  const l = ledger as Partial<EvidenceLedger> | null | undefined;
  if (!l || typeof l.isAvailable !== 'function' || typeof l.findSealedEntriesContaining !== 'function') return null;
  try { return l.isAvailable() ? (l as EvidenceLedger) : null; } catch { return null; }
}

/** SHA-256 over the sorted [entryId, entryHash] pairs: what a review binds as "the evidence it saw". */
export function evidenceDigest(pairs: Array<[number, string]>): string {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/** Every row whose payload names the intent id exactly (reviews and valid intent decisions excluded), newest first. */
export async function findGovernanceEvidence(ledger: unknown, intentId: string): Promise<GovernanceEvidence> {
  const usable = usableEvidenceLedger(ledger);
  if (!usable) return { state: 'unavailable', reason: 'The FailSafe ledger is unavailable, so governance evidence cannot be read.' };
  let rows: SealedLedgerRow[];
  try {
    rows = await usable.findSealedEntriesContaining(intentId);
  } catch {
    return { state: 'unavailable', reason: 'The FailSafe ledger could not be read.' };
  }
  const byId = new Map<number, EvidenceRecord>();
  const unverifiable: UnverifiableEvidence[] = [];
  for (const sealed of rows) {
    const { row, payload, seal } = sealed;
    // B340 (plan-b340 LD7): a valid intent decision (sealed, written by the decision DID) is not evidence;
    // any other row with that event type stays evidence, and a broken seal stays listed as unverifiable.
    if (row.event_type === REVIEW_EVENT_TYPE || isIntentDecisionRecord(sealed) || byId.has(row.id)) continue;
    const exact = !!payload && payload.intentId === intentId;
    if (!exact && payload) continue; // the id appears in some other field: not evidence
    if (!seal.ok) {
      unverifiable.push({
        entryId: row.id, entryHash: row.entry_hash, eventType: String(row.event_type),
        reason: payload ? `its seal does not verify (${seal.code})` : 'its payload is not JSON, so what it says cannot be read',
      });
    }
    if (!exact) continue;
    const outcome = POLICY_OUTCOME[String(row.event_type)] ?? null;
    byId.set(row.id, {
      entryId: row.id, eventType: String(row.event_type), timestamp: row.timestamp, entryHash: row.entry_hash,
      matchedBy: 'intentId', value: intentId, kind: outcome ? 'policy-decision' : 'presence', outcome, chain: 'unknown', sealOk: seal.ok,
    });
  }
  const all = [...byId.values()].sort((a, b) => b.entryId - a.entryId);
  return {
    state: 'ok', records: all.slice(0, EVIDENCE_PAGE), truncated: all.length > EVIDENCE_PAGE, chain: 'unknown',
    chainReason: CHAIN_UNKNOWN_REASON, total: all.length, digest: evidenceDigest(all.map((r) => [r.entryId, r.entryHash])), unverifiable,
  };
}
