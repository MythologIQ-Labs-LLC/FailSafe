/**
 * ShadowGenomePanel - Failure Pattern Viewer
 *
 * Singleton webview showing Shadow Genome failure patterns,
 * unresolved entries, and negative constraints.
 */

import * as vscode from 'vscode';
import { EventBus } from '../../shared/EventBus';
import { ShadowGenomeManager, FailurePattern, ShadowGenomeAvailability } from '../../qorelogic/shadow/ShadowGenomeManager';
import { ShadowGenomeEntry, RemediationStatus } from '../../shared/types';
import { getNonce, escapeHtml } from '../../shared/utils/htmlSanitizer';
import {
    renderPatternCards,
    renderEntriesTable,
    renderConstraints,
    getStyles,
    getScript
} from './ShadowGenomePanelHelpers';

export class ShadowGenomePanel {
    public static currentPanel: ShadowGenomePanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private eventBus: EventBus;
    private manager: ShadowGenomeManager;
    private disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        eventBus: EventBus,
        manager: ShadowGenomeManager
    ) {
        this.panel = panel;
        this.eventBus = eventBus;
        this.manager = manager;

        this.update();
        this.registerMessageHandler();

        const unsub = this.eventBus.on('genome.failureArchived', () => this.update());
        this.disposables.push({ dispose: unsub });
        this.panel.onDidDispose(() => {
            ShadowGenomePanel.currentPanel = undefined;
            this.disposables.forEach(d => d.dispose());
        });
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        eventBus: EventBus,
        shadowGenomeManager: ShadowGenomeManager
    ): ShadowGenomePanel {
        if (ShadowGenomePanel.currentPanel) {
            ShadowGenomePanel.currentPanel.panel.reveal();
            return ShadowGenomePanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'failsafe.shadowGenome',
            'Shadow Genome',
            vscode.ViewColumn.One,
            { enableScripts: true, localResourceRoots: [extensionUri] }
        );

        ShadowGenomePanel.currentPanel = new ShadowGenomePanel(panel, eventBus, shadowGenomeManager);
        return ShadowGenomePanel.currentPanel;
    }

    public reveal(): void {
        this.panel.reveal();
    }

    private registerMessageHandler(): void {
        this.panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'updateStatus':
                    await this.handleStatusUpdate(msg.entryId, msg.status, msg.notes);
                    break;
                case 'refresh':
                    await this.update();
                    break;
            }
        }, null, this.disposables);
    }

    private async handleStatusUpdate(
        entryId: number,
        status: string,
        notes: string
    ): Promise<void> {
        try {
            await this.manager.updateRemediationStatus(
                entryId,
                status as RemediationStatus,
                notes || undefined
            );
            await this.update();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to update status: ${message}`);
        }
    }

    private async update(): Promise<void> {
        const availability = this.manager.getAvailability();
        if (!availability.available) {
            this.panel.webview.html = this.buildUnavailableHtml(availability);
            return;
        }

        const [patterns, entries] = await Promise.all([
            this.manager.analyzeFailurePatterns(),
            this.manager.getUnresolvedEntries(50)
        ]);
        const constraintsByAgent = await this.fetchConstraints(patterns);
        this.panel.webview.html = this.buildHtml(patterns, entries, constraintsByAgent);
    }

    private async fetchConstraints(
        patterns: FailurePattern[]
    ): Promise<Map<string, string[]>> {
        const allDids = new Set<string>();
        for (const p of patterns) {
            for (const did of p.agentDids) { allDids.add(did); }
        }
        const result = new Map<string, string[]>();
        for (const did of allDids) {
            const constraints = await this.manager.getNegativeConstraintsForAgent(did);
            if (constraints.length > 0) { result.set(did, constraints); }
        }
        return result;
    }

    private buildHtml(
        patterns: FailurePattern[],
        entries: ShadowGenomeEntry[],
        constraintsByAgent: Map<string, string[]>
    ): string {
        const nonce = getNonce();
        const csp = this.panel.webview.cspSource;
        const isEmpty = patterns.length === 0 && entries.length === 0;
        const body = isEmpty
            ? this.emptyState()
            : this.contentSections(patterns, entries, constraintsByAgent);

        return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${getStyles()}</style>
</head><body>
<h1>Shadow Genome</h1>
<p class="subtitle">Failure patterns and learning constraints</p>
<button class="refresh" onclick="refresh()">Refresh</button>
${body}
<script nonce="${nonce}">${getScript()}</script>
</body></html>`;
    }

    private emptyState(): string {
        return `<div class="empty"><p>No failure patterns recorded.</p>
<p>Shadow Genome data appears when Sentinel detects and archives agent failures.</p></div>`;
    }

    /**
     * Distinct from emptyState(): the Shadow Genome database could not be
     * read at all (e.g. it was written by a newer FailSafe version than
     * this runtime supports). This must never render as "no failures" —
     * that would tell the operator their history is clean when it is
     * actually unknown.
     */
    private buildUnavailableHtml(availability: ShadowGenomeAvailability): string {
        const nonce = getNonce();
        const csp = this.panel.webview.cspSource;
        const reasonLine = availability.reason === 'unsupported-schema'
            ? `Database schema version ${escapeHtml(availability.currentVersion ?? 'unknown')} is newer than ` +
              `the ${escapeHtml(availability.latestVersion ?? 'unknown')} this FailSafe version supports. ` +
              `Upgrade the FailSafe extension to read this Shadow Genome.`
            : escapeHtml(availability.message ?? 'The Shadow Genome database could not be opened.');

        return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${getStyles()}</style>
</head><body>
<h1>Shadow Genome</h1>
<p class="subtitle">Failure patterns and learning constraints</p>
<button class="refresh" onclick="refresh()">Refresh</button>
<div class="empty"><p><strong>Unavailable</strong> — not the same as no recorded failures.</p><p>${reasonLine}</p></div>
<script nonce="${nonce}">${getScript()}</script>
</body></html>`;
    }

    private contentSections(
        patterns: FailurePattern[],
        entries: ShadowGenomeEntry[],
        constraintsByAgent: Map<string, string[]>
    ): string {
        return renderPatternCards(patterns)
            + renderEntriesTable(entries)
            + renderConstraints(constraintsByAgent);
    }

    public dispose(): void {
        ShadowGenomePanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
