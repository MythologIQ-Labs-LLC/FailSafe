/**
 * crossProcessLock - an exclusive lock on one file, shared by every FailSafe
 * process (v6.0.8 LD-3). Moved without behavior change from the #517 risk
 * register lock so the replay-nonce store can use it too; each store passes
 * its own typed errors.
 *
 * The lock is proper-lockfile's mkdir lock at `<file>.lock`. The caller, not
 * the library, decides what counts as contention, and the caller, not the
 * library, removes the lock directory: only while the directory is still the
 * one this holder created and the lock budget has not run out, so a holder
 * that stalled never deletes a lock another process has since taken.
 *
 * Waiters queue first-come, first-served (lockQueue.ts, #528): a writer
 * making back-to-back updates queues behind a waiter that arrived earlier.
 * A holder that crashed or stalled still blocks waiters until stale recovery.
 */

import * as fs from "fs";
import * as path from "path";
import * as lockfile from "proper-lockfile";
import { Logger } from "../Logger";
import { LockQueue, QueueSeams } from "./lockQueue";

/** The store-specific failures; each store words them for its own file. */
export interface LockErrors {
  timeout(lastCode: string, staleMs: number): Error;
  blocked(code: string): Error;
  lost(): Error;
  reentrant(): Error;
}

export interface FileLockOptions {
  timeoutMs: number;
  staleMs: number;
  errors: LockErrors;
  /** Names the store in log lines. */
  label: string;
  /** Internal test seam: the monotonic clock (default performance.now). */
  now?: () => number;
  /** Re-runs the store's path check when mkdir reports ENOENT. */
  ensureParent?: () => void;
  /** @internal Queue test seam (LD-4.8); production passes none. */
  queueSeams?: QueueSeams;
}

export interface FileLock {
  /** Throws the store's "lost" error unless this holder still owns the lock. */
  assertHeld(): void;
  /** Never throws. */
  release(): void;
}

interface LockIdentity { dev: bigint; ino: bigint; mtimeNs: bigint; birthtimeNs: bigint }

const CONTENTION = new Set(["ELOCKED", "EPERM", "EACCES", "EBUSY"]);
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY"]);
const RELEASE_ATTEMPTS = 3;
const RELEASE_RETRY_MS = 20;
const LOCK_MARGIN_MS = 1000;
const HEAD_POLL_MS = 5;
const held = new Set<string>();
const logger = new Logger("CrossProcessLock");

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "UNKNOWN";
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Same file, same key: the real directory path, case-folded where usual. */
export function reentryKey(file: string): string {
  let resolved = path.resolve(file);
  try {
    resolved = path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved));
  } catch {
    // An unresolvable directory keeps the resolved path as its key.
  }
  return process.platform === "win32" || process.platform === "darwin"
    ? resolved.toLowerCase()
    : resolved;
}

function readIdentity(lockDir: string): LockIdentity | null {
  for (let attempt = 1; ; attempt++) {
    try {
      const st = fs.lstatSync(lockDir, { bigint: true });
      if (!st.isDirectory() || st.isSymbolicLink()) return null;
      return { dev: st.dev, ino: st.ino, mtimeNs: st.mtimeNs, birthtimeNs: st.birthtimeNs };
    } catch (error) {
      if (attempt >= 3 || !TRANSIENT.has(errorCode(error))) return null;
      sleepSync(10);
    }
  }
}

function sameIdentity(a: LockIdentity | null, b: LockIdentity | null): boolean {
  return !!a && !!b && a.dev === b.dev && a.ino === b.ino &&
    a.mtimeNs === b.mtimeNs && a.birthtimeNs === b.birthtimeNs;
}

/** Is a failed acquire waiting on a real lock, or blocked for good? */
function isContention(lockDir: string): boolean {
  try {
    const st = fs.lstatSync(lockDir);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch (error) {
    const code = errorCode(error);
    return code === "ENOENT" || TRANSIENT.has(code);
  }
}

function tryLock(file: string, opts: FileLockOptions): (() => void) | string {
  try {
    return lockfile.lockSync(file, {
      realpath: false,
      stale: opts.staleMs,
      fs,
      onCompromised: (err) => logger.warn(`${opts.label} lock compromised`, err),
    });
  } catch (error) {
    return errorCode(error);
  }
}

function waitForLock(file: string, opts: FileLockOptions, now: () => number): void {
  const lockDir = `${file}.lock`;
  const startedAt = now();
  const deadline = startedAt + opts.timeoutMs;
  const patientAt = startedAt + opts.timeoutMs / 2;
  const queue = new LockQueue(`${file}.queue`, opts.staleMs, opts.label, opts.queueSeams);
  let wait = 5;
  let lastCode = "ELOCKED";
  let parentRetried = false;
  try {
    queue.arrive();
    for (;;) {
      if (queue.mayAttempt(now() >= patientAt)) {
        const outcome = tryLock(file, opts);
        if (typeof outcome === "function") return;
        if (outcome === "ENOENT" && !parentRetried && opts.ensureParent) {
          parentRetried = true;
          opts.ensureParent();
          continue;
        }
        if (!CONTENTION.has(outcome) || !isContention(lockDir)) throw opts.errors.blocked(outcome);
        lastCode = outcome;
        queue.join();
      }
      if (now() >= deadline) throw opts.errors.timeout(lastCode, opts.staleMs);
      queue.refresh();
      if (queue.isHead()) {
        sleepSync(HEAD_POLL_MS + Math.random() * HEAD_POLL_MS);
      } else {
        sleepSync(wait + Math.random() * wait);
        wait = Math.min(wait * 2, 100);
      }
    }
  } finally {
    queue.leave();
  }
}

export function acquireFileLock(target: string, opts: FileLockOptions): FileLock {
  const file = path.resolve(target);
  const key = reentryKey(file);
  if (held.has(key)) throw opts.errors.reentrant();
  const now = opts.now ?? (() => performance.now());
  const lockDir = `${file}.lock`;
  waitForLock(file, opts, now);
  const acquiredAt = now();
  const identity = readIdentity(lockDir);
  held.add(key);
  const budgetLeft = (): boolean => now() - acquiredAt < opts.staleMs - LOCK_MARGIN_MS;
  const stillOurs = (): boolean => budgetLeft() && sameIdentity(identity, readIdentity(lockDir));
  return {
    assertHeld(): void {
      if (!stillOurs()) throw opts.errors.lost();
    },
    release(): void {
      held.delete(key);
      try {
        clearLibraryState(file, opts.label);
        removeOwnLockDir(lockDir, stillOurs);
      } catch (error) {
        logger.warn(`${opts.label} lock release failed`, error);
      }
    },
  };
}

/** Forget the lock in proper-lockfile without letting it rmdir anything. */
function clearLibraryState(file: string, label: string): void {
  try {
    lockfile.unlockSync(file, { realpath: false, fs: { ...fs, rmdirSync: () => undefined } });
  } catch (error) {
    logger.warn(`Could not clear the ${label} lock state`, error);
  }
}

/** Guarded lock removal: the full release condition before every rmdir. */
function removeOwnLockDir(lockDir: string, stillOurs: () => boolean): void {
  for (let attempt = 1; attempt <= RELEASE_ATTEMPTS; attempt++) {
    if (!stillOurs()) {
      logger.warn(`Left ${lockDir} in place: it may now belong to another process`);
      return;
    }
    try {
      fs.rmdirSync(lockDir);
      return;
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") return;
      if (!TRANSIENT.has(code) || attempt === RELEASE_ATTEMPTS) {
        logger.warn(`Could not remove ${lockDir} (${code}); stale recovery will clear it`);
        return;
      }
      sleepSync(RELEASE_RETRY_MS);
    }
  }
}
