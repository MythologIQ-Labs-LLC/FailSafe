import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskRegisterManager } from '../../../roadmap/services/RiskRegisterManager';
import { importSentryRisks, type RiskSink } from '../../../integrations/sentry/sentry-import';
import { describeSentryImport } from '../../../integrations/sentry/sentry-report';
import { context, detail, issue, OPTS, SCOPE, server, type Server } from './sentry-fixtures';

// FX954 (#478 LD5/LD6): release association only from issue-detail responses,
// with a lookup cap and stop rules; carried releases are shape-checked.

suite('sentry release lookups (#478 FX954)', function () {
  this.timeout(20000);
  let dir = '';
  let store: RiskRegisterManager;
  let sink: RiskSink;
  const stored = (id: string) => store.getStoredRisks().find((r) => r.id === id) as Record<string, unknown> | undefined;
  const release = (id: string) => (stored(id)?.provenance as Record<string, unknown> | undefined)?.release as Record<string, unknown> | undefined;
  const run = (s: Server, opts = OPTS, ctx = context()) => importSentryRisks(opts, s.get, sink, ctx);

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs478-rel-'));
    store = new RiskRegisterManager(dir);
    sink = { upsertWith: (id, build, o) => store.upsertRiskWith(id, build, o) };
  });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a detail response records first / last / lastReleasedAt / ref with source and verifiedAt', async () => {
    const o = await run(server([[issue('1')]], { 1: detail('app@1.0', 'app@1.2') }));
    assert.equal(o.releases.enriched, 1);
    assert.deepEqual(release('sentry:1'), {
      source: 'sentry-issue-detail', first: 'app@1.0', last: 'app@1.2',
      lastReleasedAt: '2026-06-01T00:00:00Z', ref: 'abc123', verifiedAt: '2026-10-15T00:00:00.000Z',
    });
  });

  test('a list item lastRelease is never used without a detail response', async () => {
    await run(server([[issue('1', { lastRelease: { version: 'list@9' } })]]));
    assert.equal(release('sentry:1'), undefined);
  });

  test('a cap of 1 enriches the first listed issue; the other is not attempted', async () => {
    const s = server([[issue('1'), issue('2')]], { 1: detail('a@1', null), 2: detail('b@1', null) });
    const o = await run(s, { ...OPTS, maxReleaseLookups: 1 });
    assert.deepEqual([o.releases.enriched, o.releases.notAttempted], [1, 1]);
    assert.equal(s.details.length, 1);
    assert.equal(release('sentry:2'), undefined);
  });

  test('a rate-limited first lookup stops the rest and the message says so', async () => {
    const s = server([[issue('1'), issue('2'), issue('3')]], { 1: { status: 429, body: '' } });
    const o = await run(s);
    assert.equal(o.releases.stoppedBy, 'rate_limited');
    assert.equal(o.releases.notAttempted, 3);
    assert.equal(s.details.length, 4, 'the one rate-limited lookup, retried, and no other');
    const m = describeSentryImport(o, SCOPE);
    assert.equal(m.level, 'warning');
    assert.match(m.text, /rate limit/i);
    assert.match(m.text, /3 not looked up/);
  });

  test('three consecutive failed lookups stop the rest', async () => {
    const fail = { status: 500, body: '' };
    const s = server([[issue('1'), issue('2'), issue('3'), issue('4'), issue('5')]], { 1: fail, 2: fail, 3: fail, 4: fail, 5: fail });
    const o = await run(s);
    assert.deepEqual([o.releases.failed, o.releases.notAttempted, o.releases.stoppedBy], [3, 2, 'failures']);
    assert.equal(s.details.length, 12);
  });

  test('a failed lookup carries a stored detail release with its old verifiedAt; other stored values are discarded', async () => {
    await run(server([[issue('1'), issue('2')]], { 1: detail('a@1', 'a@2') }));
    const old = release('sentry:1');
    store.upsertRiskWith('sentry:2', (r) => ({ ...r, provenance: { ...(r?.provenance as object), release: { source: 'manual', first: 'x' } } }));
    const o = await run(server([[issue('1'), issue('2')]], { 1: { status: 503, body: '' }, 2: { status: 503, body: '' } }));
    assert.deepEqual([o.releases.carried, o.releases.discarded], [1, 1]);
    assert.deepEqual(release('sentry:1'), old);
    assert.equal(release('sentry:2'), undefined);
  });

  test('a stored detail release with a non-string ref or an extra key is discarded', async () => {
    for (const tamper of [{ ref: 42 }, { note: 'added by hand' }]) {
      await run(server([[issue('1')]], { 1: detail('a@1', 'a@2') }));
      store.upsertRiskWith('sentry:1', (r) => {
        const prov = r?.provenance as Record<string, unknown>;
        return { ...r, provenance: { ...prov, release: { ...(prov.release as object), ...tamper } } };
      });
      const o = await run(server([[issue('1')]]));
      assert.equal(o.releases.discarded, 1, JSON.stringify(tamper));
      assert.equal(release('sentry:1'), undefined, JSON.stringify(tamper));
    }
  });

  test('null releases record none; malformed 200 details count failed and keep a valid stored release', async () => {
    await run(server([[issue('1'), issue('2')]], { 1: detail('a@1', null), 2: detail(null, null) }));
    assert.equal(release('sentry:2'), undefined);
    for (const body of ['not json', '{"id":"1"}', '{"firstRelease":{"name":"x"},"lastRelease":null}']) {
      const o = await run(server([[issue('1')]], { 1: { status: 200, body } }));
      assert.equal(o.releases.failed, 1, body);
      assert.equal(release('sentry:1')?.first, 'a@1', body);
    }
  });

  test('two lookup failures below the threshold stay info but are named', async () => {
    const o = await run(server([[issue('1'), issue('2'), issue('3')]], { 1: { status: 500, body: '' }, 2: { status: 500, body: '' }, 3: detail('c@1', null) }));
    const m = describeSentryImport(o, SCOPE);
    assert.equal(m.level, 'info');
    assert.match(m.text, /2 release lookups failed/);
  });

  test('a non-numeric id is never looked up, and the counters partition the unique issues', async () => {
    const s = server([[issue('1'), issue('abc'), issue('1'), issue('2')]], { 1: detail('a@1', null), 2: detail(null, null) });
    const o = await run(s);
    assert.ok(s.details.every((u) => !u.includes('abc')));
    const r = o.releases;
    assert.equal(r.enriched + r.none + r.failed + r.notAttempted, o.eligible - o.duplicates);
    assert.deepEqual([r.enriched, r.none, r.notAttempted], [1, 1, 1]);
  });

  suite('request targets', () => {
    test('every detail request stays under the configured HTTPS base', async () => {
      const s = server([[issue('1'), issue('2')]], { 1: detail('a@1', null) });
      await run(s, { ...OPTS, apiBaseUrl: 'https://Host.Example:443/sentry/' } as typeof OPTS);
      assert.equal(s.details.length, 2);
      for (const u of s.details) assert.ok(u.startsWith('https://host.example/sentry/api/0/organizations/acme/issues/'), u);
      assert.ok(s.list.every((u) => u.startsWith('https://host.example/sentry/api/0/organizations/acme/issues/?')));
    });

    test('an http base or an unsafe org makes zero requests', async () => {
      for (const opts of [{ ...OPTS, apiBaseUrl: 'http://sentry.io' }, { ...OPTS, org: '..' }, { ...OPTS, org: 'a/b' }]) {
        const s = server([[issue('1')]]);
        const o = await run(s, opts as typeof OPTS);
        assert.equal(o.ok, false);
        assert.equal(describeSentryImport(o, SCOPE).level, 'error');
        assert.equal(s.list.length + s.details.length, 0);
      }
    });

    test('a Remaining: 0 list response makes the import wait for reset before the next request', async () => {
      const ctx = context();
      const reset = String(Date.parse('2026-10-15T00:00:05Z') / 1000);
      const s = server([[issue('1')]]);
      const get: typeof s.get = async (u, h) => ({ ...(await s.get(u, h)), headers: { 'x-sentry-rate-limit-remaining': '0', 'x-sentry-rate-limit-reset': reset } });
      await importSentryRisks(OPTS, get, sink, ctx);
      assert.deepEqual(ctx.sleeps, [5000]);
    });
  });
});
