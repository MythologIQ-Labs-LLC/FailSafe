/**
 * failsafe.emitGovernanceSidecar command (#233 fail-visible stale/untrusted evidence).
 *
 * Follows the require.cache vscode-stub pattern from substrate-command.test.cjs / :21-33 —
 * inject a vscodeStub with commands.registerCommand / window.show*Message mocks BEFORE
 * requiring the compiled artifact. Exercises the REAL production entry point
 * (registerGovernanceSidecarCommand -> emitGovernanceSidecar -> nodeSidecarDeps, real fs)
 * rather than only the pure governance-sidecar.ts unit tests, so a review finding about
 * "production path" behavior is provably addressed here, not just in isolation.
 *
 * Runs standalone: node --test src/test/extension/tracker-sidecar-command.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let registeredCommand = null;
let registeredHandler = null;
let infoMessages = [];
let warnMessages = [];
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
    showInformationMessage: (m) => { infoMessages.push(String(m)); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { warnMessages.push(String(m)); return Promise.resolve(undefined); },
  },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const compiled = path.resolve(
  __dirname, '..', '..', '..', 'out', 'extension', 'tracker-sidecar-command.js',
);
const { registerGovernanceSidecarCommand } = require(compiled);

function mkContext() {
  return { subscriptions };
}

const LEDGER = [
  '### Entry #1: DELIVER - v1.0.0',
  '',
  '**Date**: 2026-01-01',
  '**Phase**: DELIVER',
  '',
  '## Decision',
  '',
  'Released.',
  '',
  '## Content Hash',
  '',
  '**Content Hash**: `aaa`',
  '',
  '---',
  '',
].join('\n');

function writeLedger(tmp, text, mtime) {
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
  const p = path.join(tmp, 'docs', 'META_LEDGER.md');
  fs.writeFileSync(p, text, 'utf-8');
  if (mtime) fs.utimesSync(p, mtime, mtime);
}

describe('failsafe.emitGovernanceSidecar command (#233)', () => {
  beforeEach(() => {
    registeredCommand = null;
    registeredHandler = null;
    infoMessages = [];
    warnMessages = [];
    subscriptions.length = 0;
  });

  it('registers the command id', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-sidecar-cmd-reg-'));
    try {
      registerGovernanceSidecarCommand(mkContext(), tmp);
      assert.equal(registeredCommand, 'failsafe.emitGovernanceSidecar');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fresh ledger, no opts -> info message, no warning (version/freshness unenforced without evidence)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-sidecar-cmd-fresh-'));
    try {
      writeLedger(tmp, LEDGER);
      registerGovernanceSidecarCommand(mkContext(), tmp);
      registeredHandler();
      assert.equal(warnMessages.length, 0, 'no warning for an ordinary fresh emit');
      assert.equal(infoMessages.length, 1);
      assert.ok(/^FailSafe: Emitted/.test(infoMessages[0]), infoMessages[0]);
      assert.ok(!/STALE/.test(infoMessages[0]), 'no stale caveat when nothing is stale');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('malformed ledger -> untrusted, surfaced as a warning (fail-visible)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-sidecar-cmd-malformed-'));
    try {
      writeLedger(tmp, 'not a valid governance ledger, no entries here\n');
      registerGovernanceSidecarCommand(mkContext(), tmp);
      registeredHandler();
      assert.equal(infoMessages.length, 0, 'untrusted evidence must not read as routine info');
      assert.equal(warnMessages.length, 1);
      assert.ok(/malformed/.test(warnMessages[0]), warnMessages[0]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('getOpts supplying maxAgeMs, over a stale ledger -> written but surfaced as a warning with STALE SOURCE', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-sidecar-cmd-stale-'));
    try {
      writeLedger(tmp, LEDGER, new Date('2000-01-01T00:00:00.000Z'));
      registerGovernanceSidecarCommand(mkContext(), tmp, () => ({ maxAgeMs: 1 }));
      registeredHandler();
      assert.equal(infoMessages.length, 0, 'stale evidence must not read as routine info');
      assert.equal(warnMessages.length, 1);
      assert.ok(/^FailSafe: Emitted/.test(warnMessages[0]), 'still written — stale data stays usable');
      assert.ok(/STALE SOURCE/.test(warnMessages[0]), warnMessages[0]);
      const written = fs.readFileSync(path.join(tmp, 'docs', 'roadmap', 'programs.generated.yaml'), 'utf-8');
      assert.ok(/STALE SOURCE EVIDENCE/.test(written), 'the persisted file itself carries the caveat, not only the toast');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('getOpts called fresh per invocation, not captured once at registration', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-sidecar-cmd-fresh-opts-'));
    try {
      writeLedger(tmp, LEDGER);
      let calls = 0;
      registerGovernanceSidecarCommand(mkContext(), tmp, () => { calls += 1; return undefined; });
      registeredHandler();
      registeredHandler();
      assert.equal(calls, 2, 'getOpts is invoked on every command run, not memoized at registration');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('no META_LEDGER.md -> plain info, not a warning (ungoverned repo is not untrusted evidence)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-sidecar-cmd-none-'));
    try {
      registerGovernanceSidecarCommand(mkContext(), tmp);
      registeredHandler();
      assert.equal(warnMessages.length, 0);
      assert.equal(infoMessages.length, 1);
      assert.ok(/ungoverned repo/.test(infoMessages[0]), infoMessages[0]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
