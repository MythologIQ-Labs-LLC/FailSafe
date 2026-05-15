import * as vscode from 'vscode';
import { ArchitectureEngine } from '../../sentinel/engines/ArchitectureEngine';
import { QorLogicManager } from '../../qorelogic/QorLogicManager';
import { EventBus } from '../../shared/EventBus';
import { SentinelDaemon } from '../../sentinel/SentinelDaemon';
import { LivingGraphData, SentinelVerdict } from '../../shared/types';
import { applyVerdictToGraph, createInitialGraphData } from './GenesisGraphService';
import { showGenesisHelp, showVerdictDetails } from './GenesisNotificationService';

export class GenesisRuntimeOps {
  constructor(
    private readonly eventBus: EventBus,
    private readonly sentinel: SentinelDaemon,
    private readonly architectureEngine: ArchitectureEngine,
    private readonly qorelogic: QorLogicManager
  ) {}

  async createGraphData() {
    const graphData = createInitialGraphData();
    this.eventBus.emit('genesis.graphUpdate', graphData);
    return graphData;
  }

  async updateGraphNode(graphData: LivingGraphData | undefined, verdict: SentinelVerdict) {
    const updated = applyVerdictToGraph(graphData, verdict);
    if (updated) {
      this.eventBus.emit('genesis.graphUpdate', updated);
    }
    return updated;
  }

  async filterGraphByRisk(showLivingGraph: () => void, riskGrade?: string): Promise<void> {
    showLivingGraph();
    vscode.window.showInformationMessage(`Filtering graph by risk: ${riskGrade || 'all'}`);
  }

  async showTrustSummary(): Promise<void> {
    const agents = await this.qorelogic.getTrustEngine().getAllAgents();
    const items = agents.map((agent) => ({
      label: `${agent.persona}: ${agent.did.substring(0, 20)}...`,
      description: `Trust: ${(agent.trustScore * 100).toFixed(0)}% (${agent.trustStage})`,
      detail: agent.isQuarantined ? 'Quarantined' : undefined
    }));
    vscode.window.showQuickPick(items, { placeHolder: 'Agent Trust Scores', canPickMany: false });
  }

  async runArchitectureScan(): Promise<void> {
    this.emitStreamEvent('system', 'info', 'Starting Architecture Scan...');
    const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!root) { return; }
    const report = await this.architectureEngine.analyzeWorkspace(root);
    const smells = report.smells.map((s) => s.name).join(', ');
    const message = report.smells.length > 0
      ? `Architecture Score: ${report.score}/100. Found ${report.smells.length} smells: ${smells}`
      : `Architecture Score: ${report.score}/100. Clean architecture.`;
    this.emitStreamEvent('sentinel', report.score < 80 ? 'warn' : 'info', 'Architecture Report', message);
    vscode.window.showInformationMessage(message);
  }

  async explainLastFailure(): Promise<void> {
    const status = this.sentinel.getStatus();
    if (status.lastVerdict && status.lastVerdict.decision !== 'PASS') {
      showVerdictDetails(status.lastVerdict);
      return;
    }
    vscode.window.showInformationMessage('No recent failures to explain');
  }

  showHelp(): void {
    showGenesisHelp();
  }

  showVerdictDetails(verdict: SentinelVerdict): void {
    showVerdictDetails(verdict);
  }

  emitStreamEvent(
    category: 'sentinel' | 'qorelogic' | 'genesis' | 'user' | 'system',
    severity: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    title: string,
    details?: string
  ): void {
    this.eventBus.emit('genesis.streamEvent', {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category,
      severity,
      title,
      details
    });
  }
}
