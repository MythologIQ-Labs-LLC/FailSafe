// FX965 (#482): no integration reads a plain-text credential, and a user
// credential is never sent to an endpoint that workspace settings chose.
// Runs in the extension host (the command modules import vscode); every
// provider transport is a fake that records calls.

import { strict as assert } from 'assert';
import * as path from 'path';
import { IntegrationCredentials, secretKey } from '../../../integrations/credentials/IntegrationCredentials';
import {
  buildCredentialSnapshot, endpointRefusalMessage, governedCommitToken, moveMessage, MOVE_ACTION,
  notifierConfig, notifyFailureText, optionalCredential, providerConnection, requireCredential,
  unavailableMessage, type EndpointReader, type EndpointScope,
} from '../../../integrations/credentials/credentialGates';
import { migrateCredentials, removalQuestion } from '../../../integrations/credentials/credentialMigration';
import { runLinearImport } from '../../../extension/linear-command';
import { runJiraImport } from '../../../extension/jira-command';
import { runGitHubAdvisory, type GitHubAdvisoryOptions } from '../../../extension/github-checks-command';
import { resolveSentryOptions } from '../../../integrations/sentry/sentry-settings';
import { runGovernedCommitFlow } from '../../../extension/governedCommitFlow';
import type { GitRunner } from '../../../extension/governedCommit';
import type { ImportUi } from '../../../integrations/credentials/importUi';
import { FakeInspector, FakeSecretStore, RecordingLogger } from './fakes';
import { findCredentialReads } from './credentialScan';

const TOKEN = 'tok_SECRET_value_1234';
const WS = 'file:///work/project';

class RecordingUi implements ImportUi {
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  readonly infos: string[] = [];
  moved = 0;
  constructor(private readonly answer?: string) {}
  warn(message: string): PromiseLike<string | undefined> { this.warnings.push(message); return Promise.resolve(this.answer); }
  moveToSecureStorage(): void { this.moved++; }
  error(message: string): void { this.errors.push(message); }
  info(message: string): void { this.infos.push(message); }
  progress<T>(_title: string, task: () => Promise<T>): PromiseLike<T> { return task(); }
}

class FakeEndpoints implements EndpointReader {
  readonly values = new Map<string, { value?: string; scope: EndpointScope }>();
  endpoint(settingKey: string) { return this.values.get(settingKey) ?? { scope: 'default' as EndpointScope }; }
}

interface H { store: FakeSecretStore; config: FakeInspector; creds: IntegrationCredentials; endpoints: FakeEndpoints; ui: RecordingUi }

async function h(answer?: string): Promise<H> {
  const store = new FakeSecretStore();
  const config = new FakeInspector();
  const creds = new IntegrationCredentials(store, config, new RecordingLogger());
  await creds.init();
  return { store, config, creds, endpoints: new FakeEndpoints(), ui: new RecordingUi(answer) };
}

const flush = () => new Promise((r) => setImmediate(r));
const migrate = (x: H) => migrateCredentials(x.creds, x.config, { staleChoice: async () => 'leave', confirmRemoval: async () => true }, new RecordingLogger());

suite('requireCredential and providerConnection (FX965 #482)', () => {
  test('value -> returned; plain text -> move message with the move action; unavailable -> unavailable message; none -> not-configured message', async () => {
    const x = await h(MOVE_ACTION);
    await x.creds.set('linear.apiKey', 'user', TOKEN);
    assert.equal(requireCredential(x.creds, 'linear.apiKey', x.ui, 'not configured'), TOKEN);
    assert.deepEqual(x.ui.warnings, []);

    x.config.set('failsafe.integrations.jira.apiToken', 'user', TOKEN);
    assert.equal(requireCredential(x.creds, 'jira.apiToken', x.ui, 'not configured'), undefined);
    await flush();
    assert.deepEqual(x.ui.warnings, [moveMessage('Jira')]);
    assert.equal(x.ui.moved, 1, 'the move action runs the migration');

    assert.equal(requireCredential(x.creds, 'sentry.token', x.ui, 'Sentry not configured'), undefined);
    assert.equal(x.ui.warnings[1], 'Sentry not configured');

    const down = await h();
    down.store.failGet = true;
    await down.creds.refresh();
    assert.equal(requireCredential(down.creds, 'linear.apiKey', down.ui, 'x'), undefined);
    assert.deepEqual(down.ui.warnings, [unavailableMessage('Linear')]);
  });

  test('precedence: a workspace plain-text copy over a stored user value -> refused with the move message', async () => {
    const x = await h();
    await x.creds.set('github.token', 'user', TOKEN);
    x.config.set('failsafe.integrations.github.token', 'workspace', 'ws_plain_value_9999');
    assert.equal(requireCredential(x.creds, 'github.token', x.ui, 'x'), undefined);
    assert.deepEqual(x.ui.warnings, [moveMessage('GitHub')]);
  });

  for (const [endpointScope, credScope, allowed] of [
    ['workspace', 'user', false],
    ['workspace', 'workspace', true],
    ['user', 'user', true],
    ['default', 'user', true],
  ] as const) {
    test(`endpoint trust: endpoint from ${endpointScope} + ${credScope} credential -> ${allowed ? 'allowed' : 'refused'}`, async () => {
      const x = await h();
      await x.creds.set('github.token', credScope, TOKEN);
      if (endpointScope !== 'default') x.endpoints.values.set('failsafe.integrations.github.apiBaseUrl', { value: 'https://ghe.example/api/v3', scope: endpointScope });
      const conn = providerConnection(x.creds, x.endpoints, 'github', x.ui, 'x');
      assert.equal(conn?.credential, allowed ? TOKEN : undefined);
      assert.deepEqual(x.ui.warnings, allowed ? [] : [endpointRefusalMessage('GitHub')]);
    });
  }
});

suite('integration consumers (FX965 #482)', () => {
  test('runLinearImport: after migration the transport receives the migrated key; with only plain text it is never called', async () => {
    const x = await h();
    x.config.set('failsafe.integrations.linear.apiKey', 'user', TOKEN);
    const calls: Record<string, string>[] = [];
    const post = async (_u: string, headers: Record<string, string>) => { calls.push(headers); return { status: 200, body: '{"data":{"issue":null}}' }; };

    await runLinearImport(async () => 'ENG-1', { creds: x.creds, enabled: true, post, ui: x.ui });
    assert.equal(calls.length, 0);
    assert.deepEqual(x.ui.warnings, [moveMessage('Linear')]);

    await migrate(x);
    await runLinearImport(async () => 'ENG-1', { creds: x.creds, enabled: true, post, ui: x.ui });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].Authorization, TOKEN);
  });

  test('runLinearImport: a transport error containing the key is shown redacted', async () => {
    const x = await h();
    await x.creds.set('linear.apiKey', 'user', TOKEN);
    const post = async () => { throw new Error(`rejected key ${TOKEN}`); };
    await runLinearImport(async () => 'ENG-1', { creds: x.creds, enabled: true, post, ui: x.ui });
    assert.equal(x.ui.errors.length, 1);
    assert.ok(!x.ui.errors[0].includes(TOKEN), x.ui.errors[0]);
  });

  test('runJiraImport: workspace base URL + user token -> transport never called, refusal shown; workspace token -> called with it', async () => {
    const x = await h();
    await x.creds.set('jira.apiToken', 'user', TOKEN);
    x.endpoints.values.set('failsafe.integrations.jira.baseUrl', { value: 'https://evil.example', scope: 'workspace' });
    const urls: string[] = [];
    const get = async (url: string, headers: Record<string, string>) => { urls.push(`${url} ${headers.Authorization}`); return { status: 404, body: '{}' }; };
    const deps = { creds: x.creds, endpoints: x.endpoints, enabled: true, email: 'me@example.com', get, ui: x.ui };

    await runJiraImport(async () => 'PROJ-1', deps);
    assert.equal(urls.length, 0);
    assert.deepEqual(x.ui.warnings, [endpointRefusalMessage('Jira')]);

    await x.creds.set('jira.apiToken', 'workspace', 'ws_token_value_5678');
    await runJiraImport(async () => 'PROJ-1', deps);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].startsWith('https://evil.example/'));
    assert.ok(urls[0].includes(Buffer.from('me@example.com:ws_token_value_5678').toString('base64')));
  });

  test('runJiraImport: plain-text token only -> transport never called, move message', async () => {
    const x = await h();
    x.config.set('failsafe.integrations.jira.apiToken', 'user', TOKEN);
    x.endpoints.values.set('failsafe.integrations.jira.baseUrl', { value: 'https://me.atlassian.net', scope: 'user' });
    let called = 0;
    await runJiraImport(async () => 'PROJ-1', {
      creds: x.creds, endpoints: x.endpoints, enabled: true, email: 'me@example.com',
      get: async () => { called++; return { status: 200, body: '{}' }; }, ui: x.ui,
    });
    assert.equal(called, 0);
    assert.deepEqual(x.ui.warnings, [moveMessage('Jira')]);
  });

  test('runGitHubAdvisory: workspace API base URL + user token -> publish never called; workspace token -> published with it', async () => {
    const x = await h();
    await x.creds.set('github.token', 'user', TOKEN);
    x.endpoints.values.set('failsafe.integrations.github.apiBaseUrl', { value: 'https://ghe.evil/api/v3', scope: 'workspace' });
    const published: GitHubAdvisoryOptions[] = [];
    const deps = { creds: x.creds, endpoints: x.endpoints, enabled: true, ui: x.ui, publish: async (o: GitHubAdvisoryOptions) => { published.push(o); } };

    await runGitHubAdvisory(deps);
    assert.deepEqual(published, []);
    assert.deepEqual(x.ui.warnings, [endpointRefusalMessage('GitHub')]);

    await x.creds.set('github.token', 'workspace', 'ws_gh_token_4321');
    await runGitHubAdvisory(deps);
    assert.deepEqual(published, [{ enabled: true, token: 'ws_gh_token_4321', apiBaseUrl: 'https://ghe.evil/api/v3' }]);
  });

  test('Sentry: options take the token and endpoint from the connection; workspace endpoint + user token -> refused, no options', async () => {
    const x = await h();
    const settings: Record<string, unknown> = { 'integrations.sentry.enabled': true, 'integrations.sentry.org': 'o', 'integrations.sentry.project': 'p', 'integrations.sentry.token': 'plain_in_settings_0000' };
    const read = (k: string, f: unknown) => (k in settings ? settings[k] : f);

    x.config.set('failsafe.integrations.sentry.token', 'user', 'plain_in_settings_0000');
    assert.equal(resolveSentryOptions(read, x.creds, x.endpoints, x.ui), undefined, 'plain text alone yields the move message, not a token');
    assert.deepEqual(x.ui.warnings, [moveMessage('Sentry')]);

    await migrate(x);
    assert.equal(resolveSentryOptions(read, x.creds, x.endpoints, x.ui)?.token, 'plain_in_settings_0000');

    x.endpoints.values.set('failsafe.integrations.sentry.apiBaseUrl', { value: 'https://sentry.evil', scope: 'workspace' });
    assert.equal(resolveSentryOptions(read, x.creds, x.endpoints, x.ui), undefined);
    assert.equal(x.ui.warnings.at(-1), endpointRefusalMessage('Sentry'));

    await x.creds.set('sentry.token', 'workspace', 'ws_sentry_token_77');
    const opts = resolveSentryOptions(read, x.creds, x.endpoints, x.ui);
    assert.equal(opts?.token, 'ws_sentry_token_77');
    assert.equal(opts?.apiBaseUrl, 'https://sentry.evil');
  });

  test('Sentry disabled: options returned without consulting credentials (the import reports disabled)', async () => {
    const x = await h();
    x.config.set('failsafe.integrations.sentry.token', 'user', 'plain_in_settings_0000');
    const opts = resolveSentryOptions(() => undefined, x.creds, x.endpoints, x.ui);
    assert.equal(opts?.enabled, false);
    assert.equal(opts?.token, '');
    assert.deepEqual(x.ui.warnings, []);
  });

  test('buildCredentialSnapshot: booleans only; plain text -> false; stored -> true; user GitHub token with workspace endpoint -> false; other keys from settings', async () => {
    const x = await h();
    x.config.set('failsafe.integrations.linear.apiKey', 'user', 'plain_linear_000');
    await x.creds.set('slack.webhookUrl', 'user', 'https://hooks.slack.com/services/x');
    await x.creds.set('github.token', 'user', TOKEN);
    x.endpoints.values.set('failsafe.integrations.github.apiBaseUrl', { value: 'https://ghe.evil', scope: 'workspace' });
    const settings: Record<string, unknown> = { 'failsafe.integrations.jira.email': 'me@example.com', 'failsafe.integrations.slack.enabled': true };
    const keys = ['failsafe.integrations.linear.apiKey', 'failsafe.integrations.slack.webhookUrl', 'failsafe.integrations.github.token', 'failsafe.integrations.jira.email', 'failsafe.integrations.slack.enabled', 'failsafe.integrations.jira.baseUrl'];
    const snap = buildCredentialSnapshot(x.creds, x.endpoints, (k) => settings[k], keys);
    assert.deepEqual(snap, {
      'failsafe.integrations.linear.apiKey': false,
      'failsafe.integrations.slack.webhookUrl': true,
      'failsafe.integrations.github.token': false,
      'failsafe.integrations.jira.email': true,
      'failsafe.integrations.slack.enabled': true,
      'failsafe.integrations.jira.baseUrl': false,
    });
    assert.ok(Object.values(snap).every((v) => typeof v === 'boolean'));
  });

  for (const channel of ['Slack', 'Teams'] as const) {
    const id = channel === 'Slack' ? 'slack.webhookUrl' : 'teams.webhookUrl';
    const setting = `failsafe.integrations.${id}`;
    test(`notifierConfig ${channel}: disabled never consults credentials; plain text -> skipped, warned once; stored -> that webhook`, async () => {
      const x = await h();
      x.config.set(setting, 'user', 'https://plain.example/hook');
      const warned = new Set<string>();
      assert.deepEqual(notifierConfig(x.creds, channel, false, x.ui, warned), { enabled: false });
      assert.deepEqual(x.ui.warnings, []);

      assert.deepEqual(notifierConfig(x.creds, channel, true, x.ui, warned), { enabled: true });
      assert.deepEqual(notifierConfig(x.creds, channel, true, x.ui, warned), { enabled: true });
      assert.deepEqual(x.ui.warnings, [moveMessage(channel === 'Slack' ? 'Slack' : 'Microsoft Teams')]);

      await x.creds.set(id, 'user', 'https://stored.example/hook');
      x.config.settings.clear();
      assert.deepEqual(notifierConfig(x.creds, channel, true, x.ui, warned), { enabled: true, webhookUrl: 'https://stored.example/hook' });
    });
  }

  test('the delivery-failure text names the credential command, not the setting', () => {
    const text = notifyFailureText('Slack', 'HTTP 404');
    assert.ok(text.includes('FailSafe: Set Integration Credential'));
    assert.ok(!/webhook in settings|failsafe\.integrations/.test(text));
  });

  test('governed commit: a stored token reaches the PR creator; plain text only -> PR step skipped, commit still made', async () => {
    const git: GitRunner = async (a) => {
      if (a[0] === 'rev-parse' && a.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
      if (a[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
      if (a[0] === 'status') return { code: 0, stdout: ' M .gitignore\n', stderr: '' };
      if (a[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    };
    const run = async (x: H) => {
      const auth: string[] = [];
      const commits: string[][] = [];
      const r = await runGovernedCommitFlow('organize', ['.gitignore'], ['x'], {
        workspaceRoot: '/ws', confirm: async () => true, recordDeclined: async () => {}, now: () => '2026-10-15T00:00:00Z',
        git: async (a, cwd) => { if (a[0] === 'commit') commits.push(a); return git(a, cwd); },
        post: async (_u, headers) => { auth.push(String(headers.Authorization)); return { status: 201, body: '{"html_url":"https://github.com/o/r/pull/1"}' }; },
        token: governedCommitToken(x.creds, x.ui),
      });
      return { step: (r as { step: string }).step, auth, commits: commits.length };
    };

    const stored = await h();
    await stored.creds.set('github.token', 'user', TOKEN);
    const a = await run(stored);
    assert.equal(a.step, 'pr');
    assert.ok(a.auth[0].includes(TOKEN));

    const plain = await h();
    plain.config.set('failsafe.integrations.github.token', 'user', TOKEN);
    const b = await run(plain);
    assert.notEqual(b.step, 'pr');
    assert.equal(b.commits, 1, 'the commit is still made');
    assert.deepEqual(b.auth, []);
    assert.deepEqual(plain.ui.warnings, [moveMessage('GitHub')]);
  });

  test('Continue: stored key -> used; plain text only -> refused; nothing -> runs without a key', async () => {
    const stored = await h();
    await stored.creds.set('continue.apiKey', 'user', TOKEN);
    assert.deepEqual(optionalCredential(stored.creds, 'continue.apiKey', stored.ui), { ok: true, value: TOKEN });

    const plain = await h();
    plain.config.set('failsafe.integrations.continue.apiKey', 'user', TOKEN);
    assert.deepEqual(optionalCredential(plain.creds, 'continue.apiKey', plain.ui), { ok: false });
    assert.deepEqual(plain.ui.warnings, [moveMessage('Continue')]);

    const none = await h();
    assert.deepEqual(optionalCredential(none.creds, 'continue.apiKey', none.ui), { ok: true });
    assert.deepEqual(none.ui.warnings, []);
  });

  test('the removal question names a value that came from workspace settings', () => {
    const q = removalQuestion({ credentials: ['Jira API token', 'GitHub token'], fromWorkspace: ['Jira API token'], orphans: [] });
    assert.ok(q.includes("From this workspace's settings: Jira API token."), q);
  });

  test('workspace credentials are keyed per workspace identity', () => {
    assert.notEqual(secretKey('jira.apiToken', 'workspace', WS), secretKey('jira.apiToken', 'workspace', 'file:///other'));
    assert.equal(secretKey('jira.apiToken', 'workspace', undefined), undefined);
  });

  test('source scan: no integration reads a credential or credential endpoint setting; every consumer uses a gate', () => {
    const srcRoot = path.resolve(__dirname, '..', '..', '..', '..', 'src');
    assert.deepEqual(findCredentialReads(srcRoot), []);
  });
});
