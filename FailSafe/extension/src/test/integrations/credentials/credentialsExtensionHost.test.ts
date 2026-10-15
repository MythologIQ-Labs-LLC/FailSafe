// FX962/FX965 (#482), VS Code extension host: migration and endpoint trust
// against the real configuration API (inspect / update at User and Workspace
// scope), with an in-memory Secret Storage. Restores every setting it touches.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IntegrationCredentials, secretKey } from '../../../integrations/credentials/IntegrationCredentials';
import { endpointRefusalMessage, providerConnection } from '../../../integrations/credentials/credentialGates';
import { migrateCredentials } from '../../../integrations/credentials/credentialMigration';
import {
  createConfigurationInspector, createEndpointReader, workspaceIdentity,
} from '../../../integrations/credentials/vscodeCredentialAdapters';
import { FakeSecretStore, RecordingLogger } from './fakes';

const TOKEN_KEY = 'failsafe.integrations.jira.apiToken';
const BASE_KEY = 'failsafe.integrations.jira.baseUrl';
const TOUCHED = [TOKEN_KEY, BASE_KEY];
const { Global, Workspace } = vscode.ConfigurationTarget;

const cfg = () => vscode.workspace.getConfiguration();
const consent = { staleChoice: async () => 'leave' as const, confirmRemoval: async () => true };

async function fresh(): Promise<{ store: FakeSecretStore; creds: IntegrationCredentials }> {
  const store = new FakeSecretStore();
  const creds = new IntegrationCredentials(store, createConfigurationInspector(), new RecordingLogger());
  await creds.init();
  return { store, creds };
}

suite('integration credentials in the extension host (FX962/FX965 #482)', () => {
  let settingsFile: string | undefined;
  let settingsBefore: string | undefined;

  suiteSetup(() => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(folder, 'the test host opens src/test/test-workspace');
    settingsFile = path.join(folder, '.vscode', 'settings.json');
    settingsBefore = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : undefined;
  });

  suiteTeardown(async () => {
    for (const key of TOUCHED) {
      await cfg().update(key, undefined, Global);
      await cfg().update(key, undefined, Workspace);
    }
    if (settingsFile && settingsBefore !== undefined) fs.writeFileSync(settingsFile, settingsBefore);
  });

  test('a Workspace-scope plain-text token migrates and, after consent, is gone from workspace settings', async () => {
    await cfg().update(TOKEN_KEY, 'ws_plain_jira_token_1', Workspace);
    assert.equal(cfg().inspect(TOKEN_KEY)?.workspaceValue, 'ws_plain_jira_token_1');
    const { store, creds } = await fresh();

    const report = await migrateCredentials(creds, createConfigurationInspector(), consent, new RecordingLogger());

    assert.deepEqual(report.lines.map((l) => `${l.scope}:${l.outcome}`), ['Workspace:migrated', 'Workspace:plaintext-removed']);
    assert.equal(cfg().inspect(TOKEN_KEY)?.workspaceValue, undefined);
    assert.equal(store.data.get(secretKey('jira.apiToken', 'workspace', workspaceIdentity())!), 'ws_plain_jira_token_1');
    assert.equal(creds.resolve('jira.apiToken').value, 'ws_plain_jira_token_1');
  });

  test('a User-scope plain-text token migrates and is cleared from user settings', async () => {
    await cfg().update(TOKEN_KEY, 'user_plain_jira_token_2', Global);
    const { store, creds } = await fresh();

    const report = await migrateCredentials(creds, createConfigurationInspector(), consent, new RecordingLogger());

    assert.deepEqual(report.lines.map((l) => `${l.scope}:${l.outcome}`), ['User:migrated', 'User:plaintext-removed']);
    assert.equal(cfg().inspect(TOKEN_KEY)?.globalValue, undefined);
    assert.equal(store.data.get('failsafe.credential.v1:jira.apiToken'), 'user_plain_jira_token_2');
    assert.equal(report.settingsSyncNote, true);
  });

  test('a Workspace-scope Jira base URL with a user-scope token is refused; the same URL at User scope is allowed', async () => {
    const { creds } = await fresh();
    await creds.set('jira.apiToken', 'user', 'user_secret_jira_token_3');
    const warnings: string[] = [];
    const ui = { warn: (m: string) => { warnings.push(m); } };

    await cfg().update(BASE_KEY, 'https://evil.example', Workspace);
    assert.equal(providerConnection(creds, createEndpointReader(), 'jira', ui, 'x'), undefined);
    assert.deepEqual(warnings, [endpointRefusalMessage('Jira')]);

    await cfg().update(BASE_KEY, undefined, Workspace);
    await cfg().update(BASE_KEY, 'https://me.atlassian.net', Global);
    assert.deepEqual(providerConnection(creds, createEndpointReader(), 'jira', ui, 'x'), {
      credential: 'user_secret_jira_token_3', endpoint: 'https://me.atlassian.net',
    });
  });
});
