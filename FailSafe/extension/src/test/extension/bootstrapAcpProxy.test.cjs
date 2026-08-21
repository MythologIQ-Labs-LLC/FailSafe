/**
 * FailSafe#398 — bootstrapAcpProxy ACP registry drift-check tests.
 *
 * Uses the vscode-stub require.cache pattern from
 * organizeWorkspaceCallbacks.test.cjs:21-33. Loads the compiled
 * `out/extension/bootstrapAcpProxy.js` artifact.
 *
 * Runs standalone:
 *   node --test src/test/extension/bootstrapAcpProxy.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact ----

const stub = {
  warnings: [],
  infos: [],
  errors: [],
  commands: new Map(),
};

let quickPickAnswer = async () => undefined;

const vscodeStub = {
  window: {
    showWarningMessage: async (msg) => { stub.warnings.push(msg); },
    showInformationMessage: async (msg) => { stub.infos.push(msg); },
    showErrorMessage: async (msg) => { stub.errors.push(msg); },
    showQuickPick: async (items, opts) => quickPickAnswer(items, opts),
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

const compiled = path.resolve(__dirname, '..', '..', '..', 'out', 'extension', 'bootstrapAcpProxy.js');
const { bootstrapAcpProxy, verifyGovernedProxyEntries } = require(compiled);

function buildAgent(name, cmd) {
  return {
    id: 'failsafe-governed',
    name,
    version: '1.0.0',
    distribution: {
      binary: {
        'linux-x86_64': { archive: '', cmd, args: ['/x/acp-proxy.js', '--', 'real-agent'] },
      },
    },
  };
}

function makeMemento(initial) {
  const state = new Map(Object.entries(initial ?? {}));
  return {
    get: (key) => state.get(key),
    update: async (key, value) => {
      if (value === undefined) state.delete(key);
      else state.set(key, value);
    },
    _state: state,
  };
}

function makeContext(initialGlobalState, extensionPath) {
  const subs = [];
  return {
    extensionPath: extensionPath ?? '/ext',
    subscriptions: { push: (item) => subs.push(item) },
    globalState: makeMemento(initialGlobalState),
    workspaceState: makeMemento(),
    _subs: subs,
  };
}

function resetStub() {
  stub.warnings.length = 0;
  stub.infos.length = 0;
  stub.errors.length = 0;
  stub.commands.clear();
  quickPickAnswer = async () => undefined;
}

describe('bootstrapAcpProxy', () => {
  beforeEach(() => {
    resetStub();
  });

  it('registers both install/uninstall commands', () => {
    const ctx = makeContext();
    bootstrapAcpProxy(ctx, '/repo');
    assert.equal(stub.commands.has('failsafe.acp.installGovernedProxy'), true);
    assert.equal(stub.commands.has('failsafe.acp.uninstallGovernedProxy'), true);
  });

  it('activation with no prior install stays silent and never reads the registry', () => {
    const ctx = makeContext();
    let readCalls = 0;
    verifyGovernedProxyEntries(ctx, '/home/op', () => { readCalls++; return null; });
    assert.equal(stub.warnings.length, 0);
    assert.equal(readCalls, 0, 'no expected entry means nothing to compare against');
  });

  it('full bootstrapAcpProxy activation with empty state stays silent (real fs/os path)', () => {
    const ctx = makeContext();
    bootstrapAcpProxy(ctx, '/repo');
    assert.equal(stub.warnings.length, 0);
    assert.equal(stub.errors.length, 0);
  });

  it('intact live entry produces no warning', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const ctx = makeContext({ 'failsafe.acp.expectedRegistryEntry.stable': agent });
    const text = JSON.stringify({ version: '1.0.0', agents: [agent], extensions: [] });
    verifyGovernedProxyEntries(ctx, '/home/op', () => text);
    assert.equal(stub.warnings.length, 0);
  });

  it('tampered entry (cmd rewritten to raw agent) warns with a distinguishing message', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const ctx = makeContext({ 'failsafe.acp.expectedRegistryEntry.stable': agent });
    const hijacked = JSON.parse(JSON.stringify(agent));
    hijacked.distribution.binary['linux-x86_64'].cmd = 'real-agent';
    const text = JSON.stringify({ version: '1.0.0', agents: [hijacked], extensions: [] });
    verifyGovernedProxyEntries(ctx, '/home/op', () => text);
    assert.equal(stub.warnings.length, 1);
    assert.match(stub.warnings[0], /no longer matches/);
    assert.match(stub.warnings[0], /FailSafe \(governing real-agent\)/);
    assert.match(stub.warnings[0], /stable/);
  });

  it('missing entry (registry file gone) warns with a distinct "missing" message', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const ctx = makeContext({ 'failsafe.acp.expectedRegistryEntry.stable': agent });
    verifyGovernedProxyEntries(ctx, '/home/op', () => null);
    assert.equal(stub.warnings.length, 1);
    assert.match(stub.warnings[0], /is missing/);
    assert.doesNotMatch(stub.warnings[0], /no longer matches/);
    assert.doesNotMatch(stub.warnings[0], /could not be parsed/);
  });

  it('malformed registry (unparseable JSON) warns with a distinct message from "missing"/"tampered"', () => {
    // FX898 review: a corrupt registry file must not be reported as "missing"
    // (which implies a clean removal + a safe reinstall), since reinstalling
    // over an unparseable file silently discards any other agents in it.
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const ctx = makeContext({ 'failsafe.acp.expectedRegistryEntry.stable': agent });
    verifyGovernedProxyEntries(ctx, '/home/op', () => '{ not valid json');
    assert.equal(stub.warnings.length, 1);
    assert.match(stub.warnings[0], /could not be parsed/);
    assert.doesNotMatch(stub.warnings[0], /is missing/);
    assert.doesNotMatch(stub.warnings[0], /no longer matches/);
  });

  it('unrelated registry edits (co-resident agent renamed) do not trigger a false alarm', () => {
    const agent = buildAgent('FailSafe (governing real-agent)', '/usr/bin/node');
    const ctx = makeContext({ 'failsafe.acp.expectedRegistryEntry.stable': agent });
    const text = JSON.stringify({
      version: '1.0.0',
      agents: [agent, { id: 'some-other-agent', name: 'renamed-agent', distribution: { binary: {} } }],
      extensions: [],
    });
    verifyGovernedProxyEntries(ctx, '/home/op', () => text);
    assert.equal(stub.warnings.length, 0);
  });

  it('checks stable and next channels independently — only the drifted channel warns', () => {
    const stableAgent = buildAgent('FailSafe (governing stable-agent)', '/usr/bin/node');
    const nextAgent = buildAgent('FailSafe (governing next-agent)', '/usr/bin/node');
    const ctx = makeContext({
      'failsafe.acp.expectedRegistryEntry.stable': stableAgent,
      'failsafe.acp.expectedRegistryEntry.next': nextAgent,
    });
    const nextTampered = JSON.parse(JSON.stringify(nextAgent));
    nextTampered.distribution.binary['linux-x86_64'].cmd = 'raw-next-agent';

    verifyGovernedProxyEntries(ctx, '/home/op', (p) => {
      if (p.includes('.windsurf-next')) return JSON.stringify({ version: '1.0.0', agents: [nextTampered], extensions: [] });
      return JSON.stringify({ version: '1.0.0', agents: [stableAgent], extensions: [] });
    });

    assert.equal(stub.warnings.length, 1);
    assert.match(stub.warnings[0], /next-agent/);
    assert.match(stub.warnings[0], /next/);
  });

  it('a detection error is caught and reported as an error, never thrown from activation', () => {
    const ctx = makeContext();
    ctx.globalState.get = () => { throw new Error('boom'); };
    assert.doesNotThrow(() => bootstrapAcpProxy(ctx, '/repo'));
    assert.equal(stub.errors.length, 1);
    assert.match(stub.errors[0], /drift check failed/);
    assert.match(stub.errors[0], /boom/);
  });

  describe('real registry lifecycle (HOME-scoped temp dir, real fs/os)', () => {
    let tmpHome;
    let tmpExt;
    let prevHome;

    beforeEach(() => {
      tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-acp-proxy-test-home-'));
      tmpExt = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-acp-proxy-test-ext-'));
      fs.mkdirSync(path.join(tmpExt, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(tmpExt, 'dist', 'acp-proxy.js'), '// stub proxy bundle for tests\n');
      prevHome = process.env.HOME;
      process.env.HOME = tmpHome;
    });

    function cleanupHome() {
      process.env.HOME = prevHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpExt, { recursive: true, force: true });
    }

    function seedRegistry(channelDir) {
      const registryPath = path.join(tmpHome, channelDir, 'acp', 'registry.json');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, JSON.stringify({
        version: '1.0.0',
        agents: [{
          id: 'devin-agent',
          name: 'Devin',
          version: '1.0.0',
          distribution: { binary: { 'linux-x86_64': { archive: '', cmd: 'devin-bin', args: [] } } },
        }],
        extensions: [],
      }));
      return registryPath;
    }

    it('install persists the expected entry to globalState, never workspaceState — the registry is one machine-global resource, not per-workspace', async () => {
      // FX898 review: workspaceState scoping caused a workspace-B install to
      // read as "tampered" from workspace A's next activation, even though
      // the single shared registry entry was still fully governed.
      seedRegistry('.windsurf');
      quickPickAnswer = async (items) => items[0]; // pick the only wrappable agent (Devin)

      const ctx = makeContext(undefined, tmpExt);
      try {
        bootstrapAcpProxy(ctx, '/repo');
        const install = stub.commands.get('failsafe.acp.installGovernedProxy');
        await install();

        assert.equal(ctx.globalState._state.has('failsafe.acp.expectedRegistryEntry.stable'), true,
          'expected entry must live in globalState');
        assert.equal(ctx.workspaceState._state.size, 0,
          'must never persist the expected entry in workspaceState');
        assert.equal(stub.errors.length, 0, JSON.stringify(stub.errors));
      } finally {
        cleanupHome();
      }
    });

    it('uninstall clears the globalState entry it wrote at install', async () => {
      seedRegistry('.windsurf');
      quickPickAnswer = async (items) => items[0];

      const ctx = makeContext(undefined, tmpExt);
      try {
        bootstrapAcpProxy(ctx, '/repo');
        await stub.commands.get('failsafe.acp.installGovernedProxy')();
        assert.equal(ctx.globalState._state.has('failsafe.acp.expectedRegistryEntry.stable'), true);

        await stub.commands.get('failsafe.acp.uninstallGovernedProxy')();
        assert.equal(ctx.globalState.get('failsafe.acp.expectedRegistryEntry.stable'), undefined);
      } finally {
        cleanupHome();
      }
    });

    it('uninstall clears stale expected state even when no registry file currently exists (stale-state-unclearable fix)', async () => {
      // FX898 review: the uninstall command used to early-return on "no
      // registry found" BEFORE clearing persisted state, so a deleted
      // registry left the drift warning firing forever with no way to quiet it.
      const staleAgent = buildAgent('FailSafe (governing stale-agent)', '/usr/bin/node');
      const ctx = makeContext({ 'failsafe.acp.expectedRegistryEntry.stable': staleAgent });
      try {
        bootstrapAcpProxy(ctx, '/repo'); // no registry file exists in tmpHome at all
        await stub.commands.get('failsafe.acp.uninstallGovernedProxy')();
        assert.equal(ctx.globalState.get('failsafe.acp.expectedRegistryEntry.stable'), undefined);
        assert.equal(stub.infos.length, 1);
        assert.match(stub.infos[0], /No Devin registry found/);
      } finally {
        cleanupHome();
      }
    });
  });
});
