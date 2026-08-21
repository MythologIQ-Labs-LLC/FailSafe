/**
 * AuditResolutionProjector — FailSafe#367 resolution-linkage projection.
 *
 * Pure read-model over soa_ledger entries. Never mutates the ledger: the
 * chain stays append-only, and a WARN/BLOCK/ESCALATE record is never
 * rewritten. Resolution is represented as a *projection* — for a given
 * historical AUDIT_FAIL entry, what does the rest of the chain say about
 * its current status?
 *
 * Scope note (post-review correction): this only projects the explicit
 * L3 escalation/decision path (`sourceLedgerEntryId` back-reference). An
 * earlier version of this module also inferred SUPERSEDED from a later
 * PASS verdict for the same artifactPath with non-overlapping matched
 * patterns. That inference was unsound and has been removed:
 *
 * - `VerdictEngine.determineDecision` guarantees a PASS verdict can never
 *   carry a critical/high/medium matched pattern (any such match forces
 *   BLOCK/WARN/ESCALATE). Since a WARN/BLOCK's driving pattern is always
 *   critical/high/medium, it can *never* reappear in a later PASS's
 *   matchedPatterns by construction — so "no overlap with a later PASS"
 *   was true for essentially every real WARN/BLOCK, regardless of whether
 *   the underlying finding was actually re-verified.
 * - Worse cross-engine case: `VerdictArbiter.validateClaim` (existence/
 *   claim-fabrication checks, pattern ids like `EXS001`) and
 *   `evaluateFileEvent` (content heuristics, an entirely disjoint pattern
 *   registry) can both log entries against the same artifactPath. A
 *   routine clean content scan can never carry an EXS00x pattern id, so
 *   it would have been reported as "superseding" a claim-fabrication
 *   BLOCK it says nothing about. `LedgerEntry.verificationMethod` does
 *   not currently distinguish which engine produced an entry (it is
 *   hardcoded to `'sentinel_heuristic'` for both paths in
 *   `VerdictEngine.executeActions`), so there is no schema-level way to
 *   scope a same-artifact comparison to "the same kind of check" today.
 *
 * Reintroducing content/pattern-based supersession needs a schema change
 * this tranche does not make: either persisting which matched pattern(s)
 * were decision-driving (not the full matched set) plus per-engine
 * provenance on each entry, or populating the already-declared but
 * currently-unwritten `artifactHash` and anchoring supersession to
 * verified content identity instead of a path string — either way, also
 * excluding synthetic non-file identities (`'unknown'`, `'claim_manifest'`)
 * from any path-based correlation. That is deferred to a follow-up
 * tranche; `FailSafe#367` stays open for it.
 *
 * Two further scope notes (also post-review):
 *
 * - Only `VerdictRouter.route()`'s ESCALATE branch ever calls
 *   `queueL3Approval`. WARN and BLOCK verdicts never reach L3, so under
 *   this projector they are structurally always `LIVE` — that's a
 *   constant, not a computed distinction, until content-based supersession
 *   (above) exists.
 * - `L3ApprovalService.pruneExpired()` drops an SLA-expired queue item
 *   (default 120s, `ConfigManager.ts`) from the in-memory/persisted queue
 *   and emits an `l3Decided`/`EXPIRED` event, but **never calls
 *   `ledgerManager.appendEntry`** — expiry leaves no ledger row. An
 *   escalated entry whose SLA lapsed unattended is therefore
 *   indistinguishable, from the ledger alone, from one still genuinely
 *   awaiting review. `ESCALATED_UNDECIDED` is named and worded to reflect
 *   exactly that (not "pending", which would claim someone is looking at
 *   it) — see the dedicated blind-spot test in
 *   `AuditResolutionProjector.test.ts`. Closing that gap for real means
 *   making `L3ApprovalService.getQueue()`/`pruneExpired()` log expiry to
 *   the ledger, which would require an async signature change rippling
 *   through 7+ production call sites (`HubSnapshotService`,
 *   `ActionsRoute`, four `genesis/panels/*`) — out of scope for this
 *   tranche; disclosed rather than attempted blind.
 */

import type { LedgerEntry } from "../../shared/types";

export type ResolutionState =
  | "LIVE"
  | "ESCALATED_UNDECIDED"
  | "DECIDED_APPROVED"
  | "DECIDED_REJECTED";

export interface ResolutionProjection {
  /** id of the WARN/BLOCK/ESCALATE ledger entry this projection describes. */
  sourceEntryId: number;
  state: ResolutionState;
  /** id of the ledger entry that produced this state, when there is one. */
  resolvedByEntryId?: number;
  reason: string;
}

const RESOLVABLE_VERDICTS = new Set(["WARN", "BLOCK", "ESCALATE"]);

function sourceLedgerEntryIdOf(entry: LedgerEntry): number | null {
  const value = entry.payload?.sourceLedgerEntryId;
  return typeof value === "number" ? value : null;
}

/**
 * Project resolution state for every WARN/BLOCK/ESCALATE (AUDIT_FAIL)
 * entry in `entries`. `entries` need not be sorted; the projector sorts
 * by id (the ledger's own monotonic, append-only ordering) internally.
 */
export function projectResolution(entries: LedgerEntry[]): ResolutionProjection[] {
  const sorted = [...entries].sort((a, b) => a.id - b.id);
  const results: ResolutionProjection[] = [];

  for (const source of sorted) {
    if (source.eventType !== "AUDIT_FAIL") continue;
    const verdict = source.verificationResult || "";
    if (!RESOLVABLE_VERDICTS.has(verdict)) continue;

    results.push(projectOne(source, sorted));
  }

  return results;
}

function projectOne(source: LedgerEntry, sorted: LedgerEntry[]): ResolutionProjection {
  const later = sorted.filter((e) => e.id > source.id);

  // 1. Explicit authority: an L3 decision that names this entry as its
  //    source always wins. If more than one exists (re-decision), the
  //    latest by id is authoritative.
  let decision: LedgerEntry | undefined;
  for (const entry of later) {
    if (entry.eventType !== "L3_APPROVED" && entry.eventType !== "L3_REJECTED") continue;
    if (sourceLedgerEntryIdOf(entry) === source.id) decision = entry;
  }
  if (decision) {
    return {
      sourceEntryId: source.id,
      state: decision.eventType === "L3_APPROVED" ? "DECIDED_APPROVED" : "DECIDED_REJECTED",
      resolvedByEntryId: decision.id,
      reason: `explicit L3 decision (${decision.eventType}) references this entry as its source`,
    };
  }

  // 2. Escalated and queued for human review, but no decision has landed
  //    yet: distinct from LIVE (no attention at all) — this one is
  //    already in front of a human.
  const queued = later.find(
    (e) => e.eventType === "L3_QUEUED" && sourceLedgerEntryIdOf(e) === source.id,
  );
  if (queued) {
    return {
      sourceEntryId: source.id,
      state: "ESCALATED_UNDECIDED",
      resolvedByEntryId: queued.id,
      reason:
        "escalated for L3 review via explicit source-entry back-reference; no decision is " +
        "recorded in the ledger. May still be awaiting review, or may have silently expired " +
        "past its SLA without a ledger record (L3ApprovalService.pruneExpired() does not " +
        "currently log expiry) — the ledger alone cannot distinguish the two.",
    };
  }

  // 3. No explicit-authority evidence at all. This tranche does not infer
  //    resolution from later same-artifact verdicts — see the module
  //    doc comment for why that inference was removed as unsound.
  return {
    sourceEntryId: source.id,
    state: "LIVE",
    reason: "no explicit L3 escalation/decision evidence found for this entry",
  };
}
