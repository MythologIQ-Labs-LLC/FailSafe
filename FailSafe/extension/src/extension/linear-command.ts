/**
 * linear-command — registers `FailSafe: Import Linear Issue as Intent Draft`
 * (B-INT-11 / #97, #480). Prompts for a Linear issue URL/identifier, fetches it
 * read-only via the Linear GraphQL API and opens an unsaved preview document. A
 * governed intent draft is created only when the operator approves it
 * (tracker-intent-import.ts); nothing is written to Linear and nothing is synced. Disabled unless an API key is stored in Secure Storage (#482);
 * the key is never read from settings and never logged.
 */

import * as vscode from 'vscode';
import { fetchLinearIssue, defaultLinearPost, type LinearPostFn } from '../integrations/linear/linear-client';
import { providerMessage, type IntegrationCredentials } from '../integrations/credentials/IntegrationCredentials';
import { disabledMessage, requireCredential, setCommandHint } from '../integrations/credentials/credentialGates';
import type { ImportUi } from '../integrations/credentials/importUi';
import { vscodeImportUi } from './importUiAdapter';
import { healthFromLinearFetch } from '../integrations/linear/linear-health';
import { recordIntegrationHealth } from '../integrations/catalog/integration-health';
import {
  DRAFTS_UNAVAILABLE, fromLinearPreview, type TrackerImportResult, type TrackerIssue,
} from '../integrations/tracker-import/tracker-intent-import';
import { earlierImportNote, reviewTrackerIssue, vscodeReviewUi } from './trackerReviewUi';
import { parseLinearIssueId } from '../integrations/linear/linear-import';

export interface LinearImportDeps {
  creds: IntegrationCredentials;
  enabled: boolean;
  post: LinearPostFn;
  ui: ImportUi;
  /** Preview + governed draft (#480); without it the fetch is reported as a preview only. */
  review?: (issue: TrackerIssue) => Promise<TrackerImportResult>;
  /** For a 404: the note naming an earlier import of that key, if any. */
  earlierImport?: (externalRef: string) => Promise<string | undefined>;
}

export async function runLinearImport(
  input: () => PromiseLike<string | undefined>, deps: LinearImportDeps,
): Promise<TrackerImportResult | undefined> {
  const { creds, ui } = deps;
  if (!deps.enabled) {
    ui.warn(disabledMessage('Linear import', 'failsafe.integrations.linear.enabled', 'Linear API key'));
    return { outcome: 'not_authorized' };
  }
  const apiKey = requireCredential(creds, 'linear.apiKey', ui, `Linear import has no API key. ${setCommandHint('Linear API key')}`);
  if (!apiKey) return { outcome: 'not_authorized' };
  const issue = await input();
  if (!issue) return undefined;

  const result = await ui.progress('Fetching Linear issue…', () => fetchLinearIssue(issue, apiKey, deps.post));
  recordIntegrationHealth('linear', ...healthFromLinearFetch(result));
  if (!result.ok || !result.preview) {
    const key = parseLinearIssueId(issue);
    const note = result.failure === 'not_found' && key ? await deps.earlierImport?.(`linear:${key}`) : undefined;
    ui.error(providerMessage(`Linear import failed: ${result.error ?? 'unknown error'}${note ? ` ${note}` : ''}`, creds));
    return result.failure === 'auth' ? { outcome: 'not_authorized' } : undefined;
  }
  const tracked = fromLinearPreview(result.preview);
  if (!deps.review) {
    ui.info(`Previewed ${tracked.key}. ${DRAFTS_UNAVAILABLE}`);
    return { outcome: 'previewed' };
  }
  return deps.review(tracked);
}

export function registerLinearImportCommand(context: vscode.ExtensionContext, creds: IntegrationCredentials): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.linear.import', () => runLinearImport(
      () => vscode.window.showInputBox({
        title: 'Import Linear issue as an intent draft',
        prompt: 'Paste a Linear issue URL or identifier (e.g. ENG-123)',
        ignoreFocusOut: true,
      }),
      {
        creds,
        enabled: vscode.workspace.getConfiguration('failsafe').get<boolean>('integrations.linear.enabled', false),
        post: defaultLinearPost,
        ui: vscodeImportUi(),
        review: (issue) => reviewTrackerIssue(issue, vscodeReviewUi()),
        earlierImport: earlierImportNote,
      },
    )),
  );
}
