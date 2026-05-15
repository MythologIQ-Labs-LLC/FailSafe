/**
 * L3ApprovalPanel - Human-in-the-Loop Approval Queue
 *
 * Review and approve/reject L3 (Critical) items
 */

import * as vscode from 'vscode';
import { EventBus } from '../../shared/EventBus';
import { QorLogicManager } from '../../qorelogic/QorLogicManager';
import { L3ApprovalRequest } from '../../shared/types';
import { escapeHtml, escapeJsString, getNonce } from '../../shared/utils/htmlSanitizer';

export class L3ApprovalPanel {
    public static currentPanel: L3ApprovalPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private qorelogic: QorLogicManager;
    private eventBus: EventBus;
    private disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        qorelogic: QorLogicManager,
        eventBus: EventBus
    ) {
        this.panel = panel;
        this.qorelogic = qorelogic;
        this.eventBus = eventBus;

        this.update();

        // Handle messages
        this.panel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'approve':
                    await this.handleApproval(message.id, 'APPROVED');
                    break;
                case 'reject':
                    await this.handleApproval(message.id, 'REJECTED');
                    break;
                case 'viewFile':
                    vscode.workspace.openTextDocument(message.file).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                    break;
            }
        }, null, this.disposables);

        // Subscribe to queue updates
        const unsub = this.eventBus.on('qorelogic.l3Queued', () => this.update());
        this.disposables.push({ dispose: unsub });

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        qorelogic: QorLogicManager,
        eventBus: EventBus
    ): L3ApprovalPanel {
        if (L3ApprovalPanel.currentPanel) {
            L3ApprovalPanel.currentPanel.panel.reveal();
            return L3ApprovalPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'failsafe.l3Approval',
            'L3 Approval Queue',
            vscode.ViewColumn.One,
            { enableScripts: true, localResourceRoots: [extensionUri] }
        );

        L3ApprovalPanel.currentPanel = new L3ApprovalPanel(panel, qorelogic, eventBus);
        return L3ApprovalPanel.currentPanel;
    }

    public reveal(): void {
        this.panel.reveal();
    }

    private async handleApproval(id: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
        try {
            await this.qorelogic.processL3Decision(id, decision);
            vscode.window.showInformationMessage(`L3 request ${decision.toLowerCase()}`);
            this.update();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process decision: ${error}`);
        }
    }

    private update(): void {
        const queue = this.qorelogic.getL3Queue();
        this.panel.webview.html = this.getHtmlContent(queue);
    }

    private getHtmlContent(queue: L3ApprovalRequest[]): string {
        const nonce = getNonce();
        const cspSource = this.panel.webview.cspSource;

        return `<!DOCTYPE html>
<html>
<head>
    <title>L3 Approval Queue</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        body {
            margin: 0;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
        }
        h1 { font-size: 18px; margin-bottom: 8px; }
        .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
        .empty {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .item {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
        }
        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }
        .item-title { font-weight: 600; font-size: 14px; }
        .item-risk {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            background: #f56565;
            color: white;
        }
        .item-meta {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
        }
        .item-summary {
            font-size: 12px;
            padding: 8px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
            margin-bottom: 12px;
        }
        .item-flags {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 12px;
        }
        .flag {
            padding: 2px 6px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            font-size: 10px;
        }
        .item-actions {
            display: flex;
            gap: 8px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        .btn-approve { background: #238636; color: white; }
        .btn-approve:hover { background: #2ea043; }
        .btn-reject { background: #da3633; color: white; }
        .btn-reject:hover { background: #f85149; }
        .btn-view { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .btn-view:hover { background: var(--vscode-button-secondaryHoverBackground); }
    </style>
</head>
<body>
    <h1>L3 Approval Queue</h1>
    <p class="subtitle">Review and approve critical changes requiring human oversight</p>

    ${queue.length === 0 ? `
        <div class="empty">
            <p>No pending approvals</p>
            <p style="font-size: 12px;">L3 (Critical) items will appear here when detected</p>
        </div>
    ` : queue.map(item => `
        <div class="item">
            <div class="item-header">
                <div class="item-title">${escapeHtml(item.filePath.split(/[/\\]/).pop())}</div>
                <span class="item-risk">${escapeHtml(item.riskGrade)}</span>
            </div>
            <div class="item-meta">
                Agent: ${escapeHtml(item.agentDid.substring(0, 25))}... | Trust: ${(item.agentTrust * 100).toFixed(0)}%<br>
                Queued: ${escapeHtml(new Date(item.queuedAt).toLocaleString())}
            </div>
            <div class="item-summary">${escapeHtml(item.sentinelSummary)}</div>
            ${item.flags.length > 0 ? `
                <div class="item-flags">
                    ${item.flags.map(f => `<span class="flag">${escapeHtml(f)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="item-actions">
                <button class="btn-approve" onclick="approve('${escapeJsString(item.id)}')">Approve</button>
                <button class="btn-reject" onclick="reject('${escapeJsString(item.id)}')">Reject</button>
                <button class="btn-view" onclick="viewFile('${escapeJsString(item.filePath)}')">View File</button>
            </div>
        </div>
    `).join('')}

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        function approve(id) { vscode.postMessage({ command: 'approve', id }); }
        function reject(id) { vscode.postMessage({ command: 'reject', id }); }
        function viewFile(file) { vscode.postMessage({ command: 'viewFile', file }); }
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        L3ApprovalPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
