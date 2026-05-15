/**
 * DashboardPanel - Unified FailSafe Dashboard
 *
 * Main HUD displaying:
 * - System status overview
 * - Real-time metrics
 * - Quick actions
 * - Embedded Living Graph mini-view
 * - Cortex Stream summary
 */

import * as vscode from "vscode";
import { EventBus } from "../../shared/EventBus";
import { SentinelDaemon } from "../../sentinel/SentinelDaemon";
import { QorLogicManager } from "../../qorelogic/QorLogicManager";
import { PlanManager } from "../../qorelogic/planning/PlanManager";
import { getNonce } from "../../shared/utils/htmlSanitizer";
import { renderDashboardTemplate } from "./templates/DashboardTemplate";

type EvaluationMetrics = {
  cache?: Record<string, { hits: number; misses: number }>;
  noveltyAccuracy?: {
    totalEvaluations: number;
    lowCount: number;
    mediumCount: number;
    highCount: number;
    averageConfidence: number;
  };
  cacheSizes?: { fingerprint: number; novelty: number };
};

const isEvaluationMetrics = (
  payload: unknown,
): payload is EvaluationMetrics => {
  if (!payload || typeof payload !== "object") return false;
  return true;
};

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private sentinel: SentinelDaemon;
  private qorelogic: QorLogicManager;
  private eventBus: EventBus;
  private planManager?: PlanManager;
  private disposables: vscode.Disposable[] = [];
  private evaluationMetrics: EvaluationMetrics | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    sentinel: SentinelDaemon,
    qorelogic: QorLogicManager,
    eventBus: EventBus,
  ) {
    this.panel = panel;
    this.sentinel = sentinel;
    this.qorelogic = qorelogic;
    this.eventBus = eventBus;

    void this.update();

    this.setupEventSubscriptions();
    this.setupPeriodicRefresh();
    this.setupMessageHandlers();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private setupEventSubscriptions(): void {
    const unsubscribes = [
      this.eventBus.on("sentinel.verdict", () => void this.update()),
      this.eventBus.on("qorelogic.trustUpdate", () => void this.update()),
      this.eventBus.on("qorelogic.l3Queued", () => void this.update()),
      this.eventBus.on("evaluation.metrics", (event) => {
        if (isEvaluationMetrics(event.payload)) {
          this.evaluationMetrics = event.payload;
          void this.update();
        }
      }),
    ];
    unsubscribes.forEach((unsub) => this.disposables.push({ dispose: unsub }));
  }

  private setupPeriodicRefresh(): void {
    const interval = setInterval(() => void this.update(), 5000);
    this.disposables.push({ dispose: () => clearInterval(interval) });
  }

  private setupMessageHandlers(): void {
    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "auditFile":
          vscode.commands.executeCommand("failsafe.auditFile");
          break;
        case "showGraph":
          vscode.commands.executeCommand("failsafe.showLivingGraph");
          break;
        case "showLedger":
          vscode.commands.executeCommand("failsafe.viewLedger");
          break;
        case "focusCortex":
          vscode.commands.executeCommand("failsafe.focusCortex");
          break;
        case "showL3Queue":
          vscode.commands.executeCommand("failsafe.approveL3");
          break;
        case "showPlanningHub":
          vscode.commands.executeCommand("failsafe.showRoadmapWindow");
          break;
        case "openRoadmap":
          vscode.commands.executeCommand("failsafe.openRoadmap");
          break;
      }
    }, null);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    sentinel: SentinelDaemon,
    qorelogic: QorLogicManager,
    eventBus: EventBus,
  ): DashboardPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "failsafe.dashboard",
      "FailSafe Dashboard",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(
      panel,
      sentinel,
      qorelogic,
      eventBus,
    );
    return DashboardPanel.currentPanel;
  }

  public reveal(): void {
    this.panel.reveal();
  }

  public setPlanManager(pm: PlanManager): void {
    this.planManager = pm;
    void this.update();
  }

  private async update(): Promise<void> {
    this.panel.webview.html = await this.getHtmlContent();
  }

  private async getHtmlContent(): Promise<string> {
    const nonce = getNonce();
    const cspSource = this.panel.webview.cspSource;
    const status = this.sentinel.getStatus();
    const l3Queue = this.qorelogic.getL3Queue();
    const trustSummary = await this.getTrustSummary();
    const lastVerdict = status.lastVerdict;
    const uptime = this.formatUptime(status.uptime);

    // Get plan data if PlanManager is available
    const plan = this.planManager?.getActivePlan() ?? null;
    const planProgress = plan ? this.planManager?.getPlanProgress(plan.id) ?? null : null;

    return renderDashboardTemplate({
      nonce,
      cspSource,
      status,
      l3Queue,
      trustSummary,
      lastVerdict,
      uptime,
      metrics: this.evaluationMetrics,
      plan,
      planProgress,
    });
  }

  private async getTrustSummary(): Promise<{
    totalAgents: number;
    avgTrust: number;
    quarantined: number;
    stageCounts: { CBT: number; KBT: number; IBT: number };
  }> {
    try {
      const agents = await this.qorelogic.getTrustEngine().getAllAgents();
      const totalAgents = agents.length;
      const quarantined = agents.filter((agent) => agent.isQuarantined).length;
      const totalTrust = agents.reduce(
        (sum, agent) => sum + agent.trustScore,
        0,
      );
      const avgTrust = totalAgents === 0 ? 0 : totalTrust / totalAgents;
      const stageCounts = agents.reduce(
        (counts, agent) => {
          counts[agent.trustStage] = (counts[agent.trustStage] || 0) + 1;
          return counts;
        },
        { CBT: 0, KBT: 0, IBT: 0 } as { CBT: number; KBT: number; IBT: number },
      );

      return { totalAgents, avgTrust, quarantined, stageCounts };
    } catch {
      return {
        totalAgents: 0,
        avgTrust: 0,
        quarantined: 0,
        stageCounts: { CBT: 0, KBT: 0, IBT: 0 },
      };
    }
  }

  private formatUptime(uptimeMs: number): string {
    if (!uptimeMs || uptimeMs < 0) {
      return "0s";
    }

    const totalSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
