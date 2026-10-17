/**
 * nonceStore - durable reads and writes of the replay-nonce file, and its
 * cross-process lock (v6.0.8 #472, LD-6/LD-7).
 *
 * The file on disk is the authority. Every change is one transaction under
 * the shared cross-process lock: read fresh, change, write. A write goes to a
 * new temp file (mode 0o600) that is fsynced; then the file must still hold
 * the bytes the transaction read, the lock must still be this holder's, an
 * optional commit step runs (a consumption's marker, nonceMarkers.ts), and the
 * lock is checked again immediately before each rename attempt. On POSIX the
 * directory is fsynced after the rename.
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

/** @internal Fault-injection seams for tests; production passes none. */
export interface NonceStoreSeams {
  renameSync?: (from: string, to: string) => void;
  writeSync?: (fd: number, data: string) => void;
  fsyncSync?: (fd: number) => void;
  /** Opens the temp file (default: flag wx, mode 0o600). */
  openTemp?: (file: string) => number;
}

/**
 * The store is busy or was taken over: a read or the lock could not be had
 * or kept, or the file changed under the transaction. Nothing on disk is
 * wrong, so the caller fails closed without disabling the store. Nothing was
 * written, except for LOST_AFTER_MARK: the lock was lost after a
 * consumption's marker was created, so that nonce stays used.
 */
export class NonceStoreBusyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NonceStoreBusyError";
  }
}

const busy = (code: string, message: string) => (): NonceStoreBusyError => new NonceStoreBusyError(code, message);

export const NONCE_LOCK_ERRORS: LockErrors = {
  timeout: (lastCode, _staleMs, lockPresent) => new NonceStoreBusyError("LOCK_TIMEOUT",
    !lockPresent && (lastCode === "EPERM" || lastCode === "EACCES")
      ? `FailSafe cannot create the nonce store lock (${lastCode}); the store folder may be read-only. Replay authorization is refused until FailSafe can write there.`
      : `The nonce store is being updated by another FailSafe process (last error ${lastCode}).`),
  blocked: (code) => new NonceStoreBusyError("LOCK_BLOCKED", `FailSafe cannot take the nonce store lock (${code}).`),
  lost: busy("LOCK_LOST", "This nonce update took longer than the lock allows; nothing was written."),
  reentrant: busy("REENTRANT", "Nested nonce store updates are not supported."),
};

export const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 3;
const RENAME_RETRY_MS = 50;
const READ_ATTEMPTS = 5;
const DIR_FSYNC_IGNORED = new Set(["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"]);
const LOST_AFTER_MARK = "This nonce was marked used, then the store lock was lost before the store was updated; it will not be accepted.";
const logger = new Logger("NonceStore");

export function codeOf(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "";
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The file's bytes, or null when it does not exist. Transient Windows errors
 * are retried; if they persist the read is busy (NonceStoreBusyError).
 */
export function readNonceBytes(file: string): Buffer | null {
  for (let attempt = 1; ; attempt++) {
    try {
      return fs.readFileSync(file);
    } catch (error) {
      const code = codeOf(error);
      if (code === "ENOENT") return null;
      if (!TRANSIENT.has(code)) throw error;
      if (attempt >= READ_ATTEMPTS) throw new NonceStoreBusyError("READ_BUSY", `The nonce store could not be read just now (${code}).`);
      sleepSync(10 * attempt);
    }
  }
}

/**
 * Parse the store's bytes; throws on anything that is not an array. Entries
 * that are not objects with a string nonce are dropped (a malformed expiresAt
 * is handled as expired by the guard).
 */
export function parseNonces(raw: Buffer | null): Map<string, NonceRecord> {
  const records = new Map<string, NonceRecord>();
  if (raw === null) return records;
  const parsed = JSON.parse(raw.toString("utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("the nonce store is not a list of records");
  for (const entry of parsed as unknown[]) {
    const record = entry as NonceRecord | null;
    if (record && typeof record === "object" && typeof record.nonce === "string") records.set(record.nonce, record);
  }
  return records;
}

export function withNonceLock<T>(
  file: string,
  opts: { timeoutMs: number; staleMs: number; now?: () => number },
  fn: (lock: FileLock) => T,
  ensureParent: () => void = () => fs.mkdirSync(path.dirname(file), { recursive: true }),
): T {
  const lock = acquireFileLock(file, {
    timeoutMs: opts.timeoutMs,
    staleMs: opts.staleMs,
    now: opts.now,
    errors: NONCE_LOCK_ERRORS,
    label: "Nonce store",
    ensureParent,
  });
  try {
    return fn(lock);
  } finally {
    lock.release();
  }
}

function renameWithRetry(from: string, to: string, rename: (from: string, to: string) => void, beforeEach: () => void): void {
  for (let attempt = 1; ; attempt++) {
    // The lock check runs immediately before each attempt, with no sleep in between (LD-2).
    beforeEach();
    try {
      rename(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !TRANSIENT.has(codeOf(error))) throw error;
      sleepSync(RENAME_RETRY_MS);
    }
  }
}

/** Best effort: makes a rename or create durable on POSIX; Windows has no directory fsync. */
export function fsyncDir(dir: string): void {
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

export interface WriteHooks {
  /** The byte compare and the lock check, after the temp file is durable. */
  check(): void;
  /** Optional step after the checks and before the rename (a consumption's marker). */
  commit?(): void;
  /** Immediately before each rename attempt (the lock check). */
  beforeEachRename(): void;
}

/**
 * Write `records` over `file`: temp file, fsync, `check`, `commit`, then the
 * rename with `beforeEachRename` before every attempt. Any failure removes the
 * temp file and rethrows.
 */
export function writeNonceFile(file: string, records: NonceRecord[], hooks: WriteHooks, seams: NonceStoreSeams = {}): void {
  const tmp = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  let fd: number | null = null;
  try {
    fd = (seams.openTemp ?? ((t: string) => fs.openSync(t, "wx", 0o600)))(tmp);
    (seams.writeSync ?? ((d: number, data: string) => fs.writeFileSync(d, data, "utf8")))(fd, JSON.stringify(records, null, 2));
    (seams.fsyncSync ?? fs.fsyncSync)(fd);
    fs.closeSync(fd);
    fd = null;
    hooks.check();
    hooks.commit?.();
    renameWithRetry(tmp, file, seams.renameSync ?? fs.renameSync, () => hooks.beforeEachRename());
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch { /* may not exist */ }
    throw error;
  }
  fsyncDir(path.dirname(file));
}

/** A change to the records; `commit` runs after the checks, immediately before the rename. */
export type NonceChange<T> = (records: Map<string, NonceRecord>) => { changed: boolean; result: T; commit?: () => void };

/** The nonce file and its lock: lock-free reads, and locked read-change-write transactions. */
export class NonceFile {
  constructor(
    readonly path: string,
    private readonly lock: { timeoutMs: number; staleMs: number; now?: () => number },
    private readonly seams: NonceStoreSeams = {},
    /** The store-folder containment walk (checkNonceStoreDir, LD11); throws on a link. */
    private readonly dirCheck?: (create: boolean) => boolean,
  ) {}

  /** A lock-free read: an atomic rename means a reader sees the old file or the new one. */
  read(): Map<string, NonceRecord> {
    if (this.dirCheck && !this.dirCheck(false)) return new Map();
    return parseNonces(readNonceBytes(this.path));
  }

  /**
   * One change under the lock on a fresh read, written only if it changed.
   * After the temp file is durable the file must still hold the bytes read
   * and the lock must still be this holder's; then the change's commit step
   * runs; then the lock is checked before each rename attempt. Throws
   * NonceStoreBusyError when busy or taken over; any other error is a read or
   * write failure (or the commit step's own error).
   */
  transact<T>(change: NonceChange<T>): { result: T; records: Map<string, NonceRecord> } {
    const dirCheck = this.dirCheck;
    dirCheck?.(true);
    const ensureParent = dirCheck ? () => { dirCheck(true); } : undefined;
    return withNonceLock(this.path, this.lock, (lock) => {
      dirCheck?.(true); // again after the lock wait, before anything is written (LD11)
      const raw = readNonceBytes(this.path);
      const records = parseNonces(raw);
      const { changed, result, commit } = change(records);
      if (!changed) return { result, records };
      let committed = false;
      writeNonceFile(this.path, Array.from(records.values()), {
        check: () => {
          const now = readNonceBytes(this.path);
          const same = now === null ? raw === null : raw !== null && now.equals(raw);
          if (!same) throw new NonceStoreBusyError("CHANGED", "The nonce store changed during this update; nothing was written.");
          dirCheck?.(false);
          lock.assertHeld();
        },
        commit: commit ? () => { commit(); committed = true; } : undefined,
        beforeEachRename: () => {
          try {
            lock.assertHeld();
          } catch (error) {
            throw committed ? new NonceStoreBusyError("LOST_AFTER_MARK", LOST_AFTER_MARK) : error;
          }
        },
      }, this.seams);
      return { result, records };
    }, ensureParent);
  }
}
