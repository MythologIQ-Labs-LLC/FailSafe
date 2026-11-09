/**
 * #475 behavioral refusal — the registered `failsafe.continue.run` and
 * `failsafe.aider.run` commands, invoked through `registerAgentCliCommands`
 * with the production `AGENT_OS_CONTAINMENT_AVAILABLE` (false).
 *
 * agent-os-boundary.test.cjs proves the guard's SOURCE ORDER; this suite proves
 * the BEHAVIOR: each handler shows the refusal and returns without reading a
 * setting value, touching the credential store, asking for a prompt, showing
 * progress, calling the governed wrapper, spawning a process, recording to the
 * ledger, applying, or writing an audit copy.
 *
 * The governed wrappers are replaced through require.cache with spies (no
 * production seam). child_process is spied too, so a spawn on any other path
 * would also fail the suite.
 *
 * Follows the require.cache vscode-stub pattern from agent-cli-command.test.cjs.
 *
 * Runs standalone: node --test src/test/extension/agent-cli-command-refusal.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const Module = require('module');

const REFUSAL = 'Agent execution unavailable: FailSafe cannot prove OS-level containment for this CLI. No process was started.';

// ---- recorders ----
let warn;
let info;
let errors;
let inputBoxes;
let progress;
let configSections;
let configReads;
let wrapperCalls;
let spawns;
const commands = new Map();

const configObject = {
  get: (key, def) => { configReads.push(key); return def; },
  has: (key) => { configReads.push(key); return false; },
  inspect: (key) => { configReads.push(key); return undefined; },
};

const vscodeStub = {
  window: {
    showWarningMessage: (m) => { warn.push(String(m)); return Promise.resolve(undefined); },
    showInformationMessage: (m) => { info.push(String(m)); return Promise.resolve(undefined); },
    showErrorMessage: (m) => { errors.push(String(m)); return Promise.resolve(undefined); },
    showInputBox: (opts) => { inputBoxes.push(opts); return Promise.resolve('do something'); },
    withProgress: (opts, task) => { progress.push(opts); return task(); },
    showTextDocument: () => Promise.resolve(undefined),
  },
  workspace: {
    getConfiguration: (section) => { configSections.push(section); return configObject; },
    registerTextDocumentContentProvider: (scheme) => ({ dispose() {}, scheme }),
    openTextDocument: () => Promise.resolve({}),
  },
  commands: {
    registerCommand: (id, handler) => { commands.set(id, handler); return { dispose() {}, id }; },
  },
  languages: { setTextDocumentLanguage: (doc) => Promise.resolve(doc) },
  ProgressLocation: { Notification: 15 },
  Uri: { parse: (s) => ({ toString: () => s, path: s.replace(/^[a-z-]+:/, '') }) },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

// ---- governed-wrapper spies, installed BEFORE requiring the compiled command module ----
const outDir = path.resolve(__dirname, '..', '..', '..', 'out');
function stubModule(rel, exports) {
  const filename = path.join(outDir, ...rel.split('/'));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stubModule('integrations/agent-cli/continue-wrapper.js', {
  runContinueGoverned: async (...args) => { wrapperCalls.push({ agent: 'continue', args }); throw new Error('wrapper must not run'); },
});
stubModule('integrations/agent-cli/aider-wrapper.js', {
  runAiderGoverned: async (...args) => { wrapperCalls.push({ agent: 'aider', args }); throw new Error('wrapper must not run'); },
});

const { registerAgentCliCommands } = require(path.join(outDir, 'extension', 'agent-cli-command.js'));
const { AGENT_OS_CONTAINMENT_AVAILABLE } = require(path.join(outDir, 'integrations', 'agent-cli', 'agent-cli-core.js'));

const SPAWN_FNS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
const originals = {};

/** Every property access on these objects is recorded; none is expected. */
function recordingProxy(label, log) {
  return new Proxy({}, {
    get: (_t, prop) => { log.push(`${label}.${String(prop)}`); return () => { throw new Error(`${label} must not be used`); }; },
  });
}

function mkDeps() {
  const touched = [];
  const ledger = [];
  const applied = [];
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-agent-refusal-'));
  const deps = {
    workspaceRoot: auditDir,
    policyEngine: { classifyRisk: (p) => { touched.push(`classify:${p}`); return 'L1'; } },
    ledger: { appendEntry: async (e) => { ledger.push(e); } },
    auditDir,
    apply: async (cs) => { applied.push(cs); return { status: 'APPLIED', reason: 'x', details: [] }; },
    creds: recordingProxy('creds', touched),
    credentialUi: recordingProxy('credentialUi', touched),
  };
  return { deps, touched, ledger, applied, auditDir };
}

describe('#475 registered agent CLI commands refuse without OS containment', () => {
  let ctx;

  beforeEach(() => {
    warn = []; info = []; errors = []; inputBoxes = []; progress = [];
    configSections = []; configReads = []; wrapperCalls = []; spawns = [];
    commands.clear();
    for (const fn of SPAWN_FNS) {
      originals[fn] = childProcess[fn];
      childProcess[fn] = (...args) => { spawns.push({ fn, args }); throw new Error(`${fn} must not be called`); };
    }
    ctx = mkDeps();
    const context = { subscriptions: [] };
    registerAgentCliCommands(context, ctx.deps);
    assert.equal(context.subscriptions.length, 3, 'review provider + two commands are registered');
  });

  afterEach(() => {
    for (const fn of SPAWN_FNS) childProcess[fn] = originals[fn];
    fs.rmSync(ctx.auditDir, { recursive: true, force: true });
  });

  it('runs against the production capability, which is false', () => {
    assert.equal(AGENT_OS_CONTAINMENT_AVAILABLE, false);
    assert.ok(commands.has('failsafe.continue.run'));
    assert.ok(commands.has('failsafe.aider.run'));
  });

  for (const id of ['failsafe.continue.run', 'failsafe.aider.run']) {
    it(`${id}: shows the refusal and starts nothing`, async () => {
      configReads = [];
      await commands.get(id)();

      assert.deepEqual(warn, [REFUSAL], 'exactly the refusal warning is shown');
      assert.deepEqual(info, []);
      assert.deepEqual(errors, []);
      assert.deepEqual(inputBoxes, [], 'no input box was requested');
      assert.deepEqual(configReads, [], 'no configuration value was read');
      assert.deepEqual(ctx.touched, [], 'credential store, credential UI and classifier untouched');
      assert.deepEqual(progress, [], 'no progress notification (no run started)');
      assert.deepEqual(wrapperCalls, [], 'governed wrapper never called');
      assert.deepEqual(spawns, [], 'no child process spawned');
      assert.deepEqual(ctx.ledger, [], 'nothing recorded to the ledger');
      assert.deepEqual(ctx.applied, [], 'nothing applied to the workspace');
      assert.deepEqual(fs.readdirSync(ctx.auditDir), [], 'nothing written to the audit / workspace directory');
    });
  }
});
