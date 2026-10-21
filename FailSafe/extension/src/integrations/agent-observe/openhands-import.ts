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
import { StringDecoder } from 'string_decoder';
import { acquireFileLock, type LockErrors } from '../../shared/fileLock/crossProcessLock';
import type { AgentObservationEvent } from './openhands-observer';
import { normalizeFolder, signRecord, verifyRecord, type EvidenceKeyHolder } from './openhands-signing';

export const EVIDENCE_FILE = 'openhands-imports.jsonl';
export const RECORD_TYPE = 'agent.observation.imported';

/** Current processes use a mkdir lock; old releases left an empty regular file. */
const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 30_000;
const LEGACY_STALE_MS = 120_000;
const locked = () => new Error('OPENHANDS_IMPORT_LOCKED: import lock is held or cannot be safely recovered');
const LOCK_ERRORS: LockErrors = {
  timeout: () => locked(),
  blocked: (code) => new Error('OPENHANDS_IMPORT_LOCKED: cannot acquire evidence lock (' + code + ')'),
  lost: () => new Error('OPENHANDS_IMPORT_LOCK_LOST: lock ownership expired; import not acknowledged'),
  reentrant: () => locked(),
};

/**
 * Migrate old regular .lock files only after a conservative inactivity window.
 * Old files contain no owner PID, so a recent lock is never presumed stale.
 * Proper-lockfile handles new directory locks independently.
 */
function recoverLegacyLockFile(lockPath: string): void {
  let first: fs.Stats;
  try { first = fs.lstatSync(lockPath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (first.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: redirected lock');
  if (first.isDirectory()) return;
  if (!first.isFile() || first.nlink !== 1 || Date.now() - first.mtimeMs < LEGACY_STALE_MS) throw locked();
  const current = fs.lstatSync(lockPath);
  if (!current.isFile() || current.nlink !== 1 ||
      current.dev !== first.dev || current.ino !== first.ino ||
      current.mtimeMs !== first.mtimeMs || current.ctimeMs !== first.ctimeMs ||
      current.size !== first.size) throw locked();
  fs.unlinkSync(lockPath);
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

/**
 * Open an append target once and check the descriptor itself, so a swap between
 * the path checks and the open cannot redirect the write: it must be a regular
 * file with exactly one hard link (a second link means the same bytes also live
 * outside this path). O_NOFOLLOW refuses a final symlink where it is defined;
 * on Windows it is not, and the lstat checks before the open are what refuse one.
 */
function openAppendTarget(file: string, what: string): number {
  const flags = fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(file, flags, 0o600);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw new Error(`OPENHANDS_IMPORT_INVALID_LOG: the ${what} is not a regular file`);
    if (st.nlink !== 1) throw new Error(`OPENHANDS_IMPORT_HARDLINK: refusing a hard-linked ${what}`);
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

/** Write every byte through the descriptor. */
function writeAll(fd: number, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error('OPENHANDS_IMPORT_WRITE_FAILED: no progress writing the evidence file');
    offset += written;
  }
}

/** Refuse a link at `.failsafe` or `.failsafe/logs` before anything is created there. */
function refuseLinkedFolders(workspaceRoot: string): void {
  for (const dir of [path.join(workspaceRoot, '.failsafe'), path.join(workspaceRoot, '.failsafe', 'logs')]) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(dir); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: refusing a redirected evidence path');
  }
}

function refuseLinks(workspaceRoot: string, target: string, lockPath: string): void {
  for (const candidate of [path.join(workspaceRoot, '.failsafe'), path.dirname(target), target, lockPath]) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(candidate); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: refusing a redirected evidence path');
    if (candidate === target && !stat.isFile()) throw new Error('OPENHANDS_IMPORT_INVALID_LOG: the evidence target is not a regular file');
  }
}

/** Verified import keys already in the evidence file, and the count of lines that did not verify.
 *  Streams the file in 64 KiB chunks through a StringDecoder instead of reading it whole. */
function existingKeys(target: string, key: string, folder: string): { keys: Set<string>; unverified: number } {
  const keys = new Set<string>();
  let unverified = 0;
  if (!fs.existsSync(target)) return { keys, unverified };
  const take = (line: string): void => {
    if (!line.trim()) return;
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { unverified++; return; }
    if (!rec || typeof rec !== 'object' || !verifyRecord(key, folder, rec as Record<string, unknown>)) { unverified++; return; }
    const k = (rec as Record<string, unknown>).importKey;
    if (typeof k === 'string') keys.add(k);
  };
  const fd = fs.openSync(target, 'r');
  try {
    const decoder = new StringDecoder('utf8');
    const buf = Buffer.alloc(64 * 1024);
    let rest = '';
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      const parts = (rest + decoder.write(buf.subarray(0, n))).split('\n');
      rest = parts.pop() ?? '';
      parts.forEach(take);
    }
    take(rest + decoder.end());
  } finally {
    fs.closeSync(fd);
  }
  return { keys, unverified };
}

/** True when the open file ends inside a line (a torn last write); the next line must start fresh. */
function endsMidLine(fd: number): boolean {
  const size = fs.fstatSync(fd).size;
  if (size === 0) return false;
  const last = Buffer.alloc(1);
  fs.readSync(fd, last, 0, 1, size - 1);
  return last[0] !== 0x0a;
}

function writeLines(target: string, lines: string[], assertHeld: () => void): void {
  assertHeld();
  const fd = openAppendTarget(target, 'evidence file');
  try {
    if (endsMidLine(fd)) writeAll(fd, '\n');
    for (const line of lines) {
      assertHeld();
      writeAll(fd, line + '\n');
    }
    fs.fsyncSync(fd);
    assertHeld();
  } finally {
    fs.closeSync(fd);
  }
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
    let stat: fs.Stats | undefined;
    try { stat = fs.lstatSync(log); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (stat?.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: refusing a redirected transparency log');
    const fd = openAppendTarget(log, 'transparency log');
    try {
      writeAll(fd, JSON.stringify(record) + '\n');
    } finally {
      fs.closeSync(fd);
    }
  };
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

  refuseLinkedFolders(workspaceRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  refuseLinks(workspaceRoot, target, lockPath);
  recoverLegacyLockFile(lockPath);
  const lock = acquireFileLock(target, {
    timeoutMs: LOCK_TIMEOUT_MS, staleMs: LOCK_STALE_MS,
    label: 'OpenHands historical import', errors: LOCK_ERRORS,
    ensureParent: () => {
      refuseLinkedFolders(workspaceRoot);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      refuseLinks(workspaceRoot, target, lockPath);
    },
  });
  let result: Omit<OpenHandsImportResult, 'summaryWritten'>;
  try {
    const key = await deps.keys.readUnderLock();
    lock.assertHeld();
    const { keys, unverified } = existingKeys(target, key, folder);
    lock.assertHeld();
    const importedAt = (deps.now?.() ?? new Date()).toISOString();
    let duplicates = 0;
    const lines: string[] = [];
    for (const event of events) {
      const importKey = importKeyFor(event, sourceSha256, deps.runId);
      if (keys.has(importKey)) { duplicates++; continue; }
      keys.add(importKey);
      const record: Record<string, unknown> = {
        v: 2, type: RECORD_TYPE, source: 'openhands', origin: 'historical-export',
        importKey, sourceSha256, ...(deps.runId ? { runId: deps.runId } : {}), idSource: event.idSource, sourceEventId: event.id,
        kind: event.kind, verb: event.verb, tool: event.tool, severity: event.riskHint,
        sourceTimestamp: event.timestamp, importedAt, summary: event.summary,
      };
      record.sig = signRecord(key, folder, record);
      lines.push(JSON.stringify(record));
    }
    if (lines.length) writeLines(target, lines, () => lock.assertHeld());
    lock.assertHeld();
    result = { imported: lines.length, duplicates, unverified };
  } finally {
    lock.release();
  }

  let summaryWritten = true;
  try {
    (deps.appendSummary ?? defaultAppendSummary(workspaceRoot))({
      type: 'agent.import.summary', source: 'openhands', origin: 'historical-export',
      timestamp: (deps.now?.() ?? new Date()).toISOString(), sourceSha256,
      imported: result.imported, duplicates: result.duplicates,
      summary: `OpenHands historical import: ${result.imported} event(s) from ${path.basename(sourceFile)} (sha256 ${sourceSha256.slice(0, 12)}), not live enforcement`,
    });
  } catch {
    summaryWritten = false;
  }
  return { ...result, summaryWritten };
}
