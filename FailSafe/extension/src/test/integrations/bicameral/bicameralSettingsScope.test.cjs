/**
 * The Bicameral command, its extra roots and auto-connect are the user's choice
 * only (v6.0.8 lane A review delta, LD15, plan T15), and a folder change
 * re-wires the client (review note A4).
 *
 * Runs standalone after `npm run compile`: node --test src/test/integrations/bicameral/bicameralSettingsScope.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { removeTempTree } = require('../../shared/removeTempTree.cjs');
const { privateNode } = require('../../shared/privateNode.cjs');

const EXT = path.resolve(__dirname, '..', '..', '..', '..');
const OUT = path.join(EXT, 'out');
const KEYS = ['command', 'extraCommandRoots', 'autoConnect'].map((k) => `failsafe.integrations.bicameral.${k}`);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

test('T15: the three settings declare machine scope, and pipCommand is gone', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT, 'package.json'), 'utf8'));
  const props = Object.assign({}, ...[].concat(pkg.contributes.configuration).map((c) => c.properties || {}));
  for (const k of KEYS) assert.equal(props[k] && props[k].scope, 'machine', k);
  assert.equal(props['failsafe.integrations.bicameral.pipCommand'], undefined, 'the unread pipCommand setting is deleted');
});

test('T15: userLevelValue reads only the user level', () => {
  const { userLevelValue } = require(path.join(OUT, 'shared', 'userSetting.js'));
  assert.equal(userLevelValue({ workspaceValue: 'x' }, 'd'), 'd');
  assert.equal(userLevelValue({ workspaceFolderValue: true }, false), false);
  assert.equal(userLevelValue({ globalValue: undefined, workspaceValue: true }, false), false);
  assert.equal(userLevelValue(undefined, 'd'), 'd');
  assert.equal(userLevelValue({ globalValue: 'g', workspaceValue: 'w' }, 'd'), 'g');
});

test('T15 source: bootstrapBicameral reads the three keys through inspect and writes auto-connect to the user level', () => {
  const src = stripComments(fs.readFileSync(path.join(EXT, 'src', 'extension', 'bootstrapBicameral.ts'), 'utf8'));
  for (const k of ['command', 'extraCommandRoots', 'autoConnect']) {
    assert.doesNotMatch(src, new RegExp(`\\.get<[^>]+>\\("${k}"`), `${k} is never read with .get`);
  }
  assert.match(src, /\.update\("autoConnect", value, vscode\.ConfigurationTarget\.Global\)/);
  assert.doesNotMatch(src, /ConfigurationTarget\.Workspace/);
});

test('T15 (A4): a workspace-folder change disconnects the prior client once and wires exactly one new client', async () => {
  const listeners = { folders: [] };
  // LD23: a trusted absolute node (a private copy on POSIX; a runner's tool cache is world-writable).
  const nodeBase = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsbicnode-')));
  const node = privateNode(nodeBase);
  const settings = { command: node, extraCommandRoots: [path.dirname(node), path.dirname(fs.realpathSync.native(node))], autoConnect: false };
  const vscodeStub = {
    workspace: {
      getConfiguration: () => ({
        get: (k, d) => d,
        inspect: (k) => ({ globalValue: settings[k] }),
        update: async () => {},
      }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
      onDidChangeWorkspaceFolders: (fn) => { listeners.folders.push(fn); return { dispose() {} }; },
    },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    commands: { executeCommand: async () => {} },
    Uri: { file: (p) => ({ fsPath: p }) },
    Position: class {}, Range: class {},
    window: { showInformationMessage: async () => undefined },
  };
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (r, ...rest) { return r === 'vscode' ? 'vscode' : orig.call(this, r, ...rest); };
  require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };
  try {
    const { wireBicameralIntegration } = require(path.join(OUT, 'extension', 'bootstrapBicameral.js'));
    const set = [];
    let current = null;
    const server = {
      setBicameralAutoConnect() {}, setBicameralCommand() {}, setBicameralAutoConnectWriter() {},
      broadcastEvent() {}, setMcpInterceptor() {}, setBicameralOpenFileInEditor() {},
      setDriftToL3Mediator() {}, setUpstreamMonitor() {},
      setBicameralClient(c) { set.push(c); current = c; },
      getBicameralClient() { return current; },
    };
    wireBicameralIntegration({ subscriptions: [] }, server, path.join(EXT, 'src', 'test', 'test-workspace'));
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(set.length >= 1 && set[set.length - 1], 'the activation wiring set a client');
    const prior = set[set.length - 1];
    let disconnects = 0;
    prior.disconnect = async () => { disconnects++; };
    const before = set.length;
    assert.equal(listeners.folders.length, 1, 'one folder-change listener');
    listeners.folders[0]({ added: [], removed: [] });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(set.length - before, 1, 'exactly one new client');
    assert.ok(set[set.length - 1] && set[set.length - 1] !== prior);
    assert.equal(disconnects, 1, 'the prior client is disconnected exactly once');
  } finally {
    Module._resolveFilename = orig;
    delete require.cache.vscode;
    removeTempTree(nodeBase);
  }
});
