/**
 * jira-command — registers `FailSafe: Import Jira Issue (preview)` (#98).
 * Prompts for a Jira issue URL/key, fetches it read-only via the Jira Cloud
 * REST API, and shows an UNCOMMITTED intent preview. Nothing is persisted and
 * no FailSafe intent is created — the operator reviews the preview and decides.
 * Disabled unless base URL + email + API token are configured. The token is
 * read from settings and never logged.
 */

import * as vscode from 'vscode';
import { fetchJiraIssue, defaultJiraGet } from '../integrations/jira/jira-client';

export function registerJiraImportCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.jira.import', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const enabled = cfg.get<boolean>('integrations.jira.enabled', false);
      const baseUrl = cfg.get<string>('integrations.jira.baseUrl', '');
      const email = cfg.get<string>('integrations.jira.email', '');
      const apiToken = cfg.get<string>('integrations.jira.apiToken', '');
      if (!enabled || !baseUrl || !email || !apiToken) {
        vscode.window.showWarningMessage(
          'Jira import is disabled. Enable `failsafe.integrations.jira.enabled` and set `baseUrl`, `email`, and `apiToken`.',
        );
        return;
      }
      const input = await vscode.window.showInputBox({
        title: 'Import Jira issue (preview)',
        prompt: 'Paste a Jira issue URL or key (e.g. PROJ-123)',
        ignoreFocusOut: true,
      });
      if (!input) return;

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Fetching Jira issue…' },
        () => fetchJiraIssue(input, { baseUrl, email, apiToken }, defaultJiraGet),
      );

      if (!result.ok || !result.preview) {
        vscode.window.showErrorMessage(`Jira import failed: ${result.error ?? 'unknown error'}`);
        return;
      }
      const p = result.preview;
      const meta = [
        p.status && `status: ${p.status}`,
        p.priority && `priority: ${p.priority}`,
        p.assignee && `assignee: ${p.assignee}`,
        p.components.length && `components: ${p.components.join(', ')}`,
        p.labels.length && `labels: ${p.labels.join(', ')}`,
        p.sourceUrl && `source: ${p.sourceUrl}`,
      ].filter(Boolean).join(' · ');
      // Preview only — explicitly NOT committed.
      vscode.window.showInformationMessage(
        `Intent preview (not committed) — ${p.intent}${meta ? `\n${meta}` : ''}`,
        { modal: false },
      );
    }),
  );
}
