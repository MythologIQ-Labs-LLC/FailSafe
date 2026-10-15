import * as vscode from "vscode";
import { EventBus } from "../shared/EventBus";
import { ConfigManager } from "../shared/ConfigManager";
import { Logger } from "../shared/Logger";
import { WorkspaceMutationBus } from "../shared/WorkspaceMutationBus";
import { PlanManager } from "../qorelogic/planning/PlanManager";
import { ModeTransitionHistory } from "../governance/ModeTransitionHistory";
import { ensureGitRepositoryReady } from "../shared/gitBootstrap";
import { trustedGitPath } from "../shared/git/trustedGit";
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
    .get<boolean>("bootstrap.autoInstallGit", false);

  const gitLog = (level: "info" | "warn" | "error", message: string) => {
    if (level === "error") logger.error(message);
    else if (level === "warn") logger.warn(message);
    else logger.info(message);
  };
  // #503: activation never initializes a repository on its own.
  const git = await ensureGitRepositoryReady(workspaceRoot, { autoInstallGit, log: gitLog });

  if (!git.gitAvailable) {
    logger.warn(
      `Git is unavailable. Checkpoint git hashes will be recorded as unknown until git is installed.${trustedGitReason()}`,
    );
  } else if (!git.repoInitialized) {
    offerGitInit(workspaceRoot, gitLog).then(undefined, (err) =>
      logger.warn(`Git initialization offer failed: ${String(err)}`),
    );
  }

  // B192 remediation: workspace-mutation bus. Constructed alongside EventBus
  // and threaded through to cache-vulnerable services (PlanManager,
  // HubSnapshotService chain-validity, TrustEngine external-mutation, and
  // ConsoleLifecycleService watchMetaLedger).
  const mutationBus = new WorkspaceMutationBus();
  const planManager = new PlanManager(workspaceRoot, eventBus, mutationBus);
  // FailSafe#388 (Relay Cycle 074): planManager is constructor-injected into
  // ConsoleServer, genesisManager, and governanceRouter, none of which own
  // it. bootstrapCore constructs it, so bootstrapCore owns its teardown.
  // This registration covers NORMAL UNLOAD only: VS Code disposes
  // context.subscriptions when the extension is deactivated, and a rejected
  // activate() never reaches that point. The activation-failure path is
  // covered separately by the module-level `planManager` handle in main.ts,
  // registered in teardownActivatedResources(). Both are safe together
  // because dispose() is idempotent.
  context.subscriptions.push({ dispose: () => planManager.dispose() });

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

/** Why the trusted-git resolver found nothing, as a suffix for the warning ('' if it now resolves). */
function trustedGitReason(): string {
  try {
    trustedGitPath();
    return "";
  } catch (err) {
    return ` (${err instanceof Error ? err.message : String(err)})`;
  }
}

/** Ask once, without blocking activation, whether to `git init` this folder (#503). */
async function offerGitInit(
  workspaceRoot: string,
  log: (level: "info" | "warn" | "error", message: string) => void,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "FailSafe records checkpoint hashes with Git. Initialize a Git repository in this folder?",
    "Initialize",
    "Not now",
  );
  if (choice !== "Initialize") return;
  const result = await ensureGitRepositoryReady(workspaceRoot, { log, confirmInit: async () => true });
  if (result.initializedRepo) log("info", "Initialized workspace git repository at the user's request.");
}
