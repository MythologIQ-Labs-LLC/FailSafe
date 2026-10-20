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
} from "./types";

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

  /** #532 (plan-532c LD8a): the checks before the rollback dialog, and the values it shows. */
  async prepare(checkpointId: string): Promise<RollbackPrepareResult> {
    void checkpointId; // RED STUB
    return { ok: false, status: 501, error: "not implemented" };
  }

  async revert(request: RevertRequest, plan?: RollbackPlan): Promise<RevertResult> {
    void plan; // RED STUB
    const steps: RevertStep[] = [];
    const { gitService, workspaceRoot } = this.deps;
    const { targetCheckpoint } = request;

    const preCheck = await gitService.getStatus(workspaceRoot);
    if (!preCheck.clean) {
      return this.failure(
        steps,
        `Workspace has uncommitted changes: ${preCheck.uncommittedFiles.join(", ")}`,
      );
    }

    const reCheck = await gitService.getStatus(workspaceRoot);
    if (!reCheck.clean) {
      return this.failure(steps, "workspace_changed_during_revert");
    }

    const gitStep = await this.executeGitReset(
      targetCheckpoint.gitHash,
      workspaceRoot,
    );
    steps.push(gitStep);

    const ragStep = this.executeRagPurge(gitStep, targetCheckpoint.timestamp);
    steps.push(ragStep);

    const ledgerStep = this.executeLedgerSeal(request, steps, workspaceRoot);
    steps.push(ledgerStep);

    const allSucceeded = steps.every(
      (s) => s.status === "success" || s.status === "skipped",
    );
    return {
      success: allSucceeded,
      steps,
      revertCheckpointId: ledgerStep.status === "success"
        ? ledgerStep.detail
        : null,
      error: allSucceeded ? null : this.summarizeFailures(steps),
    };
  }

  private async executeGitReset(
    gitHash: string,
    cwd: string,
  ): Promise<RevertStep> {
    try {
      const result = await this.deps.gitService.resetHard(cwd, gitHash);
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

  private failure(steps: RevertStep[], error: string): RevertResult {
    return { success: false, steps, revertCheckpointId: null, error };
  }

  private summarizeFailures(steps: RevertStep[]): string {
    return steps
      .filter((s) => s.status === "failed")
      .map((s) => `${s.name}: ${s.detail}`)
      .join("; ");
  }
}
