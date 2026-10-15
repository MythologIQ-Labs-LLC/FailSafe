/**
 * RiskStoreError - the typed failures of the risk store (#517 LD4).
 *
 * Every refusal names what was refused and what the operator can do. Paths
 * are shown relative to the workspace.
 */

export type RiskStoreErrorCode =
  | "LOCK_TIMEOUT"
  | "LOCK_BLOCKED"
  | "LOCK_LOST"
  | "UNREADABLE"
  | "NOT_REGULAR_FILE"
  | "UNSAFE_PATH"
  | "CONFLICT"
  | "WRITE_FAILED"
  | "REENTRANT"
  | "ASYNC_MUTATOR";

export const RISKS_REL = ".failsafe/risks/risks.json";
export const LOCK_REL = ".failsafe/risks/risks.json.lock";

export class RiskStoreError extends Error {
  constructor(
    readonly code: RiskStoreErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RiskStoreError";
  }
}

export function lockTimeout(lastCode: string, staleMs: number): RiskStoreError {
  return new RiskStoreError(
    "LOCK_TIMEOUT",
    `The risk register is being updated by another FailSafe process, or its lock is briefly unavailable (lock ${LOCK_REL}, last error ${lastCode}). Try again; a lock left by a crashed process clears after ${Math.ceil(staleMs / 1000)} s.`,
  );
}

export function lockBlocked(code: string): RiskStoreError {
  return new RiskStoreError(
    "LOCK_BLOCKED",
    `FailSafe cannot take the risk register lock (${code}). Remove the directory ${LOCK_REL} if no FailSafe window is updating risks.`,
  );
}

export function lockLost(): RiskStoreError {
  return new RiskStoreError(
    "LOCK_LOST",
    "This risk update took longer than the lock allows and another process may have taken over the risk register; nothing was written. Try again.",
  );
}

export function unreadable(reason: string, bak: string | null): RiskStoreError {
  const copy = bak ? `A copy was saved to ${bak}.` : "No copy could be saved.";
  return new RiskStoreError(
    "UNREADABLE",
    `FailSafe will not modify ${RISKS_REL} because it cannot be read as a risk register (${reason}). ${copy} Repair or remove the file to resume risk updates.`,
  );
}

export function notRegularFile(): RiskStoreError {
  return new RiskStoreError(
    "NOT_REGULAR_FILE",
    `FailSafe will not read or modify ${RISKS_REL} because it is a link or not a regular file.`,
  );
}

export function unsafePath(): RiskStoreError {
  return new RiskStoreError(
    "UNSAFE_PATH",
    "FailSafe will not use .failsafe/risks because it, or .failsafe, is a link or resolves outside this workspace. Replace it with a real directory to resume risk updates.",
  );
}

export function conflict(): RiskStoreError {
  return new RiskStoreError(
    "CONFLICT",
    "risks.json was changed by a program that does not use the FailSafe risk lock while this update was in progress; nothing was written. Try again.",
  );
}

export function writeFailed(code: string, cause: unknown): RiskStoreError {
  return new RiskStoreError(
    "WRITE_FAILED",
    `Could not write ${RISKS_REL} (${code}); its previous contents are unchanged.`,
    cause,
  );
}

export function reentrant(): RiskStoreError {
  return new RiskStoreError(
    "REENTRANT",
    "RiskStore.mutate was called while this process already holds the risk register lock; nested risk updates are not supported.",
  );
}

export function asyncMutator(): RiskStoreError {
  return new RiskStoreError(
    "ASYNC_MUTATOR",
    "RiskStore.mutate requires a synchronous mutator; nothing was written.",
  );
}

export function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "UNKNOWN";
}
