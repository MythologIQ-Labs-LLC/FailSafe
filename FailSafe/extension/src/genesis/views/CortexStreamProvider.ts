/**
 * CortexStreamProvider - Real-time Event Log Sidebar View
 *
 * Displays chronological stream of events from:
 * - Sentinel (verdicts, scans)
 * - QorLogic (trust updates, ledger entries)
 * - Genesis (graph updates, wizard events)
 * - User (queries, approvals)
 * - System (startup, config changes)
 *
 * UX Enhancements:
 * - Smooth animations for new events
 * - Category-based filtering
 * - Event search functionality
 * - Visual density indicators
 * - Keyboard shortcuts
 * - Hover effects and transitions
 * - Event grouping by time
 */

import * as vscode from 'vscode';
import { EventBus } from '../../shared/EventBus';
import { CortexStreamEvent, L3ApprovalRequest, SentinelVerdict, TrustUpdate } from '../../shared/types';
import { getNonce } from '../../shared/utils/htmlSanitizer';
import { renderCortexStreamTemplate } from './templates/CortexStreamTemplate';

const isSentinelVerdict = (payload: unknown): payload is SentinelVerdict => {
    if (!payload || typeof payload !== 'object') return false;
    return typeof (payload as SentinelVerdict).id === 'string';
};

const isTrustUpdate = (payload: unknown): payload is TrustUpdate => {
    if (!payload || typeof payload !== 'object') return false;
    return typeof (payload as TrustUpdate).did === 'string';
};

const isL3ApprovalRequest = (payload: unknown): payload is L3ApprovalRequest => {
    if (!payload || typeof payload !== 'object') return false;
    return typeof (payload as L3ApprovalRequest).id === 'string';
};

export class CortexStreamProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;
    private eventBus: EventBus;
    private events: CortexStreamEvent[] = [];
    private maxEvents = 100;
    private activeFilter: 'all' | 'sentinel' | 'qorelogic' | 'genesis' | 'user' | 'system' = 'all';
    private searchTerm = '';
    private eventCounts: Record<string, number> = {
        all: 0,
        sentinel: 0,
        qorelogic: 0,
        genesis: 0,
        user: 0,
        system: 0
    };

    constructor(extensionUri: vscode.Uri, eventBus: EventBus) {
        this.extensionUri = extensionUri;
        this.eventBus = eventBus;

        // Subscribe to all stream events
        this.eventBus.on('genesis.streamEvent', (event) => {
            this.addEvent(event.payload as CortexStreamEvent);
        });

        // Also capture sentinel verdicts
        this.eventBus.on('sentinel.verdict', (event) => {
            if (!isSentinelVerdict(event.payload)) return;
            const verdict = event.payload;
            this.addEvent({
                id: verdict.id,
                timestamp: verdict.timestamp,
                category: 'sentinel',
                severity: this.getVerdictSeverity(verdict.decision),
                title: `${verdict.decision}: ${verdict.artifactPath?.split('/').pop() || 'Unknown'}`,
                details: verdict.summary,
                relatedFile: verdict.artifactPath
            });
        });

        // Capture trust updates
        this.eventBus.on('qorelogic.trustUpdate', (event) => {
            if (!isTrustUpdate(event.payload)) return;
            const update = event.payload;
            this.addEvent({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                category: 'qorelogic',
                severity: 'info',
                title: `Trust Updated: ${update.did?.substring(0, 15)}...`,
                details: `${(update.previousScore * 100).toFixed(0)}% -> ${(update.newScore * 100).toFixed(0)}%`,
                relatedAgent: update.did
            });
        });

        // Capture L3 queue events
        this.eventBus.on('qorelogic.l3Queued', (event) => {
            if (!isL3ApprovalRequest(event.payload)) return;
            const request = event.payload;
            this.addEvent({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                category: 'sentinel',
                severity: 'warn',
                title: 'L3 Approval Required',
                details: request.filePath,
                relatedFile: request.filePath,
                actions: [
                    { label: 'Review', command: 'failsafe.approveL3', args: [] }
                ]
            });
        });
    }

    private addEvent(event: CortexStreamEvent): void {
        this.events.unshift(event);
        if (this.events.length > this.maxEvents) {
            this.events.pop();
        }
        this.updateEventCounts();
        this.refresh();
    }

    private updateEventCounts(): void {
        this.eventCounts.all = this.events.length;
        this.eventCounts.sentinel = this.events.filter(e => e.category === 'sentinel').length;
        this.eventCounts.qorelogic = this.events.filter(e => e.category === 'qorelogic').length;
        this.eventCounts.genesis = this.events.filter(e => e.category === 'genesis').length;
        this.eventCounts.user = this.events.filter(e => e.category === 'user').length;
        this.eventCounts.system = this.events.filter(e => e.category === 'system').length;
    }

    private getFilteredEvents(): CortexStreamEvent[] {
        let filtered = this.events;

        // Apply category filter
        if (this.activeFilter !== 'all') {
            filtered = filtered.filter(e => e.category === this.activeFilter);
        }

        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(e =>
                e.title.toLowerCase().includes(term) ||
                (e.details && e.details.toLowerCase().includes(term))
            );
        }

        return filtered;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'openFailSafeUi') {
                void this.openFailSafeUi();
            } else if (message.command === 'executeAction') {
                vscode.commands.executeCommand(message.action, ...(message.args || []));
            } else if (message.command === 'openFile') {
                vscode.workspace.openTextDocument(message.file).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            } else if (message.command === 'clearStream') {
                this.events = [];
                this.updateEventCounts();
                this.refresh();
            } else if (message.command === 'setFilter') {
                this.activeFilter = message.filter;
                this.refresh();
            } else if (message.command === 'setSearch') {
                this.searchTerm = message.search;
                this.refresh();
            }
        });
    }

    private refresh(): void {
        if (this.view) {
            this.view.webview.html = this.getHtmlContent();
        }
    }

    private getHtmlContent(): string {
        const nonce = getNonce();
        const cspSource = this.view?.webview.cspSource || '';
        const events = this.getFilteredEvents().map(event => ({
            ...event,
            displayTime: this.formatTime(event.timestamp)
        }));

        return renderCortexStreamTemplate({
            nonce,
            cspSource,
            activeFilter: this.activeFilter,
            searchTerm: this.searchTerm,
            eventCounts: this.eventCounts,
            events
        });
    }
    private getVerdictSeverity(decision: SentinelVerdict['decision']): CortexStreamEvent['severity'] {
        switch (decision) {
            case 'PASS':
                return 'info';
            case 'WARN':
                return 'warn';
            default:
                return 'error';
        }
    }

    private formatTime(isoString: string): string {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    private async openFailSafeUi(): Promise<void> {
        try {
            await vscode.commands.executeCommand('failsafe.openPlannerHub');
        } catch {
            try {
                await vscode.commands.executeCommand('failsafe.showRoadmapWindow');
            } catch {
                vscode.window.showErrorMessage('Unable to open FailSafe UI. Run "FailSafe: Open FailSafe UI" from Command Palette.');
            }
        }
    }
}
