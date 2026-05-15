/**
 * ProjectOverviewPanel - High-level project health and governance posture
 *
 * Displays:
 * - Mission alignment status
 * - Governance posture summary
 * - Risk summary
 * - Active plan progress
 * - Recent activity
 */

import * as vscode from "vscode";
import { EventBus } from "../../shared/EventBus";
import { SentinelDaemon } from "../../sentinel/SentinelDaemon";
import { QorLogicManager } from "../../qorelogic/QorLogicManager";
import { RiskManager } from "../../qorelogic/risk";
import { PlanManager } from "../../qorelogic/planning/PlanManager";
import { IntentService } from "../../governance/IntentService";
import { escapeHtml, getNonce } from "../../shared/utils/htmlSanitizer";

type OverviewMessage = { command: string; payload?: unknown };

interface ProjectOverview {
  projectName: string;
  governancePosture: {
    sentinelRunning: boolean;
    activeIntent: boolean;
    l3QueueDepth: number;
    avgTrustScore: number;
  };
  riskSummary: {
    total: number;
    openCritical: number;
    openHigh: number;
  };
  planProgress: {
    hasPlan: boolean;
    title: string;
    percentComplete: number;
    currentPhase: string;
  } | null;
  recentActivity: Array<{
    type: string;
    timestamp: string;
    summary: string;
  }>;
}

export class ProjectOverviewPanel {
  public static currentPanel: ProjectOverviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private sentinel: SentinelDaemon;
  private qorelogic: QorLogicManager;
  private riskManager: RiskManager;
  private intentService: IntentService;
  private planManager?: PlanManager;
  private eventBus: EventBus;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    sentinel: SentinelDaemon,
    qorelogic: QorLogicManager,
    riskManager: RiskManager,
    intentService: IntentService,
    eventBus: EventBus,
  ) {
    this.panel = panel;
    this.sentinel = sentinel;
    this.qorelogic = qorelogic;
    this.riskManager = riskManager;
    this.intentService = intentService;
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
      this.eventBus.on("risk.updated" as never, () => void this.update()),
    ];
    unsubscribes.forEach((unsub) => this.disposables.push({ dispose: unsub }));
  }

  private setupPeriodicRefresh(): void {
    const interval = setInterval(() => void this.update(), 10000);
    this.disposables.push({ dispose: () => clearInterval(interval) });
  }

  private setupMessageHandlers(): void {
    this.panel.webview.onDidReceiveMessage((message: OverviewMessage) => {
      switch (message.command) {
        case "openRiskRegister":
          vscode.commands.executeCommand("failsafe.openRiskRegister");
          break;
        case "openRoadmap":
          vscode.commands.executeCommand("failsafe.openRoadmap");
          break;
        case "openCommandCenter":
          vscode.commands.executeCommand("failsafe.openPlannerHub");
          break;
        case "createIntent":
          vscode.commands.executeCommand("failsafe.createIntent");
          break;
      }
    }, null);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    sentinel: SentinelDaemon,
    qorelogic: QorLogicManager,
    riskManager: RiskManager,
    intentService: IntentService,
    eventBus: EventBus,
  ): ProjectOverviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ProjectOverviewPanel.currentPanel) {
      ProjectOverviewPanel.currentPanel.panel.reveal(column);
      return ProjectOverviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "failsafe.projectOverview",
      "Project Overview",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    ProjectOverviewPanel.currentPanel = new ProjectOverviewPanel(
      panel,
      sentinel,
      qorelogic,
      riskManager,
      intentService,
      eventBus,
    );
    return ProjectOverviewPanel.currentPanel;
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
    const overview = await this.getOverviewData();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root {
      --primary: #2c74f2;
      --success: #2c9e67;
      --warning: #f57c00;
      --danger: #d32f2f;
      --neutral: #616161;
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      margin: 0;
      background: linear-gradient(180deg, #f9fcff 0%, #edf4ff 100%);
      color: var(--vscode-foreground);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .project-name {
      font-size: 24px;
      font-weight: 700;
    }
    .mission {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(34, 72, 139, 0.08);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
    }
    .card-action {
      font-size: 11px;
      color: var(--primary);
      cursor: pointer;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .metric-row:last-child {
      border-bottom: none;
    }
    .metric-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .metric-value {
      font-size: 12px;
      font-weight: 600;
    }
    .metric-value.good { color: var(--success); }
    .metric-value.warning { color: var(--warning); }
    .metric-value.danger { color: var(--danger); }
    .progress-bar {
      height: 8px;
      background: #e7f0ff;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 8px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), var(--success));
      transition: width 0.3s;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.active { background: var(--success); }
    .status-dot.inactive { background: var(--danger); }
    .status-dot.warning { background: var(--warning); }
    .activity-list {
      max-height: 200px;
      overflow-y: auto;
    }
    .activity-item {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
      font-size: 11px;
    }
    .activity-time {
      color: var(--vscode-descriptionForeground);
      min-width: 60px;
    }
    .quick-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    .action-btn {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .action-btn.primary {
      background: linear-gradient(135deg, #2c74f2 0%, #5b94ff 60%, #62c1b0 100%);
      color: white;
    }
    .action-btn.secondary {
      background: #eaf1ff;
      color: #274780;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="project-name">${escapeHtml(overview.projectName)}</div>
      <div class="mission">FailSafe ensures AI-assisted development remains trustworthy, transparent, and accountable to human intent.</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-header">
        <span class="card-title">Governance Posture</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Sentinel Status</span>
        <span class="metric-value ${overview.governancePosture.sentinelRunning ? "good" : "danger"}">
          <span class="status-indicator">
            <span class="status-dot ${overview.governancePosture.sentinelRunning ? "active" : "inactive"}"></span>
            ${overview.governancePosture.sentinelRunning ? "Active" : "Inactive"}
          </span>
        </span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Active Intent</span>
        <span class="metric-value ${overview.governancePosture.activeIntent ? "good" : "warning"}">
          ${overview.governancePosture.activeIntent ? "Yes" : "None"}
        </span>
      </div>
      <div class="metric-row">
        <span class="metric-label">L3 Queue</span>
        <span class="metric-value ${overview.governancePosture.l3QueueDepth > 0 ? "warning" : "good"}">
          ${overview.governancePosture.l3QueueDepth} pending
        </span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Avg Trust Score</span>
        <span class="metric-value good">${Math.round(overview.governancePosture.avgTrustScore * 100)}%</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Risk Register</span>
        <span class="card-action" onclick="vscode.postMessage({command:'openRiskRegister'})">View All &rarr;</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Total Risks</span>
        <span class="metric-value">${overview.riskSummary.total}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Critical Open</span>
        <span class="metric-value ${overview.riskSummary.openCritical > 0 ? "danger" : "good"}">
          ${overview.riskSummary.openCritical}
        </span>
      </div>
      <div class="metric-row">
        <span class="metric-label">High Open</span>
        <span class="metric-value ${overview.riskSummary.openHigh > 0 ? "warning" : "good"}">
          ${overview.riskSummary.openHigh}
        </span>
      </div>
    </div>

    <div class="card" style="grid-column: span 2;">
      <div class="card-header">
        <span class="card-title">Plan Progress</span>
        <span class="card-action" onclick="vscode.postMessage({command:'openRoadmap'})">View Roadmap &rarr;</span>
      </div>
      ${
        overview.planProgress
          ? `
        <div class="metric-row">
          <span class="metric-label">${escapeHtml(overview.planProgress.title)}</span>
          <span class="metric-value">${overview.planProgress.percentComplete}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${overview.planProgress.percentComplete}%"></div>
        </div>
        <div class="metric-row" style="margin-top: 8px;">
          <span class="metric-label">Current Phase</span>
          <span class="metric-value">${escapeHtml(overview.planProgress.currentPhase)}</span>
        </div>
      `
          : `
        <div class="metric-row">
          <span class="metric-label">No active plan</span>
          <span class="metric-value">Create a plan to track progress</span>
        </div>
      `
      }
    </div>
  </div>

  <div class="quick-actions">
    <button class="action-btn primary" onclick="vscode.postMessage({command:'openCommandCenter'})">Open Command Center</button>
    <button class="action-btn secondary" onclick="vscode.postMessage({command:'createIntent'})">Create Intent</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }

  private async getOverviewData(): Promise<ProjectOverview> {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "Unknown Project";
    const projectName = workspaceRoot.split(/[/\\]/).pop() || "Project";

    const sentinelStatus = this.sentinel.getStatus();
    const l3Queue = this.qorelogic.getL3Queue();
    const agents = await this.qorelogic.getTrustEngine().getAllAgents();
    const avgTrustScore =
      agents.length > 0
        ? agents.reduce((sum, a) => sum + a.trustScore, 0) / agents.length
        : 0;

    const activeIntent = await this.intentService.getActiveIntent();
    const riskSummary = this.riskManager.getSummary();

    let planProgress: ProjectOverview["planProgress"] = null;
    if (this.planManager) {
      const plan = this.planManager.getActivePlan();
      if (plan) {
        const progress = this.planManager.getPlanProgress(plan.id);
        const currentPhase = plan.phases.find(
          (p) => p.id === plan.currentPhaseId,
        );
        planProgress = {
          hasPlan: true,
          title: plan.title,
          percentComplete: progress
            ? Math.round((progress.completed / progress.total) * 100)
            : 0,
          currentPhase: currentPhase?.title || "Unknown",
        };
      }
    }

    return {
      projectName,
      governancePosture: {
        sentinelRunning: sentinelStatus.running,
        activeIntent: !!activeIntent,
        l3QueueDepth: l3Queue.length,
        avgTrustScore,
      },
      riskSummary: {
        total: riskSummary.total,
        openCritical: riskSummary.openCritical,
        openHigh: riskSummary.openHigh,
      },
      planProgress,
      recentActivity: [],
    };
  }

  public dispose(): void {
    ProjectOverviewPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

