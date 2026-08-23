/**
 * AuditResolutionProjector — FailSafe#367 resolution-linkage projection.
 *
 * NOT YET WIRED: this module has no production consumer. It is tranche 1 —
 * the identity and read-model — and the renderer that surfaces it lands in a
 * later tranche (see the FX927 row in docs/FEATURE_INDEX.md). Shipping a
 * correct, tested, zero-consumer module is itself a defect class this repo has
 * been burned by (the ACP tamper detector in #398 sat uncalled for months), so
 * this banner exists to keep that visible to the next reader rather than only
 * in a PR description.
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
 * provenance on each entry, or anchoring supersession to verified content
 * identity instead of a path string — either way, also excluding synthetic
 * non-file identities (`'unknown'`, `'claim_manifest'`) from any
 * path-based correlation. That is deferred to a follow-up tranche;
 * `FailSafe#367` stays open for it.
 *
 * Half of that second option landed separately (FX933, #367 tranche 3a):
 * `LedgerEntry.artifactHash` is now populated end-to-end for real file
 * events (`VerdictEngine.generateVerdict`'s trailing `fileContent` param,
 * reusing content `VerdictArbiter` already read — never a second disk
 * read). That makes verified-content identity available on the ledger,
 * but this projector does not yet consume it: no supersession inference
 * is reintroduced by that change alone, since the disjoint-pattern-
 * namespace and decision-driving-pattern problems above are unresolved.
 * `artifactHash` stays unset for the `'unknown'`/`'claim_manifest'`
 * synthetic paths and for `FILE_DELETED` events, matching this module's
 * existing exclusion of those identities.
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

  // 2. Escalated and queued for L3, but no decision has landed yet. Distinct
  //    from LIVE (never escalated) — but deliberately NOT a claim that a human
  //    is looking at it: pruneExpired() discards past-SLA items without writing
  //    any ledger entry, so from the ledger alone "awaiting review" and
  //    "silently expired unattended" are indistinguishable. The projected
  //    reason string says exactly that; keep this comment consistent with it.
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
