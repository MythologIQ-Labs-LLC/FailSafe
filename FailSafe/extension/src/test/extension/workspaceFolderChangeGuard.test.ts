// GH #240 (workspace-folder/multi-root lifecycle slice). FailSafe pins
// workspaceRoot to workspaceFolders[0] once at activation and never
// rebinds; VS Code does not restart the extension host for an in-place
// folder add/remove, so nothing previously observed that mismatch. This
// suite exercises registerWorkspaceFolderChangeGuard: adding/removing a
// folder must warn exactly once and offer "Reload Window", and a second
// folder-set change after the guard already fired must not warn again
// (no listener leak / no duplicate-prompt spam across repeated
// transitions).
//
// The folder-change event source is injected (a fake, not
// vscode.workspace) rather than driven through a real
// vscode.workspace.updateWorkspaceFolders() call: mutating the real test
// host's workspace folder set is environment-fragile here (Workspace
// Trust prompts on an unfamiliar path, and this harness's mutation did
// not reliably fire onDidChangeWorkspaceFolders at all when tried against
// the real API). The guard itself only depends on the
// onDidChangeWorkspaceFolders event shape, so a fake source exercises the
// same logic deterministically. vscode.window.showWarningMessage and
// vscode.commands.executeCommand are still the real module, monkey-patched
// per this repo's existing commands-dispatch.test.ts / commands-state.test.ts
// convention.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';

import { registerWorkspaceFolderChangeGuard } from '../../extension/workspaceFolderChangeGuard';
import { Logger } from '../../shared/Logger';

function makeFakeFolderChangeSource() {
  const listeners: Array<(event: vscode.WorkspaceFoldersChangeEvent) => unknown> = [];
  return {
    source: {
      onDidChangeWorkspaceFolders: (listener: (event: vscode.WorkspaceFoldersChangeEvent) => unknown) => {
        listeners.push(listener);
        return {
          dispose: () => {
            const idx = listeners.indexOf(listener);
            if (idx >= 0) {
              listeners.splice(idx, 1);
            }
          },
        };
      },
    },
    fire(event: vscode.WorkspaceFoldersChangeEvent): void {
      for (const listener of listeners.slice()) {
        listener(event);
      }
    },
  };
}

function makeFolder(fsPath: string): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.file(fsPath), name: fsPath, index: 0 };
}

suite('workspaceFolderChangeGuard', () => {
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
    const { source, fire } = makeFakeFolderChangeSource();
    const disposable = registerWorkspaceFolderChangeGuard(fakeContext, logger, source);

    try {
      fire({ added: [makeFolder('/fake/added')], removed: [] });

      assert.equal(warnCalls.length, 1, 'guard must warn exactly once after the first folder-set change');
      assert.ok(
        warnCalls[0].items.includes('Reload Window'),
        'warning must offer a Reload Window action',
      );

      // A second folder-set change must not produce a second prompt — the
      // guard fires once per activation, not once per transition, since
      // the only correct remediation (reload) already invalidates the
      // extension host that is warning.
      fire({ added: [], removed: [makeFolder('/fake/added')] });

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
    const { source, fire } = makeFakeFolderChangeSource();
    const disposable = registerWorkspaceFolderChangeGuard(fakeContext, logger, source);

    try {
      fire({ added: [makeFolder('/fake/added')], removed: [] });

      // The guard's own showWarningMessage(...).then(...) resolution is a
      // microtask queued after the synchronous fire() above; give it a
      // turn before asserting on the follow-up command.
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

  test('registered disposable removes the listener from the folder-change source', () => {
    const fakeContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const logger = new Logger('workspaceFolderChangeGuard.test');
    const { source, fire } = makeFakeFolderChangeSource();

    const warnCalls: unknown[] = [];
    const originalWarn = vscode.window.showWarningMessage;
    (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (...args: unknown[]) => {
      warnCalls.push(args);
      return Promise.resolve(undefined);
    };

    const disposable = registerWorkspaceFolderChangeGuard(fakeContext, logger, source);
    try {
      disposable.dispose();
      fire({ added: [makeFolder('/fake/added')], removed: [] });
      assert.equal(warnCalls.length, 0, 'a disposed guard must not react to further folder-change events');
    } finally {
      (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
    }
  });
});
