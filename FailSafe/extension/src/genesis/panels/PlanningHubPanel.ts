/**
 * PlanningHubPanel - Consolidated Planning & Governance Hub
 *
 * Consolidates all sidebar features into a single full-panel view:
 * - Roadmap Visualization (SVG with blockers/risks/detours)
 * - Kanban/Timeline alternate views
 * - Sentinel Status (all metrics + tooltips)
 * - Trust Summary (agents, avg trust, stages)
 * - L3 Queue (with inline approval actions)
 * - Quick Actions (all wired to commands)
 */

import * as vscode from "vscode";
import { EventBus } from "../../shared/EventBus";
import { SentinelDaemon } from "../../sentinel/SentinelDaemon";
import { QorLogicManager } from "../../qorelogic/QorLogicManager";
import { PlanManager } from "../../qorelogic/planning/PlanManager";
import { getNonce } from "../../shared/utils/htmlSanitizer";
import {
  renderPlanningHubTemplate,
  PlanningHubViewModel,
} from "./templates/PlanningHubTemplate";
import { SentinelVerdict } from "../../shared/types";

type ViewMode = "roadmap" | "kanban" | "timeline";
type PlanningHubMessage = { command: string; payload?: unknown };
type BlockerPayload = { planId: string; blockerId: string };
type ViewModePayload = { mode: ViewMode };

export class PlanningHubPanel {
  public static currentPanel: PlanningHubPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private sentinel: SentinelDaemon;
  private qorelogic: QorLogicManager;
  private planManager: PlanManager;
  private eventBus: EventBus;
  private currentMode: ViewMode = "roadmap";
  private recentVerdicts: SentinelVerdict[] = [];
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    sentinel: SentinelDaemon,
    qorelogic: QorLogicManager,
    planManager: PlanManager,
    eventBus: EventBus,
  ): PlanningHubPanel {
    const column =
      vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (PlanningHubPanel.currentPanel) {
      PlanningHubPanel.currentPanel.panel.reveal(column);
      return PlanningHubPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "failsafe.planningHub",
      "FailSafe Planning Console",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    PlanningHubPanel.currentPanel = new PlanningHubPanel(
      panel,
      sentinel,
      qorelogic,
      planManager,
      eventBus,
    );
    return PlanningHubPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    sentinel: SentinelDaemon,
    qorelogic: QorLogicManager,
    planManager: PlanManager,
    eventBus: EventBus,
  ) {
    this.panel = panel;
    this.sentinel = sentinel;
    this.qorelogic = qorelogic;
    this.planManager = planManager;
    this.eventBus = eventBus;

    this.setupEventSubscriptions();
    void this.update();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    const interval = setInterval(() => void this.update(), 5000);
    this.disposables.push({ dispose: () => clearInterval(interval) });
  }

  private setupEventSubscriptions(): void {
    const subs = [
      this.eventBus.on<SentinelVerdict>("sentinel.verdict", (e) => {
        this.recentVerdicts.unshift(e.payload);
        if (this.recentVerdicts.length > 5) this.recentVerdicts.pop();
        void this.update();
      }),
      this.eventBus.on("qorelogic.trustUpdate", () => void this.update()),
      this.eventBus.on("qorelogic.l3Queued", () => void this.update()),
      this.eventBus.on("plan.updated" as never, () => void this.update()),
    ];
    subs.forEach((unsub) => this.disposables.push({ dispose: unsub }));
  }

  public reveal(): void {
    this.panel.reveal();
  }

  private handleMessage(message: PlanningHubMessage): void {
    const p = message.payload;
    switch (message.command) {
      case "setViewMode":
        this.currentMode = (p as ViewModePayload).mode;
        void this.update();
        break;
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
      case "prepWorkspace":
        vscode.commands.executeCommand("failsafe.secureWorkspace");
        break;
      case "panicStop":
        vscode.commands.executeCommand("failsafe.panicStop");
        break;
      case "resumeMonitoring":
        vscode.commands.executeCommand("failsafe.resumeMonitoring");
        break;
      case "openConsoleHome":
        vscode.commands.executeCommand("failsafe.openRoadmap");
        break;
      case "openConsoleTimeline":
        vscode.commands.executeCommand("failsafe.openRoadmapTimeline");
        break;
      case "openConsoleActiveSprint":
        vscode.commands.executeCommand("failsafe.openRoadmapActiveSprint");
        break;
      case "openConsoleLiveActivity":
        vscode.commands.executeCommand("failsafe.openRoadmapLiveActivity");
        break;
      case "approveL3":
        vscode.commands.executeCommand("failsafe.approveL3");
        break;
      case "requestApproval":
        this.planManager.requestBlockerApproval(
          (p as BlockerPayload).planId,
          (p as BlockerPayload).blockerId,
        );
        break;
      case "takeDetour":
        this.planManager.takeDetour(
          (p as BlockerPayload).planId,
          (p as BlockerPayload).blockerId,
        );
        break;
      case "resolveBlocker":
        this.planManager.resolveBlocker(
          (p as BlockerPayload).planId,
          (p as BlockerPayload).blockerId,
        );
        void this.update();
        break;
    }
  }

  private async update(): Promise<void> {
    const model = await this.buildViewModel();
    this.panel.webview.html = renderPlanningHubTemplate(model);
  }

  private async buildViewModel(): Promise<PlanningHubViewModel> {
    const status = this.sentinel.getStatus();
    const l3Queue = this.qorelogic.getL3Queue();
    const plan = this.planManager.getActivePlan();
    const progress = plan ? this.planManager.getPlanProgress(plan.id) : null;
    const trustSummary = await this.getTrustSummary();

    return {
      nonce: getNonce(),
      cspSource: this.panel.webview.cspSource,
      viewMode: this.currentMode,
      sentinelStatus: status,
      trustSummary,
      l3Queue,
      recentVerdicts: this.recentVerdicts,
      plan,
      planProgress: progress,
      uptime: this.formatUptime(status.uptime),
    };
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
      const quarantined = agents.filter((a) => a.isQuarantined).length;
      const avgTrust =
        totalAgents === 0
          ? 0
          : agents.reduce((s, a) => s + a.trustScore, 0) / totalAgents;
      const stageCounts = agents.reduce(
        (c, a) => {
          c[a.trustStage] = (c[a.trustStage] || 0) + 1;
          return c;
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

  private formatUptime(ms: number): string {
    if (!ms || ms < 0) return "0s";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  public dispose(): void {
    PlanningHubPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}
