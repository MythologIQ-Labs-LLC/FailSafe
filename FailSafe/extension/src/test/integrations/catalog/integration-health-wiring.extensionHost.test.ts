// #479 H7, VS Code extension host: an integration's evidence is cleared when its
// settings change (through the real configuration API and its change event) or
// when its stored credential changes, and not otherwise.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { IntegrationHealthStore, HEALTH_STATE_KEY } from '../../../integrations/catalog/integration-health';
import { secretKey } from '../../../integrations/credentials/credentialRegistry';
import { wireHealthClearing } from '../../../extension/integrationEvidenceWiring';

const BASE_KEY = 'failsafe.integrations.jira.baseUrl';
const SARIF_KEY = 'failsafe.integrations.sarif.enabled';

function memory() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: <T>(k: string) => data.get(k) as T | undefined,
    update: (k: string, v: unknown) => { data.set(k, v); return Promise.resolve(); },
  };
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
}

suite('integration health clearing in the extension host (#479 H7)', () => {
  const disposables: vscode.Disposable[] = [];
  const secrets = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  suiteTeardown(async () => {
    disposables.forEach((d) => d.dispose());
    secrets.dispose();
    await vscode.workspace.getConfiguration().update(BASE_KEY, undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration().update(SARIF_KEY, undefined, vscode.ConfigurationTarget.Global);
  });

  function wired() {
    const mem = memory();
    const store = new IntegrationHealthStore(mem);
    disposables.push(...wireHealthClearing(store, {
      onDidChangeConfiguration: vscode.workspace.onDidChangeConfiguration,
      onDidChangeSecrets: secrets.event,
      workspaceIdentity: () => 'ws-identity',
    }));
    store.record('jira', 'contract-verified');
    store.record('sentry', 'contract-verified');
    return { store, mem };
  }

  test('a Jira settings change clears Jira evidence and keeps Sentry evidence', async () => {
    const { store } = wired();
    await vscode.workspace.getConfiguration().update(BASE_KEY, 'https://changed.atlassian.net', vscode.ConfigurationTarget.Global);
    await settle();
    assert.deepEqual(Object.keys(store.snapshot()), ['sentry']);
  });

  test('a change to the Jira credential key in Secret Storage clears Jira evidence', async () => {
    const { store } = wired();
    secrets.fire({ key: secretKey('jira.apiToken', 'user', undefined)! });
    assert.deepEqual(Object.keys(store.snapshot()), ['sentry']);
    store.record('jira', 'contract-verified');
    secrets.fire({ key: secretKey('jira.apiToken', 'workspace', 'ws-identity')! });
    assert.deepEqual(Object.keys(store.snapshot()), ['sentry']);
  });

  test('unrelated setting and secret changes clear nothing', async () => {
    const { store, mem } = wired();
    const before = JSON.stringify(mem.data.get(HEALTH_STATE_KEY));
    secrets.fire({ key: 'failsafe.credential.v1:jira.apiToken:workspace:0000000000000000' });
    secrets.fire({ key: 'some.other.extension.secret' });
    // A settings change for another integration (SARIF) fires the real event
    // but clears neither Jira nor Sentry.
    let fired = false;
    const probe = vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(SARIF_KEY)) fired = true; });
    await vscode.workspace.getConfiguration().update(SARIF_KEY, true, vscode.ConfigurationTarget.Global);
    await settle();
    probe.dispose();
    assert.equal(fired, true, 'the configuration event fired, so the listener ran');
    assert.equal(JSON.stringify(mem.data.get(HEALTH_STATE_KEY)), before);
    assert.deepEqual(Object.keys(store.snapshot()).sort(), ['jira', 'sentry']);
  });
});
