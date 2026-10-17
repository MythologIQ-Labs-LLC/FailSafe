/**
 * riskStoreLock - the cross-process lock around risks.json (#517 LD2, LD3
 * steps 1, 8a and 9).
 *
 * Since v6.0.8 the lock itself is the shared crossProcessLock (LD-3): the
 * same proper-lockfile mkdir lock at risks.json.lock, the same store-decided
 * contention, identity-guarded release and lock budget. This module only
 * supplies the risk register's typed errors.
 *
 * Waiters are queued first-come, first-served (#528): an import's next
 * update queues behind an update from another window that was already
 * waiting, so that update waits for one import write, not the whole import.
 * A crashed or stalled holder still makes waiters wait until stale recovery
 * (#517).
 */

import { acquireFileLock, FileLock, LockErrors } from "../fileLock/crossProcessLock";
import { lockBlocked, lockLost, lockTimeout, reentrant } from "./riskStoreError";

export { reentryKey } from "../fileLock/crossProcessLock";

export interface RiskLockOptions {
  timeoutMs: number;
  staleMs: number;
  /** Internal test seam: the monotonic clock (default performance.now). */
  now?: () => number;
  /** Re-runs the LD3 step-0 path check when mkdir reports ENOENT. */
  ensureParent?: () => void;
}

export type RiskLock = FileLock;

const RISK_LOCK_ERRORS: LockErrors = {
  timeout: lockTimeout,
  blocked: lockBlocked,
  lost: lockLost,
  reentrant,
};

export function acquireRiskLock(risksPath: string, opts: RiskLockOptions): RiskLock {
  return acquireFileLock(risksPath, {
    timeoutMs: opts.timeoutMs,
    staleMs: opts.staleMs,
    now: opts.now,
    ensureParent: opts.ensureParent,
    errors: RISK_LOCK_ERRORS,
    label: "Risk register",
  });
}
