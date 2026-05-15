/**
 * FeedbackManager - Community Feedback Loop Handler
 *
 * Manages the collection and storage of user feedback for FailSafe.
 * Generates GUID-stamped JSON files in the .failsafe/feedback directory.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FeedbackEntry {
    id: string;
    timestamp: string;
    type: 'bug_report' | 'feature_request' | 'ux_feedback' | 'performance' | 'general';
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    reproduction?: string;
    environment: {
        os: string;
        vscodeVersion: string;
        extensionVersion: string;
        workspacePath?: string;
    };
    metadata: {
        sessionId?: string;
        relatedFiles?: string[];
        relatedEvents?: string[];
        userAgent?: string;
    };
}

export interface FeedbackSummary {
    totalFeedback: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    recentFeedback: FeedbackEntry[];
}

interface FeedbackLogger {
    info: (msg: string, data?: unknown) => void;
    error: (msg: string, error?: unknown) => void;
}

export class FeedbackManager {
    private context: vscode.ExtensionContext;
    private feedbackDir: string;
    private logger: FeedbackLogger;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Feedback directory in workspace root under .failsafe/feedback
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.feedbackDir = workspaceRoot
            ? path.join(workspaceRoot, '.failsafe', 'feedback')
            : path.join(context.globalStorageUri.fsPath, 'feedback');

        // Logger must be initialized before ensureFeedbackDirectory(), which
        // calls this.logger.info on the cold-start mkdirSync path.
        this.logger = {
            info: (msg: string, data?: unknown) => console.log(`[FeedbackManager] ${msg}`, data || ''),
            error: (msg: string, error?: unknown) => console.error(`[FeedbackManager] ${msg}`, error || '')
        };

        this.ensureFeedbackDirectory();
    }

    /**
     * Ensure the feedback directory exists
     */
    private ensureFeedbackDirectory(): void {
        if (!fs.existsSync(this.feedbackDir)) {
            fs.mkdirSync(this.feedbackDir, { recursive: true });
            this.logger.info(`Created feedback directory: ${this.feedbackDir}`);
        }
    }

    /**
     * Generate a GUID for feedback entries
     */
    private generateGUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Collect environment information
     */
    private collectEnvironment(): FeedbackEntry['environment'] {
        const vscodeVersion = vscode.version;
        const extensionVersion = this.context.extension.packageJSON.version || 'unknown';
        
        return {
            os: process.platform,
            vscodeVersion,
            extensionVersion,
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        };
    }

    /**
     * Create a feedback entry with user input
     */
    async createFeedbackEntry(): Promise<FeedbackEntry | null> {
        // Step 1: Select feedback type
        const typeOptions: Array<{ label: string; value: FeedbackEntry['type'] }> = [
            { label: 'Bug Report', value: 'bug_report' },
            { label: 'Feature Request', value: 'feature_request' },
            { label: 'UX Feedback', value: 'ux_feedback' },
            { label: 'Performance', value: 'performance' },
            { label: 'General Feedback', value: 'general' }
        ];

        const selectedType = await vscode.window.showQuickPick(
            typeOptions.map(opt => ({ label: opt.label, value: opt.value })),
            { placeHolder: 'What type of feedback do you have?' }
        );

        if (!selectedType) return null;

        // Step 2: Select severity
        const severityOptions: Array<{ label: string; value: FeedbackEntry['severity'] }> = [
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
            { label: 'Critical', value: 'critical' }
        ];

        const selectedSeverity = await vscode.window.showQuickPick(
            severityOptions.map(opt => ({ label: opt.label, value: opt.value })),
            { placeHolder: 'How severe is this feedback?' }
        );

        if (!selectedSeverity) return null;

        // Step 3: Enter title
        const title = await vscode.window.showInputBox({
            prompt: 'Enter a brief title for your feedback',
            placeHolder: 'e.g., "Cortex Stream not updating after file changes"',
            validateInput: (value) => value.trim().length < 5 ? 'Title must be at least 5 characters' : undefined
        });

        if (!title) return null;

        // Step 4: Enter description
        const description = await vscode.window.showInputBox({
            prompt: 'Describe your feedback in detail',
            placeHolder: 'Please provide as much detail as possible...',
            validateInput: (value) => value.trim().length < 10 ? 'Description must be at least 10 characters' : undefined
        });

        if (!description) return null;

        // Step 5: Optional reproduction steps (for bugs)
        let reproduction: string | undefined;
        if (selectedType.value === 'bug_report') {
            reproduction = await vscode.window.showInputBox({
                prompt: 'How can this issue be reproduced? (optional)',
                placeHolder: 'e.g., "1. Open file X, 2. Click Y, 3. Observe Z"'
            });
        }

        // Step 6: Optional related files
        let relatedFiles: string[] | undefined;
        const addFiles = await vscode.window.showQuickPick(
            [{ label: 'Yes', value: true }, { label: 'No', value: false }],
            { placeHolder: 'Do you want to attach related files?' }
        );

        if (addFiles?.value) {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectMany: true,
                openLabel: 'Attach files',
                title: 'Select related files'
            });
            if (fileUri) {
                relatedFiles = fileUri.map(uri => uri.fsPath);
            }
        }

        // Create the feedback entry
        const entry: FeedbackEntry = {
            id: this.generateGUID(),
            timestamp: new Date().toISOString(),
            type: selectedType.value,
            category: this.getCategoryFromType(selectedType.value),
            severity: selectedSeverity.value,
            title,
            description,
            reproduction,
            environment: this.collectEnvironment(),
            metadata: {
                sessionId: this.context.globalState.get<string>('failsafe.sessionId'),
                relatedFiles,
                userAgent: 'FailSafe Extension'
            }
        };

        return entry;
    }

    /**
     * Map feedback type to category
     */
    private getCategoryFromType(type: FeedbackEntry['type']): string {
        const categoryMap: Record<FeedbackEntry['type'], string> = {
            bug_report: 'Issues',
            feature_request: 'Enhancements',
            ux_feedback: 'User Experience',
            performance: 'Performance',
            general: 'General'
        };
        return categoryMap[type];
    }

    /**
     * Save feedback entry to a GUID-stamped JSON file
     */
    async saveFeedback(entry: FeedbackEntry): Promise<string> {
        const filename = `${entry.id}.json`;
        const filepath = path.join(this.feedbackDir, filename);

        try {
            await fs.promises.writeFile(
                filepath,
                JSON.stringify(entry, null, 2),
                'utf-8'
            );
            this.logger.info(`Feedback saved to: ${filepath}`);
            return filepath;
        } catch (error) {
            this.logger.error('Failed to save feedback', error);
            throw error;
        }
    }

    /**
     * Load all feedback entries from the feedback directory
     */
    async loadAllFeedback(): Promise<FeedbackEntry[]> {
        try {
            const files = await fs.promises.readdir(this.feedbackDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            const entries: FeedbackEntry[] = [];
            for (const file of jsonFiles) {
                try {
                    const filepath = path.join(this.feedbackDir, file);
                    const content = await fs.promises.readFile(filepath, 'utf-8');
                    const entry = JSON.parse(content) as FeedbackEntry;
                    entries.push(entry);
                } catch (error) {
                    this.logger.error(`Failed to load feedback file: ${file}`, error);
                }
            }
            
            // Sort by timestamp descending
            entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
            return entries;
        } catch (error) {
            this.logger.error('Failed to load feedback entries', error);
            return [];
        }
    }

    /**
     * Get a summary of all feedback
     */
    async getFeedbackSummary(): Promise<FeedbackSummary> {
        const allFeedback = await this.loadAllFeedback();
        
        const byType: Record<string, number> = {};
        const bySeverity: Record<string, number> = {};
        
        for (const entry of allFeedback) {
            byType[entry.type] = (byType[entry.type] || 0) + 1;
            bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
        }
        
        return {
            totalFeedback: allFeedback.length,
            byType,
            bySeverity,
            recentFeedback: allFeedback.slice(0, 10)
        };
    }

    /**
     * Delete a feedback entry
     */
    async deleteFeedback(id: string): Promise<boolean> {
        const filepath = path.join(this.feedbackDir, `${id}.json`);
        
        try {
            await fs.promises.unlink(filepath);
            this.logger.info(`Deleted feedback: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete feedback: ${id}`, error);
            return false;
        }
    }

    /**
     * Export all feedback to a single JSON file
     */
    async exportFeedback(outputPath: string): Promise<void> {
        const allFeedback = await this.loadAllFeedback();
        const summary = await this.getFeedbackSummary();
        
        const exportData = {
            exportedAt: new Date().toISOString(),
            summary,
            feedback: allFeedback
        };
        
        await fs.promises.writeFile(
            outputPath,
            JSON.stringify(exportData, null, 2),
            'utf-8'
        );
        
        this.logger.info(`Feedback exported to: ${outputPath}`);
    }

    /**
     * Display feedback in a webview panel
     */
    async showFeedbackPanel(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'failsafe.feedback',
            'FailSafe Feedback',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        
        const summary = await this.getFeedbackSummary();
        
        panel.webview.html = this.getFeedbackHtml(summary);
    }

    /**
     * Generate HTML for feedback panel
     */
    private getFeedbackHtml(summary: FeedbackSummary): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FailSafe Feedback</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
        }
        .stats {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--vscode-editor-selectionBackground);
            padding: 15px;
            border-radius: 8px;
            flex: 1;
            min-width: 150px;
        }
        .stat-card h3 {
            margin: 0 0 10px 0;
            font-size: 12px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }
        .stat-value {
            font-size: 28px;
            font-weight: bold;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            margin: 0 0 15px 0;
            font-size: 18px;
        }
        .feedback-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .feedback-item {
            background: var(--vscode-sideBar-background);
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid var(--vscode-textLink-foreground);
        }
        .feedback-item.critical { border-left-color: #f56565; }
        .feedback-item.high { border-left-color: #ed8936; }
        .feedback-item.medium { border-left-color: #ecc94b; }
        .feedback-item.low { border-left-color: #48bb78; }
        
        .feedback-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .feedback-title {
            font-weight: 600;
            font-size: 14px;
        }
        .feedback-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .feedback-description {
            font-size: 13px;
            margin-top: 8px;
            color: var(--vscode-descriptionForeground);
        }
        .badges {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .badge {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--vscode-button-secondaryBackground);
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>FailSafe Feedback</h1>
        <p>Community feedback loop for FailSafe development</p>
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <h3>Total Feedback</h3>
            <div class="stat-value">${summary.totalFeedback}</div>
        </div>
        <div class="stat-card">
            <h3>Bug Reports</h3>
            <div class="stat-value">${summary.byType.bug_report || 0}</div>
        </div>
        <div class="stat-card">
            <h3>Feature Requests</h3>
            <div class="stat-value">${summary.byType.feature_request || 0}</div>
        </div>
        <div class="stat-card">
            <h3>Critical Issues</h3>
            <div class="stat-value">${summary.bySeverity.critical || 0}</div>
        </div>
    </div>
    
    <div class="section">
        <h2>Recent Feedback</h2>
        ${summary.recentFeedback.length === 0 
            ? '<div class="empty-state">No feedback submitted yet. Use the "Generate Feedback" command to share your thoughts!</div>'
            : `<div class="feedback-list">
                ${summary.recentFeedback.map(entry => `
                    <div class="feedback-item ${entry.severity}">
                        <div class="feedback-header">
                            <span class="feedback-title">${this.escapeHtml(entry.title)}</span>
                            <span class="feedback-meta">${new Date(entry.timestamp).toLocaleDateString()}</span>
                        </div>
                        <div class="feedback-description">${this.escapeHtml(entry.description)}</div>
                        <div class="badges">
                            <span class="badge">${entry.type}</span>
                            <span class="badge">${entry.severity.toUpperCase()}</span>
                            <span class="badge">${entry.category}</span>
                        </div>
                    </div>
                `).join('')}
            </div>`
        }
    </div>
</body>
</html>`;
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
}
