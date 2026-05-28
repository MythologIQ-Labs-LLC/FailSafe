/**
 * FX715 — failsafe.substrate.run command.
 *
 * Follows the require.cache vscode-stub pattern from
 * src/test/extension/organizeWorkspaceCallbacks.test.cjs:21-33 — inject
 * a vscodeStub with commands.registerCommand / window.createOutputChannel /
 * window.showInformationMessage mocks BEFORE requiring the compiled artifact.
 *
 * Runs standalone: node --test src/test/extension/substrate-command.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact. ----
let registeredCommand = null;
let registeredHandler = null;
const outputChannelLines = [];
let infoMessages = [];
let warnMessages = [];
let workspaceFolders = [];
const subscriptions = [];

const vscodeStub = {
  commands: {
    registerCommand: (id, handler) => {
      registeredCommand = id;
      registeredHandler = handler;
      return { dispose: () => {} };
    },
  },
  window: {
    createOutputChannel: (_name) => ({
      appendLine: (l) => outputChannelLines.push(String(l)),
      show: () => {},
      hide: () => {},
      clear: () => {},
      dispose: () => {},
      replace: () => {},
      append: () => {},
      name: 'FailSafe Substrate',
    }),
    showInformationMessage: (m) => { infoMessages.push(String(m)); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { warnMessages.push(String(m)); return Promise.resolve(undefined); },
  },
  workspace: {
    get workspaceFolders() { return workspaceFolders; },
    getConfiguration: () => ({ get: () => undefined }),
  },
  extensions: {
    getExtension: () => undefined,
  },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const compiled = path.resolve(
  __dirname, '..', '..', '..', 'out', 'extension', 'substrate-command.js',
);
const { registerSubstrateCommand } = require(compiled);

function mkContext() {
  return { subscriptions };
}

function fakeBus() {
  const calls = [];
  return {
    emit: (...args) => calls.push(args),
    calls,
  };
}

function fakeConfig() {
  return { get: () => undefined };
}

// Fake RunCommand that pretends Python is missing — resolver returns ok=false
// and every QorScriptInvoker.invoke yields a spawn-error result. The runner
// still completes; modules return ok=false with empty findings.
async function fakeRun(_cmd, _args) {
  return { stdout: '', stderr: 'not found', code: 127 };
}

describe('failsafe.substrate.run command (FX715)', () => {
  beforeEach(() => {
    registeredCommand = null;
    registeredHandler = null;
    outputChannelLines.length = 0;
    infoMessages = [];
    warnMessages = [];
    subscriptions.length = 0;
    workspaceFolders = [];
  });

  it('registers the failsafe.substrate.run command and pushes disposables onto context.subscriptions', () => {
    registerSubstrateCommand(mkContext(), fakeBus(), fakeConfig(), fakeRun);
    assert.equal(registeredCommand, 'failsafe.substrate.run');
    assert.ok(typeof registeredHandler === 'function');
    // Output channel + command disposable both pushed.
    assert.ok(subscriptions.length >= 2);
  });

  it('handler with no workspace open → shows warning, does not run modules', async () => {
    workspaceFolders = [];
    const bus = fakeBus();
    registerSubstrateCommand(mkContext(), bus, fakeConfig(), fakeRun);
    await registeredHandler();
    assert.equal(warnMessages.length, 1);
    assert.match(warnMessages[0], /no workspace folder/i);
    assert.equal(bus.calls.length, 0);
  });

  it('handler with workspace runs all 3 modules, writes summary lines, emits transparency event', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-substrate-cmd-'));
    workspaceFolders = [{ uri: { fsPath: tmp } }];
    const bus = fakeBus();
    try {
      registerSubstrateCommand(mkContext(), bus, fakeConfig(), fakeRun);
      await registeredHandler();
      // Output channel got the start + complete lines + per-module summary.
      assert.ok(outputChannelLines.some((l) => /starting run/.test(l)), 'starting line missing');
      assert.ok(outputChannelLines.some((l) => /complete:/.test(l)), 'complete line missing');
      assert.ok(outputChannelLines.some((l) => /secret_scanner/.test(l)), 'secret_scanner line missing');
      assert.ok(outputChannelLines.some((l) => /feature_index_verify/.test(l)), 'feature_index_verify line missing');
      assert.ok(outputChannelLines.some((l) => /model_pinning_lint/.test(l)), 'model_pinning_lint line missing');
      // Exactly one transparency event emitted.
      assert.equal(bus.calls.length, 1);
      assert.equal(bus.calls[0][0], 'substrate.run.complete');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('handler surfaces total-finding count via showInformationMessage', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-substrate-cmd-info-'));
    workspaceFolders = [{ uri: { fsPath: tmp } }];
    try {
      registerSubstrateCommand(mkContext(), fakeBus(), fakeConfig(), fakeRun);
      await registeredHandler();
      assert.equal(infoMessages.length, 1);
      assert.match(infoMessages[0], /FailSafe Substrate:.*finding/i);
      assert.match(infoMessages[0], /output channel/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
