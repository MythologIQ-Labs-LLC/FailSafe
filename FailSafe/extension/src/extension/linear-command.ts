/**
 * linear-command — registers `FailSafe: Import Linear Issue (preview)` (B-INT-11
 * / #97). Prompts for a Linear issue URL/identifier, fetches it read-only via
 * the Linear GraphQL API, and shows an UNCOMMITTED intent preview. Nothing is
 * persisted and no FailSafe intent is created — the operator reviews the preview
 * and decides. Disabled unless an API key is configured. The key is read from
 * settings and never logged.
 */

import * as vscode from 'vscode';
import { fetchLinearIssue, defaultLinearPost } from '../integrations/linear/linear-client';

export function registerLinearImportCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.linear.import', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const enabled = cfg.get<boolean>('integrations.linear.enabled', false);
      const apiKey = cfg.get<string>('integrations.linear.apiKey', '');
      if (!enabled || !apiKey) {
        vscode.window.showWarningMessage(
          'Linear import is disabled. Enable `failsafe.integrations.linear.enabled` and set a `failsafe.integrations.linear.apiKey`.',
        );
        return;
      }
      const input = await vscode.window.showInputBox({
        title: 'Import Linear issue (preview)',
        prompt: 'Paste a Linear issue URL or identifier (e.g. ENG-123)',
        ignoreFocusOut: true,
      });
      if (!input) return;

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Fetching Linear issue…' },
        () => fetchLinearIssue(input, apiKey, defaultLinearPost),
      );

      if (!result.ok || !result.preview) {
        vscode.window.showErrorMessage(`Linear import failed: ${result.error ?? 'unknown error'}`);
        return;
      }
      const p = result.preview;
      const meta = [p.state && `state: ${p.state}`, p.assignee && `assignee: ${p.assignee}`, p.labels.length && `labels: ${p.labels.join(', ')}`]
        .filter(Boolean).join(' · ');
      // #480: inspectable, unsaved preview. No canonical state mutation.
      const title = `Linear issue preview (uncommitted)`;
      const markdown = [`# ${title}`, '', '> This is a read-only review. No FailSafe intent or backlog item was created.', '', `## ${p.intent}`, '', meta, ''].join('\n');
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
      await vscode.window.showTextDocument(document, { preview: true });
      vscode.window.showInformationMessage(`${title}: opened review document; not imported or saved.`);
    }),
  );
}
