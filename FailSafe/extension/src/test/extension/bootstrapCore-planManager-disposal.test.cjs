/**
 * Myth-Tech-Forge#193 / FailSafe#388 (Relay Cycle 074) — bootstrapCore
 * planManager disposal-ownership tests.
 *
 * Uses the vscode-stub require.cache pattern from
 * bootstrapOpenDesignMcp.test.cjs. Loads the compiled
 * `out/extension/bootstrapCore.js` artifact.
 *
 * Prior to this fix, planManager (constructed here) was only ever disposed
 * via `ConsoleServer.stop()` — a service constructed much later in
 * activation. Any throw between planManager's construction and
 * ConsoleServer's construction reached the activation catch block with
 * `consoleServer` still undefined, so `consoleServer?.stop()` was a no-op
 * and planManager's mutation-bus watchers leaked for the life of the
 * extension host process. The fix pushes planManager's disposer directly
 * into `context.subscriptions` at construction time, so it is released on
 * both normal deactivate and the activation-failure teardown path,
 * regardless of what else has or hasn't been constructed yet.
 *
 * Runs standalone:
 *   node --test src/test/extension/bootstrapCore-planManager-disposal.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact ----

const vscodeStub = {
  workspace: {
    getConfiguration: (_section) => ({
      get: (_key, defaultValue) => defaultValue,
    }),
  },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = {
  id: 'vscode',
  filename: 'vscode',
  loaded: true,
  exports: vscodeStub,
};

// ---- collaborator stubs installed BEFORE requiring the compiled artifact ----
// ConfigManager, PlanManager, and ensureGitRepositoryReady are I/O-facing
// collaborators unrelated to the disposal-ownership wiring under test here;
// EventBus, WorkspaceMutationBus, and ModeTransitionHistory have no vscode
// dependency and no meaningful I/O, so they run for real.

let planManagerConstructedWith = null;
let planManagerDisposeCalls = 0;

const configManagerStubPath = path.resolve(__dirname, '..', '..', '..', 'out', 'shared', 'ConfigManager.js');
const planManagerStubPath = path.resolve(__dirname, '..', '..', '..', 'out', 'qorelogic', 'planning', 'PlanManager.js');
const gitBootstrapStubPath = path.resolve(__dirname, '..', '..', '..', 'out', 'shared', 'gitBootstrap.js');

require.cache[configManagerStubPath] = {
  id: configManagerStubPath,
  filename: configManagerStubPath,
  loaded: true,
  exports: {
    ConfigManager: class {
      getWorkspaceRoot() {
        return '/fake/workspace';
      }
    },
  },
};

require.cache[planManagerStubPath] = {
  id: planManagerStubPath,
  filename: planManagerStubPath,
  loaded: true,
  exports: {
    PlanManager: class {
      constructor(workspaceRoot, eventBus, mutationBus) {
        planManagerConstructedWith = { workspaceRoot, eventBus, mutationBus };
      }
      dispose() {
        planManagerDisposeCalls += 1;
      }
    },
  },
};

require.cache[gitBootstrapStubPath] = {
  id: gitBootstrapStubPath,
  filename: gitBootstrapStubPath,
  loaded: true,
  exports: {
    ensureGitRepositoryReady: async () => ({
      gitAvailable: true,
      repoInitialized: true,
      installedGit: false,
      initializedRepo: false,
    }),
  },
};

const compiled = path.resolve(__dirname, '..', '..', '..', 'out', 'extension', 'bootstrapCore.js');
const { bootstrapCore } = require(compiled);

function makeContext() {
  const subs = [];
  return {
    subscriptions: { push: (item) => subs.push(item) },
    _subs: subs,
  };
}

function makeLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

function resetStubState() {
  planManagerConstructedWith = null;
  planManagerDisposeCalls = 0;
}

describe('bootstrapCore planManager disposal ownership (FailSafe#388)', () => {
  beforeEach(() => {
    resetStubState();
  });

  it('pushes a planManager disposer into context.subscriptions at construction time', async () => {
    const ctx = makeContext();
    await bootstrapCore(ctx, makeLogger(), {});

    assert.ok(planManagerConstructedWith, 'planManager should have been constructed');
    assert.equal(planManagerDisposeCalls, 0, 'planManager must not be disposed merely by bootstrapping');

    const planManagerDisposer = ctx._subs.find((s) => {
      if (!s || typeof s.dispose !== 'function') return false;
      const before = planManagerDisposeCalls;
      s.dispose();
      const fired = planManagerDisposeCalls > before;
      if (fired) return true;
      return false;
    });

    assert.ok(planManagerDisposer, 'context.subscriptions should contain a disposer that disposes planManager');
    assert.equal(planManagerDisposeCalls, 1, 'planManager.dispose() should have been called exactly once via context.subscriptions');
  });

  it('the pushed disposer tears planManager down independently of any later-constructed service', async () => {
    // Simulates the activation-failure shape from FailSafe#388 F2: something
    // downstream of bootstrapCore (e.g. ConsoleServer) never gets
    // constructed, so nothing but context.subscriptions can reach
    // planManager. teardownActivatedResources() in main.ts disposes
    // context.subscriptions-registered items on the crash path; this proves
    // planManager is one of them without needing to construct the rest of
    // the activation chain.
    const ctx = makeContext();
    await bootstrapCore(ctx, makeLogger(), {});

    // No consoleServer was ever constructed in this scenario.
    const consoleServer = undefined;
    assert.equal(consoleServer, undefined);

    for (const sub of ctx._subs) {
      if (sub && typeof sub.dispose === 'function') sub.dispose();
    }

    assert.equal(planManagerDisposeCalls, 1, 'planManager should be disposed via context.subscriptions even though no ConsoleServer was ever constructed');
  });
});
