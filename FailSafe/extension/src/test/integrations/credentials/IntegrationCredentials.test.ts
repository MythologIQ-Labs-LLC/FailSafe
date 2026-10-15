// FX962 (#482): integration credentials resolve only from Secret Storage,
// move from plain settings only with consent after read-back verification,
// never overwrite a different stored value silently, and never appear in
// logs or reports.

import { strict as assert } from 'assert';
import {
  IntegrationCredentials, providerMessage, secretKey, workspaceHash,
} from '../../../integrations/credentials/IntegrationCredentials';
import {
  migrateCredentials, renderMigrationReport, ROTATION_ADVICE, SETTINGS_SYNC_NOTE,
  type MigrationPrompts, type MigrationReport, type RemovalSummary, type StaleChoice,
} from '../../../integrations/credentials/credentialMigration';
import { FakeInspector, FakeSecretStore, RecordingLogger } from './fakes';

const SECRETS = ['lin_api_PLAINTEXT_0001', 'sntrys_PLAINTEXT_0002', 'stored_SECRET_0003', 'ws_PLAINTEXT_0004', 'jira_PLAINTEXT_0005', 'folder_PLAINTEXT_0006', 'orphan_PLAINTEXT_0007', 'set_SECRET_0008', 'set_SECRET_0009'];
const LINEAR = 'failsafe.integrations.linear.apiKey';
const SENTRY = 'failsafe.integrations.sentry.token';
const JIRA = 'failsafe.integrations.jira.apiToken';
const ORPHAN = 'failsafe.qorelogic.externalRuntime.apiKey';
const WS = 'file:///work/project';

interface Harness { store: FakeSecretStore; config: FakeInspector; logger: RecordingLogger; creds: IntegrationCredentials }

async function harness(setup?: (h: Omit<Harness, 'creds'>) => void, timeoutMs?: number): Promise<Harness> {
  const store = new FakeSecretStore();
  const config = new FakeInspector();
  const logger = new RecordingLogger();
  setup?.({ store, config, logger });
  const creds = new IntegrationCredentials(store, config, logger, timeoutMs ? { initTimeoutMs: timeoutMs } : {});
  await creds.init();
  return { store, config, logger, creds };
}

function prompts(opts: { remove?: boolean; stale?: StaleChoice | undefined } = {}): MigrationPrompts & { summaries: RemovalSummary[]; staleAsked: string[] } {
  const summaries: RemovalSummary[] = [];
  const staleAsked: string[] = [];
  return {
    summaries, staleAsked,
    staleChoice: async (label, scope) => { staleAsked.push(`${label}@${scope}`); return opts.stale; },
    confirmRemoval: async (s) => { summaries.push(s); return opts.remove ?? true; },
  };
}

const outcomes = (r: MigrationReport) => r.lines.map((l) => `${l.settingKey}@${l.scope}:${l.outcome}`);

/** Every string a run produced: logs and the rendered report. */
function assertNoSecretIn(h: Harness, report?: MigrationReport): void {
  const texts = [...h.logger.entries, ...(report ? renderMigrationReport(report) : []), JSON.stringify(report ?? {})];
  for (const t of texts) for (const s of SECRETS) assert.ok(!t.includes(s), `credential value leaked: ${t}`);
}

suite('IntegrationCredentials (FX962 #482)', () => {
  test('first-time set at user scope stores the v1 key; resolve returns it; configuration untouched', async () => {
    const h = await harness();
    await h.creds.set('linear.apiKey', 'user', SECRETS[7]);
    assert.equal(h.store.data.get('failsafe.credential.v1:linear.apiKey'), SECRETS[7]);
    assert.deepEqual(h.creds.resolve('linear.apiKey'), { value: SECRETS[7], scope: 'user', plaintextPending: false, plaintextScopes: [], unavailable: false });
    assert.equal(h.config.settings.size, 0);
    assertNoSecretIn(h);
  });

  test('a workspace credential is keyed by a hash of the workspace identity and beats the user value', async () => {
    const h = await harness();
    await h.creds.set('github.token', 'user', SECRETS[7]);
    await h.creds.set('github.token', 'workspace', SECRETS[8]);
    assert.equal(secretKey('github.token', 'workspace', WS), `failsafe.credential.v1:github.token:workspace:${workspaceHash(WS)}`);
    assert.equal(h.store.data.get(secretKey('github.token', 'workspace', WS)!), SECRETS[8]);
    assert.equal(h.creds.resolve('github.token').value, SECRETS[8]);
    assert.equal(h.creds.resolve('github.token').scope, 'workspace');
  });

  test('another workspace identity does not see this workspace credential', async () => {
    const h = await harness();
    await h.creds.set('github.token', 'workspace', SECRETS[8]);
    h.config.identity = 'file:///work/other';
    await h.creds.refresh();
    assert.equal(h.creds.resolve('github.token').value, undefined);
  });

  test('set twice -> the second resolves; clear -> none; a delete in another window -> none', async () => {
    const h = await harness();
    await h.creds.set('jira.apiToken', 'user', SECRETS[7]);
    await h.creds.set('jira.apiToken', 'user', SECRETS[8]);
    assert.equal(h.creds.resolve('jira.apiToken').value, SECRETS[8]);
    await h.creds.clear('jira.apiToken', 'user');
    assert.equal(h.creds.resolve('jira.apiToken').value, undefined);

    await h.creds.set('jira.apiToken', 'user', SECRETS[7]);
    h.store.externalDelete('failsafe.credential.v1:jira.apiToken');
    await new Promise((r) => setImmediate(r));
    assert.equal(h.creds.resolve('jira.apiToken').value, undefined);
  });

  test('a plain-text setting is never returned as a value', async () => {
    const h = await harness(({ config }) => config.set(LINEAR, 'user', SECRETS[0]));
    const r = h.creds.resolve('linear.apiKey');
    assert.equal(r.value, undefined);
    assert.equal(r.plaintextPending, true);
    assert.deepEqual(r.plaintextScopes, ['user']);
  });

  test('a folder copy does not count as pending (VS Code ignores it) but is reported by hasPlainText', async () => {
    const h = await harness(({ config }) => config.set(LINEAR, 'folder', SECRETS[5], 'C:/work/a'));
    assert.equal(h.creds.resolve('linear.apiKey').plaintextPending, false);
    assert.equal(h.creds.hasPlainText(), true);
  });

  test('Secret Storage throwing during init -> every credential unavailable, no plain-text value; the next resolve retries', async () => {
    const h = await harness(({ store, config }) => {
      store.failGet = true;
      store.data.set('failsafe.credential.v1:linear.apiKey', SECRETS[2]);
      config.set(LINEAR, 'user', SECRETS[0]);
    });
    const r = h.creds.resolve('linear.apiKey');
    assert.equal(r.unavailable, true);
    assert.equal(r.value, undefined);
    assert.equal(h.creds.resolve('slack.webhookUrl').unavailable, true);

    await h.creds.whenReady(); // the retry those resolves started fails too
    assert.equal(h.creds.isUnavailable(), true);
    h.store.failGet = false;
    assert.equal(h.creds.resolve('linear.apiKey').unavailable, true, 'this resolve starts the retry');
    await h.creds.whenReady();
    assert.equal(h.creds.resolve('linear.apiKey').value, SECRETS[2]);
    assertNoSecretIn(h);
  });

  test('Secret Storage not answering within the timeout -> unavailable; a late answer does not populate the cache', async () => {
    const h = await harness(({ store }) => {
      store.hangGet = true;
      store.data.set('failsafe.credential.v1:linear.apiKey', SECRETS[2]);
    }, 20);
    assert.equal(h.creds.isUnavailable(), true);
    h.store.releaseHeld();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.creds.isUnavailable(), true, 'the late answer is discarded');
    assert.deepEqual(h.creds.knownValues(), []);

    h.store.hangGet = false;
    const callsBefore = h.store.getCalls;
    assert.equal(h.creds.resolve('linear.apiKey').unavailable, true, 'this resolve starts the retry');
    await h.creds.whenReady();
    assert.ok(h.store.getCalls > callsBefore, 'resolve() retried init()');
    assert.equal(h.creds.resolve('linear.apiKey').value, SECRETS[2]);
  });

  test('set with Secret Storage refusing throws and stores nothing', async () => {
    const h = await harness(({ store }) => { store.failStore = true; });
    await assert.rejects(() => h.creds.set('linear.apiKey', 'user', SECRETS[7]));
    assert.equal(h.creds.resolve('linear.apiKey').value, undefined);
  });

  test('providerMessage replaces a stored value (and its URL-encoded form) inside an error string', async () => {
    const h = await harness();
    await h.creds.set('slack.webhookUrl', 'user', 'https://hooks.slack.com/services/T0/B0/x y');
    await h.creds.set('jira.apiToken', 'user', SECRETS[7]);
    const msg = providerMessage(`401 for token ${SECRETS[7]} at https%3A%2F%2Fhooks.slack.com%2Fservices%2FT0%2FB0%2Fx%20y`, h.creds);
    assert.equal(msg, '401 for token [redacted] at [redacted]');
  });
});

suite('credential migration (FX962 #482)', () => {
  test('a user plain-text Sentry token migrates: stored, read back, removal consented -> cleared at User; Settings Sync noted', async () => {
    const h = await harness(({ config }) => config.set(SENTRY, 'user', SECRETS[1]));
    const p = prompts();
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.deepEqual(outcomes(report), [`${SENTRY}@User:migrated`, `${SENTRY}@User:plaintext-removed`]);
    assert.equal(h.store.data.get('failsafe.credential.v1:sentry.token'), SECRETS[1]);
    assert.deepEqual(h.config.inspect(SENTRY), []);
    assert.equal(h.creds.resolve('sentry.token').value, SECRETS[1]);
    assert.equal(report.settingsSyncNote, true);
    assert.ok(renderMigrationReport(report).includes(SETTINGS_SYNC_NOTE));
    assert.equal(report.ok, true);
    assertNoSecretIn(h, report);
  });

  test('store throwing -> failed, setting untouched, nothing offered for removal, plaintext still pending', async () => {
    const h = await harness(({ config, store }) => { config.set(LINEAR, 'user', SECRETS[0]); store.failStore = true; });
    const p = prompts();
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.deepEqual(outcomes(report), [`${LINEAR}@User:failed`]);
    assert.equal(p.summaries.length, 0);
    assert.deepEqual(h.config.inspect(LINEAR), [{ scope: 'user', value: SECRETS[0] }]);
    const r = h.creds.resolve('linear.apiKey');
    assert.equal(r.value, undefined);
    assert.equal(r.plaintextPending, true);
    assert.equal(report.ok, false);
    assertNoSecretIn(h, report);
  });

  test('read-back mismatch -> failed, setting untouched', async () => {
    const h = await harness(({ config }) => config.set(LINEAR, 'user', SECRETS[0]));
    h.store.corruptReadBack = true;
    const report = await migrateCredentials(h.creds, h.config, prompts(), h.logger);
    assert.deepEqual(outcomes(report), [`${LINEAR}@User:failed`]);
    assert.deepEqual(h.config.inspect(LINEAR), [{ scope: 'user', value: SECRETS[0] }]);
    h.store.corruptReadBack = false;
    assert.equal(h.store.data.has('failsafe.credential.v1:linear.apiKey'), false, 'the unverified write was undone');
    assert.equal(h.creds.resolve('linear.apiKey').value, undefined, 'cache changes only after a verified write');
  });

  test('one failed copy keeps every plain-text copy of that credential', async () => {
    const h = await harness(({ config }) => { config.set(LINEAR, 'user', SECRETS[0]); config.set(LINEAR, 'workspace', SECRETS[3]); });
    let n = 0;
    const realStore = h.store.store.bind(h.store);
    h.store.store = async (k, v) => { if (++n === 2) throw new Error('refused'); return realStore(k, v); };
    const p = prompts();
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.deepEqual(outcomes(report), [`${LINEAR}@User:migrated`, `${LINEAR}@Workspace:failed`, `${LINEAR}@User:plaintext-kept`]);
    assert.equal(p.summaries.length, 0);
    assert.equal(h.config.inspect(LINEAR).length, 2);
  });

  test('an existing equal secret -> migrated with no store call', async () => {
    const h = await harness(({ config, store }) => {
      config.set(LINEAR, 'user', SECRETS[0]);
      store.data.set('failsafe.credential.v1:linear.apiKey', SECRETS[0]);
    });
    const before = h.store.storeCalls;
    const report = await migrateCredentials(h.creds, h.config, prompts(), h.logger);
    assert.equal(h.store.storeCalls, before);
    assert.deepEqual(outcomes(report), [`${LINEAR}@User:migrated`, `${LINEAR}@User:plaintext-removed`]);
  });

  for (const [choice, expected, storedAfter, settingAfter] of [
    ['keep', 'stale-discarded', SECRETS[2], 0],
    ['use', 'stale-adopted', SECRETS[0], 0],
    ['leave', 'stale-plaintext', SECRETS[2], 1],
    [undefined, 'stale-plaintext', SECRETS[2], 1],
  ] as const) {
    test(`a different stored secret is never overwritten silently: stale modal answer ${choice ?? 'Escape'} -> ${expected}`, async () => {
      const h = await harness(({ config, store }) => {
        config.set(LINEAR, 'user', SECRETS[0]);
        store.data.set('failsafe.credential.v1:linear.apiKey', SECRETS[2]);
      });
      const p = prompts({ stale: choice });
      const report = await migrateCredentials(h.creds, h.config, p, h.logger);
      assert.deepEqual(p.staleAsked, ['Linear API key@User']);
      assert.deepEqual(outcomes(report), [`${LINEAR}@User:${expected}`]);
      assert.equal(h.store.data.get('failsafe.credential.v1:linear.apiKey'), storedAfter);
      assert.equal(h.creds.resolve('linear.apiKey').value, storedAfter);
      assert.equal(h.config.inspect(LINEAR).length, settingAfter);
      assert.equal(p.summaries.length, 0, 'the bulk removal modal never lists a stale copy');
      assertNoSecretIn(h, report);
    });
  }

  test('removal declined -> plaintext-kept; the value resolves from the secret', async () => {
    const h = await harness(({ config }) => config.set(LINEAR, 'user', SECRETS[0]));
    const report = await migrateCredentials(h.creds, h.config, prompts({ remove: false }), h.logger);
    assert.deepEqual(outcomes(report), [`${LINEAR}@User:migrated`, `${LINEAR}@User:plaintext-kept`]);
    assert.equal(h.creds.resolve('linear.apiKey').value, SECRETS[0]);
    assert.equal(h.config.inspect(LINEAR).length, 1);
  });

  test('the setting changed between store and clear -> not cleared, plaintext-kept', async () => {
    const h = await harness(({ config }) => config.set(LINEAR, 'user', SECRETS[0]));
    const p = prompts();
    p.confirmRemoval = async (s) => { p.summaries.push(s); h.config.set(LINEAR, 'user', SECRETS[3]); return true; };
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.deepEqual(outcomes(report), [`${LINEAR}@User:migrated`, `${LINEAR}@User:plaintext-kept`]);
    assert.deepEqual(h.config.removed, []);
  });

  test('a clear that returns but leaves the value -> removal-failed; a clear that throws -> removal-failed', async () => {
    for (const mode of ['silent', 'throw'] as const) {
      const h = await harness(({ config }) => config.set(LINEAR, 'user', SECRETS[0]));
      if (mode === 'silent') h.config.silentRemove = true; else h.config.failRemove = true;
      const report = await migrateCredentials(h.creds, h.config, prompts(), h.logger);
      assert.deepEqual(outcomes(report), [`${LINEAR}@User:migrated`, `${LINEAR}@User:removal-failed`], mode);
      assert.equal(report.ok, false);
      assert.equal(report.settingsSyncNote, false);
    }
  });

  test('workspace and user copies both migrate to their own scopes; the modal names the workspace one; rotation advised', async () => {
    const h = await harness(({ config }) => { config.set(JIRA, 'user', SECRETS[4]); config.set(JIRA, 'workspace', SECRETS[3]); });
    const p = prompts();
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.equal(h.store.data.get('failsafe.credential.v1:jira.apiToken'), SECRETS[4]);
    assert.equal(h.store.data.get(secretKey('jira.apiToken', 'workspace', WS)!), SECRETS[3]);
    assert.equal(h.creds.resolve('jira.apiToken').value, SECRETS[3]);
    assert.deepEqual(p.summaries, [{ credentials: ['Jira API token'], fromWorkspace: ['Jira API token'], orphans: [] }]);
    assert.equal(report.rotationAdvised, true);
    assert.ok(renderMigrationReport(report).includes(ROTATION_ADVICE));
    assertNoSecretIn(h, report);
  });

  test('a folder copy is reported ignored-folder-copy, never stored or removed, rotation advised', async () => {
    const h = await harness(({ config }) => config.set(LINEAR, 'folder', SECRETS[5], 'C:/work/a'));
    const p = prompts();
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.deepEqual(outcomes(report), [`${LINEAR}@Folder C:/work/a:ignored-folder-copy`]);
    assert.equal(h.store.storeCalls, 0);
    assert.deepEqual(h.config.removed, []);
    assert.equal(p.summaries.length, 0);
    assert.equal(report.rotationAdvised, true);
    assertNoSecretIn(h, report);
  });

  test('externalRuntime.apiKey is offered for removal only, never stored', async () => {
    const h = await harness(({ config }) => config.set(ORPHAN, 'user', SECRETS[6]));
    const p = prompts();
    const report = await migrateCredentials(h.creds, h.config, p, h.logger);
    assert.equal(h.store.storeCalls, 0);
    assert.deepEqual(p.summaries, [{ credentials: [], fromWorkspace: [], orphans: [ORPHAN] }]);
    assert.deepEqual(outcomes(report), [`${ORPHAN}@User:plaintext-removed`]);
    assertNoSecretIn(h, report);
  });
});
