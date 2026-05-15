import {
  L3ApprovalRequest,
  SentinelStatus,
  SentinelVerdict,
} from "../../../shared/types";
import { Plan } from "../../../qorelogic/planning/types";
import { escapeHtml } from "../../../shared/utils/htmlSanitizer";
import { HELP_TEXT } from "../../../shared/components/InfoHint";
import {
  tooltipAttrs,
  TOOLTIP_STYLES,
} from "../../../shared/components/Tooltip";
import { renderRoadmapCard } from "./DashboardRoadmapCard";

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

type TrustSummary = {
  totalAgents: number;
  avgTrust: number;
  quarantined: number;
  stageCounts: { CBT: number; KBT: number; IBT: number };
};

export type DashboardViewModel = {
  nonce: string;
  cspSource: string;
  status: SentinelStatus;
  l3Queue: L3ApprovalRequest[];
  trustSummary: TrustSummary;
  lastVerdict: SentinelVerdict | null;
  uptime: string;
  metrics: EvaluationMetrics | null;
  plan: Plan | null;
  planProgress: { completed: number; total: number; blocked: boolean } | null;
};

const DASHBOARD_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
    <title>FailSafe Dashboard</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{CSP_SOURCE}} 'nonce-{{NONCE}}'; script-src 'nonce-{{NONCE}}';">
    <style nonce="{{NONCE}}">
        * { box-sizing: border-box; }
        :root { --card-bg: var(--vscode-editorWidget-background); --card-border: var(--vscode-editorWidget-border); --text: var(--vscode-foreground); --muted: var(--vscode-descriptionForeground); --badge-bg: var(--vscode-badge-background); --badge-fg: var(--vscode-badge-foreground); --accent: var(--vscode-charts-blue); --success: var(--vscode-charts-green); --warning: var(--vscode-charts-orange); --error: var(--vscode-charts-red); }
        body { margin: 0; padding: 20px; background: var(--vscode-editor-background); color: var(--text); font-family: var(--vscode-font-family); min-height: 100vh; }
        {{TOOLTIP_STYLES}}
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .title { font-size: 24px; font-weight: 600; color: var(--text); }
        .subtitle { font-size: 12px; color: var(--muted); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px; }
        .card-title { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
        .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border); }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: var(--muted); }
        .metric-value { font-weight: 600; color: var(--text); }
        .status-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
        .status-active { background: var(--success); color: #fff; }
        .status-warning { background: var(--warning); color: #fff; }
        .status-error { background: var(--error); color: #fff; }
        .l3-item { padding: 8px; margin: 4px 0; background: var(--vscode-list-inactiveSelectionBackground); border-radius: 4px; font-size: 12px; border: 1px solid var(--vscode-panel-border); }
        .trust-bar { height: 6px; background: var(--vscode-progressBar-background); border-radius: 4px; overflow: hidden; margin-top: 6px; }
        .trust-fill { height: 100%; background: var(--success); }
        .action-btn { width: 100%; padding: 10px; margin-top: 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
        .action-btn:hover { background: var(--vscode-button-hoverBackground); }
        .action-btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); }
        .action-btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">FailSafe</div>
            <div class="subtitle">feat. QorLogic | Governance Dashboard | UI-05 Dashboard</div>
        </div>
        <span class="status-badge {{STATUS_BADGE_CLASS}}">{{STATUS_LABEL}}</span>
    </div>

    <div class="grid">
        {{CARDS}}
    </div>

    <script nonce="{{NONCE}}">
        const vscode = acquireVsCodeApi();
        function auditFile() { vscode.postMessage({ command: 'auditFile' }); }
        function showGraph() { vscode.postMessage({ command: 'showGraph' }); }
        function showLedger() { vscode.postMessage({ command: 'showLedger' }); }
        function focusCortex() { vscode.postMessage({ command: 'focusCortex' }); }
        function showL3Queue() { vscode.postMessage({ command: 'showL3Queue' }); }
        function showPlanningHub() { vscode.postMessage({ command: 'showPlanningHub' }); }
        function openRoadmap() { vscode.postMessage({ command: 'openRoadmap' }); }
    </script>
</body>
</html>`;

const applyTemplate = (
  template: string,
  tokens: Record<string, string>,
): string => {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.split(key).join(value),
    template,
  );
};

function renderSentinelCard(model: DashboardViewModel): string {
  const status = model.status;
  const lastVerdict = model.lastVerdict;
  const verdictLabel = lastVerdict
    ? `${escapeHtml(lastVerdict.decision)} (${escapeHtml(lastVerdict.riskGrade)})`
    : "None";
  return `<div class="card"><div class="card-title">Sentinel Status</div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.sentinelMode)}>Mode</span><span class="metric-value">${escapeHtml(status.mode)}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.operationalMode)}>Operational Mode</span><span class="metric-value">${escapeHtml(status.operationalMode.toUpperCase())}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.uptime)}>Uptime</span><span class="metric-value">${escapeHtml(model.uptime)}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.filesWatched)}>Files Watched</span><span class="metric-value">${status.filesWatched}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.eventsProcessed)}>Events Processed</span><span class="metric-value">${status.eventsProcessed}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.queueDepth)}>Queue Depth</span><span class="metric-value">${status.queueDepth}</span></div><div class="metric"><span class="metric-label">LLM Available</span><span class="metric-value">${status.llmAvailable ? "Yes" : "No"}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.verdictDecision)}>Last Verdict</span><span class="metric-value">${verdictLabel}</span></div></div>`;
}

function renderTrustCard(model: DashboardViewModel): string {
  const trust = model.trustSummary;
  const trustPercent = (trust.avgTrust * 100).toFixed(0);
  return `<div class="card"><div class="card-title">Qor-Logic Trust</div><div class="metric"><span class="metric-label">Agents</span><span class="metric-value">${trust.totalAgents}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.avgTrust)}>Avg trust</span><span class="metric-value">${trustPercent}%</span></div><div class="trust-bar"><div class="trust-fill" style="width: ${trustPercent}%"></div></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.quarantined)}>Quarantined</span><span class="metric-value">${trust.quarantined}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.trustStages)}>Stages (CBT/KBT/IBT)</span><span class="metric-value">${trust.stageCounts.CBT}/${trust.stageCounts.KBT}/${trust.stageCounts.IBT}</span></div></div>`;
}

function renderL3Card(model: DashboardViewModel): string {
  const queueItems =
    model.l3Queue.length === 0
      ? '<div style="color: var(--vscode-descriptionForeground); font-style: italic;">No pending approvals</div>'
      : model.l3Queue
          .slice(0, 5)
          .map(
            (item) =>
              `\n                    <div class="l3-item">\n                        <strong>${escapeHtml(item.filePath.split(/[/\\]/).pop())}</strong><br>\n                        <span style="color: var(--vscode-descriptionForeground); font-size: 10px;">\n                            Risk: ${escapeHtml(item.riskGrade)} | Agent Trust: ${(item.agentTrust * 100).toFixed(0)}%\n                        </span>\n                    </div>\n                `,
          )
          .join("");
  const actionButton =
    model.l3Queue.length > 0
      ? '<button class="action-btn" onclick="showL3Queue()">Review Queue</button>'
      : "";
  return `<div class="card"><div class="card-title" ${tooltipAttrs(HELP_TEXT.l3Queue)}>L3 Approval Queue (${model.l3Queue.length})</div>${queueItems}${actionButton}</div>`;
}

function renderActionsCard(): string {
  return `<div class="card"><div class="card-title">Quick Actions</div><button class="action-btn secondary" onclick="auditFile()">Audit Current File</button><button class="action-btn secondary" onclick="showGraph()">Open Living Graph</button><button class="action-btn secondary" onclick="showLedger()">View SOA Ledger</button><button class="action-btn secondary" onclick="focusCortex()">Cortex Query</button></div>`;
}


function renderMetricsCard(model: DashboardViewModel): string {
  const novelty = model.metrics?.noveltyAccuracy;
  const cache = model.metrics?.cache;
  const cacheSizes = model.metrics?.cacheSizes;
  const noveltyLabel = novelty
    ? `${novelty.lowCount}/${novelty.mediumCount}/${novelty.highCount}`
    : "N/A";
  const confidenceLabel = novelty
    ? `${(novelty.averageConfidence * 100).toFixed(0)}%`
    : "N/A";
  const cacheHits = cache
    ? `${cache.fingerprint?.hits ?? 0}/${cache.novelty?.hits ?? 0}`
    : "N/A";
  const cacheMisses = cache
    ? `${cache.fingerprint?.misses ?? 0}/${cache.novelty?.misses ?? 0}`
    : "N/A";
  const cacheSizesLabel = cacheSizes
    ? `${cacheSizes.fingerprint}/${cacheSizes.novelty}`
    : "N/A";
  return `<div class="card"><div class="card-title">Evaluation Metrics</div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.noveltyLevels)}>Novelty (L/M/H)</span><span class="metric-value">${noveltyLabel}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.avgConfidence)}>Avg Confidence</span><span class="metric-value">${confidenceLabel}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.cacheHits)}>Cache Hits (fp/novelty)</span><span class="metric-value">${cacheHits}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.cacheMisses)}>Cache Misses (fp/novelty)</span><span class="metric-value">${cacheMisses}</span></div><div class="metric"><span class="metric-label" ${tooltipAttrs(HELP_TEXT.cacheSizes)}>Cache Sizes (fp/novelty)</span><span class="metric-value">${cacheSizesLabel}</span></div></div>`;
}

export function renderDashboardTemplate(model: DashboardViewModel): string {
  const statusBadgeClass = model.status.running
    ? "status-active"
    : "status-error";
  const statusLabel = model.status.running ? "ACTIVE" : "STOPPED";
  const cards = [
    renderSentinelCard(model),
    renderTrustCard(model),
    renderRoadmapCard(model.plan, model.planProgress),
    renderL3Card(model),
    renderActionsCard(),
    renderMetricsCard(model),
  ].join("");
  const tokens = {
    "{{CSP_SOURCE}}": model.cspSource,
    "{{NONCE}}": model.nonce,
    "{{TOOLTIP_STYLES}}": TOOLTIP_STYLES,
    "{{STATUS_BADGE_CLASS}}": statusBadgeClass,
    "{{STATUS_LABEL}}": statusLabel,
    "{{CARDS}}": cards,
  };
  return applyTemplate(DASHBOARD_TEMPLATE, tokens);
}
