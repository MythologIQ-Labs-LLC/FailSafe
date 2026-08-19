/**
 * FailSafe#241 (Tranche B, editor/agent wrappers) — regression coverage for
 * `report()` in agent-cli-command.ts, the real production reporting path for
 * the governed `failsafe.continue.run` / `failsafe.aider.run` commands.
 *
 * Defect: on an ESCALATE decision, `report()` awaited the L3-approval queue
 * write with no try/catch. Continue/Aider had already run and produced a
 * real, uncommitted diff on disk BEFORE this call — if the queue write threw
 * (e.g. a ledger/db error), the exception propagated uncaught out of the
 * async command handler with no `showErrorMessage`/`showWarningMessage` call
 * at all: a real L3-risk change sat unreviewed and unlogged with zero
 * operator-facing trace.
 *
 * Follows the require.cache vscode-stub pattern from
 * organizeWorkspaceCallbacks.test.cjs / substrate-command.test.cjs — inject a
 * vscodeStub with window.show*Message mocks BEFORE requiring the compiled
 * artifact, then call the exported `report()` directly (the full command
 * registration path is wired to the live `defaultAgentRun`/vscode config and
 * cannot deterministically reach every decision branch without a real binary
 * on PATH and a full extension-host harness).
 *
 * Runs standalone: node --test src/test/extension/agent-cli-command.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact. ----
let infoMessages = [];
let warnMessages = [];
let errorMessages = [];

const vscodeStub = {
  window: {
    showInformationMessage: (m) => { infoMessages.push(String(m)); return Promise.resolve(undefined); },
    showWarningMessage: (m) => { warnMessages.push(String(m)); return Promise.resolve(undefined); },
    showErrorMessage: (m) => { errorMessages.push(String(m)); return Promise.resolve(undefined); },
  },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const compiled = path.resolve(
  __dirname, '..', '..', '..', 'out', 'extension', 'agent-cli-command.js',
);
const { report } = require(compiled);

function mkDeps(queueL3Approval) {
  return {
    workspaceRoot: '/tmp/fake-workspace',
    policyEngine: { classifyRisk: () => 'L1' },
    qorelogicManager: { queueL3Approval },
  };
}

const escalateOutcome = {
  available: true,
  spawned: true,
  decision: { verdict: 'ESCALATE', reason: 'L3-risk change requires human (L3) approval', riskGrade: 'L3' },
  diff: { files: 2, additions: 10, deletions: 3, paths: ['src/a.ts', 'src/b.ts'] },
  receipt: { receiptId: 'abc123', agent: 'continue' },
};

describe('agent-cli-command report() — ESCALATE queue-failure visibility (FailSafe#241 Tranche B)', () => {
  beforeEach(() => {
    infoMessages = [];
    warnMessages = [];
    errorMessages = [];
  });

  it('ESCALATE + successful queue write → warns with the escalation summary', async () => {
    const deps = mkDeps(async () => 'req-1');
    await report(deps, 'continue', escalateOutcome);
    assert.equal(errorMessages.length, 0);
    assert.equal(warnMessages.length, 1);
    assert.match(warnMessages[0], /escalated to the L3 approval queue/);
    assert.match(warnMessages[0], /2 file\(s\)/);
  });

  it('ESCALATE + queue write throws → does NOT propagate, surfaces an explicit error to the operator', async () => {
    const deps = mkDeps(async () => { throw new Error('ledger unavailable'); });
    // Must not reject — a thrown/rejected report() here is itself the historical
    // defect (an unhandled rejection with no operator-facing message at all).
    await assert.doesNotReject(() => report(deps, 'continue', escalateOutcome));
    assert.equal(errorMessages.length, 1, 'expected exactly one showErrorMessage call');
    assert.match(errorMessages[0], /could NOT be queued for L3 approval/);
    assert.match(errorMessages[0], /ledger unavailable/);
    assert.match(errorMessages[0], /2 file\(s\) remain uncommitted/);
    // The silent-failure defect means: no warning is shown either, so the
    // operator has zero notification of any kind. Confirm that's now false.
    assert.equal(warnMessages.length, 0);
  });

  it('ESCALATE + queue write throws a non-Error → error message still includes a string detail', async () => {
    const deps = mkDeps(async () => { throw 'db down'; });
    await assert.doesNotReject(() => report(deps, 'aider', escalateOutcome));
    assert.equal(errorMessages.length, 1);
    assert.match(errorMessages[0], /db down/);
  });

  it('BLOCK verdict still just warns (unaffected by the ESCALATE fix)', async () => {
    const deps = mkDeps(async () => 'unused');
    const out = { available: true, spawned: false, decision: { verdict: 'BLOCK', reason: 'writes are not permitted', riskGrade: 'L1' }, diff: { files: 0, additions: 0, deletions: 0, paths: [] } };
    await report(deps, 'aider', out);
    assert.equal(warnMessages.length, 1);
    assert.match(warnMessages[0], /writes are not permitted/);
    assert.equal(errorMessages.length, 0);
  });

  it('ALLOW verdict still just informs (unaffected by the ESCALATE fix)', async () => {
    const deps = mkDeps(async () => 'unused');
    const out = { available: true, spawned: true, decision: { verdict: 'ALLOW', reason: 'within auto-approve risk tier', riskGrade: 'L1' }, diff: { files: 1, additions: 1, deletions: 0, paths: ['a.ts'] } };
    await report(deps, 'continue', out);
    assert.equal(infoMessages.length, 1);
    assert.equal(errorMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('not available → warns with the error/unavailable message, no queue call attempted', async () => {
    let called = false;
    const deps = mkDeps(async () => { called = true; return 'x'; });
    await report(deps, 'aider', { available: false, spawned: false, error: '`aider` not found on PATH' });
    assert.equal(called, false);
    assert.equal(warnMessages.length, 1);
    assert.match(warnMessages[0], /not found on PATH/);
  });
});
