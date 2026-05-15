import * as vscode from "vscode";
import { GenesisManager } from "../genesis/GenesisManager";
import { HallucinationDecorator } from "../genesis/decorators/HallucinationDecorator";
import { AgentTimelinePanel } from "../genesis/panels/AgentTimelinePanel";
import { ShadowGenomePanel } from "../genesis/panels/ShadowGenomePanel";
import { AgentRunReplayPanel } from "../genesis/panels/AgentRunReplayPanel";
import { CoreSubstrate } from "./bootstrapCore";
import { QorLogicSubstrate } from "./bootstrapQorLogic";
import { SentinelSubstrate } from "./bootstrapSentinel";
import { Logger } from "../shared/Logger";

export async function bootstrapGenesis(
  context: vscode.ExtensionContext,
  core: CoreSubstrate,
  qor: QorLogicSubstrate,
  sentinel: SentinelSubstrate,
  logger: Logger,
): Promise<GenesisManager> {
  logger.info("Initializing Genesis layer...");

  // No legacy sidebar providers are registered.

  // Initialize Genesis manager
  try {
    const genesisManager = new GenesisManager(
      context,
      sentinel.sentinelDaemon,
      sentinel.architectureEngine,
      qor.qorelogicManager,
      core.eventBus,
    );
    genesisManager.setPlanManager(core.planManager);
    await genesisManager.initialize();

    const hallucinationDecorator = new HallucinationDecorator(
      sentinel.sentinelDaemon,
      core.eventBus,
    );
    context.subscriptions.push(hallucinationDecorator);

    context.subscriptions.push(
      vscode.commands.registerCommand("failsafe.showTimeline", () => {
        AgentTimelinePanel.createOrShow(
          context.extensionUri,
          core.eventBus,
          sentinel.agentTimelineService,
        );
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("failsafe.showShadowGenome", () => {
        ShadowGenomePanel.createOrShow(
          context.extensionUri,
          core.eventBus,
          qor.shadowGenomeManager,
        );
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("failsafe.showRunReplay", () => {
        AgentRunReplayPanel.createOrShow(
          context.extensionUri,
          core.eventBus,
          sentinel.agentRunRecorder,
        );
      }),
    );

    return genesisManager;
  } catch (error) {
    logger.error("Genesis manager initialization failed", error);
    const stubManager = {
      initialize: async () => {},
      updateGraph: () => {},
      dispose: () => {},
    };
    return stubManager as unknown as GenesisManager;
  }
}
