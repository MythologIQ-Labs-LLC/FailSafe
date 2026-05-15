import * as vscode from "vscode";
import * as path from "path";
import { SystemRegistry } from "../qorelogic/SystemRegistry";
import { QorLogicManager } from "../qorelogic/QorLogicManager";
import { LedgerManager } from "../qorelogic/ledger/LedgerManager";
import { TrustEngine } from "../qorelogic/trust/TrustEngine";
import { PolicyEngine } from "../qorelogic/policies/PolicyEngine";
import { ShadowGenomeManager } from "../qorelogic/shadow/ShadowGenomeManager";
import { GovernanceAdapter } from "../governance/GovernanceAdapter";
import { BreakGlassProtocol } from "../governance/BreakGlassProtocol";
import { AgentRevocation } from "../qorelogic/trust/AgentRevocation";
import { LedgerRetentionPolicy } from "../qorelogic/ledger/LedgerRetentionPolicy";
import { LedgerQueryAPI } from "../qorelogic/ledger/LedgerQueryAPI";
import { VscodeSecretStore, VscodeStateStore } from "../core/adapters/vscode";
import { CoreSubstrate } from "./bootstrapCore";
import { GovernanceSubstrate } from "./bootstrapGovernance";
import { Logger } from "../shared/Logger";

export interface QorLogicSubstrate {
  ledgerManager: LedgerManager;
  trustEngine: TrustEngine;
  policyEngine: PolicyEngine;
  shadowGenomeManager: ShadowGenomeManager;
  qorelogicManager: QorLogicManager;
  governanceAdapter: GovernanceAdapter;
  breakGlass: BreakGlassProtocol;
  agentRevocation: AgentRevocation;
  ledgerRetentionPolicy: LedgerRetentionPolicy;
  ledgerQueryAPI: LedgerQueryAPI | undefined;
  systemRegistry: SystemRegistry;
}

export async function bootstrapQorLogic(
  context: vscode.ExtensionContext,
  core: CoreSubstrate,
  gov: GovernanceSubstrate,
  logger: Logger,
): Promise<QorLogicSubstrate> {
  logger.info("Initializing Qor-Logic layer...");

  // Create VS Code adapters (composition root wiring)
  // Use shared ConfigManager (implements IConfigProvider) from core substrate
  const secretStore = new VscodeSecretStore(context);
  const workspaceStateStore = new VscodeStateStore(context.workspaceState);
  const configProvider = core.configManager;

  // Ensure directory structure before services initialize
  await core.configManager.ensureDirectoryStructure();

  const ledgerManager = new LedgerManager(secretStore, configProvider);
  await ledgerManager.initialize();

  const trustEngine = new TrustEngine(ledgerManager, core.eventBus);
  await trustEngine.initialize();

  const policyEngine = new PolicyEngine(configProvider);
  await policyEngine.loadPolicies();

  const shadowGenomeManager = new ShadowGenomeManager(
    configProvider,
    ledgerManager,
    core.eventBus,
  );
  await shadowGenomeManager.initialize();

  const overseerId = configProvider.getConfig().governance?.overseerId
    ?? 'did:myth:overseer:local';

  const qorelogicManager = new QorLogicManager(
    workspaceStateStore,
    configProvider,
    ledgerManager,
    trustEngine,
    policyEngine,
    shadowGenomeManager,
    core.eventBus,
    overseerId,
  );
  await qorelogicManager.initialize();

  gov.governanceRouter.setQorLogicManager(qorelogicManager);

  // Create and wire GovernanceAdapter
  const governanceAdapter = new GovernanceAdapter(
    core.eventBus,
    ledgerManager,
    policyEngine,
    gov.replayGuard,
    gov.transparency,
    trustEngine,
  );
  gov.governanceRouter.setGovernanceAdapter(governanceAdapter);

  // Gap 2: Instantiate BreakGlassProtocol (after ledger exists)
  const breakGlass = new BreakGlassProtocol(ledgerManager, core.eventBus);
  breakGlass.setModeChangeHandler(async (mode) => {
    await vscode.workspace
      .getConfiguration("failsafe")
      .update("governance.mode", mode, vscode.ConfigurationTarget.Workspace);
  });
  context.subscriptions.push({ dispose: () => breakGlass.dispose() });

  // v4.2.0: QorLogic services
  const agentRevocation = new AgentRevocation(trustEngine, ledgerManager);
  const archivePath = path.join(core.workspaceRoot, '.failsafe', 'archive');
  const ledgerRetentionPolicy = new LedgerRetentionPolicy(ledgerManager, archivePath);
  const ledgerQueryAPI = ledgerManager.isAvailable()
    ? new LedgerQueryAPI(ledgerManager.getDatabase())
    : undefined;
  const systemRegistry = new SystemRegistry(core.workspaceRoot);

  return {
    ledgerManager,
    trustEngine,
    policyEngine,
    shadowGenomeManager,
    qorelogicManager,
    governanceAdapter,
    breakGlass,
    agentRevocation,
    ledgerRetentionPolicy,
    ledgerQueryAPI,
    systemRegistry,
  };
}
