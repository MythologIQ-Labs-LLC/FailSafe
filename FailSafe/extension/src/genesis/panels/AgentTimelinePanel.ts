/**
 * AgentTimelinePanel - Agent Activity Timeline
 *
 * Singleton webview panel displaying a filterable, vertical timeline
 * of agent events (verdicts, trust changes, approvals, DiffGuard).
 */

import * as vscode from 'vscode';
import { EventBus } from '../../shared/EventBus';
import { AgentTimelineService, TimelineEntry, TimelineFilter } from '../../sentinel/AgentTimelineService';
import { TransparencyLogger } from '../../roadmap/services/TransparencyLogger';
import { escapeHtml, escapeJsString, getNonce } from '../../shared/utils/htmlSanitizer';

const MAX_RENDERED = 200;

const SEVERITY_COLORS: Record<TimelineEntry['severity'], string> = {
    success: 'var(--vscode-charts-green)',
    warning: 'var(--vscode-charts-yellow)',
    error: 'var(--vscode-errorForeground)',
    info: 'var(--vscode-foreground)',
};

const CATEGORY_LABELS: Record<string, string> = {
    all: 'All',
    verdict: 'Verdicts',
    trust: 'Trust',
    approval: 'Approvals',
    diffguard: 'DiffGuard',
    imported: 'Imported',
};

export class AgentTimelinePanel {
    public static currentPanel: AgentTimelinePanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly eventBus: EventBus;
    private readonly timelineService: AgentTimelineService;
    private disposables: vscode.Disposable[] = [];
    private currentFilter: TimelineFilter = {};

    private constructor(
        panel: vscode.WebviewPanel,
        eventBus: EventBus,
        timelineService: AgentTimelineService
    ) {
        this.panel = panel;
        this.eventBus = eventBus;
        this.timelineService = timelineService;

        this.update();
        this.registerMessageHandler();

        const unsub = this.eventBus.on('timeline.entryAdded', () => this.update());
        this.disposables.push({ dispose: unsub });

        this.panel.onDidDispose(() => {
            AgentTimelinePanel.currentPanel = undefined;
            this.disposables.forEach(d => d.dispose());
        });
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        eventBus: EventBus,
        timelineService: AgentTimelineService
    ): AgentTimelinePanel {
        if (AgentTimelinePanel.currentPanel) {
            AgentTimelinePanel.currentPanel.panel.reveal();
            return AgentTimelinePanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'failsafe.agentTimeline',
            'Agent Timeline',
            vscode.ViewColumn.One,
            { enableScripts: true, localResourceRoots: [extensionUri] }
        );

        AgentTimelinePanel.currentPanel = new AgentTimelinePanel(panel, eventBus, timelineService);
        return AgentTimelinePanel.currentPanel;
    }

    public reveal(): void {
        this.panel.reveal();
    }

    private registerMessageHandler(): void {
        this.panel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'filter':
                    this.currentFilter = {
                        categories: message.categories,
                        severity: message.severity,
                    };
                    this.update();
                    break;
                case 'viewFile':
                    await this.openFile(message.path);
                    break;
                case 'refresh':
                    this.update();
                    break;
            }
        }, null, this.disposables);
    }

    private async openFile(filePath: string): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
        } catch {
            vscode.window.showErrorMessage(`Cannot open file: ${filePath}`);
        }
    }

    private update(): void {
        const live = this.timelineService.getEntries(this.currentFilter);
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const imported: TimelineEntry[] = root
            ? new TransparencyLogger(root).getEvents(MAX_RENDERED).filter(e => e.type === 'agent.observation.imported' && e.source === 'openhands').map(e => ({
                id: String(e.importKey ?? ''),
                timestamp: typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp)) ? e.timestamp : new Date(0).toISOString(),
                category: 'imported' as const,
                title: 'OpenHands historical import',
                detail: String(e.summary ?? '') + ' (imported evidence, not live enforcement)',
                icon: 'archive',
                severity: e.severity === 'high' ? 'warning' as const : 'info' as const,
            }))
            : [];
        const matching = imported.filter(e =>
            (!this.currentFilter.categories?.length || this.currentFilter.categories.includes(e.category)) &&
            (!this.currentFilter.severity?.length || this.currentFilter.severity.includes(e.severity)) &&
            (!this.currentFilter.since || e.timestamp >= this.currentFilter.since));
        const entries = [...live, ...matching].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, MAX_RENDERED);
        this.panel.webview.html = this.getHtmlContent(entries);
    }

    private renderFilterBar(): string {
        const cats = Object.entries(CATEGORY_LABELS).map(([key, label]) =>
            `<button class="tab ${key === 'all' ? 'active' : ''}" data-category="${escapeHtml(key)}">${escapeHtml(label)}</button>`
        ).join('');
        const sevs = (['info', 'success', 'warning', 'error'] as const).map(s =>
            `<button class="severity-btn active" data-severity="${s}" style="--sev-color:${SEVERITY_COLORS[s]}">${s}</button>`
        ).join('');
        return `<div class="filter-bar">
        <div class="category-tabs">${cats}</div>
        <div class="severity-toggles">${sevs}</div>
    </div>`;
    }

    private renderEntry(entry: TimelineEntry): string {
        const id = escapeJsString(entry.id);
        const fileBtn = entry.artifactPath
            ? `<button class="file-link" onclick="viewFile(event, '${escapeJsString(entry.artifactPath)}')">Open file</button>`
            : '';
        return `<div class="timeline-item severity-${entry.severity}" data-id="${escapeHtml(entry.id)}" onclick="toggleDetail('${id}')">
        <span class="icon codicon codicon-${escapeHtml(entry.icon)}"></span>
        <span class="timestamp" title="${escapeHtml(entry.timestamp)}">${escapeHtml(formatRelativeTime(entry.timestamp))}</span>
        <span class="title">${escapeHtml(entry.title)}</span>
        <div class="detail hidden" id="detail-${escapeHtml(entry.id)}">
            <p>${escapeHtml(entry.detail) || 'No additional details.'}</p>${fileBtn}
        </div>
    </div>`;
    }

    private renderTimeline(entries: TimelineEntry[]): string {
        if (entries.length === 0) {
            return `<div class="empty"><p>No events recorded yet.</p>
        <p class="empty-sub">Activity will appear here as agents interact with your workspace.</p></div>`;
        }
        return `<div class="timeline">${entries.map(e => this.renderEntry(e)).join('')}</div>`;
    }

    private getHtmlContent(entries: TimelineEntry[]): string {
        const nonce = getNonce();
        const cspSource = this.panel.webview.cspSource;

        return `<!DOCTYPE html>
<html>
<head>
    <title>Agent Timeline</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        body { margin:0; padding:16px; background:var(--vscode-editor-background); color:var(--vscode-foreground); font-family:var(--vscode-font-family); font-size:13px; }
        h1 { font-size:18px; margin:0 0 12px; }
        .filter-bar { margin-bottom:16px; }
        .category-tabs, .severity-toggles { display:flex; gap:4px; flex-wrap:wrap; }
        .category-tabs { margin-bottom:8px; }
        .tab { padding:4px 12px; border:1px solid var(--vscode-panel-border); border-radius:4px; background:transparent; color:var(--vscode-foreground); cursor:pointer; font-size:12px; }
        .tab.active { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border-color:var(--vscode-button-background); }
        .severity-btn { padding:4px 10px; border:1px solid var(--sev-color); border-radius:4px; background:transparent; color:var(--sev-color); cursor:pointer; font-size:11px; text-transform:uppercase; font-weight:600; }
        .severity-btn.active { background:var(--sev-color); color:var(--vscode-editor-background); }
        .timeline { border-left:2px solid var(--vscode-panel-border); margin-left:8px; }
        .timeline-item { position:relative; padding:8px 12px 8px 20px; cursor:pointer; border-bottom:1px solid var(--vscode-panel-border); }
        .timeline-item:hover { background:var(--vscode-list-hoverBackground); }
        .timeline-item::before { content:''; position:absolute; left:-7px; top:14px; width:10px; height:10px; border-radius:50%; border:2px solid var(--vscode-editor-background); }
        .severity-success::before { background:var(--vscode-charts-green); }
        .severity-warning::before { background:var(--vscode-charts-yellow); }
        .severity-error::before { background:var(--vscode-errorForeground); }
        .severity-info::before { background:var(--vscode-charts-orange); }
        .icon { margin-right:6px; }
        .timestamp { color:var(--vscode-descriptionForeground); font-size:11px; margin-right:8px; }
        .title { font-weight:500; }
        .detail { margin-top:6px; padding:8px; background:var(--vscode-textBlockQuote-background); border-radius:4px; font-size:12px; color:var(--vscode-descriptionForeground); }
        .detail p { margin:0 0 4px; }
        .hidden { display:none; }
        .empty { text-align:center; padding:40px 20px; color:var(--vscode-descriptionForeground); }
        .empty-sub { font-size:12px; }
        .file-link { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); border:none; border-radius:3px; padding:3px 8px; cursor:pointer; font-size:11px; }
        .file-link:hover { background:var(--vscode-button-secondaryHoverBackground); }
    </style>
</head>
<body>
    <h1>Agent Timeline</h1>
    ${this.renderFilterBar()}
    ${this.renderTimeline(entries)}
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let activeCategory = 'all';
        const activeSeverities = new Set(['info', 'success', 'warning', 'error']);
        document.querySelectorAll('.tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.dataset.category;
                sendFilter();
            });
        });
        document.querySelectorAll('.severity-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sev = btn.dataset.severity;
                activeSeverities.has(sev) ? activeSeverities.delete(sev) : activeSeverities.add(sev);
                btn.classList.toggle('active');
                sendFilter();
            });
        });
        function sendFilter() {
            const cats = activeCategory === 'all' ? [] : [activeCategory];
            vscode.postMessage({ command: 'filter', categories: cats, severity: Array.from(activeSeverities) });
        }
        function toggleDetail(id) {
            const el = document.getElementById('detail-' + id);
            if (el) { el.classList.toggle('hidden'); }
        }
        function viewFile(e, path) {
            e.stopPropagation();
            vscode.postMessage({ command: 'viewFile', path: path });
        }
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        AgentTimelinePanel.currentPanel = undefined;
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}

function formatRelativeTime(iso: string): string {
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
