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
  modalChoice: undefined,
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
    showWarningMessage: async (msg, ...rest) => {
      stub.warnings.push(msg);
      // Modal consent prompts pass {modal:true}; return the scripted choice.
      if (rest[0] && rest[0].modal) return stub.modalChoice;
      return undefined;
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
let lastClientOpts = null;
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
const launchSpecPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'out',
  'integrations',
  'open-design',
  'OpenDesignLaunchSpec.js',
);
// Real parse/format/sameSpec; only the network fetch is scripted.
const realLaunchSpec = require(launchSpecPath);
let fetchedSpecPayload;
require.cache[launchSpecPath] = {
  id: launchSpecPath,
  filename: launchSpecPath,
  loaded: true,
  exports: {
    ...realLaunchSpec,
    fetchLaunchSpec: async () =>
      fetchedSpecPayload === 'refused'
        ? { ok: false, reason: 'refused' }
        : realLaunchSpec.parseLaunchSpec(fetchedSpecPayload),
  },
};

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
        lastClientOpts = opts;
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

const os = require('os');
const fs = require('fs');

function makeContext() {
  const subs = [];
  const state = new Map();
  const storageDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-od-')), 'globalStorage');
  return {
    subscriptions: {
      push: (item) => subs.push(item),
      all: () => subs,
    },
    globalState: {
      get: (k) => state.get(k),
      update: async (k, v) => { state.set(k, v); },
    },
    globalStorageUri: { fsPath: storageDir },
    _subs: subs,
    _state: state,
  };
}

// Recorded Open Design 0.24.1 install-info payload shape (absolute paths).
function specPayload(port = 7456) {
  return {
    command: '/opt/open-design/open-design',
    args: ['/opt/open-design/resources/app/prebundled/daemon/daemon-cli.mjs', 'mcp', '--daemon-url', `http://127.0.0.1:${port}`],
    env: { OD_DATA_DIR: '/home/me/.open-design', ELECTRON_RUN_AS_NODE: '1' },
    cliExists: true,
    nodeExists: true,
  };
}
const allExist = { existsSync: () => true };

function resetStubState() {
  stub.configValues = {};
  stub.warnings.length = 0;
  stub.infos.length = 0;
  stub.errors.length = 0;
  stub.commands.clear();
  stub.subscriptions.length = 0;
  probeResultToReturn = { alive: false, reason: 'refused' };
  stub.modalChoice = undefined;
  fetchedSpecPayload = specPayload();
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

  it('mcpEnabled=true with no confirmed launch spec constructs no client (no bare od spawn)', () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = true;
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    assert.equal(mcpConstructorCalls, 0);
  });

  it('mcpEnabled=true with a stored confirmed spec builds the client from it (not connected)', () => {
    stub.configValues['integrations.openDesign.mcpEnabled'] = true;
    const ctx = makeContext();
    ctx._state.set('failsafe.openDesign.mcpLaunchSpec', specPayload());
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    assert.equal(mcpConstructorCalls, 1);
    assert.equal(connectCallCount, 0);
  });

  it('wizard with unreachable daemon shows warning + does not construct client', async () => {
    probeResultToReturn = { alive: false, reason: 'timeout' };
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.match(stub.warnings[0], /unreachable/);
    assert.match(stub.warnings[0], /timeout/);
    assert.equal(mcpConstructorCalls, 0);
    assert.equal(connectCallCount, 0);
  });

  it('wizard: declined confirmation spawns nothing and stores nothing', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = undefined;
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.equal(mcpConstructorCalls, 0);
    assert.equal(connectCallCount, 0);
    assert.equal(ctx._state.get('failsafe.openDesign.mcpLaunchSpec'), undefined);
    assert.match(stub.warnings[0], /ELECTRON_RUN_AS_NODE=1/, 'consent prompt shows every env pair');
  });

  it('wizard: accepted confirmation stores the spec, creates the storage dir, and connects', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = 'Allow';
    capabilitiesToReturn = new Set(['list_projects', 'get_file', 'start_run', 'delete_project', 'create_project']);
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.equal(mcpConstructorCalls, 1);
    assert.equal(connectCallCount, 1);
    assert.equal(lastClientOpts.command, '/opt/open-design/open-design');
    assert.equal(lastClientOpts.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(lastClientOpts.cwd, ctx.globalStorageUri.fsPath, 'spawn cwd is extension storage, not the workspace');
    assert.equal(ctx._state.get('failsafe.openDesign.mcpLaunchSpec').command, '/opt/open-design/open-design');
    assert.ok(fs.existsSync(ctx.globalStorageUri.fsPath), 'globalStorage dir created before connect');
    assert.match(stub.infos[0], /connected/);
    assert.match(stub.infos[0], /2 read-only tools/, 'counts allowlisted reads, not upstream tools');
  });

  it('wizard: a missing local runtime path refuses without storing or spawning', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = 'Allow';
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', { existsSync: (p) => !String(p).endsWith('daemon-cli.mjs') });
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.equal(mcpConstructorCalls, 0);
    assert.equal(ctx._state.get('failsafe.openDesign.mcpLaunchSpec'), undefined);
    assert.match(stub.errors[0], /not found/);
  });

  it('wizard: an invalid spec from the daemon (NODE_OPTIONS) is refused before any prompt', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = 'Allow';
    fetchedSpecPayload = { ...specPayload(), env: { ...specPayload().env, NODE_OPTIONS: '--require /tmp/x.js' } };
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.equal(mcpConstructorCalls, 0);
    assert.equal(stub.warnings.length, 0, 'no consent prompt for an invalid spec');
    assert.match(stub.errors[0], /NODE_OPTIONS/);
  });

  it('wizard: re-run with a changed spec replaces the stored spec and rebuilds the client', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = 'Allow';
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    const wizard = stub.commands.get('failsafe.openDesign.registerMcp');
    await wizard();
    fetchedSpecPayload = specPayload(9999);
    await wizard();
    assert.equal(mcpConstructorCalls, 2, 'a new client for the new spec');
    assert.ok(disconnectCallCount >= 1, 'previous client disconnected');
    assert.ok(ctx._state.get('failsafe.openDesign.mcpLaunchSpec').args.includes('http://127.0.0.1:9999'));
  });

  it('wizard with connect failure shows error message', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = 'Allow';
    connectShouldThrow = true;
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.match(stub.errors[0], /connect failed/);
  });

  it('dispose subscription tears down active connection', async () => {
    probeResultToReturn = { alive: true, version: '0.24.1' };
    stub.modalChoice = 'Allow';
    const ctx = makeContext();
    bootstrapOpenDesignMcp(ctx, '/repo', allExist);
    await stub.commands.get('failsafe.openDesign.registerMcp')();
    assert.equal(isConnectedState, true);
    for (const sub of ctx._subs) {
      if (sub && typeof sub.dispose === 'function') sub.dispose();
    }
    await new Promise((r) => setImmediate(r));
    assert.ok(disconnectCallCount >= 1, 'expected dispose to call disconnect');
  });
});
