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

// B-SUBSTRATE-3 seal auto-hook — ledger reads now go through the qorlogic
// consumer adapter (#233 migration). Covers the adapter-classified states the
// watcher branches on: ok (fires on a new seal), unavailable (no watcher
// wired), and malformed (logged, never fires / never throws).
describe('failsafe.substrate.run seal auto-hook (B-SUBSTRATE-3, #233 adapter migration)', () => {
  function fakeMutationBus() {
    const watchers = [];
    return {
      registerWatcher: (absPath, onMutation) => {
        watchers.push({ absPath, onMutation });
        return { dispose: () => {} };
      },
      watchers,
    };
  }

  function writeLedger(tmp, text) {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'META_LEDGER.md'), text, 'utf-8');
  }

  const SEAL_1 = '### Entry #1: SESSION SEAL — first\n\n**Phase**: SUBSTANTIATE\n**Chain Hash**: `'
    + 'a'.repeat(64) + '`\n\n';
  const SEAL_2 = '### Entry #2: SESSION SEAL — second\n\n**Phase**: SUBSTANTIATE\n**Chain Hash**: `'
    + 'b'.repeat(64) + '`\n\n';

  beforeEach(() => {
    registeredCommand = null;
    registeredHandler = null;
    outputChannelLines.length = 0;
    infoMessages = [];
    warnMessages = [];
    subscriptions.length = 0;
    workspaceFolders = [];
  });

  it('no docs/META_LEDGER.md at activation → no watcher registered', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-substrate-seal-none-'));
    workspaceFolders = [{ uri: { fsPath: tmp } }];
    const bus = fakeMutationBus();
    try {
      registerSubstrateCommand(mkContext(), fakeBus(), fakeConfig(), fakeRun, bus);
      assert.equal(bus.watchers.length, 0, 'unavailable ledger wires no watcher');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a new SESSION SEAL entry → auto-runs substrate; the pre-existing seal does not', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-substrate-seal-ok-'));
    writeLedger(tmp, SEAL_1);
    workspaceFolders = [{ uri: { fsPath: tmp } }];
    const bus = fakeMutationBus();
    try {
      registerSubstrateCommand(mkContext(), fakeBus(), fakeConfig(), fakeRun, bus);
      assert.equal(bus.watchers.length, 1, 'watcher registered for an available ledger');

      // Re-firing on the SAME (seeded) content must not fire — it's the
      // pre-existing seal, not a new one.
      bus.watchers[0].onMutation();
      assert.ok(!outputChannelLines.some((l) => /new SESSION SEAL detected/.test(l)), 'no fire on unchanged ledger');

      // Append a second seal and fire again → new seal → auto-run.
      writeLedger(tmp, SEAL_1 + SEAL_2);
      bus.watchers[0].onMutation();
      assert.ok(outputChannelLines.some((l) => /new SESSION SEAL detected/.test(l)), 'fires on a genuinely new seal');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('malformed ledger (no entries) at watcher-fire time → logs and does not fire or throw', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-substrate-seal-malformed-'));
    writeLedger(tmp, SEAL_1);
    workspaceFolders = [{ uri: { fsPath: tmp } }];
    const bus = fakeMutationBus();
    try {
      registerSubstrateCommand(mkContext(), fakeBus(), fakeConfig(), fakeRun, bus);
      assert.equal(bus.watchers.length, 1);

      // Corrupt the ledger to something with no `### Entry #N:` headers at all
      // → parseMetaLedgerEntries → [] on a non-empty file → adapter: malformed.
      writeLedger(tmp, 'not a valid governance ledger, no entries here\n');
      assert.doesNotThrow(() => bus.watchers[0].onMutation());
      assert.ok(
        outputChannelLines.some((l) => /META_LEDGER\.md is malformed/.test(l)),
        'malformed state is logged (fail-visible)',
      );
      assert.ok(!outputChannelLines.some((l) => /new SESSION SEAL detected/.test(l)), 'malformed ledger never fires');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
