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
import { AFFECTED_DEFAULT_LINES, describeAffectedArchitecture } from '../../governance/architecture/affectedArchitecture';
import { readArchitectureIndexPath } from '../../extension/architectureIndexCommand';

export { formatPreflightConflicts } from './l3ApprovalHtml';

/** B311: affected-architecture lines for the queued files, keyed by path (one call per render). */
export type L3ArchitectureDescribe = (paths: string[]) => Promise<{ byPath: Record<string, string[]> }>;

/** The default: the first workspace folder's index (async reads, a time budget). */
const workspaceDescribe: L3ArchitectureDescribe = (paths) => describeAffectedArchitecture({
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, indexPathSetting: readArchitectureIndexPath(),
}, paths);

export class L3ApprovalPanel {
    public static currentPanel: L3ApprovalPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private qorelogic: QorLogicManager;
    private eventBus: EventBus;
    private disposables: vscode.Disposable[] = [];
    private readonly describeArchitecture: L3ArchitectureDescribe;
    /** B311: bumped by every update, so a describe result for an older queue is dropped. */
    private generation = 0;
    private disposed = false;

    private constructor(
        panel: vscode.WebviewPanel,
        qorelogic: QorLogicManager,
        eventBus: EventBus,
        describeArchitecture: L3ArchitectureDescribe = workspaceDescribe,
    ) {
        this.panel = panel;
        this.qorelogic = qorelogic;
        this.eventBus = eventBus;
        this.describeArchitecture = describeArchitecture;

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
        eventBus: EventBus,
        describeArchitecture?: L3ArchitectureDescribe,
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

        L3ApprovalPanel.currentPanel = new L3ApprovalPanel(panel, qorelogic, eventBus, describeArchitecture);
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

    /**
     * Render the queue at once, then (B311) once more with the warn-only affected-architecture
     * lines from one describe call, if the panel is still open and no later update ran. A throw,
     * a timeout or a stale result leaves the first render.
     */
    private update(): void {
        const queue = this.qorelogic.getL3Queue();
        const generation = ++this.generation;
        this.panel.webview.html = this.getHtmlContent(queue);
        if (queue.length === 0) return;
        let pending: Promise<{ byPath: Record<string, string[]> }>;
        try {
            pending = this.describeArchitecture([...new Set(queue.map((item) => item.filePath))]);
        } catch {
            return;
        }
        void Promise.resolve(pending).then((d) => {
            if (this.disposed || generation !== this.generation) return;
            const architecture: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
            let any = false;
            for (const item of queue) {
                const lines = d?.byPath && Object.prototype.hasOwnProperty.call(d.byPath, item.filePath) ? d.byPath[item.filePath] : undefined;
                if (!Array.isArray(lines) || lines.length === 0) continue;
                architecture[item.id] = lines.length > AFFECTED_DEFAULT_LINES
                    ? [...lines.slice(0, AFFECTED_DEFAULT_LINES), `and ${lines.length - AFFECTED_DEFAULT_LINES} more`] : lines;
                any = true;
            }
            if (any) this.panel.webview.html = this.getHtmlContent(queue, architecture);
        }).catch(() => undefined); // a rejecting describe or a failed render leaves the first render
    }

    private getHtmlContent(queue: L3ApprovalRequest[], architecture?: Record<string, string[]>): string {
        return buildL3ApprovalHtml(queue, { nonce: getNonce(), cspSource: this.panel.webview.cspSource, architecture });
    }

    public dispose(): void {
        this.disposed = true;
        L3ApprovalPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
