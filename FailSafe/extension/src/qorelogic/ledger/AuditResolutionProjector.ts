/**
 * AuditResolutionProjector — FailSafe#367 resolution-linkage projection.
 *
 * Pure read-model over soa_ledger entries. Never mutates the ledger: the
 * chain stays append-only, and a WARN/BLOCK/ESCALATE record is never
 * rewritten. Resolution is represented as a *projection* — for a given
 * historical AUDIT_FAIL entry, what does the rest of the chain say about
 * its current status?
 *
 * Deliberately conservative: an entry is only reported SUPERSEDED when a
 * later PASS verdict for the same artifactPath demonstrably cleared the
 * same finding (no overlapping matched pattern ids). A later non-PASS
 * verdict for the same pattern, or a later verdict this projector cannot
 * confidently compare, never gets silently reported as resolved.
 */

import type { LedgerEntry } from "../../shared/types";

export type ResolutionState =
  | "LIVE"
  | "SUPERSEDED"
  | "DECIDED_APPROVED"
  | "DECIDED_REJECTED"
  | "AMBIGUOUS"
  | "UNKNOWN";

export interface ResolutionProjection {
  /** id of the WARN/BLOCK/ESCALATE ledger entry this projection describes. */
  sourceEntryId: number;
  state: ResolutionState;
  /** id of the ledger entry that produced this state, when there is one. */
  resolvedByEntryId?: number;
  reason: string;
}

const RESOLVABLE_VERDICTS = new Set(["WARN", "BLOCK", "ESCALATE"]);

function matchedPatternsOf(entry: LedgerEntry): string[] | null {
  const value = entry.payload?.matchedPatterns;
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "string")) return null;
  return value as string[];
}

function sourceLedgerEntryIdOf(entry: LedgerEntry): number | null {
  const value = entry.payload?.sourceLedgerEntryId;
  return typeof value === "number" ? value : null;
}

function intersects(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return b.some((v) => set.has(v));
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
  //    source always wins over any inferred supersession. If more than one
  //    such decision exists (re-decision), the latest by id is authoritative.
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

  // 2. No artifact identity to correlate against — cannot even attempt
  //    supersession matching.
  if (!source.artifactPath) {
    return {
      sourceEntryId: source.id,
      state: "UNKNOWN",
      reason: "entry has no artifactPath; no basis for linkage",
    };
  }

  const sourcePatterns = matchedPatternsOf(source);
  if (sourcePatterns === null) {
    return {
      sourceEntryId: source.id,
      state: "UNKNOWN",
      reason: "entry has no readable matchedPatterns; cannot establish finding identity",
    };
  }

  const sameArtifact = later.filter((e) => e.artifactPath === source.artifactPath);
  let sawUncomparable = false;

  for (const candidate of sameArtifact) {
    if (candidate.eventType !== "AUDIT_PASS" && candidate.eventType !== "AUDIT_FAIL") continue;
    const candidatePatterns = matchedPatternsOf(candidate);
    if (candidatePatterns === null) {
      sawUncomparable = true;
      continue;
    }
    if (candidate.verificationResult === "PASS" && !intersects(sourcePatterns, candidatePatterns)) {
      return {
        sourceEntryId: source.id,
        state: "SUPERSEDED",
        resolvedByEntryId: candidate.id,
        reason: "later PASS verdict for the same artifact carries none of this entry's matched patterns",
      };
    }
    // Later verdict for the same artifact that still overlaps this
    // entry's patterns, or is non-PASS: the concern this entry raised has
    // not been demonstrated clear. Falls through — stays LIVE unless a
    // later candidate resolves it.
  }

  if (sawUncomparable) {
    return {
      sourceEntryId: source.id,
      state: "AMBIGUOUS",
      reason: "a later entry for the same artifact exists but its matchedPatterns cannot be compared",
    };
  }

  return {
    sourceEntryId: source.id,
    state: "LIVE",
    reason: sameArtifact.length === 0
      ? "no later entry for this artifact"
      : "later entries for this artifact exist but none demonstrate this finding cleared",
  };
}
