/**
 * L3ApprovalPanel - Human-in-the-Loop Approval Queue
 *
 * Review and approve/reject L3 (Critical) items
 */

import * as vscode from 'vscode';
import { EventBus } from '../../shared/EventBus';
import { QorLogicManager } from '../../qorelogic/QorLogicManager';
import { L3ApprovalRequest } from '../../shared/types';
import { getNonce } from '../../shared/utils/htmlSanitizer';
import { buildL3ApprovalHtml } from './l3ApprovalHtml';

export { formatPreflightConflicts } from './l3ApprovalHtml';

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
            // #538 (#514 residual): a click in this webview panel, inside VS Code.
            await this.qorelogic.processL3Decision(id, decision, { method: 'vscode-webview', channel: 'vscode:l3-approval-panel' });
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
        return buildL3ApprovalHtml(queue, { nonce: getNonce(), cspSource: this.panel.webview.cspSource });
    }

    public dispose(): void {
        L3ApprovalPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
