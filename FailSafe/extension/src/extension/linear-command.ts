/**
 * linear-command — registers `FailSafe: Import Linear Issue (preview)` (B-INT-11
 * / #97). Prompts for a Linear issue URL/identifier, fetches it read-only via
 * the Linear GraphQL API, and shows an UNCOMMITTED intent preview. Nothing is
 * persisted and no FailSafe intent is created — the operator reviews the preview
 * and decides. Disabled unless an API key is stored in Secure Storage (#482);
 * the key is never read from settings and never logged.
 */

import * as vscode from 'vscode';
import { fetchLinearIssue, defaultLinearPost, type LinearPostFn } from '../integrations/linear/linear-client';
import { providerMessage, type IntegrationCredentials } from '../integrations/credentials/IntegrationCredentials';
import { disabledMessage, requireCredential, setCommandHint } from '../integrations/credentials/credentialGates';
import type { ImportUi } from '../integrations/credentials/importUi';
import { vscodeImportUi } from './importUiAdapter';

export interface LinearImportDeps {
  creds: IntegrationCredentials;
  enabled: boolean;
  post: LinearPostFn;
  ui: ImportUi;
}

export async function runLinearImport(input: () => PromiseLike<string | undefined>, deps: LinearImportDeps): Promise<void> {
  const { creds, ui } = deps;
  if (!deps.enabled) {
    ui.warn(disabledMessage('Linear import', 'failsafe.integrations.linear.enabled', 'Linear API key'));
    return;
  }
  const apiKey = requireCredential(creds, 'linear.apiKey', ui, `Linear import has no API key. ${setCommandHint('Linear API key')}`);
  if (!apiKey) return;
  const issue = await input();
  if (!issue) return;

  const result = await ui.progress('Fetching Linear issue…', () => fetchLinearIssue(issue, apiKey, deps.post));
  if (!result.ok || !result.preview) {
    ui.error(providerMessage(`Linear import failed: ${result.error ?? 'unknown error'}`, creds));
    return;
  }
  const p = result.preview;
  const meta = [p.state && `state: ${p.state}`, p.assignee && `assignee: ${p.assignee}`, p.labels.length && `labels: ${p.labels.join(', ')}`]
    .filter(Boolean).join(' · ');
  // Preview only — explicitly NOT committed.
  ui.info(`Intent preview (not committed) — ${p.intent}${meta ? `\n${meta}` : ''}`);
}

export function registerLinearImportCommand(context: vscode.ExtensionContext, creds: IntegrationCredentials): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.linear.import', () => runLinearImport(
      () => vscode.window.showInputBox({
        title: 'Import Linear issue (preview)',
        prompt: 'Paste a Linear issue URL or identifier (e.g. ENG-123)',
        ignoreFocusOut: true,
      }),
      {
        creds,
        enabled: vscode.workspace.getConfiguration('failsafe').get<boolean>('integrations.linear.enabled', false),
        post: defaultLinearPost,
        ui: vscodeImportUi(),
      },
    )),
  );
}
