import * as vscode from "vscode";
import * as path from "path";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";
import { PatternLoader } from "../sentinel/PatternLoader";
import { HeuristicEngine } from "../sentinel/engines/HeuristicEngine";
import { VerdictEngine } from "../sentinel/engines/VerdictEngine";
import { ExistenceEngine } from "../sentinel/engines/ExistenceEngine";
import { VerdictArbiter } from "../sentinel/VerdictArbiter";
import { VerdictRouter } from "../sentinel/VerdictRouter";
import { ArchitectureEngine } from "../sentinel/engines/ArchitectureEngine";
import { AgentTimelineService } from "../sentinel/AgentTimelineService";
import { AgentRunRecorder } from "../sentinel/AgentRunRecorder";
import { OpenDesignProvenanceDetector } from "../integrations/open-design";
import type { IAgentProvenanceDetector } from "../sentinel/IAgentProvenanceDetector";
import { CoreSubstrate } from "./bootstrapCore";
import { QorLogicSubstrate } from "./bootstrapQorLogic";
import { Logger } from "../shared/Logger";

export interface SentinelSubstrate {
  sentinelDaemon: SentinelDaemon;
  architectureEngine: ArchitectureEngine;
  agentTimelineService: AgentTimelineService;
  agentRunRecorder: AgentRunRecorder;
}

export async function bootstrapSentinel(
  context: vscode.ExtensionContext,
  core: CoreSubstrate,
  qor: QorLogicSubstrate,
  logger: Logger,
): Promise<SentinelSubstrate> {
  logger.info("Initializing Sentinel daemon...");
  const architectureEngine = new ArchitectureEngine();

  try {
    const patternLoader = new PatternLoader(core.workspaceRoot);
    await patternLoader.loadCustomPatterns();

    const heuristicEngine = new HeuristicEngine(
      qor.policyEngine,
      patternLoader,
    );
    const verdictEngine = new VerdictEngine(
      qor.trustEngine,
      qor.policyEngine,
      qor.ledgerManager,
      qor.shadowGenomeManager,
    );
    const existenceEngine = new ExistenceEngine(core.configManager);

    const verdictArbiter = new VerdictArbiter(
      core.configManager,
      heuristicEngine,
      verdictEngine,
      existenceEngine,
    );

    const verdictRouter = new VerdictRouter(
      core.eventBus,
      qor.qorelogicManager,
    );

    // Use shared ConfigManager (implements IConfigProvider) from core substrate
    const sentinelDaemon = new SentinelDaemon(
      core.configManager,
      verdictArbiter,
      verdictRouter,
      core.eventBus,
    );
    await sentinelDaemon.start();
    logger.info("Sentinel daemon started successfully");

    const agentTimelineService = new AgentTimelineService(core.eventBus);
    context.subscriptions.push({ dispose: () => agentTimelineService.dispose() });

    const runsPath = path.join(core.workspaceRoot, ".failsafe", "runs");
    // Open Design integration v1 (opt-in via failsafe.integrations.openDesign.enabled).
    // Setting is read via vscode.workspace.getConfiguration directly because
    // the typed FailSafeConfig schema does NOT carry an `integrations` field.
    const odEnabled = vscode.workspace
      .getConfiguration("failsafe")
      .get<boolean>("integrations.openDesign.enabled", false);
    const provenanceDetectors: IAgentProvenanceDetector[] = odEnabled
      ? [new OpenDesignProvenanceDetector()]
      : [];
    const agentRunRecorder = new AgentRunRecorder(
      core.eventBus,
      runsPath,
      { provenanceDetectors },
    );
    context.subscriptions.push({ dispose: () => agentRunRecorder.dispose() });

    return { sentinelDaemon, architectureEngine, agentTimelineService, agentRunRecorder };
  } catch (error) {
    logger.error("Failed to start Sentinel daemon", error);
    vscode.window.showWarningMessage(
      `FailSafe: Sentinel daemon failed to start. Some monitoring features may be unavailable.`,
    );

    const stubDaemon = {
      start: async () => {},
      stop: () => {},
      isRunning: () => false,
      auditFile: async () => ({
        verdict: "UNKNOWN",
        details: "Sentinel not available",
      }),
      getStatus: () => ({
        running: false,
        llmAvailable: false,
        mode: "OFFLINE",
        filesWatched: 0,
        queueDepth: 0,
        eventsProcessed: 0,
      }),
    };

    return {
      sentinelDaemon: stubDaemon as unknown as SentinelDaemon,
      architectureEngine,
      agentTimelineService: {
        dispose: () => {},
        getEntries: () => [],
        getEntriesSince: () => [],
      } as unknown as AgentTimelineService,
      agentRunRecorder: {
        dispose: () => {},
        getActiveRuns: () => [],
        getCompletedRuns: () => [],
        getRun: () => undefined,
        getRunSteps: () => [],
        startRun: () => ({ id: "", agentDid: "", agentType: "", agentSource: "manual" as const, startedAt: "", status: "failed" as const, steps: [] }),
        endRun: () => undefined,
        loadRun: () => null,
      } as unknown as AgentRunRecorder,
    };
  }
}
