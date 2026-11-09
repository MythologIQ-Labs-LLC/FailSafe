/**
 * Evidence-file primitives for the OpenHands historical import (openhands-import.ts), split out
 * for the Section 4 razor: link refusal, the checked append descriptor, signed-key streaming
 * and torn-line-safe, fsynced line writes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import { verifyRecord } from './openhands-signing';

/**
 * Open an append target once and check the descriptor itself, so a swap between
 * the path checks and the open cannot redirect the write: it must be a regular
 * file with exactly one hard link (a second link means the same bytes also live
 * outside this path). O_NOFOLLOW refuses a final symlink where it is defined;
 * on Windows it is not, and the lstat checks before the open are what refuse one.
 */
export function openAppendTarget(file: string, what: string): number {
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
export function writeAll(fd: number, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error('OPENHANDS_IMPORT_WRITE_FAILED: no progress writing the evidence file');
    offset += written;
  }
}

/** Refuse a link at `.failsafe` or `.failsafe/logs` before anything is created there. */
export function refuseLinkedFolders(workspaceRoot: string): void {
  for (const dir of [path.join(workspaceRoot, '.failsafe'), path.join(workspaceRoot, '.failsafe', 'logs')]) {
    const stat = lstatIfPresent(dir);
    if (stat?.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: refusing a redirected evidence path');
  }
}

/** lstat, or undefined when the path does not exist; any other error is thrown. */
export function lstatIfPresent(file: string): fs.Stats | undefined {
  try { return fs.lstatSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function refuseLinks(workspaceRoot: string, target: string, lockPath: string): void {
  for (const candidate of [path.join(workspaceRoot, '.failsafe'), path.dirname(target), target, lockPath]) {
    const stat = lstatIfPresent(candidate);
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error('OPENHANDS_IMPORT_SYMLINK: refusing a redirected evidence path');
    if (candidate === target && !stat.isFile()) throw new Error('OPENHANDS_IMPORT_INVALID_LOG: the evidence target is not a regular file');
  }
}

/** Verified import keys already in the evidence file, and the count of lines that did not verify.
 *  Streams the file in 64 KiB chunks through a StringDecoder instead of reading it whole. */
export function existingKeys(target: string, key: string, folder: string): { keys: Set<string>; unverified: number } {
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

export function writeLines(target: string, lines: string[], assertHeld: () => void): void {
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
