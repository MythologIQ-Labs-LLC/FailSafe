/**
 * workspaceFolderChangeGuard — surfaces post-activation workspace-folder
 * changes instead of letting them pass silently.
 *
 * FailSafe reads `vscode.workspace.workspaceFolders?.[0]` exactly once at
 * activation (ConfigManager.workspaceRoot) and threads that single path
 * into every long-lived singleton it constructs: WorkspaceMutationBus
 * watchers (TrustEngine, PlanManager, ConsoleLifecycleService,
 * HubSnapshotService, tracker-sidecar, substrate-command), the local
 * Roadmap/Console HTTP server, the SQLite ledger, and SentinelDaemon.
 * None of them listen for `onDidChangeWorkspaceFolders`.
 *
 * VS Code does not restart the extension host when folders are added to
 * or removed from an already-open workspace (`workspace.updateWorkspaceFolders`,
 * or the "Add Folder to Workspace...")  — only replacing the workspace
 * entirely (`File > Open Folder`) does that. So after an in-place folder
 * change, FailSafe keeps every governance/watcher/server binding pointed
 * at the original root: a newly added folder is invisible to it, and a
 * removed root (if it was the original folder[0]) leaves it operating
 * against a path that is no longer part of the workspace.
 *
 * Safely rebinding every one of those singletons live is out of scope for
 * a bounded fix. Instead this makes the mismatch observable and offers
 * the one action that reliably fixes it: a window reload, which re-runs
 * `activate()` against the current folder set.
 */
import * as vscode from 'vscode';
import { Logger } from '../shared/Logger';

const RELOAD_ACTION = 'Reload Window';

type FolderChangeSource = Pick<typeof vscode.workspace, 'onDidChangeWorkspaceFolders'>;

/**
 * `folderChangeSource` defaults to the real `vscode.workspace` and only
 * exists as a seam for tests: driving a real workspace-folder mutation
 * through `vscode.workspace.updateWorkspaceFolders()` in a test host is
 * environment-fragile (workspace trust, whether the harness even applies
 * the mutation), so tests inject a fake event source instead of asserting
 * against real Electron workspace state.
 */
export function registerWorkspaceFolderChangeGuard(
  context: vscode.ExtensionContext,
  logger: Logger,
  folderChangeSource: FolderChangeSource = vscode.workspace,
): vscode.Disposable {
  let warned = false;

  const disposable = folderChangeSource.onDidChangeWorkspaceFolders((event) => {
    if (warned) {
      return;
    }
    warned = true;

    logger.warn(
      'Workspace folders changed after activation; FailSafe remains bound to the original workspace root until reload',
      {
        added: event.added.map((folder) => folder.uri.fsPath),
        removed: event.removed.map((folder) => folder.uri.fsPath),
      },
    );

    void vscode.window
      .showWarningMessage(
        'FailSafe governance state is bound to the workspace as it was when the window opened. ' +
          'Reload the window so FailSafe applies to the current folder set.',
        RELOAD_ACTION,
      )
      .then((choice) => {
        if (choice === RELOAD_ACTION) {
          void vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
  });

  context.subscriptions.push(disposable);
  return disposable;
}
