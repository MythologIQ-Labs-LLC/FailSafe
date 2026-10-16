/**
 * sentry-command — registers `FailSafe: Import Sentry Regressions` (#102, #478).
 * Reads settings, runs the import with a cancellable progress notification, and
 * shows the outcome at the level `describeSentryImport` assigns. Each risk is
 * written through `RiskRegisterManager.upsertRiskWith`, so operator triage
 * survives. The token comes from Secure Storage (#482) and is never logged.
 */

import * as vscode from 'vscode';
import { defaultSentryGet, realTimePolicy, type CancelSignal } from '../integrations/sentry/sentry-transport';
import { importSentryRisks, type SentryImportOutcome } from '../integrations/sentry/sentry-import';
import { describeSentryImport } from '../integrations/sentry/sentry-report';
import { resolveSentryOptions } from '../integrations/sentry/sentry-settings';
import type { IntegrationCredentials } from '../integrations/credentials/IntegrationCredentials';
import type { EndpointReader } from '../integrations/credentials/credentialGates';
import { credentialUi } from './credentials-command';
import { RiskRegisterManager } from '../roadmap/services/RiskRegisterManager';
import { healthFromSentryImport, recordIntegrationHealth } from '../integrations/sentry/sentry-health';

function cancelSignal(token: vscode.CancellationToken): CancelSignal {
  return {
    get cancelled() { return token.isCancellationRequested; },
    onCancel(listener) { const d = token.onCancellationRequested(listener); return () => d.dispose(); },
  };
}

function showSentryOutcome(outcome: SentryImportOutcome, scope: { org?: string; project?: string; query?: string }): void {
  const { level, text } = describeSentryImport(outcome, scope);
  if (level === 'error') vscode.window.showErrorMessage(text);
  else if (level === 'warning') vscode.window.showWarningMessage(text);
  else vscode.window.showInformationMessage(text);
}

export function registerSentryImportCommand(
  context: vscode.ExtensionContext, workspaceRoot: string, creds: IntegrationCredentials, endpoints: EndpointReader,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.sentry.import', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const opts = resolveSentryOptions((key, fallback) => cfg.get(key, fallback), creds, endpoints, credentialUi());
      if (!opts) return;
      const store = new RiskRegisterManager(workspaceRoot);
      const outcome = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Importing Sentry regressions…', cancellable: true },
        (_progress, token) => importSentryRisks(
          opts,
          defaultSentryGet,
          { upsertWith: (id, build, o) => store.upsertRiskWith(id, build, o) },
          { policy: realTimePolicy, cancel: cancelSignal(token) },
        ),
      );
      recordIntegrationHealth('sentry', ...healthFromSentryImport(outcome));
      showSentryOutcome(outcome, { org: opts.org, project: opts.project, query: opts.query });
    }),
  );
}
