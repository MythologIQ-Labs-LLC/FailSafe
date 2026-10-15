import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskRegisterManager } from '../../../roadmap/services/RiskRegisterManager';
import { importSentryRisks, type RiskSink } from '../../../integrations/sentry/sentry-import';
import { describeSentryImport } from '../../../integrations/sentry/sentry-report';
import type { SentryGetFn } from '../../../integrations/sentry/sentry-transport';
import { context, issue, OPTS, SCOPE, server, type Server } from './sentry-fixtures';

// FX954 / FX915 (#478): import outcome accuracy through a real RiskRegisterManager.
// Release-lookup cases are in sentry-releases.test.ts.

suite('sentry import outcome (#478 FX954)', function () {
  this.timeout(20000);
  let dir = '';
  let store: RiskRegisterManager;
  let sink: RiskSink;
  const file = () => path.join(dir, '.failsafe', 'risks', 'risks.json');
  const stored = (id: string) => store.getStoredRisks().find((r) => r.id === id) as Record<string, unknown> | undefined;
  const run = (s: Server, ctx = context(), opts = OPTS, k = sink) => importSentryRisks(opts, s.get, k, ctx);

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs478-imp-'));
    store = new RiskRegisterManager(dir);
    sink = { upsertWith: (id, build, o) => store.upsertRiskWith(id, build, o) };
  });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  suite('counts', () => {
    test('two pages with an id-less item, a non-object and a duplicate', async () => {
      const s = server([[issue('1'), { title: 'no id' }, 'junk'], [issue('2'), issue('1')]]);
      const o = await run(s);
      assert.equal(o.ok, true);
      assert.equal(o.pagesFetched, 2);
      assert.deepEqual([o.fetched, o.eligible, o.skipped, o.duplicates, o.unique, o.created], [5, 3, 2, 1, 2, 2]);
      assert.equal(o.skippedReasons.length, 2);
      assert.equal(s.details.length, 2, 'only the unique ids are looked up');
    });

    test('a repeat import is unchanged with identical bytes; a changed lastSeen is updated', async () => {
      await run(server([[issue('1'), issue('2')]]));
      const bytes = fs.readFileSync(file());
      const again = await run(server([[issue('1'), issue('2')]]));
      assert.deepEqual([again.unchanged, again.updated, again.created], [2, 0, 0]);
      assert.ok(fs.readFileSync(file()).equals(bytes));
      const moved = await run(server([[issue('1', { lastSeen: '2026-07-01T00:00:00Z' }), issue('2')]]));
      assert.deepEqual([moved.updated, moved.unchanged], [1, 1]);
    });

    test('a legacy provenance.suspectCommit is dropped and counted updated', async () => {
      await run(server([[issue('1')]]));
      store.upsertRiskWith('sentry:1', (r) => ({ ...r, provenance: { ...(r?.provenance as object), suspectCommit: 'deadbeef' } }));
      const o = await run(server([[issue('1')]]));
      assert.equal(o.updated, 1);
      assert.equal('suspectCommit' in (stored('sentry:1')?.provenance as object), false);
    });
  });

  suite('operator triage', () => {
    test('a closed risk with an operator field stays closed, keeps the field and is unchanged', async () => {
      await run(server([[issue('1')]]));
      store.upsertRiskWith('sentry:1', (r) => ({ ...r, status: 'closed', owner: 'kevin' }));
      const o = await run(server([[issue('1')]]));
      assert.equal(o.unchanged, 1);
      assert.equal(stored('sentry:1')?.status, 'closed');
      assert.equal(stored('sentry:1')?.owner, 'kevin');
    });

    test('a close made during a detail lookup (after the list, before writes) survives the import', async () => {
      await run(server([[issue('1')]]));
      const o = await run(server([[issue('1', { lastSeen: '2026-08-01T00:00:00Z' })]], {}, () => store.closeRisk('sentry:1')));
      assert.equal(o.updated, 1);
      assert.equal(stored('sentry:1')?.status, 'closed');
    });
  });

  suite('write failures and messages', () => {
    const failing = (failOn: (n: number) => boolean): RiskSink => {
      let n = 0;
      return { upsertWith: (id, b, o) => { n++; if (failOn(n)) throw new Error('write refused'); return store.upsertRiskWith(id, b, o); } };
    };

    test('one of three writes throwing: 2 created, 1 failed, warning, never "3"', async () => {
      const o = await run(server([[issue('1'), issue('2'), issue('3')]]), context(), OPTS, failing((n) => n === 2));
      assert.deepEqual([o.created, o.failed], [2, 1]);
      const m = describeSentryImport(o, SCOPE);
      assert.equal(m.level, 'warning');
      assert.match(m.text, /2 created/);
      assert.match(m.text, /1 failed/);
      assert.ok(!/\b3 (created|persisted|imported)/.test(m.text));
    });

    test('every write throwing is an error, also when duplicates are present', async () => {
      const o = await run(server([[issue('1'), issue('2'), issue('1')]]), context(), OPTS, failing(() => true));
      assert.deepEqual([o.eligible, o.duplicates, o.unique, o.failed], [3, 1, 2, 2]);
      assert.equal(describeSentryImport(o, SCOPE).level, 'error');
    });

    test('a 401 list response writes nothing and is an error', async () => {
      const o = await importSentryRisks(OPTS, async () => ({ status: 401, body: '' }), failing(() => { throw new Error('must not write'); }), context());
      assert.equal(o.ok, false);
      assert.equal(describeSentryImport(o, SCOPE).level, 'error');
      assert.equal(fs.existsSync(file()), false);
    });

    test('zero issues is info; local-only is ok with a warning', async () => {
      const zero = describeSentryImport(await run(server([[]])), SCOPE);
      assert.equal(zero.level, 'info');
      assert.match(zero.text, /no unresolved issues/);
      const skippedOnly = describeSentryImport(await run(server([[{ title: 'x' }]])), { ...SCOPE, query: 'level:error' });
      assert.match(skippedOnly.text, /1 skipped/);
      assert.match(skippedOnly.text, /level:error/);
      const local = await run(server([[]]), context(), { ...OPTS, enabled: false });
      assert.equal(local.ok, true);
      assert.equal(local.localOnly, true);
      assert.equal(describeSentryImport(local, SCOPE).level, 'warning');
    });
  });

  suite('list failure and cancellation', () => {
    test('a 429 exhausted on page 2 writes nothing', async () => {
      let calls = 0;
      const get: SentryGetFn = async (url) => (++calls === 1
        ? { status: 200, body: JSON.stringify([issue('1')]), headers: { link: `<${url}&cursor=1>; rel="next"; results="true"` } }
        : { status: 429, body: '' });
      const o = await importSentryRisks(OPTS, get, sink, context());
      assert.equal(o.ok, false);
      assert.equal(o.nextCursor, '1');
      assert.equal(describeSentryImport(o, SCOPE).level, 'error');
      assert.equal(fs.existsSync(file()), false);
    });

    test('cancellation after page 1 writes nothing and reports the cursor', async () => {
      const ctx = context();
      const s = server([[issue('1')], [issue('2')]]);
      const get: SentryGetFn = async (url, h) => { const r = await s.get(url, h); ctx.cancel.cancelled = true; return r; };
      const o = await importSentryRisks(OPTS, get, sink, ctx);
      assert.deepEqual([o.ok, o.cancelled, o.pagesFetched, o.nextCursor], [false, true, 1, '1']);
      assert.equal(describeSentryImport(o, SCOPE).level, 'warning');
      assert.equal(fs.existsSync(file()), false);
    });

    test('cancellation during a detail lookup writes nothing', async () => {
      const ctx = context(1);
      const o = await run(server([[issue('1'), issue('2')]], { 1: { status: 502, body: '' } }), ctx);
      assert.equal(o.cancelled, true);
      assert.equal(o.releases.stoppedBy, 'cancelled');
      assert.equal(fs.existsSync(file()), false);
    });
  });
});
