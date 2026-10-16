/**
 * openhands-evidence — reads imported OpenHands evidence into timeline entries
 * (#477) for both the VS Code Agent Timeline panel and the Console Timeline.
 *
 * The evidence file is workspace input, so nothing in it is trusted until it
 * verifies: a line is shown only when its signature verifies under the key held
 * in memory for this install and folder, and every field of a verified record
 * is rebuilt from closed sets before it becomes an entry (an out-of-set severity
 * is shown as info; an out-of-set kind or a malformed hash skips the record).
 * Imported entries never carry an artifact path, so the panel offers no
 * "Open file" action for them.
 *
 * Reads are synchronous (AgentTimelineService.getEntries is), bounded (the last
 * 500 records of each folder, read backwards in 64 KiB chunks, at most 1 MiB)
 * and cached per folder on (size, mtimeMs); the cache is cleared when the key
 * changes, after the new key is in memory.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TimelineEntry } from '../../sentinel/AgentTimelineService';
import { EVIDENCE_FILE, RECORD_TYPE } from './openhands-import';
import { normalizeFolder, verifyRecord, type EvidenceKeyHolder } from './openhands-signing';

export const MAX_RECORDS_PER_FOLDER = 500;
const CHUNK = 64 * 1024;
const MAX_TAIL = 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export interface FolderRef { fsPath: string; name: string }

export interface EvidenceRead {
  entries: TimelineEntry[];
  /** Lines whose signature did not verify (or that were not JSON). */
  unverified: number;
  /** Verified lines rebuilt from closed sets and skipped as malformed. */
  skipped: number;
}

export interface FsOps {
  statSync(p: string): { size: number; mtimeMs: number; isFile(): boolean };
  openSync(p: string, flags: string): number;
  readSync(fd: number, buf: Buffer, off: number, len: number, pos: number): number;
  closeSync(fd: number): void;
}

const realFs: FsOps = {
  statSync: (p) => fs.statSync(p),
  openSync: (p, f) => fs.openSync(p, f),
  readSync: (fd, b, o, l, p) => fs.readSync(fd, b, o, l, p),
  closeSync: (fd) => fs.closeSync(fd),
};

/** The last complete lines of a file (at most `max`), reading backwards. */
function tailLines(file: string, size: number, max: number, fsx: FsOps): string[] {
  const fd = fsx.openSync(file, 'r');
  try {
    let pos = size;
    // Chunks are kept as bytes and decoded once, so a character split across a
    // chunk boundary is not corrupted; newlines are counted on the bytes.
    const chunks: Buffer[] = [];
    let newlines = 0;
    while (pos > 0 && size - pos < MAX_TAIL) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      fsx.readSync(fd, buf, 0, len, pos);
      chunks.unshift(buf);
      for (const b of buf) if (b === 0x0a) newlines++;
      if (newlines + 1 > max + 1) break;
    }
    const lines = Buffer.concat(chunks).toString('utf8').split('\n');
    if (pos > 0) lines.shift(); // the first line may be cut
    return lines.filter((l) => l.trim()).slice(-max);
  } finally {
    fsx.closeSync(fd);
  }
}

function isoOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Rebuild one verified record from closed sets; undefined when it must be skipped. */
export function toTimelineEntry(rec: Record<string, unknown>, folder: FolderRef, folderIndex: number): TimelineEntry | undefined {
  if (rec.type !== RECORD_TYPE || rec.source !== 'openhands') return undefined;
  if (rec.kind !== 'action' && rec.kind !== 'observation') return undefined;
  if (typeof rec.importKey !== 'string' || !HEX64.test(rec.importKey)) return undefined;
  if (typeof rec.sourceSha256 !== 'string' || !HEX64.test(rec.sourceSha256)) return undefined;
  const kind = rec.kind;
  const verb = typeof rec.verb === 'string' && TOKEN_RE.test(rec.verb) ? rec.verb : 'unrecognized';
  const severity = rec.severity === 'high' ? 'error' : rec.severity === 'warn' ? 'warning' : 'info';
  const at = isoOrUndefined(rec.sourceTimestamp) ?? isoOrUndefined(rec.importedAt) ?? new Date(0).toISOString();
  return {
    id: `openhands-${folderIndex}-${rec.importKey.slice(0, 24)}`,
    timestamp: at,
    category: 'imported',
    title: `OpenHands (historical import): ${kind} ${verb}`,
    detail: `Imported from an exported run (sha256 ${rec.sourceSha256.slice(0, 12)}) in ${folder.name}; a record of a past run, not live enforcement.`,
    icon: 'archive',
    severity,
  };
}

export class OpenHandsEvidenceReader {
  private readonly cache = new Map<string, { size: number; mtimeMs: number; read: EvidenceRead }>();
  private readonly subscription: { dispose(): void };

  constructor(
    private readonly keys: EvidenceKeyHolder,
    private readonly folders: () => readonly FolderRef[],
    private readonly fsx: FsOps = realFs,
  ) {
    this.subscription = keys.onKeyChanged(() => this.cache.clear());
  }

  read(): EvidenceRead {
    const out: EvidenceRead = { entries: [], unverified: 0, skipped: 0 };
    this.folders().forEach((folder, index) => {
      const r = this.readFolder(folder, index);
      out.entries.push(...r.entries);
      out.unverified += r.unverified;
      out.skipped += r.skipped;
    });
    return out;
  }

  dispose(): void { this.subscription.dispose(); }

  private readFolder(folder: FolderRef, index: number): EvidenceRead {
    const file = path.join(folder.fsPath, '.failsafe', 'logs', EVIDENCE_FILE);
    let stat: { size: number; mtimeMs: number; isFile(): boolean };
    try { stat = this.fsx.statSync(file); } catch { return { entries: [], unverified: 0, skipped: 0 }; }
    if (!stat.isFile()) return { entries: [], unverified: 0, skipped: 0 };
    const key = this.keys.current();
    const cached = this.cache.get(file);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.read;

    const folderId = normalizeFolder(folder.fsPath);
    const read: EvidenceRead = { entries: [], unverified: 0, skipped: 0 };
    const seen = new Set<string>();
    for (const line of tailLines(file, stat.size, MAX_RECORDS_PER_FOLDER, this.fsx)) {
      let rec: unknown;
      try { rec = JSON.parse(line); } catch { read.unverified++; continue; }
      if (!rec || typeof rec !== 'object' || !verifyRecord(key, folderId, rec as Record<string, unknown>)) { read.unverified++; continue; }
      const r = rec as Record<string, unknown>;
      if (typeof r.importKey === 'string' && seen.has(r.importKey)) continue;
      const entry = toTimelineEntry(r, folder, index);
      if (!entry) { read.skipped++; continue; }
      seen.add(r.importKey as string);
      read.entries.push(entry);
    }
    this.cache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, read });
    return read;
  }
}
