/**
 * credentials-command - FailSafe: Set / Clear Integration Credential and
 * Move Plain-Text Credentials to Secure Storage (#482).
 *
 * bootstrapCredentials creates the shared IntegrationCredentials, waits for
 * Secret Storage (bounded), registers the commands and, when plain-text
 * credentials are found, offers the move. No command echoes a value.
 */

import * as vscode from 'vscode';
import { VscodeSecretStore } from '../core/adapters/vscode/VscodeSecretStore';
import {
  CREDENTIALS, IntegrationCredentials, scopeName,
  type CredentialDescriptor, type CredentialLogger, type StoredScope,
} from '../integrations/credentials/IntegrationCredentials';
import { MOVE_ACTION, type CredentialUi } from '../integrations/credentials/credentialGates';
import {
  migrateCredentials, removalQuestion, renderMigrationReport, type MigrationPrompts, type RemovalSummary, type StaleChoice,
} from '../integrations/credentials/credentialMigration';
import { createConfigurationInspector, createEndpointReader } from '../integrations/credentials/vscodeCredentialAdapters';

export const MIGRATE_COMMAND = 'failsafe.credentials.migrate';

const KEEP = 'Keep Secure Storage value (discard plain text)';
const USE = 'Use plain-text value (replace stored)';
const LEAVE = 'Leave both';
const REMOVE = 'Remove plain text';

export const vscodePrompts: MigrationPrompts = {
  async staleChoice(label, scope) {
    const pick = await vscode.window.showWarningMessage(
      `The plain-text ${label} in ${scope} settings is different from the one in Secure Storage.`,
      { modal: true }, KEEP, USE, LEAVE,
    );
    const map: Record<string, StaleChoice> = { [KEEP]: 'keep', [USE]: 'use', [LEAVE]: 'leave' };
    return pick ? map[pick] : undefined;
  },
  async confirmRemoval(summary: RemovalSummary) {
    return (await vscode.window.showWarningMessage(removalQuestion(summary), { modal: true }, REMOVE)) === REMOVE;
  },
};

export function credentialUi(): CredentialUi {
  return {
    warn: (message, ...actions) => vscode.window.showWarningMessage(message, ...actions),
    moveToSecureStorage: () => { void vscode.commands.executeCommand(MIGRATE_COMMAND); },
  };
}

async function pickCredential(title: string): Promise<CredentialDescriptor | undefined> {
  const pick = await vscode.window.showQuickPick(
    CREDENTIALS.map((d) => ({ label: d.label, description: d.provider, d })), { title },
  );
  return pick?.d;
}

async function pickScope(creds: IntegrationCredentials, title: string): Promise<StoredScope | undefined> {
  const items: Array<{ label: string; scope: StoredScope; detail: string }> = [
    { label: 'User', scope: 'user', detail: 'Used in every workspace on this machine' },
  ];
  if (creds.hasWorkspace()) items.push({ label: 'Workspace', scope: 'workspace', detail: 'Used only in this workspace; beats the User credential' });
  if (items.length === 1) return 'user';
  return (await vscode.window.showQuickPick(items, { title }))?.scope;
}

async function setCredential(creds: IntegrationCredentials): Promise<void> {
  const d = await pickCredential('Set integration credential');
  if (!d) return;
  const value = await vscode.window.showInputBox({
    title: `${d.label}`, prompt: `Paste the ${d.label}. It is kept in Secure Storage, not in settings.`,
    password: true, ignoreFocusOut: true,
  });
  if (!value?.trim()) return;
  const scope = await pickScope(creds, `Where should FailSafe use this ${d.label}?`);
  if (!scope) return;
  try {
    await creds.set(d.id, scope, value);
    void vscode.window.showInformationMessage(`${d.label} stored in Secure Storage (${scopeName(scope)}).`);
  } catch {
    void vscode.window.showErrorMessage(`Secure Storage is unavailable; the ${d.label} was not stored.`);
  }
}

async function clearCredential(creds: IntegrationCredentials): Promise<void> {
  const d = await pickCredential('Clear integration credential');
  if (!d) return;
  const scope = await pickScope(creds, `Clear the ${d.label} from which scope?`);
  if (!scope) return;
  try {
    await creds.clear(d.id, scope);
    void vscode.window.showInformationMessage(`${d.label} removed from Secure Storage (${scopeName(scope)}).`);
  } catch {
    void vscode.window.showErrorMessage(`Secure Storage is unavailable; the ${d.label} was not removed.`);
  }
}

export interface ReportSink { appendLine(line: string): void }

async function runMigration(creds: IntegrationCredentials, output: ReportSink, logger: CredentialLogger): Promise<void> {
  if (creds.isUnavailable()) {
    void vscode.window.showErrorMessage('Secure Storage is unavailable; no plain-text credential was moved.');
    return;
  }
  if (!creds.hasPlainText()) {
    void vscode.window.showInformationMessage('No plain-text integration credentials were found in settings.');
    return;
  }
  const report = await migrateCredentials(creds, createConfigurationInspector(), vscodePrompts, logger);
  const lines = renderMigrationReport(report);
  output.appendLine('[credentials] Plain-text credential migration:');
  for (const l of lines) output.appendLine(`  ${l}`);
  const summary = report.ok
    ? 'Plain-text credential migration finished.'
    : 'Plain-text credential migration finished with problems; nothing was removed where storing failed.';
  const show = report.ok ? vscode.window.showInformationMessage : vscode.window.showWarningMessage;
  void show(`${summary} See the FailSafe output channel for the full report.`);
}

export interface CredentialsBootstrap {
  creds: IntegrationCredentials;
  endpoints: ReturnType<typeof createEndpointReader>;
  ui: CredentialUi;
  /** Offer the move when plain-text credentials exist. Call once activation is done. */
  offerMigration(): void;
}

export async function bootstrapCredentials(
  context: vscode.ExtensionContext, output: ReportSink, logger: CredentialLogger,
): Promise<CredentialsBootstrap> {
  const creds = new IntegrationCredentials(new VscodeSecretStore(context), createConfigurationInspector(), logger);
  await creds.init();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void creds.refresh(); }),
    vscode.commands.registerCommand('failsafe.credentials.set', () => setCredential(creds)),
    vscode.commands.registerCommand('failsafe.credentials.clear', () => clearCredential(creds)),
    vscode.commands.registerCommand(MIGRATE_COMMAND, () => runMigration(creds, output, logger)),
  );
  const offerMigration = (): void => {
    if (!creds.hasPlainText()) return;
    void vscode.window.showWarningMessage(
      'FailSafe found integration credentials in plain-text settings. Move them to Secure Storage?',
      MOVE_ACTION, 'Not now',
    ).then((choice) => { if (choice === MOVE_ACTION) void vscode.commands.executeCommand(MIGRATE_COMMAND); });
  };
  return { creds, endpoints: createEndpointReader(), ui: credentialUi(), offerMigration };
}
