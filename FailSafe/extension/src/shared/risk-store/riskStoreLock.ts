/**
 * riskStoreLock - the cross-process lock around risks.json (#517 LD2, LD3
 * steps 1, 8a and 9).
 *
 * The lock is proper-lockfile's mkdir lock at risks.json.lock. The store,
 * not the library, decides what counts as contention, and the store, not the
 * library, removes the lock directory: only while the directory is still the
 * one this holder created and the lock budget has not run out, so a holder
 * that stalled never deletes a lock another process has since taken.
 *
 * Waiters are not queued. A healthy writer making back-to-back updates (an
 * import does one per finding) usually re-takes the lock before a sleeping
 * waiter wakes, so another window's update can wait for the whole run and
 * fail with LOCK_TIMEOUT after timeoutMs, writing nothing. The same wait
 * occurs behind a crashed or stalled holder until stale recovery (#517).
 */

import * as fs from "fs";
import * as path from "path";
import * as lockfile from "proper-lockfile";
import { Logger } from "../Logger";
import {
  errorCode,
  lockBlocked,
  lockLost,
  lockTimeout,
  reentrant,
} from "./riskStoreError";

export interface RiskLockOptions {
  timeoutMs: number;
  staleMs: number;
  /** Internal test seam: the monotonic clock (default performance.now). */
  now?: () => number;
  /** Re-runs the LD3 step-0 path check when mkdir reports ENOENT. */
  ensureParent?: () => void;
}

export interface RiskLock {
  /** Step 8a: throws LOCK_LOST unless this holder still owns the lock. */
  assertHeld(): void;
  /** Step 9: never throws. */
  release(): void;
}

interface LockIdentity { dev: bigint; ino: bigint; mtimeNs: bigint; birthtimeNs: bigint }

const CONTENTION = new Set(["ELOCKED", "EPERM", "EACCES", "EBUSY"]);
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY"]);
const RELEASE_ATTEMPTS = 3;
const RELEASE_RETRY_MS = 20;
const LOCK_MARGIN_MS = 1000;
const held = new Set<string>();
const logger = new Logger("RiskStoreLock");

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

/** LD2: is a failed acquire waiting on a real lock, or blocked for good? */
function isContention(lockDir: string): boolean {
  try {
    const st = fs.lstatSync(lockDir);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch (error) {
    const code = errorCode(error);
    return code === "ENOENT" || TRANSIENT.has(code);
  }
}

function tryLock(file: string, staleMs: number): (() => void) | string {
  try {
    return lockfile.lockSync(file, {
      realpath: false,
      stale: staleMs,
      fs,
      onCompromised: (err) => logger.warn("Risk register lock compromised", err),
    });
  } catch (error) {
    return errorCode(error);
  }
}

function waitForLock(file: string, opts: RiskLockOptions, now: () => number): void {
  const lockDir = `${file}.lock`;
  const deadline = now() + opts.timeoutMs;
  let wait = 5;
  let parentRetried = false;
  for (;;) {
    const outcome = tryLock(file, opts.staleMs);
    if (typeof outcome === "function") return;
    if (outcome === "ENOENT" && !parentRetried && opts.ensureParent) {
      parentRetried = true;
      opts.ensureParent();
      continue;
    }
    if (!CONTENTION.has(outcome) || !isContention(lockDir)) throw lockBlocked(outcome);
    if (now() >= deadline) throw lockTimeout(outcome, opts.staleMs);
    sleepSync(wait + Math.random() * wait);
    wait = Math.min(wait * 2, 100);
  }
}

export function acquireRiskLock(risksPath: string, opts: RiskLockOptions): RiskLock {
  const file = path.resolve(risksPath);
  const key = reentryKey(file);
  if (held.has(key)) throw reentrant();
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
      if (!stillOurs()) throw lockLost();
    },
    release(): void {
      held.delete(key);
      try {
        clearLibraryState(file);
        removeOwnLockDir(lockDir, stillOurs);
      } catch (error) {
        logger.warn("Risk register lock release failed", error);
      }
    },
  };
}

/** Forget the lock in proper-lockfile without letting it rmdir anything. */
function clearLibraryState(file: string): void {
  try {
    lockfile.unlockSync(file, { realpath: false, fs: { ...fs, rmdirSync: () => undefined } });
  } catch (error) {
    logger.warn("Could not clear the risk register lock state", error);
  }
}

/** LD2 guarded lock removal: the full release condition before every rmdir. */
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
