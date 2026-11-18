// FX962/FX965 (#482), VS Code extension host: migration and endpoint trust
// against the real configuration API (inspect / update at User and Workspace
// scope), with an in-memory Secret Storage. Restores every setting it touches.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IntegrationCredentials, secretKey } from '../../../integrations/credentials/IntegrationCredentials';
import { endpointRefusalMessage, githubCustomEndpointRefusalMessage, providerConnection } from '../../../integrations/credentials/credentialGates';
import { migrateCredentials } from '../../../integrations/credentials/credentialMigration';
import {
  createConfigurationInspector, createEndpointReader, workspaceIdentity,
} from '../../../integrations/credentials/vscodeCredentialAdapters';
import { FakeSecretStore, RecordingLogger } from './fakes';

const TOKEN_KEY = 'failsafe.integrations.jira.apiToken';
const BASE_KEY = 'failsafe.integrations.jira.baseUrl';
const GITHUB_BASE_KEY = 'failsafe.integrations.github.apiBaseUrl';
const TOUCHED = [TOKEN_KEY, BASE_KEY, GITHUB_BASE_KEY];
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
  test('B290 host: real VS Code globalValue GHES setting cannot redirect a User GitHub token', async () => {
    // The test CLI launches this host with a disposable --user-data-dir and HOME.
    // No real secrets, GitHub tokens or network operations are used.
    const { creds } = await fresh();
    await creds.set('github.token', 'user', 'fake_user_token_host_b290');
    const messages: string[] = [];
    const ui = { warn: (message: string) => { messages.push(message); } };
    const attackerBase = 'https://ghe.attacker.invalid/api/v3';

    await cfg().update(GITHUB_BASE_KEY, attackerBase, Global);
    assert.equal(cfg().inspect(GITHUB_BASE_KEY)?.globalValue, attackerBase);
    assert.equal(providerConnection(creds, createEndpointReader(), 'github', ui, 'not configured'), undefined);
    assert.deepEqual(messages, [githubCustomEndpointRefusalMessage()],
      'globalValue is not proof that the remote host approved a custom API destination');

    // Default public GitHub remains allowed for User scope.
    await cfg().update(GITHUB_BASE_KEY, 'https://api.github.com', Global);
    assert.deepEqual(providerConnection(creds, createEndpointReader(), 'github', ui, 'not configured'), {
      credential: 'fake_user_token_host_b290', endpoint: 'https://api.github.com',
    });

    // A separate Workspace credential remains eligible for explicitly scoped GHES.
    await cfg().update(GITHUB_BASE_KEY, undefined, Global);
    await cfg().update(GITHUB_BASE_KEY, 'https://ghe.example/api/v3', Workspace);
    await creds.set('github.token', 'workspace', 'fake_workspace_token_host_b290');
    assert.deepEqual(providerConnection(creds, createEndpointReader(), 'github', ui, 'not configured'), {
      credential: 'fake_workspace_token_host_b290', endpoint: 'https://ghe.example/api/v3',
    });
  });

});
