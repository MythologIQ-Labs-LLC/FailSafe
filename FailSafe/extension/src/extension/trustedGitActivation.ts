/**
 * Feeds the trusted-git resolver (src/shared/git/trustedGit.ts) from VS Code
 * at activation, before any git consumer runs (plan-v607-final-integration
 * Phase 2). The workspace folders become excluded roots; the Git extension's
 * resolved path is only a hint, validated like every other candidate.
 */

import * as vscode from 'vscode';
import { configureTrustedGit, workspaceDirsFor } from '../shared/git/trustedGit';

/** The subset of the vscode.git extension API read here (extensions/git/src/api/git.d.ts). */
interface GitExtensionExports {
  readonly enabled: boolean;
  getAPI(version: 1): { readonly git: { readonly path: string } };
}

/** The Git extension's git path, or undefined; never activates the extension and never throws. */
function readGitExtensionPath(): string | undefined {
  try {
    const ext = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!ext || !ext.isActive || !ext.exports?.enabled) return undefined;
    const p = ext.exports.getAPI(1).git.path;
    return typeof p === 'string' && p.length > 0 ? p : undefined;
  } catch {
    return undefined;
  }
}

const folderPaths = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

/** Synchronous: when it returns, every later git call sees the workspace folders. */
export function configureTrustedGitFromVscode(context: vscode.ExtensionContext): void {
  // FailSafe stays bound to the activation-time first folder until reload, so
  // a folder change adds to the excluded set and never replaces it.
  const activationRoot = folderPaths()[0];
  configureTrustedGit({ workspaceDirs: workspaceDirsFor(activationRoot, folderPaths()), hint: readGitExtensionPath() });
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
    configureTrustedGit({ workspaceDirs: workspaceDirsFor(activationRoot, folderPaths()), hint: readGitExtensionPath() });
  }));
}
