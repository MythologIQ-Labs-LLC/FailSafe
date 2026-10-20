import * as crypto from "crypto";
import type { CheckpointRef, RevertRequest, RevertStep } from "../../governance/revert/types";
import type { RevertDeps } from "../../governance/revert/FailSafeRevertService";
import type { GitResetService } from "../../governance/revert/GitResetService";

export interface HubRevertSource {
  workspaceRoot: string;
  gitService: GitResetService;
  getCheckpoint: (id: string) => CheckpointRef | null;
  recordCheckpoint: (request: RevertRequest, steps: RevertStep[]) => void;
  /** #532 (plan-532c LD8a): the stored row still matches its recorded hashes. */
  verifyCheckpoint: (id: string) => boolean;
}

/** #532 (review N3): a revert checkpoint passes only when every step before the seal succeeded or was skipped. */
export function revertCheckpointVerdict(steps: RevertStep[]): "PASS" | "FAIL" {
  return steps.every((s) => s.status === "success" || s.status === "skipped") ? "PASS" : "FAIL";
}

export function createHubRevertDeps(source: HubRevertSource): RevertDeps {
  return {
    getCheckpoint: source.getCheckpoint,
    gitService: source.gitService,
    purgeRagAfter: () => 0,
    recordRevertCheckpoint: (request, steps) => {
      source.recordCheckpoint(request, steps);
      return crypto.randomUUID();
    },
    workspaceRoot: source.workspaceRoot,
    verifyCheckpoint: source.verifyCheckpoint,
  };
}
