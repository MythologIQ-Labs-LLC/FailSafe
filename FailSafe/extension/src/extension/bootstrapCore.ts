import * as vscode from "vscode";
import { EventBus } from "../shared/EventBus";
import { ConfigManager } from "../shared/ConfigManager";
import { Logger } from "../shared/Logger";
import { WorkspaceMutationBus } from "../shared/WorkspaceMutationBus";
import { PlanManager } from "../qorelogic/planning/PlanManager";
import { ModeTransitionHistory } from "../governance/ModeTransitionHistory";
import { ensureGitRepositoryReady } from "../shared/gitBootstrap";
import type { ILogSink } from "../core/interfaces";

export interface CoreSubstrate {
  eventBus: EventBus;
  configManager: ConfigManager;
  workspaceRoot: string;
  planManager: PlanManager;
  mutationBus: WorkspaceMutationBus;
  /** B194: in-memory ring buffer of recent governance-mode transitions. */
  modeTransitionHistory: ModeTransitionHistory;
  logSink: ILogSink;
}

export async function bootstrapCore(
  context: vscode.ExtensionContext,
  logger: Logger,
  logSink: ILogSink,
): Promise<CoreSubstrate> {
  logger.info("Initializing Core Substrate...");

  const eventBus = new EventBus();
  const configManager = new ConfigManager(context);
  const workspaceRoot = configManager.getWorkspaceRoot();

  if (!workspaceRoot) {
    throw new Error("FailSafe requires an open workspace.");
  }
  const autoInstallGit = vscode.workspace
    .getConfiguration("failsafe")
    .get<boolean>("bootstrap.autoInstallGit", true);

  const git = await ensureGitRepositoryReady(workspaceRoot, {
    autoInstallGit,
    log: (level, message) => {
      if (level === "error") logger.error(message);
      else if (level === "warn") logger.warn(message);
      else logger.info(message);
    },
  });

  if (!git.gitAvailable) {
    logger.warn(
      "Git is unavailable. Checkpoint git hashes will be recorded as unknown until git is installed.",
    );
  } else if (git.initializedRepo) {
    logger.info("Initialized workspace git repository via bootstrap.");
  }

  // B192 remediation: workspace-mutation bus. Constructed alongside EventBus
  // and threaded through to cache-vulnerable services (PlanManager,
  // HubSnapshotService chain-validity, TrustEngine external-mutation, and
  // ConsoleLifecycleService watchMetaLedger).
  const mutationBus = new WorkspaceMutationBus();
  const planManager = new PlanManager(workspaceRoot, eventBus, mutationBus);

  // B194: ring buffer subscribes to governance.modeChanged + breakGlass* events.
  const modeTransitionHistory = new ModeTransitionHistory(eventBus);
  context.subscriptions.push({ dispose: () => modeTransitionHistory.dispose() });

  return {
    eventBus,
    configManager,
    workspaceRoot,
    planManager,
    mutationBus,
    modeTransitionHistory,
    logSink,
  };
}
