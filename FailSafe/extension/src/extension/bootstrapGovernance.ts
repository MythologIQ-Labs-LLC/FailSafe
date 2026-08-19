import * as vscode from "vscode";
import { IntentService } from "../governance/IntentService";
import { EnforcementEngine } from "../governance/EnforcementEngine";
import { GovernanceRouter } from "../governance/GovernanceRouter";
import { GovernanceStatusBar } from "../governance/GovernanceStatusBar";
import { EvaluationRouter } from "../governance/EvaluationRouter";
import { SessionManager } from "../governance/SessionManager";
import { SecurityReplayGuard } from "../governance/SecurityReplayGuard";
import { PromptTransparency } from "../governance/PromptTransparency";
import { VscodeNotificationService } from "../core/adapters/vscode/VscodeNotificationService";
import { ReleasePipelineGate } from "../governance/ReleasePipelineGate";
import { PermissionScopeManager } from "../governance/PermissionScopeManager";
import { SkillRegistryEnforcer } from "../governance/SkillRegistryEnforcer";
import { ApproverPipeline } from "../governance/ApproverPipeline";
import { WorkspaceIntegrity } from "../governance/WorkspaceIntegrity";
import { ComplianceExporter } from "../governance/ComplianceExporter";
import { GovernanceWebhook } from "../governance/GovernanceWebhook";
import { PolicySandbox } from "../governance/PolicySandbox";
import { RBACManager } from "../governance/RBACManager";
import { ArtifactHasher } from "../governance/ArtifactHasher";
import { CommitGuard } from "../governance/CommitGuard";
import { ProvenanceTracker } from "../governance/ProvenanceTracker";
import { SystemRegistry } from "../qorelogic/SystemRegistry";
import { CoreSubstrate } from "./bootstrapCore";
import { Logger } from "../shared/Logger";
import { registerGovernanceCommands } from "./commands";
import { maybeShowModeDefaultNotice } from "./modeDefaultNotice";

export interface GovernanceSubstrate {
  sessionManager: SessionManager;
  intentService: IntentService;
  enforcementEngine: EnforcementEngine;
  governanceRouter: GovernanceRouter;
  governanceStatusBar: GovernanceStatusBar;
  replayGuard: SecurityReplayGuard;
  transparency: PromptTransparency;
  releasePipelineGate: ReleasePipelineGate;
  permissionScopeManager: PermissionScopeManager;
  skillRegistryEnforcer: SkillRegistryEnforcer;
  approverPipeline: ApproverPipeline;
  workspaceIntegrity: WorkspaceIntegrity;
  complianceExporter: ComplianceExporter;
  governanceWebhook: GovernanceWebhook;
  policySandbox: PolicySandbox;
  rbacManager: RBACManager;
  artifactHasher: ArtifactHasher;
  commitGuard: CommitGuard;
  provenanceTracker: ProvenanceTracker;
}

export async function bootstrapGovernance(
  context: vscode.ExtensionContext,
  core: CoreSubstrate,
  logger: Logger,
): Promise<GovernanceSubstrate> {
  logger.info("Initializing Governance Substrate...");

  // Use shared ConfigManager (implements IConfigProvider) from core substrate
  const configProvider = core.configManager;
  const notifications = new VscodeNotificationService();
  const executeCommand = (cmd: string, ...args: unknown[]) =>
    vscode.commands.executeCommand(cmd, ...args);

  const sessionManager = new SessionManager(core.workspaceRoot);
  const sessionState = sessionManager.getState();

  if (sessionState.isLocked) {
    vscode.commands.executeCommand("setContext", "failsafe:isLocked", true);
    notifications
      .showError(
        `FailSafe is LOCKED: ${sessionState.lockReason || "Unknown Error"}`,
        "Unlock Session",
      )
      .then((choice) => {
        if (choice === "Unlock Session") {
          sessionManager.unlockSession();
          notifications.showInfo("Session Unlocked");
        }
      });
  }

  const intentService = new IntentService(core.workspaceRoot, sessionManager);
  const enforcement = new EnforcementEngine(
    intentService,
    core.workspaceRoot,
    configProvider,
    notifications,
    executeCommand,
  );
  // B66: Wire governance mode getter for planId enforcement
  intentService.setGovernanceModeGetter(() => enforcement.getGovernanceMode());
  const governanceStatusBar = new GovernanceStatusBar();

  const evaluationRouter = EvaluationRouter.fromConfigManager(
    core.configManager,
    core.eventBus,
  );

  const governanceRouter = new GovernanceRouter(
    intentService,
    enforcement,
    governanceStatusBar,
    evaluationRouter,
    notifications,
    executeCommand,
  );
  governanceRouter.setPlanManager(core.planManager);

  // Initial UI State
  governanceStatusBar.update(await intentService.getActiveIntent());

  // Wire File Hooks - extract fsPath from vscode.Uri at the boundary
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      event.waitUntil(
        governanceRouter
          .handleFileOperation("file_write", event.document.uri.fsPath)
          .then((allowed) => {
            if (!allowed) throw new Error("Action Blocked by FailSafe");
          }),
      );
    }),
  );

  registerGovernanceCommands(
    context,
    intentService,
    core.workspaceRoot,
    core.planManager,
  );

  // LD-6: one-time notice for installs that silently landed on the new
  // enforce default (globalState-keyed; explicit configs never see it).
  void maybeShowModeDefaultNotice({
    getModeState: () => enforcement.getGovernanceModeState(),
    getGlobalState: (key) => context.globalState.get<boolean>(key),
    setGlobalState: (key, value) => context.globalState.update(key, value),
    notifications,
    executeCommand,
  });

  // Initialize security and transparency services
  const replayGuard = new SecurityReplayGuard(core.workspaceRoot);
  const transparency = new PromptTransparency(core.eventBus);
  // B72: Release pipeline gate — ledger set later via main.ts wiring
  const releasePipelineGate = new ReleasePipelineGate(intentService, null as unknown as import('../qorelogic/ledger/LedgerManager').LedgerManager);
  context.subscriptions.push(
    { dispose: () => replayGuard.dispose() },
  );

  // v4.2.0: Governance services — ledger-dependent ones use null (set later)
  const permissionScopeManager = new PermissionScopeManager(null);
  const skillRegistryEnforcer = new SkillRegistryEnforcer(permissionScopeManager);
  const approverPipeline = new ApproverPipeline(null);
  const workspaceIntegrity = new WorkspaceIntegrity(core.workspaceRoot);
  const complianceExporter = new ComplianceExporter(null as unknown as import('../qorelogic/ledger/LedgerManager').LedgerManager, null as unknown as import('../qorelogic/shadow/ShadowGenomeManager').ShadowGenomeManager);
  const governanceWebhook = new GovernanceWebhook();
  const policySandbox = new PolicySandbox();
  const rbacManager = new RBACManager();
  const artifactHasher = new ArtifactHasher();

  // v4.3.0: Commit guard + provenance tracker (B92/B93)
  const commitGuard = new CommitGuard(core.workspaceRoot, 7777);
  const provenanceRegistry = new SystemRegistry(core.workspaceRoot);
  const provenanceTracker = new ProvenanceTracker(
    null as unknown as import('../qorelogic/ledger/LedgerManager').LedgerManager,
    provenanceRegistry,
    intentService,
    () => enforcement.getGovernanceMode(),
  );

  // Wire provenance tracking into file save events
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      provenanceTracker.onFileWrite(doc.uri);
    }),
    { dispose: () => provenanceTracker.dispose() },
  );

  return {
    sessionManager,
    intentService,
    enforcementEngine: enforcement,
    governanceRouter,
    governanceStatusBar,
    replayGuard,
    transparency,
    releasePipelineGate,
    permissionScopeManager,
    skillRegistryEnforcer,
    approverPipeline,
    workspaceIntegrity,
    complianceExporter,
    governanceWebhook,
    policySandbox,
    rbacManager,
    artifactHasher,
    commitGuard,
    provenanceTracker,
  };
}
