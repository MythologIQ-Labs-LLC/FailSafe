/**
 * #463: A zero-exit Qor-logic install is not an installation receipt.
 * Verify the frozen host's recorded files on disk before reporting success.
 * This checks the present file state; upstream wheel/CLI conformance is separate.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HOST_INSTALL_LAYOUTS, type QorLogicHost } from './hostLayouts';
import { getHostInstallStatus, readInstallRecord, type HostInstallStatus } from './qorLogicInstallRecord';

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
  const record = readInstallRecord(workspaceRoot, host);
  if (!record || !Array.isArray(record.files) || record.files.length === 0) {
    return { ok: false, error: 'install-receipt-missing' };
  }
  if (record.files.length > MAX_FILES) {
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
  try {
    const workspace = fs.realpathSync(workspaceRoot);
    const base = fs.realpathSync(path.join(workspaceRoot, layout.base));
    if (!within(workspace, base)) throw Error('host outside workspace');
    const recordPath = path.join(workspaceRoot, layout.recordPath);
    if (!fs.lstatSync(recordPath).isFile()) throw Error('record not file');
    if (!within(base, fs.realpathSync(recordPath))) throw Error('record escaped host');
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
    const status = getHostInstallStatus(workspaceRoot, host);
    if (!status.installed || status.fileCount !== seen.size) throw Error('receipt drift');
    return { ok: true, status };
  } catch {
    return { ok: false, error: 'install-receipt-integrity-failed' };
  }
}
