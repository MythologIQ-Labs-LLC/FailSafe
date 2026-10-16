/**
 * jira-command — registers `FailSafe: Import Jira Issue as Intent Draft` (#98,
 * #480). Prompts for a Jira issue URL/key, fetches it read-only via the Jira
 * Cloud REST API and opens an unsaved preview document. A governed intent draft
 * is created only when the operator approves it (tracker-intent-import.ts);
 * nothing is ever written to Jira and nothing is synced.
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
import { healthFromJiraFetch } from '../integrations/jira/jira-health';
import { recordIntegrationHealth } from '../integrations/catalog/integration-health';
import {
  DRAFTS_UNAVAILABLE, fromJiraPreview, type TrackerImportResult, type TrackerIssue,
} from '../integrations/tracker-import/tracker-intent-import';
import { earlierImportNote, reviewTrackerIssue, vscodeReviewUi } from './trackerReviewUi';
import { parseJiraIssueKey } from '../integrations/jira/jira-import';

export interface JiraImportDeps {
  creds: IntegrationCredentials;
  endpoints: EndpointReader;
  enabled: boolean;
  email: string;
  get: JiraGetFn;
  ui: ImportUi;
  /** Preview + governed draft (#480); without it the fetch is reported as a preview only. */
  review?: (issue: TrackerIssue) => Promise<TrackerImportResult>;
  /** For a 404: the note naming an earlier import of that key, if any. */
  earlierImport?: (externalRef: string) => Promise<string | undefined>;
}

export async function runJiraImport(
  input: () => PromiseLike<string | undefined>, deps: JiraImportDeps,
): Promise<TrackerImportResult | undefined> {
  const { creds, ui } = deps;
  if (!deps.enabled) {
    ui.warn(disabledMessage('Jira import', 'failsafe.integrations.jira.enabled', 'Jira API token'));
    return { outcome: 'not_authorized' };
  }
  const notConfigured = `Jira import has no API token. ${setCommandHint('Jira API token')}`;
  const conn = providerConnection(creds, deps.endpoints, 'jira', ui, notConfigured);
  if (!conn) return { outcome: 'not_authorized' };
  if (!conn.endpoint || !deps.email.trim()) {
    ui.warn('Jira import needs `failsafe.integrations.jira.baseUrl` and `failsafe.integrations.jira.email` in settings.');
    return { outcome: 'not_authorized' };
  }
  const issue = await input();
  if (!issue) return undefined;

  const auth = { baseUrl: conn.endpoint, email: deps.email, apiToken: conn.credential };
  const result = await ui.progress('Fetching Jira issue…', () => fetchJiraIssue(issue, auth, deps.get));
  recordIntegrationHealth('jira', ...healthFromJiraFetch(result));
  if (!result.ok || !result.preview) {
    const key = parseJiraIssueKey(issue);
    const note = result.failure === 'not_found' && key ? await deps.earlierImport?.(`jira:${key}`) : undefined;
    ui.error(providerMessage(`Jira import failed: ${result.error ?? 'unknown error'}${note ? ` ${note}` : ''}`, creds));
    return result.failure === 'auth' ? { outcome: 'not_authorized' } : undefined;
  }
  const tracked = fromJiraPreview(result.preview);
  if (!deps.review) {
    ui.info(`Previewed ${tracked.key}. ${DRAFTS_UNAVAILABLE}`);
    return { outcome: 'previewed' };
  }
  return deps.review(tracked);
}

export function registerJiraImportCommand(
  context: vscode.ExtensionContext, creds: IntegrationCredentials, endpoints: EndpointReader,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.jira.import', () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      return runJiraImport(
        () => vscode.window.showInputBox({
          title: 'Import Jira issue as an intent draft',
          prompt: 'Paste a Jira issue URL or key (e.g. PROJ-123)',
          ignoreFocusOut: true,
        }),
        {
          creds, endpoints,
          enabled: cfg.get<boolean>('integrations.jira.enabled', false),
          email: cfg.get<string>('integrations.jira.email', ''),
          get: defaultJiraGet,
          ui: vscodeImportUi(),
          review: (issue) => reviewTrackerIssue(issue, vscodeReviewUi()),
          earlierImport: earlierImportNote,
        },
      );
    }),
  );
}
