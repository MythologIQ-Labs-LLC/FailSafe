/**
 * vscodeCredentialAdapters - the VS Code side of IntegrationCredentials:
 * settings inspection and removal, workspace identity, and endpoint scope
 * lookup (#482, FX962/FX965).
 */

import * as vscode from 'vscode';
import type { ConfigurationInspector } from './IntegrationCredentials';
import type { PlainTextCopy, StoredScope } from './credentialRegistry';
import type { EndpointReader, EndpointScope } from './credentialGates';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function workspaceIdentity(): string | undefined {
  return vscode.workspace.workspaceFile?.toString() ?? vscode.workspace.workspaceFolders?.[0]?.uri.toString();
}

/**
 * Folder values are read only in a multi-root window: in a single-folder
 * window the folder's settings file is the workspace settings, which
 * workspaceValue already reports.
 */
function folderCopies(settingKey: string): PlainTextCopy[] {
  if (!vscode.workspace.workspaceFile) return [];
  const out: PlainTextCopy[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const value = text(vscode.workspace.getConfiguration(undefined, folder.uri).inspect(settingKey)?.workspaceFolderValue);
    if (value) out.push({ scope: 'folder', value, folder: folder.uri.fsPath });
  }
  return out;
}

export function createConfigurationInspector(): ConfigurationInspector {
  return {
    inspect(settingKey) {
      const i = vscode.workspace.getConfiguration().inspect(settingKey);
      const out: PlainTextCopy[] = [];
      const user = text(i?.globalValue);
      const workspace = text(i?.workspaceValue);
      if (user) out.push({ scope: 'user', value: user });
      if (workspace) out.push({ scope: 'workspace', value: workspace });
      return [...out, ...folderCopies(settingKey)];
    },
    async remove(settingKey: string, scope: StoredScope) {
      const target = scope === 'user' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
      await vscode.workspace.getConfiguration().update(settingKey, undefined, target);
    },
    workspaceIdentity,
  };
}

/** Effective endpoint value and its scope. Folder values are not applied for these window-scoped settings. */
export function createEndpointReader(): EndpointReader {
  return {
    endpoint(settingKey) {
      const i = vscode.workspace.getConfiguration().inspect(settingKey);
      const workspace = text(i?.workspaceValue);
      if (workspace) return { value: workspace, scope: 'workspace' as EndpointScope };
      const user = text(i?.globalValue);
      if (user) return { value: user, scope: 'user' as EndpointScope };
      const fallback = text(i?.defaultValue);
      return { value: fallback || undefined, scope: 'default' as EndpointScope };
    },
  };
}
