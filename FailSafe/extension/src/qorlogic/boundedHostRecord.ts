/**
 * Bounded read-only parser for Qor-logic host installation records.
 * Presence is only an advisory Hub state, not verified installation evidence.
 * The separate host receipt verifier checks all installed file digests.
 */
import { MAX_RECEIPT_BYTES, MAX_RECEIPT_FILES, readBoundedReceipt } from './boundedReceiptRead';
import type { QorLogicInstallRecord } from './qorLogicInstallRecord';

export const MAX_HOST_RECORD_BYTES = MAX_RECEIPT_BYTES;
export const MAX_HOST_RECORD_FILES = MAX_RECEIPT_FILES;

export function readBoundedHostRecord(filePath: string): QorLogicInstallRecord | null {
  const read = readBoundedReceipt(filePath);
  if (!read.ok) return null;
  const parsed = read.value;
  if (!parsed || typeof parsed !== 'object') return null;
  const files = (parsed as { files?: unknown }).files;
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_HOST_RECORD_FILES) return null;
  if (!files.every((x: unknown) => x && typeof x === 'object'
    && typeof (x as { path?: unknown }).path === 'string'
    && typeof (x as { sha256?: unknown }).sha256 === 'string')) return null;
  return { files } as QorLogicInstallRecord;
}
