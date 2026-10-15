// #473 host wiring (vscode-test only): the workspace binding is keyed by the real
// ConfigManager root (workspaceFolders[0]) and stored through VscodeSecretStore.
// The ExtensionContext's own SecretStorage is not exported by activate(), so the
// store wraps an in-memory SecretStorage; everything else is the production class.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigManager } from '../../shared/ConfigManager';
import { VscodeSecretStore } from '../../core/adapters/vscode/VscodeSecretStore';
import { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { workspaceKey } from '../../qorelogic/ledger/LedgerAnchor';

function memento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? values.get(key) as T : fallback) as T,
    update: async (key: string, value: unknown) => { values.set(key, value); },
  } as vscode.Memento;
}

suite('#473 host wiring', () => {
  test('a ledger opened with the real ConfigManager is bound to workspaceFolders[0] through VscodeSecretStore', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the test host opens a workspace folder');
    const stored = new Map<string, string>();
    const changed = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
    const secrets = {
      get: async (key: string) => stored.get(key),
      store: async (key: string, value: string) => { stored.set(key, value); },
      delete: async (key: string) => { stored.delete(key); },
      keys: async () => [...stored.keys()],
      onDidChange: changed.event,
    } as unknown as vscode.SecretStorage;
    const context = { secrets, globalState: memento(), workspaceState: memento(), subscriptions: [] } as unknown as vscode.ExtensionContext;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger473-host-'));
    const config = new ConfigManager(context);
    // Real getWorkspaceRoot (inherited); only the ledger file is redirected so the test workspace stays clean.
    const provider = Object.create(config) as ConfigManager;
    provider.getLedgerPath = () => path.join(dir, 'soa_ledger.db');
    assert.equal(provider.getWorkspaceRoot(), folder.uri.fsPath);
    const mgr = new LedgerManager(new VscodeSecretStore(context), provider);
    try {
      await mgr.initialize();
      const report = await mgr.verifyLedger();
      assert.equal(report.ok, true);
      assert.equal(report.anchor.workspaceBound, true);
      assert.ok(stored.has(workspaceKey(folder.uri.fsPath)), 'binding stored under the real root');
    } finally {
      mgr.close();
      changed.dispose();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp sweep */ }
    }
  });
});
