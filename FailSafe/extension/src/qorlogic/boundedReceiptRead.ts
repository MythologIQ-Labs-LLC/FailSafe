/**
 * #463: the single bounded, no-follow, identity-checked JSON receipt reader.
 * Advisory record reads and receipt integrity verification share these bounds.
 */
import * as fs from 'fs';

export const MAX_RECEIPT_BYTES = 1024 * 1024;
export const MAX_RECEIPT_FILES = 2048;
const MIN_RECEIPT_BYTES = 2;

export type BoundedReceiptRead =
  | { ok: true; value: unknown; mtime: Date }
  | { ok: false; missing: boolean };

const INVALID: BoundedReceiptRead = { ok: false, missing: false };

function inBudget(info: fs.Stats): boolean {
  return info.isFile() && info.size >= MIN_RECEIPT_BYTES && info.size <= MAX_RECEIPT_BYTES;
}

/**
 * Read at most one byte past the checked size; a growing record cannot force
 * unbounded allocation or be accepted on an earlier size check.
 */
function readExactly(fd: number, size: number): Buffer | null {
  const buffer = Buffer.alloc(size + 1);
  let length = 0;
  while (length < buffer.length) {
    const n = fs.readSync(fd, buffer, length, buffer.length - length, null);
    if (n === 0) break;
    length += n;
  }
  if (length > MAX_RECEIPT_BYTES || length !== size) return null;
  return buffer.subarray(0, length);
}

/** `missing` is true only when the record path does not exist (ENOENT). */
export function readBoundedReceipt(filePath: string): BoundedReceiptRead {
  let fd: number | undefined;
  try {
    // O_NOFOLLOW is not portable to every Windows host. Reject linked
    // records explicitly and bind the opened descriptor to the lstat identity.
    const before = fs.lstatSync(filePath);
    if (before.isSymbolicLink() || !inBudget(before)) return INVALID;
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const current = fs.fstatSync(fd);
    if (!inBudget(current) || current.dev !== before.dev || current.ino !== before.ino) return INVALID;
    const bytes = readExactly(fd, current.size);
    if (!bytes) return INVALID;
    return { ok: true, value: JSON.parse(bytes.toString('utf8')), mtime: current.mtime };
  } catch (err) {
    return { ok: false, missing: (err as NodeJS.ErrnoException).code === 'ENOENT' };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
