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
import { bootstrapServers } from "./bootstrapServers";
import { bootstrapIdeActivity } from "./bootstrapIdeActivity";
import { registerAdvancedCommands } from "./bootstrapAdvancedCommands";
import { registerCommands, setServerPort } from "./commands";
import { createVscodeFeatureGate } from "../core/adapters/vscode";
import { bootstrapStartupChecks } from "./bootstrapStartupChecks";

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
    bootstrapOpenDesignMcp(context, core.workspaceRoot);

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
      try { consoleServer?.stop(); } catch { /* ignore */ }
      __failsafeActivated = false;
      return;
    }
    logger.error("Activation failed", error);
    throw error;
  }
}

export async function deactivate(): Promise<void> {
  logger?.info("Deactivating FailSafe...");
  consoleServer?.stop();
  ledgerManager?.close();
  shadowGenomeManager?.close();
  sentinelDaemon?.stop();
  if (mcpServer) await mcpServer.stop();
  qorelogicManager?.dispose();
  genesisManager?.dispose();
  governanceStatusBar?.dispose();
  eventBus?.dispose();
  __failsafeActivated = false;
}
