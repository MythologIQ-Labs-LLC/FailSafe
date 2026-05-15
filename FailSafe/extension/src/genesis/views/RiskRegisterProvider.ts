/**
 * RiskRegisterProvider - Webview for risk register visualization
 *
 * Displays project risks with severity, status, and mitigation tracking.
 */

import * as vscode from "vscode";
import {
  RiskManager,
  Risk,
  RiskStatus,
} from "../../qorelogic/risk";
import { EventBus } from "../../shared/EventBus";
import {
  getNonce,
  escapeHtml,
  escapeJsString,
} from "../../shared/utils/htmlSanitizer";

type RiskMessage = { command: string; payload?: unknown };

export class RiskRegisterProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "failsafe.riskRegister";

  private view?: vscode.WebviewView;
  private extensionUri: vscode.Uri;
  private riskManager: RiskManager;
  private eventBus: EventBus;
  private disposables: vscode.Disposable[] = [];

  constructor(
    extensionUri: vscode.Uri,
    riskManager: RiskManager,
    eventBus: EventBus,
  ) {
    this.extensionUri = extensionUri;
    this.riskManager = riskManager;
    this.eventBus = eventBus;

    const unsubscribe = this.eventBus.on("risk.updated" as never, () =>
      this.refresh(),
    );
    this.disposables.push({ dispose: unsubscribe });
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtmlContent();
    const messageDisposable = webviewView.webview.onDidReceiveMessage((msg) =>
      this.handleMessage(msg),
    );
    this.disposables.push(messageDisposable);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  private handleMessage(message: RiskMessage): void {
    const p = message.payload as Record<string, unknown>;
    switch (message.command) {
      case "updateStatus":
        if (p?.id && p?.status) {
          this.riskManager.updateRisk(p.id as string, {
            status: p.status as RiskStatus,
          });
          this.refresh();
        }
        break;
      case "deleteRisk":
        if (p?.id) {
          this.riskManager.deleteRisk(p.id as string);
          this.refresh();
        }
        break;
      case "viewRisk":
        if (p?.id) {
          this.showRiskDetails(p.id as string);
        }
        break;
    }
  }

  // showCreateRiskDialog removed in v5.1.0. Risks are now sourced via the
  // coding model (MCP tool, chat subcommand, or auto-derivation). See
  // plan-qor-model-sourced-risks.md.

  private async showRiskDetails(id: string): Promise<void> {
    const risk = this.riskManager.getRisk(id);
    if (!risk) return;

    const panel = vscode.window.createWebviewPanel(
      "failsafe.riskDetail",
      `Risk: ${risk.title}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    );

    panel.webview.html = this.getRiskDetailHtml(risk);
  }

  private refresh(): void {
    if (this.view) {
      this.view.webview.html = this.getHtmlContent();
    }
  }

  private getHtmlContent(): string {
    const nonce = getNonce();
    const risks = this.riskManager.getAllRisks();
    const summary = this.riskManager.getSummary();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root {
      --critical: #d32f2f;
      --high: #f57c00;
      --medium: #fbc02d;
      --low: #388e3c;
      --open: #1976d2;
      --mitigating: #7b1fa2;
      --resolved: #388e3c;
      --accepted: #616161;
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 12px;
      margin: 0;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .header h2 {
      margin: 0;
      font-size: 14px;
    }
    .add-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .summary-card {
      background: var(--vscode-editor-background);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .summary-card.critical { border-left: 3px solid var(--critical); }
    .summary-card.high { border-left: 3px solid var(--high); }
    .summary-card.medium { border-left: 3px solid var(--medium); }
    .summary-card.low { border-left: 3px solid var(--low); }
    .summary-count {
      font-size: 24px;
      font-weight: bold;
    }
    .summary-label {
      font-size: 10px;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .risk-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .risk-item {
      background: var(--vscode-editor-background);
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
    }
    .risk-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .risk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .risk-title {
      font-weight: 600;
      font-size: 12px;
    }
    .risk-badges {
      display: flex;
      gap: 4px;
    }
    .badge {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .badge.critical { background: var(--critical); color: white; }
    .badge.high { background: var(--high); color: white; }
    .badge.medium { background: var(--medium); color: black; }
    .badge.low { background: var(--low); color: white; }
    .badge.open { background: var(--open); color: white; }
    .badge.mitigating { background: var(--mitigating); color: white; }
    .badge.resolved { background: var(--resolved); color: white; }
    .badge.accepted { background: var(--accepted); color: white; }
    .risk-description {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .risk-actions {
      display: flex;
      gap: 4px;
    }
    .risk-actions button {
      font-size: 10px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-radius: 4px;
      cursor: pointer;
    }
    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>Risk Register</h2>
    <span class="model-sourced-note" style="font-size:11px;color:var(--vscode-descriptionForeground)">Sourced by the coding model</span>
  </div>
  
  <div class="summary">
    <div class="summary-card critical">
      <div class="summary-count">${summary.openCritical}</div>
      <div class="summary-label">Critical</div>
    </div>
    <div class="summary-card high">
      <div class="summary-count">${summary.openHigh}</div>
      <div class="summary-label">High</div>
    </div>
    <div class="summary-card medium">
      <div class="summary-count">${summary.bySeverity.medium}</div>
      <div class="summary-label">Medium</div>
    </div>
    <div class="summary-card low">
      <div class="summary-count">${summary.bySeverity.low}</div>
      <div class="summary-label">Low</div>
    </div>
  </div>

  <div class="risk-list">
    ${
      risks.length === 0
        ? '<div class="empty-state">No risks registered</div>'
        : risks.map((r) => this.renderRiskItem(r)).join("")
    }
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }

  private renderRiskItem(risk: Risk): string {
    return `
    <div class="risk-item" onclick="vscode.postMessage({command:'viewRisk',payload:{id:'${escapeJsString(risk.id)}'}})">
        <div class="risk-header">
        <span class="risk-title">${escapeHtml(risk.title)}</span>
        <div class="risk-badges">
          <span class="badge ${risk.severity}">${risk.severity}</span>
          <span class="badge ${risk.status}">${risk.status}</span>
          ${this.renderSourceBadge(risk)}
        </div>
      </div>
      <div class="risk-description">${escapeHtml(risk.description || risk.impact)}</div>
      <div class="risk-actions" onclick="event.stopPropagation()">
        <button onclick="vscode.postMessage({command:'updateStatus',payload:{id:'${escapeJsString(risk.id)}',status:'mitigating'}})">Mitigate</button>
        <button onclick="vscode.postMessage({command:'updateStatus',payload:{id:'${escapeJsString(risk.id)}',status:'resolved'}})">Resolve</button>
      </div>
    </div>`;
  }

  private renderSourceBadge(risk: Risk): string {
    const source = risk.source || 'manual';
    const df = risk.derivedFrom;
    let context = '';
    if (source === 'mcp' && risk.sourceAgent) context = ` · ${escapeHtml(risk.sourceAgent)}`;
    else if (source === 'audit-veto' && df?.ledgerEntry !== undefined) context = ` · Entry #${df.ledgerEntry}`;
    else if (source === 'audit-veto' && df?.planSlug) context = ` · ${escapeHtml(df.planSlug)}`;
    else if (source === 'shadow-genome' && df?.shadowGenomeEventId) {
      context = ` · ${escapeHtml(String(df.shadowGenomeEventId).slice(0, 8))}`;
    }
    return `<span class="badge source" title="${escapeHtml(JSON.stringify(df ?? {}))}">${escapeHtml(source)}${context}</span>`;
  }

  private getRiskDetailHtml(risk: Risk): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); padding: 20px; }
    h1 { font-size: 18px; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    .label { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    .value { font-size: 13px; margin-top: 4px; }
    .badges { display: flex; gap: 8px; margin-bottom: 16px; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge.critical { background: #d32f2f; color: white; }
    .badge.high { background: #f57c00; color: white; }
    .badge.medium { background: #fbc02d; color: black; }
    .badge.low { background: #388e3c; color: white; }
  </style>
</head>
<body>
  <h1>${escapeHtml(risk.title)}</h1>
  <div class="badges">
    <span class="badge ${risk.severity}">${risk.severity.toUpperCase()}</span>
    <span class="badge">${risk.category}</span>
    <span class="badge">${risk.status}</span>
  </div>
  <div class="field">
    <div class="label">Description</div>
    <div class="value">${escapeHtml(risk.description || "No description")}</div>
  </div>
  <div class="field">
    <div class="label">Impact</div>
    <div class="value">${escapeHtml(risk.impact || "Not specified")}</div>
  </div>
  <div class="field">
    <div class="label">Mitigation</div>
    <div class="value">${escapeHtml(risk.mitigation || "Not specified")}</div>
  </div>
  <div class="field">
    <div class="label">Created</div>
    <div class="value">${new Date(risk.createdAt).toLocaleDateString()}</div>
  </div>
  ${risk.resolvedAt ? `<div class="field"><div class="label">Resolved</div><div class="value">${new Date(risk.resolvedAt).toLocaleDateString()}</div></div>` : ""}
</body>
</html>`;
  }
}
