/**
 * #475 (FX951/FX952 command layer) — `handleOutcome()` in agent-cli-command.ts,
 * the production path for `failsafe.continue.run` / `failsafe.aider.run` after
 * the isolated run returns.
 *
 * A quarantined change set reaches the workspace only when the operator picks
 * Apply in this invocation; Escape / close / Discard discard it. Every decision
 * is recorded in the ledger, and a failed QUARANTINE_START record discards the
 * change set before the operator is asked.
 *
 * Follows the require.cache vscode-stub pattern from
 * organizeWorkspaceCallbacks.test.cjs / substrate-command.test.cjs.
 *
 * Runs standalone: node --test src/test/extension/agent-cli-command.test.cjs
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact. ----
let info = [];
let warn = [];
let errors = [];
let modalCalls = [];
let choices = [];
let opened = [];

const vscodeStub = {
  window: {
    showInformationMessage: (m) => { info.push(String(m)); return Promise.resolve(undefined); },
    showWarningMessage: (m, ...rest) => {
      const opts = rest[0] && typeof rest[0] === 'object' ? rest[0] : undefined;
      const items = opts ? rest.slice(1) : rest;
      if (items.length) { modalCalls.push({ message: String(m), modal: !!(opts && opts.modal), detail: opts && opts.detail, items }); return Promise.resolve(choices.shift()); }
      warn.push(String(m));
      return Promise.resolve(undefined);
    },
    showErrorMessage: (m) => { errors.push(String(m)); return Promise.resolve(undefined); },
    showTextDocument: () => Promise.resolve(undefined),
  },
  workspace: { openTextDocument: (uri) => { opened.push(String(uri)); return Promise.resolve({ uri }); } },
  languages: { setTextDocumentLanguage: (doc) => Promise.resolve(doc) },
  Uri: { parse: (s) => ({ toString: () => s, path: s.replace(/^[a-z-]+:/, '') }) },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const compiled = path.resolve(__dirname, '..', '..', '..', 'out', 'extension', 'agent-cli-command.js');
const { handleOutcome, BOUNDARY_NOTE } = require(compiled);

function mkDeps(over = {}) {
  const ledger = [];
  const applied = [];
  return {
    ledger,
    applied,
    deps: {
      workspaceRoot: '/tmp/fake-workspace',
      policyEngine: { classifyRisk: () => 'L1' },
      ledger: { appendEntry: async (e) => { ledger.push(e); } },
      apply: async (cs) => { applied.push(cs); return { status: 'APPLIED', reason: 'applied 2 file(s) exactly as reviewed', details: [] }; },
      ...over,
    },
  };
}

const changeSet = {
  receiptId: 'rcpt1', agent: 'continue', root: '/tmp/fake-workspace', baseHead: 'abc', preSnapshot: new Map(),
  patch: Buffer.from('diff --git a/a.txt b/a.txt\n'), patchSha256: 'f'.repeat(64),
  stats: { files: 2, additions: 3, deletions: 1, paths: ['a.txt', 'b.txt'] },
};
const quarantined = {
  available: true, spawned: true, status: 'QUARANTINED_PENDING_APPROVAL', reason: 'changes are held for review',
  details: [], riskGrade: 'L2', diff: changeSet.stats, receipt: { receiptId: 'rcpt1' }, changeSet,
};

describe('agent-cli-command handleOutcome() — quarantine and promotion (#475)', () => {
  beforeEach(() => { info = []; warn = []; errors = []; modalCalls = []; choices = []; opened = []; });

  it('asks with a modal whose buttons are Discard, Review diff, Apply and states the boundary', async () => {
    const { deps } = mkDeps();
    await handleOutcome(deps, 'continue', quarantined);
    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0].modal, true);
    assert.deepEqual(modalCalls[0].items, ['Discard', 'Review diff', 'Apply']);
    assert.match(modalCalls[0].message, /Nothing has been written to your workspace/);
    assert.equal(modalCalls[0].detail, BOUNDARY_NOTE);
  });

  for (const [label, choice] of [['Escape / close', undefined], ['Discard', 'Discard']]) {
    it(`${label} discards: apply never called, ledger records DISCARDED`, async () => {
      const { deps, ledger, applied } = mkDeps();
      choices = [choice];
      await handleOutcome(deps, 'continue', quarantined);
      assert.equal(applied.length, 0);
      assert.deepEqual(ledger.map((e) => e.eventType), ['QUARANTINE_START', 'QUARANTINE_END']);
      assert.equal(ledger[1].overseerDecision, 'DISCARDED');
      assert.equal(ledger[0].artifactHash, changeSet.patchSha256);
      assert.match(info[0], /DISCARDED.*Your workspace is unchanged/);
    });
  }

  it('Apply promotes exactly the in-memory change set and records APPLIED', async () => {
    const { deps, ledger, applied } = mkDeps();
    choices = ['Apply'];
    await handleOutcome(deps, 'aider', quarantined);
    assert.equal(applied.length, 1);
    assert.equal(applied[0], changeSet);
    assert.equal(ledger[1].overseerDecision, 'APPLIED');
    assert.match(info[0], /APPLIED/);
  });

  it('Review diff opens the read-only review document, then Apply promotes', async () => {
    const { deps, applied } = mkDeps();
    choices = ['Review diff', 'Apply'];
    await handleOutcome(deps, 'continue', quarantined);
    assert.deepEqual(opened, ['failsafe-agent-run:/rcpt1.diff']);
    assert.equal(modalCalls.length, 2);
    assert.equal(modalCalls[1].modal, false);
    assert.deepEqual(modalCalls[1].items, ['Discard', 'Apply']);
    assert.equal(applied.length, 1);
  });

  it('Review diff then dismissing the prompt discards', async () => {
    const { deps, applied, ledger } = mkDeps();
    choices = ['Review diff', undefined];
    await handleOutcome(deps, 'continue', quarantined);
    assert.equal(applied.length, 0);
    assert.equal(ledger[1].overseerDecision, 'DISCARDED');
  });

  for (const status of ['REFUSED', 'APPLY_MISMATCH']) {
    it(`${status} from promotion is shown as an error with its reason and recorded`, async () => {
      const { deps, ledger } = mkDeps({ apply: async () => ({ status, reason: 'HEAD moved from abc to def since the run', details: ['d1'] }) });
      choices = ['Apply'];
      await handleOutcome(deps, 'continue', quarantined);
      assert.equal(ledger[1].overseerDecision, status);
      assert.equal(errors.length, 1);
      assert.match(errors[0], new RegExp(`${status} — HEAD moved.*d1`));
    });
  }

  it('a failed QUARANTINE_START record discards before asking (fail closed)', async () => {
    const applied = [];
    const { deps } = mkDeps({ ledger: { appendEntry: async () => { throw new Error('ledger down'); } }, apply: async (cs) => { applied.push(cs); return { status: 'APPLIED', reason: '', details: [] }; } });
    choices = ['Apply'];
    await assert.doesNotReject(() => handleOutcome(deps, 'continue', quarantined));
    assert.equal(modalCalls.length, 0);
    assert.equal(applied.length, 0);
    assert.match(errors[0], /could not be recorded \(ledger down\); the change set was discarded/);
  });

  it('writes the audit copy (change set + record) when an audit directory is configured', async () => {
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsau-'));
    try {
      const { deps } = mkDeps({ auditDir });
      await handleOutcome(deps, 'continue', quarantined);
      assert.ok(fs.readFileSync(path.join(auditDir, 'rcpt1', 'change-set.patch')).equals(changeSet.patch));
      assert.match(fs.readFileSync(path.join(auditDir, 'rcpt1', 'record.json'), 'utf8'), /"patchSha256"/);
    } finally { fs.rmSync(auditDir, { recursive: true, force: true }); }
  });
});

describe('agent-cli-command handleOutcome() — non-promotable outcomes (#475)', () => {
  beforeEach(() => { info = []; warn = []; errors = []; modalCalls = []; choices = []; opened = []; });

  it('WORKSPACE_CHANGED_DURING_RUN: error naming the change + boundary, EXTERNAL_DRIFT recorded, no modal', async () => {
    const { deps, ledger } = mkDeps();
    await handleOutcome(deps, 'aider', { available: true, spawned: true, status: 'WORKSPACE_CHANGED_DURING_RUN', reason: 'the repository changed outside the isolated worktree during the run; nothing is promotable', details: ['git-hooks:pre-commit'] });
    assert.equal(modalCalls.length, 0);
    assert.match(errors[0], /git-hooks:pre-commit/);
    assert.ok(errors[0].includes(BOUNDARY_NOTE));
    assert.deepEqual(ledger.map((e) => e.eventType), ['EXTERNAL_DRIFT']);
  });

  for (const [status, sink] of [['BLOCKED_PRE_EXECUTION', 'warn'], ['NO_CHANGES', 'warn'], ['REJECTED_PATCH', 'error'], ['FAILED_INCONCLUSIVE', 'error']]) {
    it(`${status} is reported (${sink}) and never prompts for Apply`, async () => {
      const { deps, applied } = mkDeps();
      await handleOutcome(deps, 'continue', { available: true, spawned: false, status, reason: 'why', details: ['x'], cleanupError: 'worktree left at /tmp/fsa-1' });
      const list = sink === 'warn' ? warn : errors;
      assert.equal(list.length, 1);
      assert.match(list[0], new RegExp(`${status} — why\\. x \\(worktree left at /tmp/fsa-1\\)`));
      assert.equal(modalCalls.length, 0);
      assert.equal(applied.length, 0);
    });
  }

  it('a quarantined status without a change set never applies', async () => {
    const { deps, applied } = mkDeps();
    await handleOutcome(deps, 'continue', { ...quarantined, changeSet: undefined });
    assert.equal(applied.length, 0);
    assert.match(errors[0], /no change set; nothing was applied/);
  });

  it('not available → warns with the error, nothing else', async () => {
    const { deps, ledger } = mkDeps();
    await handleOutcome(deps, 'aider', { available: false, spawned: false, error: '`aider` not found on PATH' });
    assert.match(warn[0], /not found on PATH/);
    assert.equal(ledger.length, 0);
  });
});
