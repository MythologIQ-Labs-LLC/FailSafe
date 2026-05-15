import * as vscode from 'vscode';
import { EventBus } from '../shared/EventBus';
import { Logger } from '../shared/Logger';
import { CortexIntent, LivingGraphData, SentinelVerdict } from '../shared/types';
import { SentinelDaemon } from '../sentinel/SentinelDaemon';
import { ArchitectureEngine } from '../sentinel/engines/ArchitectureEngine';
import { QorLogicManager } from '../qorelogic/QorLogicManager';
import { PlanManager } from '../qorelogic/planning/PlanManager';
import { IntentScout } from './cortex/IntentScout';
import { AnalyticsDashboardPanel } from './panels/AnalyticsDashboardPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { L3ApprovalPanel } from './panels/L3ApprovalPanel';
import { LedgerViewerPanel } from './panels/LedgerViewerPanel';
import { LivingGraphPanel } from './panels/LivingGraphPanel';
import { PlanningHubPanel } from './panels/PlanningHubPanel';
import { executeCortexIntent } from './services/GenesisIntentRouter';
import {
  showVerdictNotification as showVerdictNotificationDialog
} from './services/GenesisNotificationService';
import { GenesisRuntimeOps } from './services/GenesisRuntimeOps';
import { TokenAggregatorService } from '../economics/TokenAggregatorService';
import { EconomicsPanel } from './panels/EconomicsPanel';
import { RevertPanel, CheckpointLookup } from './panels/RevertPanel';
import { FailSafeRevertService } from '../governance/revert/FailSafeRevertService';
import { GitResetService } from '../governance/revert/GitResetService';

export class GenesisManager {
  private readonly context: vscode.ExtensionContext;
  private readonly sentinel: SentinelDaemon;
  private readonly architectureEngine: ArchitectureEngine;
  private readonly qorelogic: QorLogicManager;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly intentScout: IntentScout;
  private readonly runtimeOps: GenesisRuntimeOps;
  private readonly workspaceRoot: string;
  private readonly tokenAggregator: TokenAggregatorService;

  private livingGraphPanel: LivingGraphPanel | undefined;
  private dashboardPanel: DashboardPanel | undefined;
  private ledgerViewerPanel: LedgerViewerPanel | undefined;
  private l3ApprovalPanel: L3ApprovalPanel | undefined;
  private planningHubPanel: PlanningHubPanel | undefined;
  private analyticsDashboardPanel: AnalyticsDashboardPanel | undefined;
  private economicsPanel: EconomicsPanel | undefined;
  private revertPanel: RevertPanel | undefined;
  private revertDeps: { svc: FailSafeRevertService; git: GitResetService; lookup: CheckpointLookup } | undefined;
  private graphData: LivingGraphData | undefined;
  private planManager: PlanManager | undefined;

  constructor(
    context: vscode.ExtensionContext,
    sentinel: SentinelDaemon,
    architectureEngine: ArchitectureEngine,
    qorelogic: QorLogicManager,
    eventBus: EventBus
  ) {
    this.context = context;
    this.sentinel = sentinel;
    this.architectureEngine = architectureEngine;
    this.qorelogic = qorelogic;
    this.eventBus = eventBus;
    this.logger = new Logger('Genesis');
    this.intentScout = new IntentScout();
    this.runtimeOps = new GenesisRuntimeOps(eventBus, sentinel, architectureEngine, qorelogic);
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.tokenAggregator = new TokenAggregatorService(eventBus, this.workspaceRoot);
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Genesis layer...');
    this.setupEventSubscriptions();
    this.graphData = await this.runtimeOps.createGraphData();
    this.logger.info('Genesis layer initialized');
  }

  showDashboard(): void {
    if (this.dashboardPanel) {
      this.dashboardPanel.reveal();
      return;
    }

    this.dashboardPanel = DashboardPanel.createOrShow(
      this.context.extensionUri,
      this.sentinel,
      this.qorelogic,
      this.eventBus
    );
    if (this.planManager) {
      this.dashboardPanel.setPlanManager(this.planManager);
    }
  }

  showLivingGraph(): void {
    if (this.livingGraphPanel) { this.livingGraphPanel.reveal(); return; }
    this.livingGraphPanel = LivingGraphPanel.createOrShow(
      this.context.extensionUri, this.graphData, this.eventBus,
    );
  }

  setPlanManager(planManager: PlanManager): void {
    this.planManager = planManager;
    if (this.dashboardPanel) {
      this.dashboardPanel.setPlanManager(planManager);
    }
  }

  showRoadmapWindow(): void {
    if (!this.planManager) {
      vscode.window.showWarningMessage('Planning system not initialized');
      return;
    }

    if (this.planningHubPanel) {
      this.planningHubPanel.reveal();
      return;
    }

    this.planningHubPanel = PlanningHubPanel.createOrShow(
      this.context.extensionUri,
      this.sentinel,
      this.qorelogic,
      this.planManager,
      this.eventBus
    );
  }

  showAnalyticsDashboard(): void {
    if (!this.workspaceRoot) { vscode.window.showWarningMessage('No workspace folder open'); return; }
    if (this.analyticsDashboardPanel) { this.analyticsDashboardPanel.reveal(); return; }
    this.analyticsDashboardPanel = AnalyticsDashboardPanel.createOrShow(
      this.context.extensionUri, this.eventBus, this.workspaceRoot,
    );
  }

  showEconomics(): void {
    if (this.economicsPanel) { this.economicsPanel.reveal(); return; }
    this.economicsPanel = EconomicsPanel.createOrShow(this.context.extensionUri, this.tokenAggregator);
  }

  setRevertDeps(svc: FailSafeRevertService, git: GitResetService, lookup: CheckpointLookup): void {
    this.revertDeps = { svc, git, lookup };
  }

  showRevert(checkpointId: string): void {
    if (!this.revertDeps) {
      vscode.window.showWarningMessage('Revert service not initialized');
      return;
    }
    if (!this.revertPanel) {
      const { svc, git, lookup } = this.revertDeps;
      this.revertPanel = RevertPanel.createOrShow(
        this.context.extensionUri, svc, git, lookup, this.workspaceRoot,
      );
    }
    this.revertPanel.reveal();
    void this.revertPanel.showForCheckpoint(checkpointId);
  }

  async focusCortexOmnibar(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Cortex Query',
      placeHolder: 'e.g., "audit auth module", "show L3 files", "explain last failure"'
    });
    if (query) {
      await this.processCortexQuery(query);
    }
  }

  async processCortexQuery(query: string): Promise<void> {
    const intent = this.intentScout.analyze(query);
    this.logger.debug('Cortex intent detected', intent);
    await this.handleIntent(intent);
  }

  showLedgerViewer(): void {
    if (this.ledgerViewerPanel) { this.ledgerViewerPanel.reveal(); return; }
    this.ledgerViewerPanel = LedgerViewerPanel.createOrShow(
      this.context.extensionUri, this.qorelogic.getLedgerManager(),
    );
  }

  showL3ApprovalQueue(): void {
    if (this.l3ApprovalPanel) { this.l3ApprovalPanel.reveal(); return; }
    this.l3ApprovalPanel = L3ApprovalPanel.createOrShow(
      this.context.extensionUri, this.qorelogic, this.eventBus,
    );
  }

  showVerdictNotification(verdict: SentinelVerdict): void {
    showVerdictNotificationDialog(
      verdict,
      () => this.runtimeOps.showVerdictDetails(verdict),
      () => this.showL3ApprovalQueue()
    );
  }

  dispose(): void {
    const panels = [
      this.livingGraphPanel, this.dashboardPanel, this.ledgerViewerPanel,
      this.l3ApprovalPanel, this.planningHubPanel, this.analyticsDashboardPanel,
      this.economicsPanel, this.revertPanel,
    ];
    panels.forEach((p) => p?.dispose());
    this.tokenAggregator.dispose();
  }

  private setupEventSubscriptions(): void {
    this.eventBus.on('sentinel.verdict', async (event) => {
      this.graphData = await this.runtimeOps.updateGraphNode(this.graphData, event.payload as SentinelVerdict);
    });
    this.eventBus.on('qorelogic.trustUpdate', (event) => {
      this.runtimeOps.emitStreamEvent('qorelogic', 'info', 'Trust Updated', JSON.stringify(event.payload));
    });
    this.eventBus.on('qorelogic.l3Queued', (event) => {
      this.runtimeOps.emitStreamEvent('sentinel', 'warn', 'L3 Approval Required', JSON.stringify(event.payload));
    });
  }

  private async handleIntent(intent: CortexIntent): Promise<void> {
    await executeCortexIntent(intent, {
      auditFile: async (file?: string) => {
        if (file) { await this.sentinel.auditFile(file); return; }
        await vscode.commands.executeCommand('failsafe.auditFile');
      },
      runArchitectureScan: async () => this.runtimeOps.runArchitectureScan(),
      showLivingGraph: () => this.showLivingGraph(),
      showLedgerViewer: () => this.showLedgerViewer(),
      filterGraphByRisk: async (riskGrade?: string) => this.runtimeOps.filterGraphByRisk(() => this.showLivingGraph(), riskGrade),
      showTrustSummary: async () => this.runtimeOps.showTrustSummary(),
      explainLastFailure: async () => this.runtimeOps.explainLastFailure(),
      showL3ApprovalQueue: () => this.showL3ApprovalQueue(),
      showHelp: () => this.runtimeOps.showHelp(),
      showUnknownIntent: (intentName: string, confidence: number) => {
        vscode.window.showInformationMessage(`Unknown intent: ${intentName} (confidence: ${confidence.toFixed(2)})`);
      }
    });
  }
}
