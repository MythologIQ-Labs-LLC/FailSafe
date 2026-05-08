// Fixture-data builders for the ConsoleServer-boot helper (Phase 2 of
// plan-monitor-coherence-and-browser-verification.md). Kept side-by-side with
// the existing `ledgerFixtures.ts` (used by `serveCompactUI.ts`) so that the
// two helpers can share types without coupling their implementations.

import type { CheckpointRecord, CheckpointStatus } from "../../../roadmap/services/CheckpointStore";

export interface CatalogItem {
  id: string;
  name: string;
  trustTier: "verified" | "community" | "untrusted";
  status: "installed" | "available" | "quarantined";
}

export interface TimelineEvent {
  id: string;
  type: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface RiskEntry {
  id: string;
  title: string;
  severity?: "low" | "medium" | "high";
  [key: string]: unknown;
}

export interface VerdictPayload {
  verdict: "PASS" | "WARN" | "BLOCK" | "VETO";
  reason?: string;
  [key: string]: unknown;
}

/** Build a `policy.checked` CheckpointRecord whose payloadJson encodes the
 *  given verdict. The memory-fallback branch in `getRecentVerdicts`
 *  (CheckpointStore.ts:73-76) JSON-parses payloadJson and only includes rows
 *  whose checkpointType equals "policy.checked". */
export function buildVerdictRecord(
  payload: VerdictPayload,
  overrides: Partial<CheckpointRecord> = {},
): CheckpointRecord {
  const ts = overrides.timestamp || "2026-05-08T00:00:00.000Z";
  const payloadJson = JSON.stringify(payload);
  const status: CheckpointStatus = overrides.status || "validated";
  return {
    checkpointId: overrides.checkpointId || `ckpt-${payload.verdict.toLowerCase()}-${ts}`,
    runId: overrides.runId || "run-test",
    checkpointType: "policy.checked",
    phase: overrides.phase || "implement",
    status,
    timestamp: ts,
    parentId: overrides.parentId ?? null,
    gitHash: overrides.gitHash || "0000000",
    policyVerdict: overrides.policyVerdict || payload.verdict,
    evidenceRefs: overrides.evidenceRefs || [],
    actor: overrides.actor || "test-actor",
    payloadJson,
    payloadHash: overrides.payloadHash || "test-payload-hash",
    entryHash: overrides.entryHash || "test-entry-hash",
    prevHash: overrides.prevHash || "GENESIS_CHECKPOINT",
  };
}

/** Convenience builder for the timeline.jsonl fixture. */
export function buildTimelineEvent(
  id: string,
  type: string,
  extra: Record<string, unknown> = {},
): TimelineEvent {
  return { id, type, timestamp: "2026-05-08T00:00:00.000Z", ...extra };
}
