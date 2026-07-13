import * as crypto from "crypto";
import type { CheckpointRef, RevertRequest } from "../../governance/revert/types";
import type { RevertDeps } from "../../governance/revert/FailSafeRevertService";
import type { GitResetService } from "../../governance/revert/GitResetService";

export interface HubRevertSource {
  workspaceRoot: string;
  gitService: GitResetService;
  getCheckpoint: (id: string) => CheckpointRef | null;
  recordCheckpoint: (request: RevertRequest) => void;
}

export function createHubRevertDeps(source: HubRevertSource): RevertDeps {
  return {
    getCheckpoint: source.getCheckpoint,
    gitService: source.gitService,
    purgeRagAfter: () => 0,
    recordRevertCheckpoint: (request) => {
      source.recordCheckpoint(request);
      return crypto.randomUUID();
    },
    workspaceRoot: source.workspaceRoot,
  };
}
