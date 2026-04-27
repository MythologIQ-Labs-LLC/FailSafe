/**
 * CheckpointStore - Manages checkpoint persistence, chain verification,
 * and summary queries. Extracted from ConsoleServer.ts for modularity.
 */
import * as crypto from "crypto";
import {
  stableStringify, hash, tryGetGitHead,
  mapCheckpointRow, inferPhaseKeyFromPlan,
} from "./CheckpointUtils";

export { stableStringify, hash, mapCheckpointRow, inferPhaseKeyFromPlan } from "./CheckpointUtils";

export type CheckpointStatus = "proposed" | "validated" | "sealed" | "superseded";

export type CheckpointRecord = {
  checkpointId: string;
  runId: string;
  checkpointType: string;
  phase: string;
  status: CheckpointStatus;
  timestamp: string;
  parentId: string | null;
  gitHash: string;
  policyVerdict: string;
  evidenceRefs: string[];
  actor: string;
  payloadJson: string;
  payloadHash: string;
  entryHash: string;
  prevHash: string;
};

import type { CheckpointDb } from "../../shared/types/database";
export type { CheckpointDb } from "../../shared/types/database";

const CKPT_COLUMNS = `checkpoint_id, run_id, checkpoint_type, phase, status, timestamp,
  parent_id, git_hash, policy_verdict, evidence_refs, actor,
  payload_json, payload_hash, entry_hash, prev_hash`;

export function getRecentCheckpoints(
  db: CheckpointDb, memory: CheckpointRecord[], limit: number,
): CheckpointRecord[] {
  if (db) {
    try {
      const rows = db.prepare(
        `SELECT ${CKPT_COLUMNS} FROM failsafe_checkpoints ORDER BY id DESC LIMIT ?`,
      ).all(limit) as Record<string, unknown>[];
      return rows.map(mapCheckpointRow);
    } catch (err) {
      console.warn("[CheckpointStore] getRecentCheckpoints query failed:", err);
      /* fall through to memory */
    }
  }
  return memory.slice(0, limit);
}

export function getRecentVerdicts(
  db: CheckpointDb, memory: CheckpointRecord[], limit: number,
): Array<Record<string, unknown>> {
  if (db) {
    try {
      const rows = db.prepare(
        `SELECT payload_json, timestamp FROM failsafe_checkpoints
         WHERE checkpoint_type = 'policy.checked'
         ORDER BY id DESC LIMIT ?`,
      ).all(limit) as Array<{ payload_json: string; timestamp: string }>;
      return rows.map(row => ({ ...JSON.parse(row.payload_json), timestamp: row.timestamp }));
    } catch (err) {
      console.warn("[CheckpointStore] getRecentVerdicts query failed:", err);
      /* fall through to memory */
    }
  }
  return memory
    .filter(r => r.checkpointType === "policy.checked")
    .slice(0, limit)
    .map(r => ({ ...JSON.parse(r.payloadJson), timestamp: r.timestamp }));
}

export function getAllCheckpointsAsc(
  db: CheckpointDb, memory: CheckpointRecord[],
): CheckpointRecord[] {
  if (db) {
    try {
      const rows = db.prepare(
        `SELECT ${CKPT_COLUMNS} FROM failsafe_checkpoints ORDER BY id ASC`,
      ).all() as Record<string, unknown>[];
      return rows.map(mapCheckpointRow);
    } catch { return memory.slice().reverse(); }
  }
  return memory.slice().reverse();
}

export function verifyCheckpointChain(
  db: CheckpointDb, memory: CheckpointRecord[],
): boolean {
  const records = getAllCheckpointsAsc(db, memory);
  if (records.length === 0) return true;
  let prevHash = "GENESIS_CHECKPOINT";
  for (const record of records) {
    if (hash(record.payloadJson) !== record.payloadHash) return false;
    const recomputed = hash(stableStringify({
      checkpointId: record.checkpointId, runId: record.runId,
      checkpointType: record.checkpointType, phase: record.phase,
      status: record.status, timestamp: record.timestamp,
      parentId: record.parentId, gitHash: record.gitHash,
      policyVerdict: record.policyVerdict,
      evidenceRefs: record.evidenceRefs.slice().sort(),
      actor: record.actor, payloadHash: record.payloadHash,
      prevHash: record.prevHash,
    }));
    if (recomputed !== record.entryHash) return false;
    if (record.prevHash !== prevHash) return false;
    prevHash = record.entryHash;
  }
  return true;
}

export function verifyLatestCheckpoint(
  db: CheckpointDb, memory: CheckpointRecord[],
): boolean {
  const records = getRecentCheckpoints(db, memory, 2);
  if (records.length === 0) return true;
  const latest = records[0];
  if (hash(latest.payloadJson) !== latest.payloadHash) return false;
  const expectedPrev = records.length > 1 ? records[1].entryHash : "GENESIS_CHECKPOINT";
  return latest.prevHash === expectedPrev;
}

export function getCheckpointSummary(
  db: CheckpointDb, memory: CheckpointRecord[],
  cachedChainValid: boolean, chainValidAt: string | null,
): Record<string, unknown> {
  const recent = getRecentCheckpoints(db, memory, 1)[0];
  const latestValid = verifyLatestCheckpoint(db, memory);
  const chainValid = cachedChainValid && latestValid;
  const total = db
    ? (() => {
        try {
          const row = db.prepare("SELECT count(*) as c FROM failsafe_checkpoints")
            .get() as { c: number };
          return Number(row?.c || 0);
        } catch { return memory.length; }
      })()
    : memory.length;
  return {
    total, chainValid, chainValidAt,
    latestType: recent?.checkpointType || null,
    latestAt: recent?.timestamp || null,
    latestVerdict: recent?.policyVerdict || null,
  };
}

export function buildCheckpointRecord(
  input: {
    checkpointType: string; actor: string; phase: string;
    status: CheckpointStatus; policyVerdict: string;
    evidenceRefs: string[]; payload: unknown;
  },
  timestamp: string,
  runId: string,
  db: CheckpointDb,
  memory: CheckpointRecord[],
): CheckpointRecord {
  const payloadJson = stableStringify(input.payload || {});
  const payloadHash = hash(payloadJson);
  const gitHash = tryGetGitHead();
  const previous = getRecentCheckpoints(db, memory, 1)[0];
  const prevHash = previous?.entryHash || "GENESIS_CHECKPOINT";
  const checkpointId = crypto.randomUUID();
  const parentId = previous?.checkpointId || null;
  const entryHash = hash(stableStringify({
    checkpointId, runId, checkpointType: input.checkpointType,
    phase: input.phase, status: input.status, timestamp,
    parentId, gitHash, policyVerdict: input.policyVerdict,
    evidenceRefs: input.evidenceRefs.slice().sort(),
    actor: input.actor, payloadHash, prevHash,
  }));
  return {
    checkpointId, runId, checkpointType: input.checkpointType,
    phase: input.phase, status: input.status, timestamp,
    parentId, gitHash, policyVerdict: input.policyVerdict,
    evidenceRefs: input.evidenceRefs, actor: input.actor,
    payloadJson, payloadHash, entryHash, prevHash,
  };
}

export function persistCheckpoint(
  record: CheckpointRecord,
  db: CheckpointDb,
  memory: CheckpointRecord[],
): void {
  if (db) {
    try {
      db.prepare(`
        INSERT INTO failsafe_checkpoints (${CKPT_COLUMNS})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.checkpointId, record.runId, record.checkpointType,
        record.phase, record.status, record.timestamp,
        record.parentId, record.gitHash, record.policyVerdict,
        JSON.stringify(record.evidenceRefs), record.actor,
        record.payloadJson, record.payloadHash, record.entryHash,
        record.prevHash,
      );
      return;
    } catch (error) {
      console.warn("Checkpoint persistence failed, using memory fallback:", error);
    }
  }
  memory.unshift(record);
  if (memory.length > 500) memory.splice(500);
  // Evict entries older than 24 hours from memory fallback
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const idx = memory.findIndex(r => r.timestamp < cutoff);
  if (idx >= 0) memory.splice(idx);
}

export const CHECKPOINT_INIT_SQL = `
  CREATE TABLE IF NOT EXISTS failsafe_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkpoint_id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL,
    checkpoint_type TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    parent_id TEXT,
    git_hash TEXT NOT NULL,
    policy_verdict TEXT NOT NULL,
    evidence_refs TEXT NOT NULL,
    actor TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL UNIQUE,
    prev_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fs_ckpt_time ON failsafe_checkpoints(timestamp);
  CREATE INDEX IF NOT EXISTS idx_fs_ckpt_run ON failsafe_checkpoints(run_id);
  CREATE INDEX IF NOT EXISTS idx_fs_ckpt_phase ON failsafe_checkpoints(phase);
  CREATE INDEX IF NOT EXISTS idx_fs_ckpt_type ON failsafe_checkpoints(checkpoint_type);
`;
