/**
 * jira-command — registers `FailSafe: Import Jira Issue (preview)` (#98).
 * Prompts for a Jira issue URL/key, fetches it read-only via the Jira Cloud
 * REST API, and shows an UNCOMMITTED intent preview. Nothing is persisted and
 * no FailSafe intent is created — the operator reviews the preview and decides.
 * Disabled unless base URL + email are configured and an API token is stored
 * in Secure Storage (#482). The token is never read from settings and never
 * sent to a base URL that workspace settings chose under a user-level token.
 */

import * as vscode from 'vscode';
import { fetchJiraIssue, defaultJiraGet, type JiraGetFn } from '../integrations/jira/jira-client';
import { providerMessage, type IntegrationCredentials } from '../integrations/credentials/IntegrationCredentials';
import { disabledMessage, providerConnection, setCommandHint, type EndpointReader } from '../integrations/credentials/credentialGates';
import type { ImportUi } from '../integrations/credentials/importUi';
import { vscodeImportUi } from './importUiAdapter';

export interface JiraImportDeps {
  creds: IntegrationCredentials;
  endpoints: EndpointReader;
  enabled: boolean;
  email: string;
  get: JiraGetFn;
  ui: ImportUi;
}

function previewText(p: NonNullable<Awaited<ReturnType<typeof fetchJiraIssue>>['preview']>): string {
  const meta = [
    p.status && `status: ${p.status}`,
    p.priority && `priority: ${p.priority}`,
    p.assignee && `assignee: ${p.assignee}`,
    p.components.length && `components: ${p.components.join(', ')}`,
    p.labels.length && `labels: ${p.labels.join(', ')}`,
    p.sourceUrl && `source: ${p.sourceUrl}`,
  ].filter(Boolean).join(' · ');
  return `Intent preview (not committed) — ${p.intent}${meta ? `\n${meta}` : ''}`;
}

export async function runJiraImport(input: () => PromiseLike<string | undefined>, deps: JiraImportDeps): Promise<void> {
  const { creds, ui } = deps;
  if (!deps.enabled) {
    ui.warn(disabledMessage('Jira import', 'failsafe.integrations.jira.enabled', 'Jira API token'));
    return;
  }
  const notConfigured = `Jira import has no API token. ${setCommandHint('Jira API token')}`;
  const conn = providerConnection(creds, deps.endpoints, 'jira', ui, notConfigured);
  if (!conn) return;
  if (!conn.endpoint || !deps.email.trim()) {
    ui.warn('Jira import needs `failsafe.integrations.jira.baseUrl` and `failsafe.integrations.jira.email` in settings.');
    return;
  }
  const issue = await input();
  if (!issue) return;

  const auth = { baseUrl: conn.endpoint, email: deps.email, apiToken: conn.credential };
  const result = await ui.progress('Fetching Jira issue…', () => fetchJiraIssue(issue, auth, deps.get));
  if (!result.ok || !result.preview) {
    ui.error(providerMessage(`Jira import failed: ${result.error ?? 'unknown error'}`, creds));
    return;
  }
  // Preview only — explicitly NOT committed.
  ui.info(previewText(result.preview));
}

export function registerJiraImportCommand(
  context: vscode.ExtensionContext, creds: IntegrationCredentials, endpoints: EndpointReader,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.jira.import', () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      return runJiraImport(
        () => vscode.window.showInputBox({
          title: 'Import Jira issue (preview)',
          prompt: 'Paste a Jira issue URL or key (e.g. PROJ-123)',
          ignoreFocusOut: true,
        }),
        {
          creds, endpoints,
          enabled: cfg.get<boolean>('integrations.jira.enabled', false),
          email: cfg.get<string>('integrations.jira.email', ''),
          get: defaultJiraGet,
          ui: vscodeImportUi(),
        },
      );
    }),
  );
}
