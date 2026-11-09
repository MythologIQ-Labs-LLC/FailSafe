/**
 * #463: A zero-exit Qor-logic install is not an installation receipt.
 * Verify the frozen host's recorded files on disk before reporting success.
 * This checks the present file state; upstream wheel/CLI conformance is separate.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HOST_INSTALL_LAYOUTS, type QorLogicHost } from './hostLayouts';
import type { QorLogicInstallRecord, HostInstallStatus } from './qorLogicInstallRecord';

const MAX_FILES = 2048;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

export type VerifiedHostReceipt =
  | { ok: true; status: HostInstallStatus }
  | { ok: false; error: 'install-receipt-missing' | 'install-receipt-integrity-failed' };

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

/** Repository-scope only; global host receipts have a different trust root. */
export function verifyHostInstallReceipt(
  workspaceRoot: string, host: QorLogicHost,
): VerifiedHostReceipt {
  const layout = HOST_INSTALL_LAYOUTS[host];
  if (!layout) return { ok: false, error: 'install-receipt-integrity-failed' };
  const recordPath = path.join(workspaceRoot, layout.recordPath);
  let record: QorLogicInstallRecord | null;
  let workspace: string;
  let base: string;
  let recordMtime: string;
  try {
    workspace = fs.realpathSync(workspaceRoot);
    base = fs.realpathSync(path.join(workspaceRoot, layout.base));
    if (!within(workspace, base) || !within(base, fs.realpathSync(recordPath))) {
      throw Error('record escaped host');
    }
    // Open once with no-follow. Validate and parse using that same descriptor;
    // do not reopen an attacker-replaceable pathname after checking it.
    const fd = fs.openSync(recordPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const info = fs.fstatSync(fd);
      if (!info.isFile() || info.size > 1024 * 1024) throw Error('record invalid');
      recordMtime = info.mtime.toISOString();
      const parsed: unknown = JSON.parse(fs.readFileSync(fd, 'utf8'));
      record = parsed && typeof parsed === 'object'
        && Array.isArray((parsed as { files?: unknown }).files)
        ? parsed as QorLogicInstallRecord : null;
    } finally { fs.closeSync(fd); }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, error: 'install-receipt-missing' };
    }
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
  if (!record || !Array.isArray(record.files) || record.files.length === 0) {
    return { ok: false, error: 'install-receipt-missing' };
  }
  if (record.files.length > MAX_FILES) {
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
  try {
    let total = 0;
    const seen = new Set<string>();
    for (const item of record.files) {
      if (!item || typeof item.path !== 'string' || !path.isAbsolute(item.path)
        || typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) {
        throw Error('invalid entry');
      }
      if (fs.lstatSync(item.path).isSymbolicLink()) throw Error('linked file');
      const actual = fs.realpathSync(item.path);
      if (!within(base, actual) || seen.has(actual)) throw Error('invalid location');
      seen.add(actual);
      const fd = fs.openSync(item.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      try {
        const info = fs.fstatSync(fd);
        if (!info.isFile() || info.size > MAX_FILE_BYTES) throw Error('invalid file');
        total += info.size;
        if (total > MAX_TOTAL_BYTES || sha256OfFd(fd) !== item.sha256) {
          throw Error('digest mismatch or budget exceeded');
        }
      } finally { fs.closeSync(fd); }
    }
    // All paths/digests came from the same checked receipt descriptor.
    const destinations = [...new Set(record.files.map((entry) =>
      path.dirname(entry.path).replace(/\\\\/g, '/') + '/'))].sort();
    const status: HostInstallStatus = {
      host, installed: true, recordPath, fileCount: seen.size,
      destinations, recordMtime,
    };
    return { ok: true, status };
  } catch {
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
}
