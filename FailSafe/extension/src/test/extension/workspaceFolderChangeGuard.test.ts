// GH #240 (workspace-folder/multi-root lifecycle slice). FailSafe pins
// workspaceRoot to workspaceFolders[0] once at activation and never
// rebinds; VS Code does not restart the extension host for an in-place
// folder add/remove, so nothing previously observed that mismatch. This
// suite exercises registerWorkspaceFolderChangeGuard against the real
// vscode.workspace API: adding/removing a folder must warn exactly once
// and offer "Reload Window", and a second folder-set change after the
// guard already fired must not warn again (no listener leak / no
// duplicate-prompt spam across repeated transitions).
//
// The extra folder is created *inside* the already-open (and therefore
// already-trusted) test workspace root rather than under os.tmpdir().
// VS Code's Workspace Trust prompts for any folder outside an already
// -trusted path before it can be added via updateWorkspaceFolders; an
// unrelated tmpdir path triggers that prompt, which has nothing to
// dismiss it under the headless xvfb test host and hangs until the
// mocha timeout. A nested path inherits the parent's trust decision.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { registerWorkspaceFolderChangeGuard } from '../../extension/workspaceFolderChangeGuard';
import { Logger } from '../../shared/Logger';

function waitForNextFolderChange(): Promise<vscode.WorkspaceFoldersChangeEvent> {
  return new Promise((resolve) => {
    const sub = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      sub.dispose();
      resolve(event);
    });
  });
}

suite('workspaceFolderChangeGuard', () => {
  let extraFolder: string;

  setup(() => {
    const trustedRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(trustedRoot, 'test host must have an open workspace folder');
    extraFolder = fs.mkdtempSync(path.join(trustedRoot, '.wfc-guard-'));
  });

  teardown(async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const idx = folders.findIndex((folder) => folder.uri.fsPath === extraFolder);
    if (idx >= 0) {
      const changed = waitForNextFolderChange();
      vscode.workspace.updateWorkspaceFolders(idx, 1);
      await changed;
    }
    fs.rmSync(extraFolder, { recursive: true, force: true });
  });

  test('warns once with a Reload Window action when a folder is added, and does not warn again on a further change', async () => {
    const warnCalls: Array<{ message: string; items: string[] }> = [];
    const originalWarn = vscode.window.showWarningMessage;
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (
      message: string,
      ...items: string[]
    ) => {
      warnCalls.push({ message, items });
      return Promise.resolve(undefined);
    };

    const fakeContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const logger = new Logger('workspaceFolderChangeGuard.test');
    const disposable = registerWorkspaceFolderChangeGuard(fakeContext, logger);

    try {
      const startCount = vscode.workspace.workspaceFolders?.length ?? 0;

      const firstChange = waitForNextFolderChange();
      vscode.workspace.updateWorkspaceFolders(startCount, 0, {
        uri: vscode.Uri.file(extraFolder),
      });
      await firstChange;

      assert.equal(warnCalls.length, 1, 'guard must warn exactly once after the first folder-set change');
      assert.ok(
        warnCalls[0].items.includes('Reload Window'),
        'warning must offer a Reload Window action',
      );

      // A second folder-set change (remove the folder we just added) must
      // not produce a second prompt — the guard fires once per activation,
      // not once per transition, since the only correct remediation
      // (reload) already invalidates the extension host that is warning.
      const secondChange = waitForNextFolderChange();
      const idx = (vscode.workspace.workspaceFolders ?? []).findIndex(
        (folder) => folder.uri.fsPath === extraFolder,
      );
      vscode.workspace.updateWorkspaceFolders(idx, 1);
      await secondChange;

      assert.equal(warnCalls.length, 1, 'guard must not warn again on a subsequent folder-set change');
    } finally {
      (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
      disposable.dispose();
    }
  });

  test('executes workbench.action.reloadWindow only when the operator picks Reload Window', async () => {
    const originalWarn = vscode.window.showWarningMessage;
    const originalExec = vscode.commands.executeCommand.bind(vscode.commands);
    const executed: string[] = [];

    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = () =>
      Promise.resolve('Reload Window');
    (vscode.commands as { executeCommand: unknown }).executeCommand = (name: string, ...args: unknown[]) => {
      executed.push(name);
      if (name === 'workbench.action.reloadWindow') {
        // Never actually reload the shared test host; swallow it.
        return Promise.resolve();
      }
      return originalExec(name, ...args);
    };

    const fakeContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const logger = new Logger('workspaceFolderChangeGuard.test');
    const disposable = registerWorkspaceFolderChangeGuard(fakeContext, logger);

    try {
      const startCount = vscode.workspace.workspaceFolders?.length ?? 0;
      const change = waitForNextFolderChange();
      vscode.workspace.updateWorkspaceFolders(startCount, 0, {
        uri: vscode.Uri.file(extraFolder),
      });
      await change;

      // The guard's own showWarningMessage(...).then(...) resolution is a
      // microtask queued after the synchronous event dispatch above; give
      // it a turn before asserting on the follow-up command.
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(
        executed.includes('workbench.action.reloadWindow'),
        'picking Reload Window must invoke workbench.action.reloadWindow',
      );
    } finally {
      (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
      (vscode.commands as { executeCommand: unknown }).executeCommand = originalExec;
      disposable.dispose();
    }
  });
});
