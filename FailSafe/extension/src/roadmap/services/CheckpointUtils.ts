/**
 * CheckpointUtils - Pure utility functions for checkpoint hashing,
 * row mapping, and phase inference. Extracted from CheckpointStore.ts.
 */
import * as crypto from "crypto";
import type { CheckpointRecord, CheckpointStatus } from "./CheckpointStore";

export function stableStringify(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map((i) => normalize(i));
    if (input && typeof input === "object") {
      const obj = input as Record<string, unknown>;
      return Object.keys(obj).sort().reduce<Record<string, unknown>>(
        (acc, key) => { acc[key] = normalize(obj[key]); return acc; }, {},
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function mapCheckpointRow(row: Record<string, unknown>): CheckpointRecord {
  const evidence = parseEvidenceRefs(row.evidence_refs);
  return {
    checkpointId: String(row.checkpoint_id || ""),
    runId: String(row.run_id || ""),
    checkpointType: String(row.checkpoint_type || ""),
    phase: String(row.phase || ""),
    status: String(row.status || "validated") as CheckpointStatus,
    timestamp: String(row.timestamp || ""),
    parentId: row.parent_id ? String(row.parent_id) : null,
    gitHash: String(row.git_hash || "unknown"),
    policyVerdict: String(row.policy_verdict || "UNKNOWN"),
    evidenceRefs: evidence,
    actor: String(row.actor || "system"),
    payloadJson: String(row.payload_json || "{}"),
    payloadHash: String(row.payload_hash || ""),
    entryHash: String(row.entry_hash || ""),
    prevHash: String(row.prev_hash || "GENESIS_CHECKPOINT"),
  };
}

function parseEvidenceRefs(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((i) => String(i)) : [];
  } catch { return []; }
}

export function inferPhaseKeyFromPlan(plan: unknown): string {
  const phases = Array.isArray((plan as { phases?: unknown[] } | null)?.phases)
    ? (plan as { phases: Array<{ id?: string; title?: string; status?: string }> }).phases
    : [];
  const cpId = (plan as { currentPhaseId?: string } | null)?.currentPhaseId;
  const active = phases.find((p) => p.id === cpId) ||
    phases.find((p) => p.status === "active") || phases[0] || null;
  const title = String(active?.title || "").toLowerCase();
  if (title.includes("substantiat") || title.includes("release") || title.includes("ship")) return "substantiate";
  if (title.includes("debug") || title.includes("fix") || title.includes("stabil")) return "debug";
  if (title.includes("implement") || title.includes("build") || title.includes("develop")) return "implement";
  if (title.includes("audit") || title.includes("review") || title.includes("verify")) return "audit";
  return "plan";
}
