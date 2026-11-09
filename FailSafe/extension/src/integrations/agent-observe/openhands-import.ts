/**
 * openhands-import — persists an operator-approved import of an exported
 * OpenHands run as historical evidence (#477, building on draft PR #507).
 *
 * Store: `.failsafe/logs/openhands-imports.jsonl`, whose only writer is this
 * importer, under the shared cross-process lock. Each line is one event record, signed for this
 * install and folder (openhands-signing.ts). The shared transparency log gets
 * one summary line per import, so a large import does not push live verdicts
 * out of the recent-transparency views, and a torn line written by another
 * transparency writer can never block an import.
 *
 * Deduplication: when the export names its run (runIdentityOf) and an event
 * carries a string id, the event is keyed by run and id, so a longer re-export
 * of that run imports only the new events. Otherwise (integer ids, which
 * OpenHands 0.x numbers 0..N in every conversation, no id, or no run identity)
 * the event is keyed by the export file's hash and position, so a different
 * file re-imports its events. The key hashes a JSON-encoded tuple, so a run id
 * or event id containing the separator cannot collide with another key. Keys
 * are read only from lines whose signature verifies, by streaming the file,
 * never by reading it whole.
 *
 * Writes: one write per record line (a concurrent append can only fall between
 * lines), then fsync, before the import is reported as saved. Links under
 * `.failsafe` are refused before any folder is created. Both append targets
 * (the evidence file and the transparency log) are refused when they are a
 * link, and are then opened once (O_NOFOLLOW where the platform defines it),
 * checked on the open descriptor (a regular file with exactly one hard link)
 * and written through that descriptor, so the import never becomes an append
 * primitive into a file outside the workspace.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { acquireFileLock, type LockErrors } from '../../shared/fileLock/crossProcessLock';
import type { AgentObservationEvent } from './openhands-observer';
import { normalizeFolder, signRecord, type EvidenceKeyHolder } from './openhands-signing';
import {
  existingKeys, lstatIfPresent, openAppendTarget, refuseLinkedFolders, refuseLinks, writeAll, writeLines,
} from './openhands-evidence-file';

export const EVIDENCE_FILE = 'openhands-imports.jsonl';
export const RECORD_TYPE = 'agent.observation.imported';

/** Current processes use a mkdir lock; old releases left an empty regular file. */
const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 30_000;
const locked = () => new Error('OPENHANDS_IMPORT_LOCKED: import lock is held or cannot be safely recovered');
const LOCK_ERRORS: LockErrors = {
  timeout: () => locked(),
  blocked: (code) => new Error('OPENHANDS_IMPORT_LOCKED: cannot acquire evidence lock (' + code + ')'),
  lost: () => new Error('OPENHANDS_IMPORT_LOCK_LOST: lock ownership expired; import not acknowledged'),
  reentrant: () => locked(),
};

/**
 * Legacy regular-file locks never refreshed mtime. Even a very old file may
 * belong to a live writer, so age-based unlink can admit two writers.
 * Refuse until the operator has stopped the old host and removed its lock;
 * modern directory locks retain the shared lock's own stale recovery.
 */
function refuseLegacyLockFile(lockPath: string): void {
  let info: fs.Stats;
  try { info = fs.lstatSync(lockPath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: redirected lock');
  if (info.isDirectory()) return;
  // Neither an old mtime nor a second stat can attest that the old owner exited.
  // Leave the original lock bytes and filesystem object untouched on refusal.
  throw locked();
}


export interface OpenHandsImportResult {
  imported: number;
  duplicates: number;
  /** Lines in the evidence file whose signature did not verify (ignored). */
  unverified: number;
  /** False when the transparency summary line could not be appended. */
  summaryWritten: boolean;
}

export function evidencePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.failsafe', 'logs', EVIDENCE_FILE);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const NAMED_RUN_FIELDS = ['conversation_id', 'conversationId', 'session_id'] as const;

/**
 * The run an export belongs to, or undefined. Only strings count. A named
 * field (conversation_id, conversationId, session_id) counts when it is a UUID
 * or a token of at least 8 characters; the generic `id` field only when it is a
 * UUID or at least 16 hex characters. Qualifying fields that disagree mean no
 * run identity.
 */
export function runIdentityOf(envelope: unknown): string | undefined {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return undefined;
  const env = envelope as Record<string, unknown>;
  const found = new Set<string>();
  for (const f of NAMED_RUN_FIELDS) {
    const v = env[f];
    if (typeof v === 'string' && (UUID_RE.test(v) || (TOKEN_RE.test(v) && v.length >= 8))) found.add(v);
  }
  const g = env.id;
  if (typeof g === 'string' && (UUID_RE.test(g) || /^[0-9a-f]{16,64}$/i.test(g))) found.add(g);
  return found.size === 1 ? [...found][0] : undefined;
}

/** The deduplication key of one event (see the module comment). */
export function importKeyFor(event: AgentObservationEvent, sourceSha256: string, runId?: string): string {
  const basis = runId && event.idSource === 'export'
    ? ['openhands', 'run', runId, event.id, event.kind]
    : ['openhands', 'file', sourceSha256, event.index, event.kind];
  return createHash('sha256').update(JSON.stringify(basis)).digest('hex');
}

export interface PersistDeps {
  keys: EvidenceKeyHolder;
  now?: () => Date;
  /** Appends the transparency summary line; defaults to the workspace transparency log. */
  appendSummary?: (record: Record<string, unknown>) => void;
  /** The export's run identity (runIdentityOf), when it has one. */
  runId?: string;
}

function defaultAppendSummary(workspaceRoot: string): (record: Record<string, unknown>) => void {
  return (record) => {
    refuseLinkedFolders(workspaceRoot);
    const log = path.join(workspaceRoot, '.failsafe', 'logs', 'transparency.jsonl');
    const stat = lstatIfPresent(log);
    if (stat?.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: refusing a redirected transparency log');
    const fd = openAppendTarget(log, 'transparency log');
    try {
      writeAll(fd, JSON.stringify(record) + '\n');
    } finally {
      fs.closeSync(fd);
    }
  };
}

/** Refuse links, then create the logs folder; run again by the lock before it creates a lease. */
function prepareEvidenceFolder(workspaceRoot: string, target: string, lockPath: string): void {
  refuseLinkedFolders(workspaceRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  refuseLinks(workspaceRoot, target, lockPath);
}

interface RecordContext { key: string; folder: string; sourceSha256: string; importedAt: string; runId?: string }

/** Signed lines for the events not already recorded; `keys` gains each new import key. */
function newRecordLines(
  events: readonly AgentObservationEvent[], keys: Set<string>, ctx: RecordContext,
): { lines: string[]; duplicates: number } {
  const { key, folder, sourceSha256, importedAt } = ctx;
  let duplicates = 0;
  const lines: string[] = [];
  for (const event of events) {
    const importKey = importKeyFor(event, sourceSha256, ctx.runId);
    if (keys.has(importKey)) { duplicates++; continue; }
    keys.add(importKey);
    const record: Record<string, unknown> = {
      v: 2, type: RECORD_TYPE, source: 'openhands', origin: 'historical-export',
      importKey, sourceSha256, ...(ctx.runId ? { runId: ctx.runId } : {}), idSource: event.idSource, sourceEventId: event.id,
      kind: event.kind, verb: event.verb, tool: event.tool, severity: event.riskHint,
      sourceTimestamp: event.timestamp, importedAt, summary: event.summary,
    };
    record.sig = signRecord(key, folder, record);
    lines.push(JSON.stringify(record));
  }
  return { lines, duplicates };
}

export async function persistOpenHandsObservations(
  workspaceRoot: string, sourceFile: string, sourceBytes: Buffer,
  events: readonly AgentObservationEvent[], deps: PersistDeps,
): Promise<OpenHandsImportResult> {
  const target = evidencePath(workspaceRoot);
  const lockPath = `${target}.lock`;
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const folder = normalizeFolder(workspaceRoot);

  // Create the key, if none exists yet, before the lock: a keychain prompt must not hold it.
  await deps.keys.ensureKey();

  prepareEvidenceFolder(workspaceRoot, target, lockPath);
  refuseLegacyLockFile(lockPath);
  const lock = acquireFileLock(target, {
    timeoutMs: LOCK_TIMEOUT_MS, staleMs: LOCK_STALE_MS,
    label: 'OpenHands historical import', errors: LOCK_ERRORS,
    ensureParent: () => prepareEvidenceFolder(workspaceRoot, target, lockPath),
  });
  let result: Omit<OpenHandsImportResult, 'summaryWritten'>;
  try {
    const key = await deps.keys.readUnderLock();
    lock.assertHeld();
    const { keys, unverified } = existingKeys(target, key, folder);
    lock.assertHeld();
    const importedAt = (deps.now?.() ?? new Date()).toISOString();
    const { lines, duplicates } = newRecordLines(events, keys, { key, folder, sourceSha256, importedAt, runId: deps.runId });
    if (lines.length) writeLines(target, lines, () => lock.assertHeld());
    lock.assertHeld();
    result = { imported: lines.length, duplicates, unverified };
  } finally {
    lock.release();
  }
  const summaryWritten = writeImportSummary(workspaceRoot, sourceFile, sourceSha256, result, deps);
  return { ...result, summaryWritten };
}

/** One transparency summary line per import; a failure is reported, never thrown. */
function writeImportSummary(
  workspaceRoot: string, sourceFile: string, sourceSha256: string,
  result: { imported: number; duplicates: number }, deps: PersistDeps,
): boolean {
  try {
    (deps.appendSummary ?? defaultAppendSummary(workspaceRoot))({
      type: 'agent.import.summary', source: 'openhands', origin: 'historical-export',
      timestamp: (deps.now?.() ?? new Date()).toISOString(), sourceSha256,
      imported: result.imported, duplicates: result.duplicates,
      summary: `OpenHands historical import: ${result.imported} event(s) from ${path.basename(sourceFile)} (sha256 ${sourceSha256.slice(0, 12)}), not live enforcement`,
    });
    return true;
  } catch {
    return false;
  }
}
