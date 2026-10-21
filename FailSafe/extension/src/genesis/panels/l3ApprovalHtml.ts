/**
 * l3ApprovalHtml - HTML for the L3 Approval Queue webview (FX964).
 *
 * Kept free of the vscode module so the markup can be rendered and clicked
 * in a browser test under the same Content-Security-Policy the webview uses.
 */

import { L3ApprovalRequest } from '../../shared/types';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

/**
 * B-INT-2: render bicameral-preflight conflict lines for an L3 entry's
 * `meta`. Module-level export (not a private method) so it is unit-testable
 * as a free function. Returns escaped conflict-line HTML, or '' when there
 * is no `meta.preflight.driftedDecisions` evidence. Decision titles are
 * escaped via escapeHtml (XSS guard).
 */
export function formatPreflightConflicts(
    meta: Record<string, unknown> | undefined
): string {
    const preflight = meta?.preflight as { driftedDecisions?: unknown } | undefined;
    const drifted = preflight?.driftedDecisions;
    if (!Array.isArray(drifted) || drifted.length === 0) {
        return '';
    }
    const lines = drifted.map((d) => {
        const title = (d && typeof d === 'object' && 'title' in d)
            ? String((d as { title: unknown }).title)
            : 'unknown decision';
        return `<div class="preflight-conflict">Conflicts with decision: ${escapeHtml(title)}</div>`;
    }).join('');
    return `<div class="item-preflight">${lines}</div>`;
}

/**
 * B311: warn-only affected architecture decisions for one item. The lines are review text from
 * describeAffectedArchitecture; each is escaped here. '' without lines.
 */
export function formatArchitectureLines(lines: string[] | undefined): string {
    if (!Array.isArray(lines) || lines.length === 0) {
        return '';
    }
    const rows = lines.map((l) => `<div class="architecture-line">${escapeHtml(l)}</div>`).join('');
    return `<div class="item-architecture"><div class="architecture-title">Architecture decisions for this file (warn-only):</div>${rows}</div>`;
}

export interface L3ApprovalHtmlOptions {
    nonce: string;
    cspSource: string;
    /** B311: affected-architecture lines by item id (absent: no block). */
    architecture?: Record<string, string[]>;
}

export function buildL3ApprovalHtml(queue: L3ApprovalRequest[], opts: L3ApprovalHtmlOptions): string {
    const { nonce, cspSource } = opts;
    const architecture = opts.architecture ?? {};
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
        .empty-hint { font-size: 12px; }
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
        .item-preflight { margin-bottom: 12px; }
        .item-architecture {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border-left: 2px solid var(--vscode-editorWarning-foreground);
            padding: 2px 0 2px 8px;
            margin-bottom: 12px;
            word-break: break-all;
        }
        .architecture-title { font-weight: 600; margin-bottom: 2px; }
        .preflight-conflict {
            font-size: 11px;
            color: #f85149;
            padding: 2px 0;
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
            <p class="empty-hint">L3 (Critical) items will appear here when detected</p>
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
            ${formatArchitectureLines(Object.prototype.hasOwnProperty.call(architecture, item.id) ? architecture[item.id] : undefined)}
            ${formatPreflightConflicts(item.meta)}
            ${item.flags.length > 0 ? `
                <div class="item-flags">
                    ${item.flags.map(f => `<span class="flag">${escapeHtml(f)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="item-actions">
                <button class="btn-approve" data-command="approve" data-id="${escapeHtml(item.id)}">Approve</button>
                <button class="btn-reject" data-command="reject" data-id="${escapeHtml(item.id)}">Reject</button>
                <button class="btn-view" data-command="viewFile" data-file="${escapeHtml(item.filePath)}">View File</button>
            </div>
        </div>
    `).join('')}

    <script nonce="${nonce}">
        // The CSP allows only this nonce'd script, so buttons carry data
        // attributes and one delegated listener posts the message.
        const vscode = acquireVsCodeApi();
        document.addEventListener('click', (event) => {
            const button = event.target instanceof Element ? event.target.closest('button[data-command]') : null;
            if (!button) { return; }
            const command = button.dataset.command;
            if (command === 'approve' || command === 'reject') {
                vscode.postMessage({ command, id: button.dataset.id });
            } else if (command === 'viewFile') {
                vscode.postMessage({ command, file: button.dataset.file });
            }
        });
    </script>
</body>
</html>`;
}
