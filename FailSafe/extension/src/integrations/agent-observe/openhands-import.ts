/**
 * openhands-import — persists an operator-approved import of an exported
 * OpenHands run as historical evidence (#477, building on draft PR #507).
 *
 * Store: `.failsafe/logs/openhands-imports.jsonl`, whose only writer is this
 * importer, under its own lock. Each line is one event record, signed for this
 * install and folder (openhands-signing.ts). The shared transparency log gets
 * one summary line per import, so a large import does not push live verdicts
 * out of the recent-transparency views, and a torn line written by another
 * transparency writer can never block an import.
 *
 * Deduplication: an event that carries its own export id is keyed by that id
 * (a re-export of the same run with more events imports only the new ones);
 * only an event without one is keyed by the export file's hash and position.
 * Keys are read only from lines whose signature verifies.
 *
 * Writes: one write per record line (a concurrent append can only fall between
 * lines), then fsync, before the import is reported as saved. Links under
 * `.failsafe` are refused, so the import never becomes an append primitive
 * into a file outside the workspace.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { AgentObservationEvent } from './openhands-observer';
import { normalizeFolder, signRecord, verifyRecord, type EvidenceKeyHolder } from './openhands-signing';

export const EVIDENCE_FILE = 'openhands-imports.jsonl';
export const RECORD_TYPE = 'agent.observation.imported';

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

/** The deduplication key of one event (see the module comment). */
export function importKeyFor(event: AgentObservationEvent, sourceSha256: string): string {
  const basis = event.idSource === 'export'
    ? `openhands:id:${event.id}:${event.kind}`
    : `openhands:file:${sourceSha256}:${event.index}:${event.kind}`;
  return createHash('sha256').update(basis).digest('hex');
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

/** Verified import keys already in the evidence file, and the count of lines that did not verify. */
function existingKeys(target: string, key: string, folder: string): { keys: Set<string>; unverified: number } {
  const keys = new Set<string>();
  let unverified = 0;
  if (!fs.existsSync(target)) return { keys, unverified };
  for (const line of fs.readFileSync(target, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { unverified++; continue; }
    if (!rec || typeof rec !== 'object' || !verifyRecord(key, folder, rec as Record<string, unknown>)) { unverified++; continue; }
    const k = (rec as Record<string, unknown>).importKey;
    if (typeof k === 'string') keys.add(k);
  }
  return { keys, unverified };
}

/** True when the file ends inside a line (a torn last write); the next line must start fresh. */
function endsMidLine(target: string): boolean {
  let fd: number | undefined;
  try {
    const size = fs.statSync(target).size;
    if (size === 0) return false;
    fd = fs.openSync(target, 'r');
    const last = Buffer.alloc(1);
    fs.readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeLines(target: string, lines: string[]): void {
  const torn = endsMidLine(target);
  const fd = fs.openSync(target, 'a', 0o600);
  try {
    if (torn) fs.writeSync(fd, '\n');
    for (const line of lines) {
      const bytes = Buffer.from(line + '\n', 'utf8');
      let offset = 0;
      while (offset < bytes.length) {
        const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
        if (written <= 0) throw new Error('OPENHANDS_IMPORT_WRITE_FAILED: no progress writing the evidence file');
        offset += written;
      }
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export interface PersistDeps {
  keys: EvidenceKeyHolder;
  now?: () => Date;
  /** Appends the transparency summary line; defaults to the workspace transparency log. */
  appendSummary?: (record: Record<string, unknown>) => void;
}

function defaultAppendSummary(workspaceRoot: string): (record: Record<string, unknown>) => void {
  return (record) => {
    const log = path.join(workspaceRoot, '.failsafe', 'logs', 'transparency.jsonl');
    fs.appendFileSync(log, JSON.stringify(record) + '\n', 'utf8');
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

  fs.mkdirSync(path.dirname(target), { recursive: true });
  refuseLinks(workspaceRoot, target, lockPath);
  let lockFd: number;
  try { lockFd = fs.openSync(lockPath, 'wx', 0o600); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('OPENHANDS_IMPORT_LOCKED: another import holds the lock; inspect it before removing the lock file');
    }
    throw error;
  }
  let result: Omit<OpenHandsImportResult, 'summaryWritten'>;
  try {
    const key = await deps.keys.readUnderLock();
    const { keys, unverified } = existingKeys(target, key, folder);
    const importedAt = (deps.now?.() ?? new Date()).toISOString();
    let duplicates = 0;
    const lines: string[] = [];
    for (const event of events) {
      const importKey = importKeyFor(event, sourceSha256);
      if (keys.has(importKey)) { duplicates++; continue; }
      keys.add(importKey);
      const record: Record<string, unknown> = {
        v: 1, type: RECORD_TYPE, source: 'openhands', origin: 'historical-export',
        importKey, sourceSha256, idSource: event.idSource, sourceEventId: event.id,
        kind: event.kind, verb: event.verb, tool: event.tool, severity: event.riskHint,
        sourceTimestamp: event.timestamp, importedAt, summary: event.summary,
      };
      record.sig = signRecord(key, folder, record);
      lines.push(JSON.stringify(record));
    }
    if (lines.length) writeLines(target, lines);
    result = { imported: lines.length, duplicates, unverified };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lockPath);
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
