/**
 * sentry-command — registers `FailSafe: Import Sentry Regressions` (#102).
 * Fetches a configured Sentry project's unresolved issues read-only and upserts
 * them as runtime-regression risk records in the Risk Register (keyed-idempotent,
 * so re-importing updates rather than duplicates). Thin glue over the
 * unit-tested `importSentryRisks` orchestrator. Disabled unless token + org +
 * project are configured. The token is read from settings and never logged.
 */

import * as vscode from 'vscode';
import { importSentryRisks, defaultSentryGet, type SentryOptions } from '../integrations/sentry/sentry-client';
import { RiskRegisterManager } from '../roadmap/services/RiskRegisterManager';

export function registerSentryImportCommand(context: vscode.ExtensionContext, workspaceRoot: string): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.sentry.import', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const opts: SentryOptions = {
        enabled: cfg.get<boolean>('integrations.sentry.enabled', false),
        token: cfg.get<string>('integrations.sentry.token', ''),
        org: cfg.get<string>('integrations.sentry.org', ''),
        project: cfg.get<string>('integrations.sentry.project', ''),
        environment: cfg.get<string>('integrations.sentry.environment', '') || undefined,
        apiBaseUrl: cfg.get<string>('integrations.sentry.apiBaseUrl', '') || undefined,
      };
      if (!opts.enabled || !opts.token || !opts.org || !opts.project) {
        vscode.window.showWarningMessage(
          'Sentry import is disabled. Enable `failsafe.integrations.sentry.enabled` and set `token`, `org`, and `project`.',
        );
        return;
      }

      const riskManager = new RiskRegisterManager(workspaceRoot);
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Importing Sentry regressions…' },
        () => importSentryRisks(opts, defaultSentryGet, (risk) => riskManager.upsertRisk(risk)),
      );

      if (!result.ok) {
        vscode.window.showErrorMessage(`Sentry import failed: ${result.error ?? 'unknown error'}`);
        return;
      }
      vscode.window.showInformationMessage(
        `Sentry import: ${result.count} runtime-regression risk(s) upserted from ${opts.org}/${opts.project}.`,
      );
    }),
  );
}
