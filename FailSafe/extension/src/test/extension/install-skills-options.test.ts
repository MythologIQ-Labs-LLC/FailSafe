import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { resolveInstallSkillsOptions, STATE_KEY, type InstallSkillsOptions } from '../../extension/installSkillsOptions';

interface MockState {
  values: Map<string, unknown>;
  updateCalls: Array<{ key: string; value: unknown }>;
}

function fakeContext(state: MockState): vscode.ExtensionContext {
  return {
    workspaceState: {
      get: <T>(key: string) => state.values.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        state.updateCalls.push({ key, value });
        state.values.set(key, value);
      },
    },
  } as unknown as vscode.ExtensionContext;
}

interface QuickPickStubs {
  hostResult: { host: string; label: string }[] | undefined;
  scopeResult: { scope: 'repo' | 'global'; label: string } | undefined;
  hostShown: boolean;
  scopeShown: boolean;
  hostItemsCaptured: ReadonlyArray<vscode.QuickPickItem & { picked?: boolean }>;
  scopeItemsCaptured: ReadonlyArray<vscode.QuickPickItem & { picked?: boolean }>;
}

function patchQuickPick(stubs: QuickPickStubs): () => void {
  const original = vscode.window.showQuickPick;
  let callIdx = 0;
  (vscode.window as unknown as { showQuickPick: any }).showQuickPick = async (
    items: any,
    _options?: any,
  ) => {
    const itemsArr = Array.isArray(items) ? items : await items;
    if (callIdx === 0) {
      stubs.hostShown = true;
      stubs.hostItemsCaptured = itemsArr;
      callIdx += 1;
      return stubs.hostResult;
    }
    stubs.scopeShown = true;
    stubs.scopeItemsCaptured = itemsArr;
    return stubs.scopeResult;
  };
  return () => { (vscode.window as unknown as { showQuickPick: any }).showQuickPick = original; };
}

function newStubs(): QuickPickStubs {
  return {
    hostResult: [{ host: 'claude', label: 'claude' }, { host: 'codex', label: 'codex' }],
    scopeResult: { scope: 'repo', label: 'repo' },
    hostShown: false,
    scopeShown: false,
    hostItemsCaptured: [],
    scopeItemsCaptured: [],
  };
}

suite('resolveInstallSkillsOptions', () => {
  test('returns {hosts, scope} from QuickPick selections', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    const stubs = newStubs();
    const restore = patchQuickPick(stubs);
    try {
      const result = await resolveInstallSkillsOptions(fakeContext(state));
      assert.deepEqual(result, { hosts: ['claude', 'codex'], scope: 'repo' });
    } finally { restore(); }
  });

  test('persists selection to workspaceState under STATE_KEY', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    const stubs = newStubs();
    const restore = patchQuickPick(stubs);
    try {
      await resolveInstallSkillsOptions(fakeContext(state));
      assert.equal(state.updateCalls.length, 1);
      assert.equal(state.updateCalls[0].key, STATE_KEY);
      assert.deepEqual(state.updateCalls[0].value, { hosts: ['claude', 'codex'], scope: 'repo' });
    } finally { restore(); }
  });

  test('defaults pre-check claude+codex when no prior state', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    const stubs = newStubs();
    const restore = patchQuickPick(stubs);
    try {
      await resolveInstallSkillsOptions(fakeContext(state));
      const claudeItem = stubs.hostItemsCaptured.find((i) => i.label === 'claude');
      const codexItem = stubs.hostItemsCaptured.find((i) => i.label === 'codex');
      const geminiItem = stubs.hostItemsCaptured.find((i) => i.label === 'gemini');
      assert.equal(claudeItem?.picked, true);
      assert.equal(codexItem?.picked, true);
      assert.equal(geminiItem?.picked, false);
    } finally { restore(); }
  });

  test('prior selection pre-checks the previous hosts', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    state.values.set(STATE_KEY, { hosts: ['gemini'], scope: 'global' } as InstallSkillsOptions);
    const stubs = newStubs();
    const restore = patchQuickPick(stubs);
    try {
      await resolveInstallSkillsOptions(fakeContext(state));
      const geminiItem = stubs.hostItemsCaptured.find((i) => i.label === 'gemini');
      const claudeItem = stubs.hostItemsCaptured.find((i) => i.label === 'claude');
      assert.equal(geminiItem?.picked, true);
      assert.equal(claudeItem?.picked, false);
      const globalScope = stubs.scopeItemsCaptured.find((i) => i.label === 'global');
      assert.equal(globalScope?.picked, true);
    } finally { restore(); }
  });

  test('host QuickPick cancel returns undefined; scope QuickPick not shown; no state update', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    const stubs = newStubs();
    stubs.hostResult = undefined;
    const restore = patchQuickPick(stubs);
    try {
      const result = await resolveInstallSkillsOptions(fakeContext(state));
      assert.equal(result, undefined);
      assert.equal(stubs.scopeShown, false);
      assert.equal(state.updateCalls.length, 0);
    } finally { restore(); }
  });

  test('scope QuickPick cancel returns undefined; no state update', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    const stubs = newStubs();
    stubs.scopeResult = undefined;
    const restore = patchQuickPick(stubs);
    try {
      const result = await resolveInstallSkillsOptions(fakeContext(state));
      assert.equal(result, undefined);
      assert.equal(state.updateCalls.length, 0);
    } finally { restore(); }
  });

  test('empty host selection returns undefined', async () => {
    const state: MockState = { values: new Map(), updateCalls: [] };
    const stubs = newStubs();
    stubs.hostResult = [];
    const restore = patchQuickPick(stubs);
    try {
      const result = await resolveInstallSkillsOptions(fakeContext(state));
      assert.equal(result, undefined);
      assert.equal(state.updateCalls.length, 0);
    } finally { restore(); }
  });
});
