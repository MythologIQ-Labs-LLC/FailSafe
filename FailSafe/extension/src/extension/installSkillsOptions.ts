import * as vscode from 'vscode';
import { QOR_LOGIC_HOSTS, type QorLogicHost } from '../qorlogic/hostLayouts';
import type { QorLogicScope } from '../qorlogic/QorLogicSkillIngestor';

export interface InstallSkillsOptions {
  hosts: QorLogicHost[];
  scope: QorLogicScope;
}

export const STATE_KEY = 'failsafe.installSkills.lastOptions';
const DEFAULT_HOSTS: QorLogicHost[] = ['claude', 'codex'];

interface HostQuickPickItem extends vscode.QuickPickItem {
  host: QorLogicHost;
}

interface ScopeQuickPickItem extends vscode.QuickPickItem {
  scope: QorLogicScope;
}

export async function resolveInstallSkillsOptions(
  context: vscode.ExtensionContext,
): Promise<InstallSkillsOptions | undefined> {
  const prior = context.workspaceState.get<InstallSkillsOptions>(STATE_KEY);
  const priorHosts = prior?.hosts ?? DEFAULT_HOSTS;

  const hostItems: HostQuickPickItem[] = QOR_LOGIC_HOSTS.map((host) => ({
    label: host,
    host,
    picked: priorHosts.includes(host),
  }));

  const hostSelection = await vscode.window.showQuickPick(hostItems, {
    canPickMany: true,
    title: 'Install Qor-Logic Skills',
    placeHolder: 'Select target hosts',
  });
  if (!hostSelection || hostSelection.length === 0) return undefined;

  const scopeItems: ScopeQuickPickItem[] = [
    // #463: only repository-scoped receipts can be independently verified.
    { label: 'repo', description: 'Workspace-local install (.claude/, .codex/, ...)', scope: 'repo', picked: true },
  ];

  const scopeSelection = await vscode.window.showQuickPick(scopeItems, {
    canPickMany: false,
    title: 'Install Qor-Logic Skills',
    placeHolder: 'Select install scope',
  });
  if (!scopeSelection) return undefined;

  const options: InstallSkillsOptions = {
    hosts: hostSelection.map((i) => i.host),
    scope: scopeSelection.scope,
  };
  await context.workspaceState.update(STATE_KEY, options);
  return options;
}
