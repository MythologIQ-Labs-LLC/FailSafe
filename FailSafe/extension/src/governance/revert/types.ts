export interface CheckpointRef {
  checkpointId: string;
  gitHash: string;
  timestamp: string;
  phase: string;
  status: string;
}

export interface RevertRequest {
  targetCheckpoint: CheckpointRef;
  reason: string;
  actor: string;
}

export type RevertStepStatus = "pending" | "success" | "failed" | "skipped";

export interface RevertStep {
  name: "git_reset" | "verify_reset" | "rag_purge" | "ledger_seal";
  status: RevertStepStatus;
  detail: string;
}

export interface RevertResult {
  success: boolean;
  steps: RevertStep[];
  revertCheckpointId: string | null;
  error: string | null;
  /** #532 (plan-532c LD8a): HTTP status for a refusal (409 changed / refused, 503 unavailable). */
  status?: number;
  /** #532 (plan-532c LD8a): HEAD before the reset, for recovery through the reflog when a post-reset check fails. */
  previousHead?: string;
  /** #532 (review N1): a successful rollback whose check was narrower than usual (no reflog entry). */
  warning?: string;
}

/**
 * #532 (plan-532c LD8a): what the rollback dialog showed, computed on the server. The reset runs
 * only while the workspace still matches it.
 */
export interface RollbackPlan {
  checkpointId: string;
  /** The checkpoint commit. */
  target: string;
  targetSubject: string;
  targetDate: string;
  /** `git rev-parse --show-toplevel`. */
  workTree: string;
  /** The current branch, or null for a detached HEAD. */
  branch: string | null;
  head: string;
  /** Commits on HEAD that are not reachable from the target (`rev-list --count target..HEAD`). */
  leaving: number;
}

export type RollbackRefusal =
  | 'not-found' | 'no-commit' | 'unverifiable' | 'hash' | 'status-unavailable' | 'dirty' | 'not-ancestor' | 'unavailable';

export type RollbackPrepareResult =
  | { ok: true; plan: RollbackPlan }
  | { ok: false; status: number; error: string; code?: RollbackRefusal };
