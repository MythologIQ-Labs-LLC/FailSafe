/**
 * FailSafe (feat. QorLogic)
 *
 * Main extension entry point.
 * Decomposed into bootstrap modules for Section 4 Simplicity.
 */

import * as vscode from "vscode";
import { Logger } from "../shared/Logger";
import { VscodeLogSink } from "../core/adapters/vscode/VscodeLogSink";
import { FeedbackManager } from "../genesis/FeedbackManager";
import { FailSafeMCPServer } from "../mcp/FailSafeServer";
import { FailSafeChatParticipant } from "../genesis/chat/FailSafeChatParticipant";
import { WorkspaceMigration } from "../qorelogic/WorkspaceMigration";
import { GenesisManager } from "../genesis/GenesisManager";
import { QorLogicManager } from "../qorelogic/QorLogicManager";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";
import { EventBus } from "../shared/EventBus";
import { GovernanceStatusBar } from "../governance/GovernanceStatusBar";
import { LedgerManager } from "../qorelogic/ledger/LedgerManager";
import { ShadowGenomeManager } from "../qorelogic/shadow/ShadowGenomeManager";
import { ConsoleServer } from "../roadmap";
import { CheckpointManager } from "../qorelogic/checkpoint/CheckpointManager";
import { AgentHealthIndicator } from "../sentinel/AgentHealthIndicator";
import type { ICheckpointMetrics } from "../core/interfaces";

// Bootstrap Modules
import { bootstrapCore } from "./bootstrapCore";
import { bootstrapGovernance } from "./bootstrapGovernance";
import { bootstrapQorLogic } from "./bootstrapQorLogic";
import { bootstrapSentinel } from "./bootstrapSentinel";
import { bootstrapGenesis } from "./bootstrapGenesis";
import { bootstrapMCP } from "./bootstrapMCP";
import { bootstrapOpenDesignMcp } from "./bootstrapOpenDesignMcp";
import { bootstrapAcpProxy } from "./bootstrapAcpProxy";
import { bootstrapServers } from "./bootstrapServers";
import { bootstrapIdeActivity } from "./bootstrapIdeActivity";
import { registerAdvancedCommands } from "./bootstrapAdvancedCommands";
import { registerCommands, setServerPort } from "./commands";
import { createVscodeFeatureGate } from "../core/adapters/vscode";
import { bootstrapStartupChecks } from "./bootstrapStartupChecks";
import { registerWorkspaceFolderChangeGuard } from "./workspaceFolderChangeGuard";
import { registerSubstrateCommand } from "./substrate-command";
import { registerSarifImportCommand } from "./sarif-command";
import { registerGenerateTrackerManifestCommand } from "./tracker-manifest-command";
import { registerGovernanceSidecarCommand, wireGovernanceSidecarAutoEmit } from "./tracker-sidecar-command";
import { registerMcpInstallCommand } from "./mcp-install-command";
import { registerLinearImportCommand } from "./linear-command";
import { registerJiraImportCommand } from "./jira-command";
import { registerGitHubChecksCommand } from "./github-checks-command";
import { registerSentryImportCommand } from "./sentry-command";
import { registerAgentCliCommands } from "./agent-cli-command";
import { registerAgentObserveCommands } from "./agent-observe-command";
import { SlackNotifier } from "../integrations/slack/SlackNotifier";
import { TeamsNotifier } from "../integrations/teams/TeamsNotifier";
import { defaultRun } from "../qorlogic/PythonInterpreterResolver";
import { disposeResources } from "./disposeResources";

let genesisManager: GenesisManager;
let qorelogicManager: QorLogicManager;
let sentinelDaemon: SentinelDaemon;
let eventBus: EventBus;
let logger: Logger;
let feedbackManager: FeedbackManager;
let governanceStatusBar: GovernanceStatusBar;
let ledgerManager: LedgerManager;
let shadowGenomeManager: ShadowGenomeManager;
let mcpServer: FailSafeMCPServer | undefined;
let consoleServer: ConsoleServer | undefined;
let featureGate:
  | import("../core/FeatureGateService").FeatureGateService
  | undefined;

// Test-harness re-entry guard: vscode-test occasionally racing two
// workspace-folder updates can trigger two parallel activate() invocations
// (sometimes across two extension-host PIDs sharing the same workbench
// command registry). Without the guard, the second activate fails on
// duplicate `failsafe.breakGlass` registration. Module-level flag is reset
// at deactivate; the duplicate-command catch covers the cross-process case.
let __failsafeActivated = false;

// Tears down every long-lived resource `activate()` may have already
// acquired, independently of whether the others succeed or fail. Shared by
// `deactivate()` (normal teardown) and `activate()`'s catch block
// (crash-during-activation teardown) so a partial-activation failure does
// not leak the resources it already started, and so a broken resource's
// teardown failure is logged instead of aborting every subsequent one.
async function teardownActivatedResources(): Promise<void> {
  await disposeResources(
    [
      { name: "consoleServer", dispose: () => consoleServer?.stop() },
      { name: "ledgerManager", dispose: () => ledgerManager?.close() },
      { name: "shadowGenomeManager", dispose: () => shadowGenomeManager?.close() },
      { name: "sentinelDaemon", dispose: () => sentinelDaemon?.stop() },
      { name: "mcpServer", dispose: () => mcpServer?.stop() },
      { name: "qorelogicManager", dispose: () => qorelogicManager?.dispose() },
      { name: "genesisManager", dispose: () => genesisManager?.dispose() },
      { name: "governanceStatusBar", dispose: () => governanceStatusBar?.dispose() },
      { name: "eventBus", dispose: () => eventBus?.dispose() },
    ],
    logger,
  );
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (__failsafeActivated) {
    return;
  }
  __failsafeActivated = true;
  const logSink = new VscodeLogSink("FailSafe");
  logger = new Logger("FailSafe", undefined, logSink);
  logger.info("Activating FailSafe...");

  try {
    // 0. Workspace-folder-change guard (GH #240): FailSafe binds
    // workspaceRoot and every downstream watcher/server to
    // workspaceFolders[0] once, here, at activation. Register the guard
    // before anything else captures that snapshot so an in-place folder
    // add/remove afterward is surfaced instead of silently ignored.
    registerWorkspaceFolderChangeGuard(context, logger);

    // 1. Core
    const core = await bootstrapCore(context, logger, logSink);
    eventBus = core.eventBus;
    featureGate = createVscodeFeatureGate(core.configManager);

    // Hygiene Automation
    await WorkspaceMigration.checkAndRepair(context);

    // 1.5 IDE Activity (task/debug lifecycle → EventBus)
    bootstrapIdeActivity(context, core);

    // 2. Governance
    const gov = await bootstrapGovernance(context, core, logger);
    governanceStatusBar = gov.governanceStatusBar;

    // 3. QorLogic
    const qor = await bootstrapQorLogic(context, core, gov, logger);
    qorelogicManager = qor.qorelogicManager;
    ledgerManager = qor.ledgerManager;
    shadowGenomeManager = qor.shadowGenomeManager;

    // 3.4 Late-bind ledger to governance services created before QorLogic
    gov.releasePipelineGate.setLedgerManager(qor.ledgerManager);
    gov.complianceExporter.setLedgerManager(qor.ledgerManager);
    gov.complianceExporter.setShadowGenomeManager(qor.shadowGenomeManager);
    gov.provenanceTracker.setLedgerManager(qor.ledgerManager);

    // B-EM-2: hydrate the mode-transition ring from the persistent ledger so
    // the Governance tab transition feed survives extension reload. Non-fatal
    // on ledger query failure (logger.warn + continue with empty ring).
    if (qor.ledgerManager.isAvailable()) {
      try {
        await core.modeTransitionHistory.hydrateFromLedger(qor.ledgerManager);
      } catch (err) {
        logger.warn("ModeTransitionHistory.hydrateFromLedger failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Wire RBAC persistence (deferred — ledgerManager not available at governance bootstrap)
    if (qor.ledgerManager.isAvailable()) {
      gov.rbacManager.setDatabase(
        qor.ledgerManager.getDatabase() as unknown as import('../shared/types/database').CheckpointDb,
      );
    }

    // 3.5-3.11 Gap commands, ceremony, commit hooks (extracted to bootstrapAdvancedCommands)
    registerAdvancedCommands(
      context,
      {
        ledgerManager: qor.ledgerManager,
        policyEngine: qor.policyEngine,
        breakGlass: qor.breakGlass,
        systemRegistry: qor.systemRegistry,
        commitGuard: gov.commitGuard,
        configManager: core.configManager,
        workspaceRoot: core.workspaceRoot,
        showRevert: (checkpointId) => genesisManager.showRevert(checkpointId),
        eventBus: core.eventBus,
      },
      logger,
    );

    // 3.12 Substrate runner command (qor.scripts WARN-only governance checks).
    // Per plan-qor-substrate-modules-v1 §Phase 2 + drift note: pass
    // vscode.workspace.getConfiguration('failsafe') (ConfigLike), not
    // core.configManager — the FailSafe ConfigManager class does not
    // implement ConfigLike.get(key:string):string|undefined. This matches the
    // pattern used at bootstrapServers.ts:162.
    registerSubstrateCommand(
      context,
      core.eventBus,
      vscode.workspace.getConfiguration('failsafe'),
      defaultRun,
      core.mutationBus, // B-SUBSTRATE-3: enables the seal auto-hook
    );

    // 3.13 SARIF offline import (B-INT-9 / #99): parse a SARIF file → upsert
    // findings as WARN-only risk records.
    registerSarifImportCommand(context, core.workspaceRoot);

    // 3.13b Tracker manifest generator (GH #174): scaffold docs/roadmap/programs.yaml
    // from merged PRs + CHANGELOG (+ the Bicameral decision graph when connected)
    // so any repo gets a detailed Development Tracker.
    registerGenerateTrackerManifestCommand(
      context, core.workspaceRoot,
      () => consoleServer?.getBicameralClient() ?? null,
    );

    // 3.13c Governance tracker sidecar (GH #194; A.2): emit a Development Tracker manifest
    // PROJECTED from the governance ledger (META_LEDGER + FEATURE_INDEX) to a generated
    // sidecar (docs/roadmap/programs.generated.yaml) — the governed-repo authoritative
    // source, distinct from the operator's hand-curated programs.yaml (FX859, never
    // clobbered). On-demand command + opt-in auto-emit on governance writes.
    registerGovernanceSidecarCommand(context, core.workspaceRoot);
    wireGovernanceSidecarAutoEmit(context, core.workspaceRoot, core.mutationBus);

    // 3.14 Governed MCP install (B-INT-13/14): risk-scored install of catalog
    // MCP integrations (Context7, Mermaid Chart) into .mcp.json.
    registerMcpInstallCommand(context, core.workspaceRoot);

    // 3.14a Read-only issue → intent-preview imports (Linear #97, Jira #98).
    registerLinearImportCommand(context);
    registerJiraImportCommand(context);

    // 3.14b GitHub Checks publish (#96): post SHIELD verdicts as Check Runs.
    registerGitHubChecksCommand(context);

    // 3.14c Sentry runtime-regression import (#102): pull a project's unresolved
    // issues read-only → upsert as risk records.
    registerSentryImportCommand(context, core.workspaceRoot);

    // 3.14d Governed CLI agent wrappers (Group B — #104 Continue, #107 Aider):
    // run a headless coding-agent CLI argv-form, classify the produced diff with
    // the live PolicyEngine, and route L3-risk changes to the L3 queue.
    registerAgentCliCommands(context, {
      workspaceRoot: core.workspaceRoot,
      policyEngine: qor.policyEngine,
      qorelogicManager: qor.qorelogicManager,
    });

    // 3.14e Agent observe/audit (Group C — #106 Cline/Roo/Kilo MCP-policy audit,
    // #105 OpenHands run observer). Read-only; no spawning, no mutation.
    registerAgentObserveCommands(context, core.workspaceRoot);

    // 3.15 Slack + Teams notify-only (#100 / #101): post governance enforcement
    // events to a configured incoming webhook. Disabled by default; non-blocking.
    new SlackNotifier(core.eventBus, () => {
      const c = vscode.workspace.getConfiguration('failsafe');
      return {
        enabled: c.get<boolean>('integrations.slack.enabled', false),
        webhookUrl: c.get<string>('integrations.slack.webhookUrl', ''),
      };
    }).register();
    new TeamsNotifier(core.eventBus, () => {
      const c = vscode.workspace.getConfiguration('failsafe');
      return {
        enabled: c.get<boolean>('integrations.teams.enabled', false),
        webhookUrl: c.get<string>('integrations.teams.webhookUrl', ''),
      };
    }).register();

    // 4. Sentinel
    const sentinel = await bootstrapSentinel(context, core, qor, logger);
    sentinelDaemon = sentinel.sentinelDaemon;

    // 4.5. Checkpoint (bridges qor + sentinel substrates)
    const checkpointMetrics: ICheckpointMetrics = {
      getLedgerEntryCount: () => qor.ledgerManager.getEntryCount(),
      getSentinelEventsProcessed: () =>
        sentinel.sentinelDaemon.getStatus().eventsProcessed,
    };
    const _checkpointManager = new CheckpointManager(
      core.configManager,
      qor.ledgerManager,
      checkpointMetrics,
    );

    // 6. Genesis
    genesisManager = await bootstrapGenesis(
      context,
      core,
      qor,
      sentinel,
      logger,
    );

    // 7. Feedback
    feedbackManager = new FeedbackManager(context);

    // 8. Servers (Roadmap + Webview providers) - single server on port 9376
    const servers = await bootstrapServers(
      context,
      {
        planManager: core.planManager,
        qorelogicManager,
        sentinelDaemon,
        eventBus,
        workspaceRoot: core.workspaceRoot,
        systemRegistry: qor.systemRegistry,
        configManager: core.configManager,
        mutationBus: core.mutationBus,
        modeTransitionHistory: core.modeTransitionHistory,
        getGovernanceMode: () => gov.enforcementEngine.getGovernanceModeState(),
        // B151: back the universal governance interceptor for bicameral routes.
        enforcementEngine: gov.enforcementEngine,
        // #83A: commit-check route token gate + live hook port.
        commitGuard: gov.commitGuard,
        commitGuardPortSource: gov.commitGuardPortSource,
      },
      logger,
    );
    consoleServer = servers.consoleServer;

    // 8.1. MCP Server (deferred from step 5 to step 8.1 so RiskManager
    //      constructed by bootstrapServers can be wired into the
    //      failsafe.create_risk tool. Per plan-qor-model-sourced-risks Phase 2.
    //      mcpServer is otherwise unused by Genesis/chat/server steps.)
    mcpServer = await bootstrapMCP(context, sentinel, qor, gov, logger, servers.riskManager);

    // 8.1b. Open Design v1.1 MCP + SSE + daemon-probe bootstrap.
    //       Registers the `failsafe.openDesign.registerMcp` operator wizard.
    //       Per plan-open-design-integration-v1.1.md Phase 2.
    // B-OD-8: wire the Open Design create_artifact L3 path — push the live
    // client to ConsoleServer (for the open-design-create-artifact route) and
    // construct the Buffer & auto-execute listener (eventBus + ledger).
    bootstrapOpenDesignMcp(context, core.workspaceRoot, {
      eventBus,
      ledgerManager,
      onClient: (c) => consoleServer?.setOpenDesignClient(c),
    });

    // 8.1c. ACP enforce-proxy install UX (GH #172 Part 2). Registers the
    //       failsafe.acp.install/uninstallGovernedProxy operator commands that
    //       register a FailSafe-governed twin in Devin Desktop's ACP registry.
    bootstrapAcpProxy(context, core.workspaceRoot);

    // 8.2. Chat participant (deferred so RiskManager is available for the
    //      /risk subcommand. Per plan-qor-model-sourced-risks Phase 4.)
    try {
      const chatParticipant = new FailSafeChatParticipant(
        gov.intentService,
        sentinelDaemon,
        qorelogicManager,
        servers.riskManager,
      );
      context.subscriptions.push({ dispose: () => chatParticipant.dispose() });
    } catch (e) {
      logger.error("Failed to register chat participant", e);
    }

    // Wire dynamic port for workspace isolation
    setServerPort(servers.actualPort, core.workspaceRoot);

    // 8.5. Agent Health Indicator (needs sentinelDaemon + riskManager + trustEngine)
    const agentHealthIndicator = new AgentHealthIndicator(
      eventBus,
      servers.riskManager,
      qor.trustEngine,
      sentinelDaemon,
    );
    context.subscriptions.push(agentHealthIndicator);

    // 8.6. Wire agent services to ConsoleServer for Command Center API
    consoleServer.setAgentTimelineService(sentinel.agentTimelineService);
    consoleServer.setAgentHealthIndicator(agentHealthIndicator);
    consoleServer.setAgentRunRecorder(sentinel.agentRunRecorder);

    // 8.7. Wire file edit detection for external agent capture (B182)
    context.subscriptions.push(
      vscode.workspace.onWillSaveTextDocument((event) => {
        sentinel.agentRunRecorder.handleFileEdit(event.document.uri.fsPath, "vscode-user");
      }),
    );

    // 9. Commands
    registerCommands(
      context,
      genesisManager,
      qorelogicManager,
      sentinelDaemon,
      feedbackManager,
      servers.riskManager,
      gov.intentService,
      eventBus,
    );

    // 10. Startup Checks (extracted to bootstrapStartupChecks.ts — B97)
    bootstrapStartupChecks(context, core, qor);

    eventBus.emit("failsafe.ready", {
      timestamp: new Date().toISOString(),
      components: {
        genesis: true,
        qorelogic: true,
        sentinel: sentinelDaemon.isRunning(),
      },
    });

    vscode.window.showInformationMessage(
      "FailSafe is now protecting your workspace",
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Cross-process duplicate-registration race: when vscode-test spawns a
    // parallel extension-host on the same workbench (multi-fixture suites),
    // both hosts try to register `failsafe.*` commands. The second host hits
    // "command 'failsafe.X' already exists". Treat this as a benign no-op
    // (the existing host's handlers remain wired) rather than throwing —
    // throwing here trips vscode-test's commands-not-found cascade across
    // all subsequent test assertions.
    if (/command '.*' already exists/.test(msg) || /EADDRINUSE/.test(msg)) {
      logger.info("FailSafe already activated in a sibling extension host; skipping duplicate bootstrap.");
      // Best-effort cleanup of anything this partial activate did start.
      await teardownActivatedResources();
      __failsafeActivated = false;
      return;
    }
    logger.error("Activation failed", error);
    // Crash during activation: whatever was already acquired above (server,
    // ledger connection, sentinel daemon, ...) is otherwise leaked forever,
    // and the module-level re-entry guard would otherwise stay stuck `true`
    // for the lifetime of this extension host, silently no-op'ing any retry
    // that doesn't go through a full window reload.
    await teardownActivatedResources();
    __failsafeActivated = false;
    throw error;
  }
}

export async function deactivate(): Promise<void> {
  logger?.info("Deactivating FailSafe...");
  await teardownActivatedResources();
  __failsafeActivated = false;
}
