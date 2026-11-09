/**
 * Bounded read-only parser for Qor-logic host installation records.
 * Presence is only an advisory Hub state, not verified installation evidence.
 * The separate host receipt verifier checks all installed file digests.
 */
import * as fs from 'fs';
import type { QorLogicInstallRecord } from './qorLogicInstallRecord';

export const MAX_HOST_RECORD_BYTES = 1024 * 1024;
export const MAX_HOST_RECORD_FILES = 2048;

export function readBoundedHostRecord(filePath: string): QorLogicInstallRecord | null {
  let fd: number | undefined;
  try {
    const before = fs.lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 2
      || before.size > MAX_HOST_RECORD_BYTES) return null;
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const current = fs.fstatSync(fd);
    if (!current.isFile() || current.size < 2 || current.size > MAX_HOST_RECORD_BYTES
      || current.dev !== before.dev || current.ino !== before.ino) return null;
    // Read at most one byte past the budget; a growing record cannot force
    // unbounded allocation or be accepted on an earlier size check.
    const buffer = Buffer.alloc(current.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const n = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (n === 0) break;
      length += n;
    }
    if (length > MAX_HOST_RECORD_BYTES || length !== current.size) return null;
    const parsed: unknown = JSON.parse(buffer.toString('utf8', 0, length));
    if (!parsed || typeof parsed !== 'object') return null;
    const files = (parsed as { files?: unknown }).files;
    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_HOST_RECORD_FILES) return null;
    if (!files.every((x: unknown) => x && typeof x === 'object'
      && typeof (x as { path?: unknown }).path === 'string'
      && typeof (x as { sha256?: unknown }).sha256 === 'string')) return null;
    return { files } as QorLogicInstallRecord;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
