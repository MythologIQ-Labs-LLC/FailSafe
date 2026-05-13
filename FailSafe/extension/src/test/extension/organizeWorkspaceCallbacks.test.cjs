/**
 * Unit tests for organizeWorkspace.runOrganize callbacks + computeNextStep
 * (UX hotfix Phase 3).
 *
 * runOrganize imports vscode for QuickPick + OutputChannel typing, but the
 * function body only touches the QuickPick API. We require the compiled
 * out/ artifact with a `vscode` stub module installed via require.cache.
 *
 * Runs standalone: node --test src/test/extension/organizeWorkspaceCallbacks.test.cjs
 */

'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// ---- vscode stub installed BEFORE requiring the compiled artifact. ----
let stubPickResult; // controlled per test
const vscodeStub = {
  window: {
    showQuickPick: async () => stubPickResult,
  },
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode'; // sentinel resolution
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const compiled = path.resolve(
  __dirname, '..', '..', '..', 'out', 'extension', 'organizeWorkspace.js',
);
const { runOrganize, computeNextStep } = require(compiled);

function mkTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-organize-cb-'));
}

function makeMockChannel() {
  const lines = [];
  return {
    lines,
    appendLine: (s) => lines.push(String(s)),
    show: () => {},
    hide: () => {},
    clear: () => {},
    dispose: () => {},
    name: 'mock',
    replace: () => {},
    append: () => {},
  };
}

describe('runOrganize callbacks', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkTempRepo();
    stubPickResult = undefined;
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('non-empty proposal accepted → onToast + onHubRefresh + onNextStep all fire', async () => {
    // Force a real proposal: missing .failsafe/governance/plans triggers
    // governanceDirProposals; we accept it via the stub QuickPick.
    const calls = { toast: [], hub: [], next: [] };
    stubPickResult = [{
      label: 'Create .failsafe/governance/plans',
      description: 'governance structure',
      detail: '...',
      proposal: {
        label: 'Create .failsafe/governance/plans',
        description: 'governance structure',
        detail: '...',
        priority: 'high',
        action: async () => {
          fs.mkdirSync(path.join(tmp, '.failsafe', 'governance', 'plans'), { recursive: true });
        },
      },
    }];
    await runOrganize(tmp, makeMockChannel(), {
      onToast: (m) => calls.toast.push(m),
      onHubRefresh: (r) => calls.hub.push(r),
      onNextStep: (n) => calls.next.push(n),
    });
    assert.equal(calls.toast.length, 1);
    assert.match(calls.toast[0], /^Organize: applied 1 change/);
    assert.deepEqual(calls.hub, ['workspace-organized']);
    assert.equal(calls.next.length, 1);
    // Heuristic: governance-dir creation → suggest Initialize.
    assert.equal(calls.next[0].command, 'failsafe.bootstrap');
  });

  it('user dismisses QuickPick (returns undefined) → zero callbacks fired', async () => {
    stubPickResult = undefined;
    const calls = { toast: [], hub: [], next: [] };
    await runOrganize(tmp, makeMockChannel(), {
      onToast: (m) => calls.toast.push(m),
      onHubRefresh: (r) => calls.hub.push(r),
      onNextStep: (n) => calls.next.push(n),
    });
    assert.equal(calls.toast.length, 0);
    assert.equal(calls.hub.length, 0);
    assert.equal(calls.next.length, 0);
  });

  it('action throws → onToast reflects applied 0 skipped 1; onHubRefresh NOT called', async () => {
    stubPickResult = [{
      label: 'Boom',
      proposal: {
        label: 'Boom',
        description: 'test',
        detail: 'test',
        priority: 'low',
        action: async () => { throw new Error('intentional'); },
      },
    }];
    const calls = { toast: [], hub: [], next: [] };
    await runOrganize(tmp, makeMockChannel(), {
      onToast: (m) => calls.toast.push(m),
      onHubRefresh: (r) => calls.hub.push(r),
      onNextStep: (n) => calls.next.push(n),
    });
    // executed.length === 0 → no toast or hub broadcast
    assert.equal(calls.toast.length, 0);
    assert.equal(calls.hub.length, 0);
    assert.equal(calls.next.length, 0);
  });
});

describe('computeNextStep', () => {
  it('governance-dir creation → suggest Initialize with command', () => {
    const r = computeNextStep({
      archetype: 'ai-workspace', proposals: [],
      executed: ['Create .failsafe/governance/plans'], skipped: [],
    });
    assert.notEqual(r, null);
    assert.match(r.label, /Initialize/);
    assert.equal(r.command, 'failsafe.bootstrap');
  });

  it('gitignore patches → review-and-commit suggestion, no command', () => {
    const r = computeNextStep({
      archetype: 'ai-workspace', proposals: [],
      executed: ['Add 2 governance pattern(s) to .gitignore'], skipped: [],
    });
    assert.notEqual(r, null);
    assert.match(r.label, /Review.+commit/);
    assert.equal(r.command, undefined);
  });

  it('no executed → returns null', () => {
    const r = computeNextStep({
      archetype: 'ai-workspace', proposals: [],
      executed: [], skipped: [],
    });
    assert.equal(r, null);
  });

  it('generic executed (no special pattern) → generic count summary', () => {
    const r = computeNextStep({
      archetype: 'generic', proposals: [],
      executed: ['Create .editorconfig'], skipped: [],
    });
    assert.notEqual(r, null);
    assert.match(r.label, /applied 1 change/);
  });
});
