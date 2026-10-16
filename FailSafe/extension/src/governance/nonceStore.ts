/**
 * nonceStore - durable reads and writes of the replay-nonce file, and its
 * cross-process lock (v6.0.8 #472, LD-6/LD-7).
 *
 * The file on disk is the authority. Every change is one transaction under
 * the shared cross-process lock: read fresh, change, write. A write goes to a
 * new temp file (mode 0o600) that is fsynced, then, only while the lock is
 * still this holder's and the file still holds the bytes the transaction
 * read, renamed over the store; on POSIX the directory is fsynced after.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { acquireFileLock, FileLock, LockErrors } from "../shared/fileLock/crossProcessLock";
import { Logger } from "../shared/Logger";

export interface NonceRecord {
  nonce: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
  consumedBy?: string;
  metadata?: Record<string, unknown>;
}

/** Fault-injection seams for tests; production passes none. */
export interface NonceStoreSeams {
  renameSync?: (from: string, to: string) => void;
  writeSync?: (fd: number, data: string) => void;
  fsyncSync?: (fd: number) => void;
}

/**
 * The store is busy or was taken over: the lock could not be had or kept, or
 * the file changed under the transaction. Nothing was written and nothing on
 * disk is wrong, so the caller fails closed without disabling the store.
 */
export class NonceStoreBusyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NonceStoreBusyError";
  }
}

const busy = (code: string, message: string) => (): NonceStoreBusyError => new NonceStoreBusyError(code, message);

export const NONCE_LOCK_ERRORS: LockErrors = {
  timeout: (lastCode) => new NonceStoreBusyError("LOCK_TIMEOUT", `The nonce store is being updated by another FailSafe process (last error ${lastCode}).`),
  blocked: (code) => new NonceStoreBusyError("LOCK_BLOCKED", `FailSafe cannot take the nonce store lock (${code}).`),
  lost: busy("LOCK_LOST", "This nonce update took longer than the lock allows; nothing was written."),
  reentrant: busy("REENTRANT", "Nested nonce store updates are not supported."),
};

const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 3;
const RENAME_RETRY_MS = 50;
const READ_ATTEMPTS = 5;
const DIR_FSYNC_IGNORED = new Set(["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"]);
const logger = new Logger("NonceStore");

function codeOf(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "";
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The file's bytes, or null when it does not exist. Transient Windows errors are retried. */
export function readNonceBytes(file: string): Buffer | null {
  for (let attempt = 1; ; attempt++) {
    try {
      return fs.readFileSync(file);
    } catch (error) {
      if (codeOf(error) === "ENOENT") return null;
      if (attempt >= READ_ATTEMPTS || !TRANSIENT.has(codeOf(error))) throw error;
      sleepSync(10 * attempt);
    }
  }
}

/** Parse the store's bytes; throws on anything that is not an array of records. */
export function parseNonces(raw: Buffer | null): Map<string, NonceRecord> {
  const records = new Map<string, NonceRecord>();
  if (raw === null) return records;
  const parsed = JSON.parse(raw.toString("utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("the nonce store is not a list of records");
  for (const record of parsed as NonceRecord[]) records.set(record.nonce, record);
  return records;
}

export function withNonceLock<T>(
  file: string,
  opts: { timeoutMs: number; staleMs: number; now?: () => number },
  fn: (lock: FileLock) => T,
): T {
  const lock = acquireFileLock(file, {
    timeoutMs: opts.timeoutMs,
    staleMs: opts.staleMs,
    now: opts.now,
    errors: NONCE_LOCK_ERRORS,
    label: "Nonce store",
    ensureParent: () => fs.mkdirSync(path.dirname(file), { recursive: true }),
  });
  try {
    return fn(lock);
  } finally {
    lock.release();
  }
}

function renameWithRetry(from: string, to: string, rename: (from: string, to: string) => void): void {
  for (let attempt = 1; ; attempt++) {
    try {
      rename(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !TRANSIENT.has(codeOf(error))) throw error;
      sleepSync(RENAME_RETRY_MS);
    }
  }
}

/** Best effort: makes the rename itself durable on POSIX; Windows has no directory fsync. */
function fsyncDir(dir: string): void {
  if (process.platform === "win32") return;
  let fd: number | null = null;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch (error) {
    if (!DIR_FSYNC_IGNORED.has(codeOf(error))) logger.warn(`Nonce store directory fsync failed (${codeOf(error)})`);
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/**
 * Write `records` over `file`: temp file, fsync, `beforeRename()` (the lock
 * and byte checks), rename. Any failure removes the temp file and rethrows.
 */
export function writeNonceFile(file: string, records: NonceRecord[], beforeRename: () => void, seams: NonceStoreSeams = {}): void {
  const tmp = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    (seams.writeSync ?? ((d: number, data: string) => fs.writeFileSync(d, data, "utf8")))(fd, JSON.stringify(records, null, 2));
    (seams.fsyncSync ?? fs.fsyncSync)(fd);
    fs.closeSync(fd);
    fd = null;
    beforeRename();
    renameWithRetry(tmp, file, seams.renameSync ?? fs.renameSync);
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch { /* may not exist */ }
    throw error;
  }
  fsyncDir(path.dirname(file));
}

export type NonceChange<T> = (records: Map<string, NonceRecord>) => { changed: boolean; result: T };

/** The nonce file and its lock: lock-free reads, and locked read-change-write transactions. */
export class NonceFile {
  constructor(
    readonly path: string,
    private readonly lock: { timeoutMs: number; staleMs: number; now?: () => number },
    private readonly seams: NonceStoreSeams = {},
  ) {}

  /** A lock-free read: an atomic rename means a reader sees the old file or the new one. */
  read(): Map<string, NonceRecord> {
    return parseNonces(readNonceBytes(this.path));
  }

  /**
   * One change under the lock on a fresh read, written only if it changed.
   * Before the rename the lock must still be this holder's and the file must
   * still hold the bytes read. Throws NonceStoreBusyError when busy or taken
   * over (nothing written); any other error is a read or write failure.
   */
  transact<T>(change: NonceChange<T>): { result: T; records: Map<string, NonceRecord> } {
    return withNonceLock(this.path, this.lock, (lock) => {
      const raw = readNonceBytes(this.path);
      const records = parseNonces(raw);
      const { changed, result } = change(records);
      if (!changed) return { result, records };
      writeNonceFile(this.path, Array.from(records.values()), () => {
        lock.assertHeld();
        const now = readNonceBytes(this.path);
        const same = now === null ? raw === null : raw !== null && now.equals(raw);
        if (!same) throw new NonceStoreBusyError("CHANGED", "The nonce store changed during this update; nothing was written.");
      }, this.seams);
      return { result, records };
    });
  }
}
