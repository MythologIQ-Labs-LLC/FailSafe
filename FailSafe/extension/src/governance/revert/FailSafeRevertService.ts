import * as fs from "fs";
import * as path from "path";
import { GitResetService } from "./GitResetService";
import {
  CheckpointRef,
  RevertRequest,
  RevertResult,
  RevertStep,
  RollbackPlan,
  RollbackPrepareResult,
  RollbackRefusal,
} from "./types";

const FULL_NAME = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

const refuse = (status: number, error: string, code: RollbackRefusal): RollbackPrepareResult => ({ ok: false, status, error, code });

/** The values the dialog showed still describe the workspace. */
const samePlan = (a: RollbackPlan, b: RollbackPlan): boolean =>
  a.checkpointId === b.checkpointId && a.target === b.target && a.workTree === b.workTree
  && a.branch === b.branch && a.head === b.head && a.leaving === b.leaving;

export interface RevertDeps {
  getCheckpoint: (id: string) => CheckpointRef | null;
  gitService: GitResetService;
  purgeRagAfter: (timestamp: string) => number;
  recordRevertCheckpoint: (
    request: RevertRequest,
    steps: RevertStep[],
  ) => string;
  workspaceRoot: string;
  /** #532 (plan-532c LD8a): whether the stored checkpoint row still matches its recorded hashes. */
  verifyCheckpoint?: (id: string) => boolean;
}

export class FailSafeRevertService {
  private readonly deps: RevertDeps;

  constructor(deps: RevertDeps) {
    this.deps = deps;
  }

  /**
   * #532 (plan-532c LD8a): the checks before the rollback dialog, and the values it shows. The
   * checkpoint must name a commit, its row must match its recorded hashes (unkeyed: an edit that
   * did not recompute them), the tree must be clean (git status fails closed) and the commit must
   * be an ancestor of HEAD.
   */
  async prepare(checkpointId: string): Promise<RollbackPrepareResult> {
    const { gitService, workspaceRoot } = this.deps;
    const cp = this.deps.getCheckpoint(checkpointId);
    if (!cp) return refuse(404, "checkpoint not found", "not-found");
    if (!FULL_NAME.test(cp.gitHash)) {
      return refuse(409, "This checkpoint did not record a commit, so there is nothing to roll back to.", "no-commit");
    }
    if (!this.deps.verifyCheckpoint) {
      return refuse(503, "The checkpoint cannot be verified here, so it is not used for a rollback.", "unverifiable");
    }
    if (!this.deps.verifyCheckpoint(checkpointId)) {
      return refuse(409, "The checkpoint row does not match its recorded hashes, so it is not used for a rollback.", "hash");
    }
    let status;
    try {
      status = await gitService.getStatus(workspaceRoot);
    } catch (err) {
      return refuse(503, `git status is unavailable, so nothing was reset: ${(err as Error).message}`, "status-unavailable");
    }
    if (!status.clean) {
      return refuse(409, `Workspace has uncommitted changes: ${status.uncommittedFiles.join(", ")}`, "dirty");
    }
    const ancestor = await gitService.isAncestor(workspaceRoot, cp.gitHash);
    if (ancestor === "no") {
      return refuse(409, "The checkpoint commit is not an ancestor of HEAD, so the rollback is refused.", "not-ancestor");
    }
    if (ancestor === "unavailable") {
      return refuse(503, "Git could not check that the checkpoint commit is an ancestor of HEAD.", "unavailable");
    }
    const [leaving, described, workTree] = await Promise.all([
      gitService.countLeaving(workspaceRoot, cp.gitHash),
      gitService.describeCommit(workspaceRoot, cp.gitHash),
      gitService.workTree(workspaceRoot),
    ]);
    if (leaving === null || !described || !workTree) {
      return refuse(503, "Git could not describe the rollback, so nothing was reset.", "unavailable");
    }
    return {
      ok: true,
      plan: {
        checkpointId, target: cp.gitHash, targetSubject: described.subject, targetDate: described.date,
        workTree, branch: status.currentBranch || null, head: status.currentHash, leaving,
      },
    };
  }

  /**
   * Roll back to the plan the operator confirmed. Without a plan nothing runs. The checks are
   * re-run after the approval and the reset (`git reset --keep`) runs only while the work tree,
   * branch, HEAD, target and leaving count still equal the plan. After the reset, HEAD@{1}, the
   * branch and HEAD are compared with the plan; a mismatch is reported with the previous HEAD so
   * it can be recovered from the reflog.
   */
  async revert(request: RevertRequest, plan?: RollbackPlan): Promise<RevertResult> {
    const steps: RevertStep[] = [];
    if (!plan) {
      return this.failure(steps, "A rollback runs only after a confirmed plan; nothing was reset.", 409);
    }
    const { gitService, workspaceRoot } = this.deps;
    const { targetCheckpoint } = request;

    let preCheck;
    try {
      preCheck = await gitService.getStatus(workspaceRoot);
    } catch (err) {
      return this.failure(steps, `git status is unavailable, so nothing was reset: ${(err as Error).message}`, 503);
    }
    if (!preCheck.clean) {
      return this.failure(
        steps,
        `Workspace has uncommitted changes: ${preCheck.uncommittedFiles.join(", ")}`,
        409,
      );
    }

    const again = await this.prepare(plan.checkpointId);
    if (!again.ok) {
      return this.failure(steps, again.code === "dirty" ? "workspace_changed_during_revert" : again.error, again.status);
    }
    if (!samePlan(again.plan, plan)) {
      return this.failure(steps, "The workspace changed after you confirmed; nothing was reset. Ask again to see the current state.", 409);
    }

    const gitStep = await this.executeGitReset(
      plan.target,
      workspaceRoot,
    );
    steps.push(gitStep);
    // #532 (plan-532c LD8a, review N3): a reset that ran is verified; a failed or impossible check is
    // recorded as a failed step, and the RAG purge does not run as if the rollback succeeded.
    const verification = gitStep.status === "success" ? await this.verifyReset(plan) : null;
    if (verification) steps.push(verification.step);

    const ragStep = verification && verification.step.status === "failed"
      ? { name: "rag_purge" as const, status: "skipped" as const, detail: "the reset was not verified" }
      : this.executeRagPurge(gitStep, targetCheckpoint.timestamp);
    steps.push(ragStep);

    const ledgerStep = this.executeLedgerSeal(request, steps, workspaceRoot);
    steps.push(ledgerStep);

    const allSucceeded = steps.every(
      (s) => s.status === "success" || s.status === "skipped",
    );
    if (verification?.failure) {
      return {
        success: false,
        steps,
        revertCheckpointId: ledgerStep.status === "success" ? ledgerStep.detail : null,
        error: verification.failure.error,
        previousHead: verification.failure.previousHead,
        status: verification.failure.status,
      };
    }
    return {
      success: allSucceeded,
      steps,
      revertCheckpointId: ledgerStep.status === "success"
        ? ledgerStep.detail
        : null,
      error: allSucceeded ? null : this.summarizeFailures(steps),
      ...(verification?.warning ? { warning: verification.warning } : {}),
    };
  }

  /**
   * #532 (plan-532c LD8a, review N1/N3): after the reset, HEAD must be the target, the branch (read
   * as the plan reads it) must be the one shown, and HEAD@{1} must be the HEAD shown. With no reflog
   * entry (core.logAllRefUpdates=false) only HEAD and the branch are compared and the result says
   * so. A git failure while checking is a failed verification of a reset that did run.
   */
  private async verifyReset(plan: RollbackPlan): Promise<{
    step: RevertStep; warning?: string; failure?: { error: string; previousHead: string; status: number };
  }> {
    let after;
    try {
      after = await this.deps.gitService.afterReset(this.deps.workspaceRoot);
    } catch (err) {
      const why = (err as Error).message;
      return {
        step: { name: "verify_reset", status: "failed", detail: `the reset ran but could not be verified: ${why}` },
        failure: {
          status: 500, previousHead: "unknown",
          error: `The reset ran, but FailSafe could not verify it (${why}). Check git reflog for the HEAD before the reset.`,
        },
      };
    }
    const reflogUnavailable = after.previousHead === null;
    if (after.head === plan.target && after.branch === plan.branch && (reflogUnavailable || after.previousHead === plan.head)) {
      const warning = reflogUnavailable
        ? "The reflog has no entry for the HEAD before the reset (core.logAllRefUpdates may be off), so only HEAD and the branch were checked."
        : undefined;
      return { step: { name: "verify_reset", status: "success", detail: warning ?? "HEAD, the branch and the HEAD before the reset match the plan" }, warning };
    }
    const previous = after.previousHead ?? "unknown";
    const error = `The reset ran, but not from the state you confirmed: the branch is ${after.branch ?? "detached"} (you saw ${plan.branch ?? "detached"}) ` +
      `and the HEAD before the reset was ${previous} (you saw ${plan.head}). Recover it from git reflog if this was not intended.`;
    return { step: { name: "verify_reset", status: "failed", detail: error }, failure: { error, previousHead: previous, status: 409 } };
  }

  private async executeGitReset(
    gitHash: string,
    cwd: string,
  ): Promise<RevertStep> {
    try {
      // #532 (plan-532c LD8a): --keep stops, changing nothing, if a file the reset would change has local edits.
      const result = await this.deps.gitService.resetKeep(cwd, gitHash);
      return {
        name: "git_reset",
        status: result.success ? "success" : "failed",
        detail: result.success
          ? `Reset to ${gitHash.slice(0, 8)}`
          : result.stderr,
      };
    } catch (err) {
      return {
        name: "git_reset",
        status: "failed",
        detail: String((err as Error).message),
      };
    }
  }

  private executeRagPurge(
    gitStep: RevertStep,
    timestamp: string,
  ): RevertStep {
    if (gitStep.status === "failed") {
      return { name: "rag_purge", status: "skipped", detail: "git_reset failed" };
    }
    try {
      const purged = this.deps.purgeRagAfter(timestamp);
      return {
        name: "rag_purge",
        status: "success",
        detail: `Purged ${purged} observations`,
      };
    } catch (err) {
      return {
        name: "rag_purge",
        status: "failed",
        detail: String((err as Error).message),
      };
    }
  }

  private executeLedgerSeal(
    request: RevertRequest,
    priorSteps: RevertStep[],
    workspaceRoot: string,
  ): RevertStep {
    try {
      const checkpointId = this.deps.recordRevertCheckpoint(
        request,
        priorSteps,
      );
      return { name: "ledger_seal", status: "success", detail: checkpointId };
    } catch (err) {
      this.writeEmergencyLog(request, priorSteps, err as Error, workspaceRoot);
      return {
        name: "ledger_seal",
        status: "failed",
        detail: "ledger_seal_failed_emergency_logged",
      };
    }
  }

  private writeEmergencyLog(
    request: RevertRequest,
    steps: RevertStep[],
    error: Error,
    workspaceRoot: string,
  ): void {
    try {
      const logDir = path.join(workspaceRoot, ".failsafe");
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, "revert-emergency.log");
      const record = {
        timestamp: new Date().toISOString(),
        request,
        steps,
        error: error.message,
      };
      fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
    } catch {
      // Emergency log write itself failed — no further fallback
    }
  }

  private failure(steps: RevertStep[], error: string, status?: number): RevertResult {
    return { success: false, steps, revertCheckpointId: null, error, ...(status ? { status } : {}) };
  }

  private summarizeFailures(steps: RevertStep[]): string {
    return steps
      .filter((s) => s.status === "failed")
      .map((s) => `${s.name}: ${s.detail}`)
      .join("; ");
  }
}
