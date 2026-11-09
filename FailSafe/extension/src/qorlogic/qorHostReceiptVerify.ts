/**
 * #463: A zero-exit Qor-logic install is not an installation receipt.
 * Verify the frozen host's recorded files on disk before reporting success.
 * This checks the present file state; upstream wheel/CLI conformance is separate.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { MAX_RECEIPT_FILES, readBoundedReceipt } from './boundedReceiptRead';
import { HOST_INSTALL_LAYOUTS, type QorLogicHost } from './hostLayouts';
import type {
  QorLogicInstallRecord, QorLogicInstalledFile, HostInstallStatus,
} from './qorLogicInstallRecord';

const MAX_FILES = MAX_RECEIPT_FILES;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

type ReceiptError = 'install-receipt-missing' | 'install-receipt-integrity-failed';
export type VerifiedHostReceipt =
  | { ok: true; status: HostInstallStatus }
  | { ok: false; error: ReceiptError };

type LoadedReceipt =
  | { ok: true; record: QorLogicInstallRecord | null; base: string; recordMtime: string }
  | { ok: false; error: ReceiptError };

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..'
    && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function sha256OfFd(fd: number): string {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  while (true) {
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (bytes === 0) break;
    hash.update(buffer.subarray(0, bytes));
  }
  return hash.digest('hex');
}

/** Contain the record inside the host base, then read it through the shared bounded reader. */
function loadReceipt(workspaceRoot: string, layoutBase: string, recordPath: string): LoadedReceipt {
  try {
    const workspace = fs.realpathSync(workspaceRoot);
    const base = fs.realpathSync(path.join(workspaceRoot, layoutBase));
    if (!within(workspace, base) || !within(base, fs.realpathSync(recordPath))) {
      throw Error('record escaped host');
    }
    const read = readBoundedReceipt(recordPath);
    if (!read.ok) {
      return { ok: false, error: read.missing ? 'install-receipt-missing' : 'install-receipt-integrity-failed' };
    }
    const parsed = read.value;
    const record = parsed && typeof parsed === 'object'
      && Array.isArray((parsed as { files?: unknown }).files)
      ? parsed as QorLogicInstallRecord : null;
    return { ok: true, record, base, recordMtime: read.mtime.toISOString() };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, error: 'install-receipt-missing' };
    }
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
}

/** Verify one entry on its opened descriptor; returns the new byte total or throws. */
function verifyEntry(item: QorLogicInstalledFile, base: string, seen: Set<string>, total: number): number {
  if (!item || typeof item.path !== 'string' || !path.isAbsolute(item.path)
    || typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) {
    throw Error('invalid entry');
  }
  const beforeFile = fs.lstatSync(item.path);
  if (!beforeFile.isFile() || beforeFile.isSymbolicLink()) throw Error('linked file');
  const actual = fs.realpathSync(item.path);
  if (!within(base, actual) || seen.has(actual)) throw Error('invalid location');
  seen.add(actual);
  const fd = fs.openSync(item.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > MAX_FILE_BYTES
      || info.dev !== beforeFile.dev || info.ino !== beforeFile.ino) throw Error('invalid file');
    const next = total + info.size;
    if (next > MAX_TOTAL_BYTES || sha256OfFd(fd) !== item.sha256) {
      throw Error('digest mismatch or budget exceeded');
    }
    return next;
  } finally { fs.closeSync(fd); }
}

/** Repository-scope only; global host receipts have a different trust root. */
export function verifyHostInstallReceipt(
  workspaceRoot: string, host: QorLogicHost,
): VerifiedHostReceipt {
  const layout = HOST_INSTALL_LAYOUTS[host];
  if (!layout) return { ok: false, error: 'install-receipt-integrity-failed' };
  const recordPath = path.join(workspaceRoot, layout.recordPath);
  const loaded = loadReceipt(workspaceRoot, layout.base, recordPath);
  if (!loaded.ok) return loaded;
  const { record, base, recordMtime } = loaded;
  if (!record || !Array.isArray(record.files) || record.files.length === 0) {
    return { ok: false, error: 'install-receipt-missing' };
  }
  if (record.files.length > MAX_FILES) {
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
  try {
    let total = 0;
    const seen = new Set<string>();
    for (const item of record.files) total = verifyEntry(item, base, seen, total);
    // All paths/digests came from the same checked receipt descriptor.
    const destinations = [...new Set(record.files.map((entry) =>
      path.dirname(entry.path).replace(/\\/g, '/') + '/'))].sort();
    const status: HostInstallStatus = {
      host, installed: true, recordPath, fileCount: seen.size,
      destinations, recordMtime,
    };
    return { ok: true, status };
  } catch {
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
}
