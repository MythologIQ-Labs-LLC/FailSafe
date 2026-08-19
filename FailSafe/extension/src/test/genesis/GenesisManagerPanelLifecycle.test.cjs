/**
 * FailSafe#240 (Relay Cycle 024, Myth-Tech-Forge#131) — Command Center
 * destroy/reopen lifecycle.
 *
 * GenesisManager cached its own `this.xxxPanel` reference purely to decide
 * reveal-vs-create for each Command Center panel (Dashboard, Living Graph,
 * Planning Hub, Analytics Dashboard, Economics, Revert, Ledger Viewer, L3
 * Approval Queue). Every panel class already tracks its own liveness
 * correctly via a static `currentPanel` that each panel's own dispose()
 * clears. But when the user closes a panel natively (the tab's close
 * button), VS Code disposes the underlying WebviewPanel and fires
 * onDidDispose — GenesisManager's separate cached reference was never
 * cleared, so the next show*() call found it truthy, skipped
 * createOrShow(), and called .reveal() on an already-disposed webview
 * panel, which VS Code throws on.
 *
 * Follows the require.cache vscode-stub pattern from
 * src/test/extension/organizeWorkspaceCallbacks.test.cjs — inject a
 * vscodeStub with a WebviewPanel double that reproduces real VS Code's
 * disposed-panel semantics (reveal() throws after dispose()) BEFORE
 * requiring the compiled artifact.
 *
 * Runs standalone: node --test src/test/genesis/GenesisManagerPanelLifecycle.test.cjs
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact. ----
let workspaceFolders = [];
const createdPanels = [];

function makeFakeWebviewPanel(viewType) {
  let disposed = false;
  const disposeListeners = [];
  const webviewObj = {
    cspSource: 'vscode-webview:',
    html: '',
    onDidReceiveMessage: (_cb, _thisArg, disposables) => {
      const d = { dispose: () => {} };
      if (disposables) disposables.push(d);
      return d;
    },
    postMessage: () => Promise.resolve(true),
  };
  const panel = {
    viewType,
    get webview() {
      if (disposed) throw new Error('Webview is disposed and its webview property is no longer usable.');
      return webviewObj;
    },
    // Real VS Code throws when .reveal() is called on a disposed WebviewPanel.
    reveal: () => {
      if (disposed) throw new Error(`Webview panel "${viewType}" has been disposed and cannot be revealed.`);
    },
    onDidDispose: (cb, _thisArg, disposables) => {
      disposeListeners.push(cb);
      const d = { dispose: () => {} };
      if (disposables) disposables.push(d);
      return d;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeListeners.slice().forEach((cb) => cb());
    },
  };
  return panel;
}

const vscodeStub = {
  window: {
    activeTextEditor: undefined,
    createWebviewPanel: (viewType) => {
      const panel = makeFakeWebviewPanel(viewType);
      createdPanels.push(panel);
      return panel;
    },
    showWarningMessage: () => Promise.resolve(undefined),
  },
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
  ViewColumn: { One: 1 },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const outRoot = path.resolve(__dirname, '..', '..', '..', 'out');
const { GenesisManager } = require(path.join(outRoot, 'genesis', 'GenesisManager.js'));
const { EconomicsPanel } = require(path.join(outRoot, 'genesis', 'panels', 'EconomicsPanel.js'));
const { RevertPanel } = require(path.join(outRoot, 'genesis', 'panels', 'RevertPanel.js'));
const { EventBus } = require(path.join(outRoot, 'shared', 'EventBus.js'));

function mkContext(extDir) {
  return { extensionUri: { fsPath: extDir }, subscriptions: [] };
}

describe('GenesisManager Command Center panel destroy/reopen lifecycle (#240)', () => {
  let tmpDir;
  let genesis;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-genesis-lifecycle-'));
    workspaceFolders = [{ uri: { fsPath: tmpDir } }];
    genesis = new GenesisManager(mkContext(tmpDir), {}, {}, {}, new EventBus());
  });

  after(() => {
    genesis.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('showEconomics() reopens a fresh panel after a native close instead of reveal()ing the disposed one', () => {
    EconomicsPanel.currentPanel = undefined; // isolate from any other process-shared state
    createdPanels.length = 0;

    genesis.showEconomics();
    assert.equal(createdPanels.length, 1, 'first showEconomics() should create exactly one webview panel');
    const firstPanel = createdPanels[0];

    // Simulate the user clicking the panel tab's native close button: VS
    // Code disposes the WebviewPanel and fires onDidDispose.
    firstPanel.dispose();
    assert.equal(EconomicsPanel.currentPanel, undefined, 'EconomicsPanel must clear its own singleton on dispose');

    assert.doesNotThrow(
      () => genesis.showEconomics(),
      'reopening after a native close must not reveal() a disposed panel',
    );
    assert.equal(createdPanels.length, 2, 'reopening after native close should create a second webview panel');
    assert.notStrictEqual(createdPanels[1], firstPanel, 'the reopened panel must be a fresh instance');
  });

  it('showRevert() reopens a fresh panel after a native close instead of reveal()ing the disposed one', () => {
    RevertPanel.currentPanel = undefined;
    createdPanels.length = 0;
    genesis.setRevertDeps({}, {}, () => null);

    genesis.showRevert('checkpoint-not-found');
    assert.equal(createdPanels.length, 1, 'first showRevert() should create exactly one webview panel');
    const firstPanel = createdPanels[0];

    firstPanel.dispose();
    assert.equal(RevertPanel.currentPanel, undefined, 'RevertPanel must clear its own singleton on dispose');

    assert.doesNotThrow(
      () => genesis.showRevert('checkpoint-not-found'),
      'reopening after a native close must not reveal() a disposed panel',
    );
    assert.equal(createdPanels.length, 2, 'reopening after native close should create a second webview panel');
    assert.notStrictEqual(createdPanels[1], firstPanel, 'the reopened panel must be a fresh instance');
  });
});
