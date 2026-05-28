/**
 * FX725 — bootstrapOpenDesignMcp tests.
 *
 * Uses the vscode-stub require.cache pattern from
 * organizeWorkspaceCallbacks.test.cjs:21-33. Loads the compiled
 * `out/extension/bootstrapOpenDesignMcp.js` artifact.
 *
 * Runs standalone:
 *   node --test src/test/extension/bootstrapOpenDesignMcp.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact ----

const stub = {
  configValues: {},
  warnings: [],
  infos: [],
  errors: [],
  commands: new Map(),
  subscriptions: [],
};

const vscodeStub = {
  workspace: {
    getConfiguration: (_section) => ({
      get: (key, defaultValue) =>
        stub.configValues[key] !== undefined ? stub.configValues[key] : defaultValue,
    }),
  },
  window: {
    showWarningMessage: async (msg) => {
      stub.warnings.push(msg);
    },
    showInformationMessage: async (msg) => {
      stub.infos.push(msg);
    },
    showErrorMessage: async (msg) => {
      stub.errors.push(msg);
    },
  },
  commands: {
    registerCommand: (id, fn) => {
      stub.commands.set(id, fn);
      return { dispose: () => stub.commands.delete(id) };
    },
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

const compiled = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'out',
  'extension',
  'bootstrapOpenDesignMcp.js',
);

// Stub the MCP client + probe modules BEFORE the bootstrap module is required
// so the bootstrap's static imports resolve to the stubs.

let probeResultToReturn;
let connectShouldThrow = false;
let mcpConstructorCalls = 0;
let capabilitiesToReturn = new Set();
let connectCallCount = 0;
let disconnectCallCount = 0;
let isConnectedState = false;

const probeStubPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'out',
  'integrations',
  'open-design',
  'OpenDesignDaemonProbe.js',
);
const mcpStubPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'out',
  'integrations',
  'open-design',
  'OpenDesignMcpClient.js',
);
const sseStubPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'out',
  'integrations',
  'open-design',
  'OpenDesignSseClient.js',
);

require.cache[probeStubPath] = {
  id: probeStubPath,
  filename: probeStubPath,
  loaded: true,
  exports: {
    OpenDesignDaemonProbe: class {
      async probe() {
        return probeResultToReturn;
      }
    },
  },
};

require.cache[mcpStubPath] = {
  id: mcpStubPath,
  filename: mcpStubPath,
  loaded: true,
  exports: {
    OpenDesignMcpClient: class {
      constructor(opts) {
        mcpConstructorCalls++;
        this.opts = opts;
      }
      async connect() {
        connectCallCount++;
        if (connectShouldThrow) throw new Error('connect failed');
        isConnectedState = true;
      }
      async disconnect() {
        disconnectCallCount++;
        isConnectedState = false;
      }
      isConnected() {
        return isConnectedState;
      }
      getCapabilities() {
        return capabilitiesToReturn;
      }
    },
  },
};

require.cache[sseStubPath] = {
  id: sseStubPath,
  filename: sseStubPath,
  loaded: true,
  exports: {
    OpenDesignSseClient: class {
      constructor() {}
    },
  },
};

const { bootstrapOpenDesignMcp } = require(compiled);

function makeContext() {
  const subs = [];
  return {
    subscriptions: {
      push: (item) => subs.push(item),
      all: () => subs,
    },
    _subs: subs,
  };
}

function resetStubState() {
  stub.configValues = {};
  stub.warnings.length = 0;
  stub.infos.length = 0;
  stub.errors.length = 0;
  stub.commands.clear();
  stub.subscriptions.length = 0;
  probeResultToReturn = { alive: false, reason: 'refused' };
  connectShouldThrow = false;
  mcpConstructorCalls = 0;
  capabilitiesToReturn = new Set(['list_projects', 'get_file']);
  connectCallCount = 0;
  disconnectCallCount = 0;
  isConnectedState = false;
}

describe('bootstrapOpenDesignMcp', () => {
  beforeEach(() => {
    resetStubState();
  });

  it('registers the failsafe.openDesign.registerMcp command', () => {
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    assert.equal(stub.commands.has('failsafe.openDesign.registerMcp'), true);
  });

  it('mcpEnabled=false defers client construction until the wizard runs', () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = false;
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    assert.equal(mcpConstructorCalls, 0);
  });

  it('mcpEnabled=true pre-constructs the client at bootstrap', () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = true;
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    assert.equal(mcpConstructorCalls, 1);
  });

  it('wizard with unreachable daemon shows warning + does not construct client', async () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = false;
    probeResultToReturn = { alive: false, reason: 'timeout' };
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    const wizard = stub.commands.get('failsafe.openDesign.registerMcp');
    await wizard();
    assert.equal(stub.warnings.length, 1);
    assert.match(stub.warnings[0], /unreachable/);
    assert.match(stub.warnings[0], /timeout/);
    assert.equal(mcpConstructorCalls, 0);
    assert.equal(connectCallCount, 0);
  });

  it('wizard with reachable daemon constructs client + connects + shows info', async () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = false;
    probeResultToReturn = { alive: true, version: '0.9.1' };
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    const wizard = stub.commands.get('failsafe.openDesign.registerMcp');
    await wizard();
    assert.equal(mcpConstructorCalls, 1);
    assert.equal(connectCallCount, 1);
    assert.equal(stub.infos.length, 1);
    assert.match(stub.infos[0], /connected/);
    assert.match(stub.infos[0], /2 tools/); // capabilitiesToReturn size
  });

  it('wizard with connect failure shows error message', async () => {
    probeResultToReturn = { alive: true, version: '0.9.1' };
    connectShouldThrow = true;
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    const wizard = stub.commands.get('failsafe.openDesign.registerMcp');
    await wizard();
    assert.equal(stub.errors.length, 1);
    assert.match(stub.errors[0], /connect failed/);
  });

  it('dispose subscription tears down active connection', async () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = true;
    probeResultToReturn = { alive: true, version: '0.9.1' };
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo');
    const wizard = stub.commands.get('failsafe.openDesign.registerMcp');
    await wizard();
    assert.equal(isConnectedState, true);
    // Find the dispose subscription.
    const disposable = ctx._subs.find((s) => s && typeof s.dispose === 'function' && !stub.commands.has(s));
    // The command-registration result also has dispose; locate the bootstrap's
    // own non-command dispose by checking which dispose triggers disconnect.
    for (const sub of ctx._subs) {
      if (sub && typeof sub.dispose === 'function') sub.dispose();
    }
    // Disconnect is fire-and-forget; allow microtask flush.
    await new Promise((r) => setImmediate(r));
    assert.ok(disconnectCallCount >= 1, 'expected dispose to call disconnect');
  });
});
