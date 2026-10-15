/**
 * sentry-command — registers `FailSafe: Import Sentry Regressions` (#102, #478).
 * Reads settings, runs the import with a cancellable progress notification, and
 * shows the outcome at the level `describeSentryImport` assigns. Each risk is
 * written through `RiskRegisterManager.upsertRiskWith`, so operator triage
 * survives. The token is read from settings and never logged.
 */

import * as vscode from 'vscode';
import { defaultSentryGet, realTimePolicy, type CancelSignal } from '../integrations/sentry/sentry-transport';
import { importSentryRisks, type SentryImportOutcome } from '../integrations/sentry/sentry-import';
import { describeSentryImport } from '../integrations/sentry/sentry-report';
import { readSentrySettings } from '../integrations/sentry/sentry-settings';
import { RiskRegisterManager } from '../roadmap/services/RiskRegisterManager';

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

export function registerSentryImportCommand(context: vscode.ExtensionContext, workspaceRoot: string): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.sentry.import', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const opts = readSentrySettings((key, fallback) => cfg.get(key, fallback));
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
      showSentryOutcome(outcome, { org: opts.org, project: opts.project, query: opts.query });
    }),
  );
}
