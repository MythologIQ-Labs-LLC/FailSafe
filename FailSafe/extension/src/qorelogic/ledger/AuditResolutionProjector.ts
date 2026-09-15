/**
 * AuditResolutionProjector — FailSafe#367 resolution-linkage projection.
 *
 * WIRED (since tranche 2, PR #419): `HubSnapshotService.buildAuditResolutionLog()`
 * calls `projectResolution` and exposes it as `auditLog` on the hub snapshot;
 * `governance.js` renders it via `renderResolutionLog()`/`resolutionBadge()`.
 * This banner previously said "NOT YET WIRED" (true only through tranche 1)
 * and was left stale for two further tranches before being caught here
 * (FX947 review) -- the exact defect class it exists to prevent (the ACP
 * tamper detector in #398 sat uncalled for months). Every `ResolutionState`
 * added here must also be added to `resolutionBadge()`'s style map, or it
 * renders as an unstyled fallback instead of a designed label.
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
 *   BLOCK it says nothing about.
 *
 *   Half of this is now resolved (FX934, #367 tranche 3b):
 *   `LedgerEntry.verificationMethod` distinguishes `'existence_claim'`
 *   (AGENT_CLAIM events) from `'sentinel_heuristic'` (every other event
 *   type) instead of the single hardcoded literal both paths previously
 *   shared -- see below for how this projector now consumes it.
 *
 * Content/pattern-based supersession is now reintroduced (FX947, #367
 * tranche 3c) -- narrower than either fix floated above, and without
 * per-pattern persistence. The disjoint-pattern-namespace problem is closed
 * by requiring the later PASS to share `verificationMethod` (FX934) with
 * the original entry. The decision-driving-pattern problem turned out not
 * to need a fix at all: since a PASS can never carry a critical/high/medium
 * match, "no pattern overlap" was never informative, but a later PASS for
 * the *exact same artifactPath and engine* is still real evidence nothing
 * that engine currently flags -- provided the PASS reflects a real check.
 *
 * That "real check" condition is the actual blocker this doc previously
 * missed: `determineDecision` also returns PASS when zero checks ran at
 * all (`FILE_DELETED`, an oversized/unreadable file, an `AGENT_CLAIM` with
 * no claimed artifacts), which the old payload could not distinguish from
 * "ran every check and found nothing" -- a deleted file could have
 * silently cleared a real BLOCK on that path. FX947 adds
 * `payload.heuristicsEvaluated` (`heuristicResults.length`, matched or not)
 * to every ledger entry so the projector can require a genuinely non-empty
 * scan. `ExistenceEngine.validateClaim` only pushes a result for a
 * *failing* check, so a clean claim also reads `heuristicsEvaluated: 0` --
 * a disclosed asymmetry that only ever makes `existence_claim` supersession
 * unavailable, never unsound, so this tranche's practical effect is scoped
 * to `sentinel_heuristic`.
 *
 * Never applies to `ESCALATE`: that has its own L3 authority path, and an
 * inferred clean re-scan must not substitute for a pending human decision.
 * Only `WARN`/`BLOCK` (which never reach L3, see below) are eligible.
 * Correlation still excludes synthetic paths (`'unknown'`,
 * `'claim_manifest'`) and still keys on `artifactPath`, not `artifactHash`
 * (FX933): a real fix changes the file's content and therefore its hash,
 * so hash equality would almost never fire for the case this targets.
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
  | "SUPERSEDED"
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

// Synthetic non-file identities that must never participate in path-based
// correlation -- see the module doc's "Correlation still excludes" note.
const SYNTHETIC_ARTIFACT_PATHS = new Set(["unknown", "claim_manifest"]);

function sourceLedgerEntryIdOf(entry: LedgerEntry): number | null {
  const value = entry.payload?.sourceLedgerEntryId;
  return typeof value === "number" ? value : null;
}

function heuristicsEvaluatedOf(entry: LedgerEntry): number {
  const value = entry.payload?.heuristicsEvaluated;
  return typeof value === "number" ? value : 0;
}

function isSyntheticArtifactPath(artifactPath: string | undefined): boolean {
  return artifactPath === undefined || SYNTHETIC_ARTIFACT_PATHS.has(artifactPath);
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

  // 3. Content-based supersession (FX947, #367 tranche 3c) -- see below.
  const superseded = projectContentSupersession(source, later);
  if (superseded) return superseded;

  // 4. No explicit-authority or content-based evidence at all. Stays LIVE.
  return {
    sourceEntryId: source.id,
    state: "LIVE",
    reason: "no explicit L3 escalation/decision evidence found for this entry",
  };
}

/**
 * Branch 3 of projectOne, extracted for readability. Eligibility and
 * matching rules: see the module doc's "Content/pattern-based
 * supersession" section (WARN/BLOCK only, same path + same engine, later
 * entry must be a non-vacuous PASS, earliest qualifying match wins).
 */
function projectContentSupersession(
  source: LedgerEntry,
  later: LedgerEntry[],
): ResolutionProjection | undefined {
  const verdict = source.verificationResult || "";
  if (verdict === "ESCALATE" || isSyntheticArtifactPath(source.artifactPath)) return undefined;

  const supersedingPass = later.find(
    (e) =>
      e.eventType === "AUDIT_PASS" &&
      e.artifactPath === source.artifactPath &&
      e.verificationMethod === source.verificationMethod &&
      heuristicsEvaluatedOf(e) > 0,
  );
  if (!supersedingPass) return undefined;

  return {
    sourceEntryId: source.id,
    state: "SUPERSEDED",
    resolvedByEntryId: supersedingPass.id,
    reason:
      `a later '${source.verificationMethod ?? "unknown"}' scan of the same artifact path ` +
      `(entry #${supersedingPass.id}) evaluated a real, non-empty check set and returned a ` +
      "clean PASS, with no explicit L3 decision on record for this entry",
  };
}
