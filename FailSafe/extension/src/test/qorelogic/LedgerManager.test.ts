// Functional tests for LedgerManager (FX248) — append-only SOA Ledger.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import Database from 'better-sqlite3';
import { SoaLedgerRow, V3_COLUMNS } from '../../qorelogic/ledger/LedgerSeal';
import { verifyRows } from '../../qorelogic/ledger/LedgerVerifier';
import { activate, retiredFileName } from '../../qorelogic/ledger/LedgerWriter';
import { workspaceKey } from '../../qorelogic/ledger/LedgerAnchor';
import { ReleasePipelineGate } from '../../governance/ReleasePipelineGate';
import {
  Env, GOLDEN, StubSecrets, appendN, configFor, genesisHashOf, isAnchorKey, makeEnv, openLedger, quiet, rawRows, writeGoldenLedger,
} from './ledgerTestKit';

interface Stubs {
  secretStore: any;
  configProvider: any;
  ledgerPath: string;
  cleanup: () => void;
}

function makeStubs(): Stubs {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const ledgerPath = path.join(dir, 'ledger.db');
  const secrets = new Map<string, string>();
  return {
    secretStore: {
      get: async (k: string) => secrets.get(k),
      store: async (k: string, v: string) => { secrets.set(k, v); },
      delete: async (k: string) => { secrets.delete(k); },
    },
    configProvider: {
      getLedgerPath: () => ledgerPath,
      getConfig: () => ({}),
    },
    ledgerPath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

suite('LedgerManager (FX248) — SOA Ledger append-only chain', () => {
  let stubs: Stubs;
  let mgr: LedgerManager;
  setup(async () => {
    stubs = makeStubs();
    mgr = new LedgerManager(stubs.secretStore, stubs.configProvider);
    await mgr.initialize();
  });
  teardown(() => {
    try { mgr.close(); } catch { /* ignore */ }
    stubs.cleanup();
  });

  test('FX248 initialize — creates DB file + soa_ledger table + genesis entry', async () => {
    assert.ok(fs.existsSync(stubs.ledgerPath));
    assert.equal(mgr.isAvailable(), true);
    assert.equal(mgr.getEntryCount(), 1, 'genesis entry created');
  });

  test('FX248 appendEntry — adds entry with monotonically increasing ID', async () => {
    const e1 = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    const e2 = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:b' });
    assert.ok(e1.id > 0);
    assert.equal(e2.id, e1.id + 1);
    assert.equal(mgr.getEntryCount(), 3); // genesis + 2
  });

  test('FX248 appendEntry — chains entryHash via prevHash to last entry', async () => {
    const e1 = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    const e2 = await mgr.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:b' });
    assert.equal(e2.prevHash, e1.entryHash);
  });

  test('FX248 appendEntry — entryHash is 64-char hex (sha256)', async () => {
    const e = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    assert.match(e.entryHash, /^[0-9a-f]{64}$/);
    assert.match(e.signature, /^v3:[0-9a-f]{64}$/);
  });

  test('FX248 appendEntry — payload preserved through round-trip', async () => {
    const payload = { foo: 'bar', count: 42, nested: { ok: true } };
    await mgr.appendEntry({ eventType: 'SYSTEM_EVENT', agentDid: 'did:t:a', payload });
    const recent = await mgr.getRecentEntries(2);
    const entry = recent.find(e => e.eventType === 'SYSTEM_EVENT')!;
    assert.deepEqual(entry.payload, payload);
  });

  test('FX248 appendEntry — preserves agentTrust + riskGrade + artifactPath optional fields', async () => {
    await mgr.appendEntry({
      eventType: 'AUDIT_PASS', agentDid: 'did:t:a',
      agentTrustAtAction: 0.85, riskGrade: 'L2',
      artifactPath: 'src/foo.ts', artifactHash: 'sha256:abc',
    });
    const recent = await mgr.getRecentEntries(2);
    const entry = recent.find(e => e.agentTrustAtAction === 0.85)!;
    assert.equal(entry.riskGrade, 'L2');
    assert.equal(entry.artifactPath, 'src/foo.ts');
  });

  test('FX248 getRecentEntries — returns N most recent in DESC order', async () => {
    for (let i = 0; i < 5; i++) {
      await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: `did:t:${i}` });
    }
    const recent = await mgr.getRecentEntries(3);
    assert.equal(recent.length, 3);
    // DESC by id; latest is did:t:4
    assert.equal(recent[0].agentDid, 'did:t:4');
    assert.equal(recent[1].agentDid, 'did:t:3');
    assert.equal(recent[2].agentDid, 'did:t:2');
  });

  test('FX248 getEntriesByType — filters by eventType', async () => {
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    await mgr.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:b' });
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:c' });
    const passes = await mgr.getEntriesByType('AUDIT_PASS' as never);
    assert.equal(passes.length, 2);
  });

  test('FX248 getEntriesByAgent — filters by agentDid', async () => {
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:alice' });
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:bob' });
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:alice' });
    const alice = await mgr.getEntriesByAgent('did:t:alice');
    assert.equal(alice.length, 2);
  });

  test('FX248 getEntryById — returns entry or null', async () => {
    const e = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    const fetched = await mgr.getEntryById(e.id);
    assert.equal(fetched?.id, e.id);
    const missing = await mgr.getEntryById(99999);
    assert.equal(missing, null);
  });

  test('FX248 verifyChain — clean chain validates true', async () => {
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    await mgr.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:b' });
    assert.equal(mgr.verifyChain(), true);
  });

  test('v3: modifying any of the 19 bound columns of a row breaks its seal (#473 LD1)', async () => {
    const db = mgr.getDatabase();
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a', verificationResult: 'PASS', riskGrade: 'L2', agentTrustAtAction: 0.8, overseerDecision: 'APPROVED', gdprTrigger: false, payload: { k: 1 } });
    const e = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a', verificationResult: 'PASS', riskGrade: 'L2', agentTrustAtAction: 0.8, overseerDecision: 'APPROVED', gdprTrigger: false, payload: { k: 1 } });
    await mgr.flushAnchor();
    assert.equal(mgr.verifyChain(), true);
    for (const column of V3_COLUMNS) {
      const original = (db.prepare(`SELECT ${column} AS v FROM soa_ledger WHERE id = ?`).get(e.id) as { v: unknown }).v;
      const tampered = column === 'id' ? e.id + 1000
        : column === 'payload' ? '{"k":2}'
        : typeof original === 'number' ? original + 1
        : original === null ? 1 : `${original}x`;
      db.prepare(`UPDATE soa_ledger SET ${column} = ? WHERE id = ?`).run(tampered, e.id);
      const at = column === 'id' ? tampered : e.id;
      assert.equal(mgr.verifyChain(), false, `${column} must be sealed`);
      db.prepare(`UPDATE soa_ledger SET ${column} = ? WHERE id = ?`).run(original, at);
      assert.equal(mgr.verifyChain(), true, `${column} restored`);
    }
  });

  test('FX248 verifyChain — tampered entry fails verification', async () => {
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    // Tamper: directly mutate stored hash
    const db = mgr.getDatabase();
    db.prepare('UPDATE soa_ledger SET entry_hash = ? WHERE id = ?').run('tampered_hash', 1);
    assert.equal(mgr.verifyChain(), false);
  });

  test('FX248 close + isAvailable — close marks unavailable', () => {
    assert.equal(mgr.isAvailable(), true);
    mgr.close();
    // After close, db is undefined; isAvailable should return false
    assert.equal(mgr.isAvailable(), false);
  });

  test('FX248 LedgerManager — re-initialize loads existing ledger from disk', async () => {
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    mgr.close();
    const mgr2 = new LedgerManager(stubs.secretStore, stubs.configProvider);
    await mgr2.initialize();
    assert.equal(mgr2.getEntryCount(), 2); // genesis + 1
    mgr2.close();
  });

  test('FX248 secret persistence — second init reuses cached secret from secretStore', async () => {
    await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    mgr.close();
    // Verify secret was stored
    const secret = await stubs.secretStore.get('ledgerSecret');
    assert.ok(secret, 'secret should be persisted');
  });
});

// ---------------------------------------------------------------------------
// #473 SOA ledger v3: writer, anchor, activation and rotation (plan-473 Phase 2)
// ---------------------------------------------------------------------------

const failureCodes = (r: { failures: { code: string }[] }) => r.failures.map((f) => f.code);

suite('#473 v3 writer', () => {
  let env: Env;
  setup(() => { env = makeEnv(); });
  teardown(() => env.cleanup());

  test('two instances on one file append alternately without forking the chain', async () => {
    const a = await openLedger(env);
    const b = await openLedger(env);
    for (let i = 0; i < 10; i++) {
      await (i % 2 === 0 ? a : b).appendEntry({ eventType: 'AUDIT_PASS', agentDid: `did:t:${i}` });
    }
    await a.flushAnchor(); await b.flushAnchor();
    assert.equal(a.verifyChain(), true);
    assert.equal(b.verifyChain(), true);
    const ids = rawRows(a).map((r) => r.id);
    assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(env.secrets.record(genesisHashOf(a))?.headId, 11);
    a.close(); b.close();
  });

  test('zero is stored and sealed as zero; NaN as NULL; Infinity as Infinity', async () => {
    const mgr = await openLedger(env);
    const db = mgr.getDatabase();
    const zero = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a', agentTrustAtAction: 0, sentinelConfidence: 0 });
    const raw = db.prepare('SELECT agent_trust_at_action t, sentinel_confidence c FROM soa_ledger WHERE id = ?').get(zero.id) as { t: unknown; c: unknown };
    assert.deepEqual(raw, { t: 0, c: 0 });
    const nan = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a', agentTrustAtAction: NaN });
    assert.equal((db.prepare('SELECT agent_trust_at_action t FROM soa_ledger WHERE id = ?').get(nan.id) as { t: unknown }).t, null);
    assert.equal(mgr.verifyChain(), true);
    const inf = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a', agentTrustAtAction: Infinity });
    assert.equal((db.prepare('SELECT agent_trust_at_action t FROM soa_ledger WHERE id = ?').get(inf.id) as { t: unknown }).t, Infinity);
    assert.equal(mgr.verifyChain(), true);
    db.prepare('UPDATE soa_ledger SET agent_trust_at_action = NULL WHERE id = ?').run(inf.id);
    assert.equal(quiet(() => mgr.verifyChain()), false);
    mgr.close();
  });

  test('a NULL trust value rewritten to 9e999 (Infinity) is detected', async () => {
    const mgr = await openLedger(env);
    const e = await mgr.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:a', verificationResult: 'FAIL' });
    mgr.getDatabase().prepare('UPDATE soa_ledger SET agent_trust_at_action = 9e999, sentinel_confidence = -9e999 WHERE id = ?').run(e.id);
    assert.equal(quiet(() => mgr.verifyChain()), false);
    mgr.close();
  });

  test('the genesis audit columns and schema_version/extension_version are sealed', async () => {
    for (const sql of [
      "UPDATE soa_ledger SET risk_grade = 'L1', verification_result = 'PASS', overseer_decision = 'APPROVED' WHERE id = 1",
      'UPDATE soa_ledger SET schema_version = 99 WHERE id = 2',
      "UPDATE soa_ledger SET extension_version = 'forged' WHERE id = 2",
    ]) {
      const local = makeEnv();
      const mgr = await openLedger(local);
      await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
      mgr.getDatabase().prepare(sql).run();
      assert.equal(quiet(() => mgr.verifyChain()), false, sql);
      mgr.close(); local.cleanup();
    }
  });

  test('ids of v3 rows shifted +1000 fail as hash-mismatch', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 3);
    await mgr.flushAnchor();
    mgr.getDatabase().prepare('UPDATE soa_ledger SET id = id + 1000 WHERE id >= 2').run();
    const report = await mgr.verifyLedger();
    assert.equal(report.ok, false);
    assert.ok(failureCodes(report).includes('hash-mismatch'));
    mgr.close();
  });

  test('reserved agent DIDs are rejected and nothing is written', async () => {
    const mgr = await openLedger(env);
    for (const did of ['did:myth:system:ledger-seal', 'did:myth:system:genesis']) {
      await assert.rejects(mgr.appendEntry({ eventType: 'SYSTEM_EVENT', agentDid: did }), TypeError);
    }
    assert.equal(mgr.getEntryCount(), 1);
    mgr.close();
  });

  test('V3_COLUMNS equals the migrated soa_ledger columns minus the seal', async () => {
    const mgr = await openLedger(env);
    const names = (mgr.getDatabase().prepare('PRAGMA table_info(soa_ledger)').all() as { name: string }[]).map((c) => c.name);
    assert.deepEqual(names.filter((n) => n !== 'entry_hash' && n !== 'signature').sort(), [...V3_COLUMNS].sort());
    mgr.close();
  });

  test('fresh ledger: one v3 genesis, established-now and bound; the next initialize reports verified', async () => {
    const mgr = await openLedger(env);
    const rows = rawRows(mgr);
    assert.equal(rows.length, 1);
    assert.match(rows[0].signature, /^v3:/);
    assert.equal(rows[0].schema_version, 3);
    const first = await mgr.verifyLedger();
    assert.equal(first.ok, true);
    assert.equal(first.anchor.status, 'established-now');
    assert.equal(first.anchor.unanchoredTail, 0);
    assert.equal(first.anchor.workspaceBound, true);
    mgr.close();
    const again = await openLedger(env);
    assert.equal((await again.verifyLedger()).anchor.status, 'verified');
    again.close();
  });

  test('a rejected ledgerSecret read rejects initialize and creates no database file', async () => {
    env.secrets.throwGet = (k) => k === 'ledgerSecret';
    const mgr = new LedgerManager(env.secrets as any, configFor(env.ledgerPath, env.root));
    await assert.rejects(mgr.initialize());
    assert.equal(fs.existsSync(env.ledgerPath), false);
  });

  test('verifyEntry reports the seal version and covered columns', async () => {
    const mgr = await openLedger(env);
    const e = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    const v3 = await mgr.verifyEntry(e.id);
    assert.deepEqual({ ok: v3.ok, version: v3.version, n: v3.coveredColumns.length, anchored: v3.anchored }, { ok: true, version: 'v3', n: 19, anchored: true });
    mgr.close();
    const legacy = makeEnv({ secret: GOLDEN.ledgerSecret });
    await writeGoldenLedger(legacy.ledgerPath);
    const g = await openLedger(legacy);
    const v1 = await g.verifyEntry(2);
    assert.deepEqual({ version: v1.version, n: v1.coveredColumns.length }, { version: 'v1', n: 5 });
    g.close(); legacy.cleanup();
  });
});

suite('#473 head anchor and workspace binding', () => {
  let env: Env;
  setup(() => { env = makeEnv(); });
  teardown(() => env.cleanup());

  async function anchored(n = 4): Promise<LedgerManager> {
    const mgr = await openLedger(env);
    await appendN(mgr, n);
    await mgr.flushAnchor();
    return mgr;
  }

  test('tail truncation followed by more appends is still detected, in session and after re-initialize', async () => {
    const mgr = await anchored(4);           // ids 1..5, anchored head 5
    const genesis = genesisHashOf(mgr);
    mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > 3').run();
    await appendN(mgr, 5);                   // honest writer re-fills ids 4..8
    await mgr.flushAnchor();
    assert.equal(quiet(() => mgr.verifyChain()), false);
    mgr.close();
    const again = await openLedger(env);
    await appendN(again, 2);
    await again.flushAnchor();
    const report = await again.verifyLedger();
    assert.equal(report.ok, false);
    assert.ok(failureCodes(report).includes('anchor-head-missing'));
    assert.equal(env.secrets.record(genesis)?.headId, 5);
    again.close();
  });

  test('an in-session deletion with no append is reported by verifyLedger and verifyChain', async () => {
    const mgr = await anchored(4);
    mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > 3').run();
    assert.equal(quiet(() => mgr.verifyChain()), false);
    const report = await mgr.verifyLedger();
    assert.ok(failureCodes(report).includes('anchor-head-missing'));
    mgr.close();
  });

  for (const variant of ['stored head absent', 'stored head replaced'] as const) {
    test(`a second window cannot launder a deletion through its stale cache (${variant})`, async () => {
      const a = await openLedger(env);
      await appendN(a, 9, 'did:t:A');        // ids 1..10
      await a.flushAnchor();
      const b = await openLedger(env);
      await appendN(b, 5, 'did:t:B');        // ids 11..15, stored head 15
      await b.flushAnchor();
      const genesis = genesisHashOf(a);
      const bHead = env.secrets.record(genesis)!;
      assert.equal(bHead.headId, 15);
      a.getDatabase().prepare('DELETE FROM soa_ledger WHERE id >= 13').run();
      await appendN(a, variant === 'stored head absent' ? 2 : 3, 'did:t:A2');
      await a.flushAnchor();
      assert.equal(quiet(() => a.verifyChain()), false, 'A is latched in session');
      await appendN(a, 1, 'did:t:A3');
      await a.flushAnchor();
      assert.deepEqual(env.secrets.record(genesis), bHead, 'the stored record still names B\'s head');
      a.close(); b.close();
      const again = await openLedger(env);
      assert.ok(failureCodes(await again.verifyLedger()).includes('anchor-head-missing'));
      again.close();
    });
  }

  test('rollback to an older copy of the file is detected after further appends', async () => {
    const first = await anchored(2);
    first.close();                           // checkpoints the WAL
    const snapshot = env.ledgerPath + '.snap';
    fs.copyFileSync(env.ledgerPath, snapshot);
    const second = await openLedger(env);
    await appendN(second, 3);
    await second.flushAnchor();
    second.close();
    for (const suffix of ['', '-wal', '-shm']) { fs.rmSync(env.ledgerPath + suffix, { force: true }); }
    fs.copyFileSync(snapshot, env.ledgerPath);
    const third = await openLedger(env);
    await appendN(third, 5);
    await third.flushAnchor();
    third.close();
    const again = await openLedger(env);
    const report = await again.verifyLedger();
    assert.equal(report.ok, false);
    assert.ok(failureCodes(report).includes('anchor-head-missing'));
    again.close();
  });

  test('a wiped ledger never rebinds: ledger-mismatch on every initialize', async () => {
    const mgr = await anchored(2);
    const genesis = genesisHashOf(mgr);
    mgr.getDatabase().prepare('DELETE FROM soa_ledger').run();
    mgr.close();
    const wiped = await openLedger(env);
    await appendN(wiped, 5);
    await wiped.flushAnchor();
    assert.equal(quiet(() => wiped.verifyChain()), false);
    assert.ok(failureCodes(await wiped.verifyLedger()).includes('anchor-ledger-mismatch'));
    wiped.close();
    const again = await openLedger(env);
    assert.equal(again.verifyChain(), false);
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, genesis);
    again.close();
  });

  test('repointing ledgerPath to an empty path is ledger-mismatch, also after a second initialize', async () => {
    (await anchored(2)).close();
    const elsewhere = path.join(env.dir, 'elsewhere', 'soa_ledger.db');
    const repointed = await openLedger(env, { ledgerPath: elsewhere });
    assert.equal(quiet(() => repointed.verifyChain()), false);
    assert.equal((await repointed.verifyLedger()).anchor.status, 'ledger-mismatch');
    await appendN(repointed, 5);
    repointed.close();
    const again = await openLedger(env, { ledgerPath: elsewhere });
    assert.equal(again.verifyChain(), false);
    again.close();
  });

  test('repointing ledgerPath to a copy of another workspace\'s anchored ledger is ledger-mismatch', async () => {
    (await anchored(2)).close();
    const otherRoot = path.join(env.dir, 'workspace2');
    fs.mkdirSync(otherRoot);
    const otherPath = path.join(env.dir, 'other', 'soa_ledger.db');
    const foreign = await openLedger(env, { ledgerPath: otherPath, root: otherRoot });
    await appendN(foreign, 2);
    await foreign.flushAnchor();
    foreign.close();
    const copy = path.join(env.dir, 'copy', 'soa_ledger.db');
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(otherPath, copy);
    for (let i = 0; i < 2; i++) {
      const mgr = await openLedger(env, { ledgerPath: copy });
      assert.equal(quiet(() => mgr.verifyChain()), false, `initialize ${i + 1}`);
      assert.equal((await mgr.verifyLedger()).anchor.status, 'ledger-mismatch');
      mgr.close();
    }
  });

  test('another ledger placed at the bound path is ledger-mismatch', async () => {
    (await anchored(2)).close();
    const otherEnv = makeEnv();
    const other = await openLedger(otherEnv, { secrets: env.secrets });
    other.close();
    for (const suffix of ['', '-wal', '-shm']) { fs.rmSync(env.ledgerPath + suffix, { force: true }); }
    fs.copyFileSync(otherEnv.ledgerPath, env.ledgerPath);
    const mgr = await openLedger(env);
    assert.ok(failureCodes(await mgr.verifyLedger()).includes('anchor-ledger-mismatch'));
    mgr.close(); otherEnv.cleanup();
  });

  test('head truncation fails genesis-invalid, and opened elsewhere stores no record', async () => {
    const mgr = await anchored(3);
    mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id <= 2').run();
    assert.ok(failureCodes(await mgr.verifyLedger()).includes('genesis-invalid'));
    const newFirst = rawRows(mgr)[0].entry_hash;
    mgr.close();
    const moved = path.join(env.dir, 'moved', 'soa_ledger.db');
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.copyFileSync(env.ledgerPath, moved);
    const newRoot = path.join(env.dir, 'workspace3');
    fs.mkdirSync(newRoot);
    const elsewhere = await openLedger(env, { ledgerPath: moved, root: newRoot });
    assert.ok(failureCodes(await elsewhere.verifyLedger()).includes('genesis-invalid'));
    assert.equal(env.secrets.record(newFirst), null);
    assert.equal(env.secrets.binding(newRoot), null);
    elsewhere.close();
  });

  test('a moved workspace keeps its anchor (verified, not established-now) and binds the new root', async () => {
    const mgr = await anchored(2);
    mgr.close();
    const newRoot = path.join(env.dir, 'moved-workspace');
    fs.mkdirSync(newRoot);
    const moved = path.join(newRoot, '.failsafe', 'ledger', 'soa_ledger.db');
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.copyFileSync(env.ledgerPath, moved);
    const again = await openLedger(env, { ledgerPath: moved, root: newRoot });
    const report = await again.verifyLedger();
    assert.equal(report.ok, true);
    assert.equal(report.anchor.status, 'verified');
    assert.ok(env.secrets.binding(newRoot));
    again.close();
  });

  test('the workspace root is normalized through junctions and letter case (win32)', function () {
    if (process.platform !== 'win32') { this.skip(); }
    const real = path.join(env.dir, 'RealRoot');
    fs.mkdirSync(real);
    const link = path.join(env.dir, 'junction');
    fs.symlinkSync(real, link, 'junction');
    assert.equal(workspaceKey(link), workspaceKey(real));
    assert.equal(workspaceKey(real.toUpperCase()), workspaceKey(real));
  });

  test('a failed first create reports unanchored, appends do not create, later initializes stay established-late', async () => {
    env.secrets.rejectStore = isAnchorKey;
    const mgr = await openLedger(env);
    const first = await mgr.verifyLedger();
    assert.deepEqual({ ok: first.ok, status: first.anchor.status, headId: first.anchor.headId, tail: first.anchor.unanchoredTail },
      { ok: true, status: 'unanchored', headId: null, tail: 1 });
    const gate = new ReleasePipelineGate({ getActiveIntent: async () => null } as any, mgr);
    const reason = (await gate.evaluate('v6.0.7')).warnings[0]?.reason ?? '';
    assert.match(reason, /^PARTIAL SEAL/);
    assert.match(reason, /anchor never established/);
    await appendN(mgr, 1);
    await mgr.flushAnchor();
    assert.equal(env.secrets.record(genesisHashOf(mgr)), null, 'the writer never creates a record');
    mgr.close();
    env.secrets.rejectStore = () => false;
    for (let i = 0; i < 2; i++) {
      const again = await openLedger(env);
      const report = await again.verifyLedger();
      assert.equal(report.anchor.status, 'established-late', `initialize ${i + 2}`);
      assert.equal(report.anchor.establishedAtId, 2);
      const g = await new ReleasePipelineGate({ getActiveIntent: async () => null } as any, again).evaluate('v6.0.7');
      assert.match(g.warnings[0]?.reason ?? '', /^PARTIAL SEAL/);
      again.close();
    }
  });

  for (const variant of ['genesis', 'receipt', 'rotation genesis'] as const) {
    test(`deleting everything after a ${variant} whose create failed ends established-late, never intact`, async () => {
      let subjectId: number;
      if (variant === 'genesis') {
        env.secrets.rejectStore = isAnchorKey;
        const mgr = await openLedger(env);
        subjectId = 1;
        await appendN(mgr, 5);
        mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > ?').run(subjectId);
        mgr.close();
      } else if (variant === 'receipt') {
        env.secrets.map.set('ledgerSecret', GOLDEN.ledgerSecret);
        await writeGoldenLedger(env.ledgerPath);
        env.secrets.rejectStore = isAnchorKey;
        const mgr = await openLedger(env);
        subjectId = 6;
        assert.equal(rawRows(mgr)[5].agent_did, 'did:myth:system:ledger-seal');
        await appendN(mgr, 5);
        mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > ?').run(subjectId);
        mgr.close();
      } else {
        const mgr = await openLedger(env);
        await appendN(mgr, 2);
        await mgr.flushAnchor();
        env.secrets.rejectStore = isAnchorKey;
        const { genesisId } = await mgr.startNewLedger('test');
        subjectId = genesisId;
        await appendN(mgr, 5);
        mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > ?').run(subjectId);
        mgr.close();
      }
      env.secrets.rejectStore = () => false;
      const again = await openLedger(env);
      const report = await again.verifyLedger();
      assert.equal(report.ok, true);
      assert.equal(report.anchor.status, 'established-late');
      assert.equal(env.secrets.record(genesisHashOf(again))?.establishedLate, true);
      const g = await new ReleasePipelineGate({ getActiveIntent: async () => null } as any, again).evaluate('v6.0.7');
      const reason = [...g.failures, ...g.warnings].map((c) => c.reason).join(' | ');
      assert.match(reason, /PARTIAL SEAL/);
      assert.doesNotMatch(reason, /intact/);
      again.close();
    });
  }

  test('the workspace binding is still stored when the head-anchor create fails, so a later wipe meets it', async () => {
    env.secrets.rejectStore = (k) => k.startsWith('ledgerAnchor:g:');
    const mgr = await openLedger(env);
    const genesis = genesisHashOf(mgr);
    assert.equal((await mgr.verifyLedger()).anchor.status, 'unanchored');
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, genesis, 'binding attempted and stored');
    mgr.getDatabase().prepare('DELETE FROM soa_ledger').run();
    mgr.close();
    env.secrets.rejectStore = () => false;
    const again = await openLedger(env);
    assert.equal((await again.verifyLedger()).anchor.status, 'ledger-mismatch');
    again.close();
  });

  test('a create whose re-read fails stores nothing and reports unanchored (review S3)', async () => {
    let gGets = 0;
    env.secrets.throwGet = (k) => k.startsWith('ledgerAnchor:g:') && ++gGets === 1;
    const mgr = await openLedger(env);                     // empty table: the first g: read is the create re-read
    const report = await mgr.verifyLedger();
    assert.equal(report.anchor.status, 'unanchored');
    assert.equal(env.secrets.record(genesisHashOf(mgr)), null, 'nothing stored after a failed re-read');
    assert.equal(env.secrets.binding(env.root!), null);
    mgr.close();
  });

  test('a hung ledgerSecret read or store rejects initialize within the bound (review S2)', async function () {
    this.timeout(12000);
    for (const hang of ['get', 'store'] as const) {
      const local = makeEnv();
      if (hang === 'get') {
        local.secrets.getGate = (k) => k === 'ledgerSecret' ? new Promise<void>(() => { /* hangs */ }) : Promise.resolve();
      } else {
        local.secrets.storeGate = (k) => k === 'ledgerSecret' ? new Promise<void>(() => { /* hangs */ }) : Promise.resolve();
      }
      const started = Date.now();
      const mgr = new LedgerManager(local.secrets as any, configFor(local.ledgerPath, local.root));
      await assert.rejects(mgr.initialize());
      assert.ok(Date.now() - started < 4000, `${hang} bounded`);
      local.cleanup();
    }
  });

  test('the anchor keeps the ledger secret off its enumerable state (review N3)', async () => {
    const mgr = await openLedger(env);
    const secret = env.secrets.map.get('ledgerSecret')!;
    const anchor = (mgr as any).anchor;
    const seen = new Set<unknown>();
    const holds = (value: unknown, depth: number): boolean => {
      if (value === secret) { return true; }
      if (!value || typeof value !== 'object' || depth > 3 || seen.has(value)) { return false; }
      seen.add(value);
      return Object.values(value as Record<string, unknown>).some((v) => holds(v, depth + 1));
    };
    assert.equal(holds(anchor, 0), false);
    mgr.close();
  });

  test('a store failing mid-session leaves an unanchored tail and the cached head unchanged', async () => {
    const mgr = await anchored(1);           // head 2
    env.secrets.rejectStore = isAnchorKey;
    await appendN(mgr, 2);
    await mgr.flushAnchor();
    const report = await mgr.verifyLedger();
    assert.deepEqual({ ok: report.ok, tail: report.anchor.unanchoredTail, head: report.anchor.headId }, { ok: true, tail: 2, head: 2 });
    mgr.close();
  });

  test('anchor reads that throw: no receipt on a legacy ledger; an empty table still gets a genesis', async () => {
    const legacy = makeEnv({ secret: GOLDEN.ledgerSecret });
    await writeGoldenLedger(legacy.ledgerPath);
    legacy.secrets.throwGet = isAnchorKey;
    const g = await openLedger(legacy);
    assert.equal(g.getEntryCount(), 5, 'no receipt');
    assert.equal(g.verifyChain(), false);
    assert.ok(failureCodes(await g.verifyLedger()).includes('anchor-unavailable'));
    g.close(); legacy.cleanup();

    env.secrets.throwGet = isAnchorKey;
    const mgr = await openLedger(env);
    const e = await mgr.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:a' });
    assert.equal(e.id, 2);
    assert.equal(rawRows(mgr)[1].prev_hash, rawRows(mgr)[0].entry_hash);
    assert.equal(mgr.verifyChain(), false);
    mgr.close();
    env.secrets.throwGet = () => false;
    const again = await openLedger(env);
    const report = await again.verifyLedger();
    assert.deepEqual({ ok: report.ok, status: report.anchor.status }, { ok: true, status: 'established-late' });
    again.close();
  });

  test('honest limit: create and binding both fail, the table is emptied, the next initialize starts fresh', async () => {
    env.secrets.rejectStore = isAnchorKey;
    const mgr = await openLedger(env);
    await appendN(mgr, 3);
    mgr.getDatabase().prepare('DELETE FROM soa_ledger').run();
    mgr.close();
    env.secrets.rejectStore = () => false;
    const again = await openLedger(env);
    const report = await again.verifyLedger();
    assert.equal(report.anchor.status, 'established-now', 'nothing stored survived to compare against');
    const g = await new ReleasePipelineGate({ getActiveIntent: async () => null } as any, again).evaluate('v6.0.7');
    assert.equal(g.warnings.length, 0);
    assert.equal(g.allowed, true);
    again.close();
  });
});

suite('#473 activation receipt', () => {
  let env: Env;
  setup(async () => {
    env = makeEnv({ secret: GOLDEN.ledgerSecret });
    await writeGoldenLedger(env.ledgerPath);
  });
  teardown(() => env.cleanup());

  test('a legacy ledger gets exactly one receipt, frozen-legacy, legacy bytes untouched', async () => {
    const mgr = await openLedger(env);
    const rows = rawRows(mgr);
    assert.equal(rows.length, 6);
    const receipt = rows[5];
    assert.equal(receipt.id, 6);
    assert.equal(receipt.agent_did, 'did:myth:system:ledger-seal');
    const payload = JSON.parse(receipt.payload!);
    assert.deepEqual({ prior: payload.priorHead.id, cov: payload.priorCoverage }, { prior: 5, cov: { v1Rows: 3, v2Rows: 2 } });
    const record = env.secrets.record(rows[0].entry_hash)!;
    assert.deepEqual({ late: record.establishedLate, at: record.establishedAtId }, { late: false, at: 6 });
    assert.deepEqual(rows.slice(0, 5).map((r) => r.signature), GOLDEN.rows.map((r) => r.signature));
    mgr.close();
    const again = await openLedger(env);
    assert.equal(again.getEntryCount(), 6, 'no second receipt');
    const report = await again.verifyLedger();
    assert.deepEqual({ status: report.anchor.status, scope: report.sealScope }, { status: 'verified', scope: 'frozen-legacy' });
    again.close();
  });

  test('replaying activation after deleting the v3 rows is refused and binds nothing', async () => {
    const mgr = await openLedger(env);
    mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id >= 6').run();
    mgr.getDatabase().prepare("UPDATE soa_ledger SET verification_result = 'PASS' WHERE id = 2").run();
    mgr.close();
    const freshRoot = path.join(env.dir, 'never-bound');
    fs.mkdirSync(freshRoot);
    const again = await openLedger(env, { root: freshRoot });
    assert.equal(again.getEntryCount(), 5, 'no second receipt');
    assert.equal(again.verifyChain(), false);
    const codes = failureCodes(await again.verifyLedger());
    assert.ok(codes.includes('anchor-head-missing'));
    assert.ok(codes.includes('receipt-missing'));
    assert.equal(env.secrets.binding(freshRoot), null);
    again.close();
  });

  test('activate refuses a genesis whose record already names an activation', async () => {
    const db = new Database(env.ledgerPath);
    try {
      const record = { v: 1, genesisHash: 'g', headId: 6, headHash: 'h', activation: { receiptId: 6, receiptHash: 'h' }, establishedAt: '', establishedAtId: 6, establishedLate: false } as const;
      assert.equal(activate(db, GOLDEN.ledgerSecret, record).status, 'refused');
      assert.equal((db.prepare('SELECT count(*) c FROM soa_ledger').get() as { c: number }).c, 5);
    } finally { db.close(); }
  });

  test('activate is skipped when a v3 row already exists', async () => {
    const mgr = await openLedger(env);       // receipt written
    mgr.close();
    const db = new Database(env.ledgerPath);
    try {
      assert.equal(activate(db, GOLDEN.ledgerSecret, null).status, 'skipped');
      assert.equal((db.prepare('SELECT count(*) c FROM soa_ledger').get() as { c: number }).c, 6);
    } finally { db.close(); }
  });

  test('a copy of the legacy prefix with an edited verdict, opened at another path, is not re-activated', async () => {
    (await openLedger(env)).close();
    const other = path.join(env.dir, 'b', 'soa_ledger.db');
    await writeGoldenLedger(other, (rows) => { rows[1].verification_result = 'PASS'; });
    const mgr = await openLedger(env, { ledgerPath: other });
    assert.equal(mgr.getEntryCount(), 5, 'no receipt written');
    assert.equal(mgr.verifyChain(), false);
    mgr.close();
  });

  test('a second window that loses the activation race ends established-late (asserted)', async () => {
    const shared = env.secrets.map;
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    const aSecrets = new StubSecrets(undefined, shared);
    let gGets = 0;
    aSecrets.getGate = async (key) => { if (key.startsWith('ledgerAnchor:g:') && ++gGets === 2) { await released; } };
    const aInit = openLedger(env, { secrets: aSecrets });
    for (let waited = 0; gGets < 2; waited += 5) {
      assert.ok(waited < 2000, 'A never reached its create re-read');
      await new Promise((r) => setTimeout(r, 5));
    }
    const b = await openLedger(env, { secrets: new StubSecrets(undefined, shared) });
    release();
    const a = await aInit;
    assert.equal(rawRows(a).filter((r) => r.agent_did === 'did:myth:system:ledger-seal').length, 1);
    assert.equal(env.secrets.record(rawRows(a)[0].entry_hash)?.establishedLate, true);
    a.close(); b.close();
    const third = await openLedger(env);
    const report = await third.verifyLedger();
    assert.deepEqual({ status: report.anchor.status, scope: report.sealScope }, { status: 'established-late', scope: 'frozen-legacy' });
    third.close();
  });

  test('a legacy ledger that already fails still fails after activation, and says so in the receipt', async () => {
    env.cleanup();
    env = makeEnv({ secret: GOLDEN.ledgerSecret });
    await writeGoldenLedger(env.ledgerPath, (rows) => { rows[2].signature = 'f'.repeat(64); });
    const mgr = await openLedger(env);
    const receipt = rawRows(mgr)[5];
    assert.equal(JSON.parse(receipt.payload!).priorVerification.ok, false);
    assert.equal(quiet(() => mgr.verifyChain()), false);
    mgr.close();
  });
});

suite('#473 rotation', () => {
  let env: Env;
  setup(() => { env = makeEnv(); });
  teardown(() => env.cleanup());

  test('a row committed between copy and swap aborts the rotation with nothing deleted', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 2);
    await mgr.flushAnchor();
    const genesis = genesisHashOf(mgr);
    const other = await openLedger(env);
    await assert.rejects(mgr.startNewLedger('test', { beforeSwap: () => { void other.appendEntry({ eventType: 'AUDIT_PASS', agentDid: 'did:t:late' }); } }));
    const rows = rawRows(mgr);
    assert.equal(rows.length, 4);
    assert.equal(rows[3].agent_did, 'did:t:late');
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, genesis);
    other.close(); mgr.close();
  });

  test('a rotation whose step 3 failed is finished by the next initialize (row 5), and only that one', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 2);
    await mgr.flushAnchor();
    const oldGenesis = genesisHashOf(mgr);
    env.secrets.rejectStore = isAnchorKey;
    const { retiredFile } = await mgr.startNewLedger('test');
    const newGenesis = genesisHashOf(mgr);
    mgr.close();
    env.secrets.rejectStore = () => false;
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, oldGenesis);

    const unrelated = new StubSecrets(undefined, new Map(env.secrets.map));
    unrelated.map.set([...unrelated.map.keys()].find((k) => k.startsWith('ledgerAnchor:w:'))!,
      JSON.stringify({ genesisHash: 'e'.repeat(64), boundAt: '' }));
    const mismatch = await openLedger(env, { secrets: unrelated });
    assert.equal((await mismatch.verifyLedger()).anchor.status, 'ledger-mismatch');
    mismatch.close();

    const retiredPath = path.join(path.dirname(env.ledgerPath), retiredFile);
    const hidden = retiredPath + '.hidden';
    fs.renameSync(retiredPath, hidden);
    const noFile = await openLedger(env, { secrets: new StubSecrets(undefined, new Map(env.secrets.map)) });
    assert.equal((await noFile.verifyLedger()).anchor.status, 'ledger-mismatch');
    noFile.close();
    fs.renameSync(hidden, retiredPath);

    const finished = await openLedger(env);
    const report = await finished.verifyLedger();
    assert.deepEqual({ ok: report.ok, status: report.anchor.status }, { ok: true, status: 'established-late' });
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, newGenesis);
    finished.close();
  });

  test('row 5 with an existing record proves it before rebinding', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 1);
    await mgr.flushAnchor();
    const oldGenesis = genesisHashOf(mgr);
    env.secrets.rejectStore = (k) => k.startsWith('ledgerAnchor:w:');
    await mgr.startNewLedger('test');
    await appendN(mgr, 3);
    await mgr.flushAnchor();
    mgr.getDatabase().prepare('DELETE FROM soa_ledger WHERE id > (SELECT min(id) FROM soa_ledger) + 1').run();
    mgr.close();
    env.secrets.rejectStore = () => false;
    const again = await openLedger(env);
    assert.equal((await again.verifyLedger()).anchor.status, 'head-missing');
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, oldGenesis, 'no rebind');
    again.close();
  });

  // --- security review of b842a2ea/92158b7a -------------------------------------------------

  /** Forge W's ledger as: a fake first row claiming genesis G_S (bogus MAC) + S's genuine rows 2..head. */
  async function forgeOnto(target: string, sRows: SoaLedgerRow[], payload: Record<string, unknown>, retired?: { file: string; headId: number; headHash: string }) {
    const db = new Database(target);
    try {
      db.prepare('DELETE FROM soa_ledger').run();
      const columns = Object.keys(sRows[0]);
      const insert = db.prepare(`INSERT INTO soa_ledger (${columns.join(',')}) VALUES (${columns.map((c) => '@' + c).join(',')})`);
      insert.run({ ...sRows[0], payload: JSON.stringify(payload), signature: 'v3:' + '0'.repeat(64) });
      for (const row of sRows.slice(1)) { insert.run(row); }
    } finally { db.close(); }
    if (retired) {
      const r = new Database(path.join(path.dirname(target), retired.file));
      try {
        r.exec('CREATE TABLE soa_ledger (id INTEGER PRIMARY KEY, entry_hash TEXT)');
        r.prepare('INSERT INTO soa_ledger VALUES (?, ?)').run(retired.headId, retired.headHash);
      } finally { r.close(); }
    }
  }

  async function otherAnchoredLedger(): Promise<SoaLedgerRow[]> {
    const otherRoot = path.join(env.dir, 'workspace-S');
    fs.mkdirSync(otherRoot);
    const s = await openLedger(env, { ledgerPath: path.join(env.dir, 'S', 'soa_ledger.db'), root: otherRoot });
    await appendN(s, 2, 'did:t:S');
    await s.flushAnchor();
    const rows = rawRows(s);
    s.close();
    return rows;
  }

  test('a forged rotation genesis with a bogus MAC cannot rebind the workspace (review M1)', async () => {
    const w = await openLedger(env);
    const gW = genesisHashOf(w);
    w.close();
    const sRows = await otherAnchoredLedger();
    const sHead = sRows[sRows.length - 1];
    await forgeOnto(env.ledgerPath, sRows,
      { message: 'SOA Ledger rotated', retired: { file: 'x.db', headId: sHead.id, headHash: sHead.entry_hash }, supersededBinding: gW },
      { file: 'x.db', headId: sHead.id, headHash: sHead.entry_hash });
    const forged = await openLedger(env);
    assert.equal((await forged.verifyLedger()).anchor.status, 'ledger-mismatch');
    forged.close();
    assert.equal(env.secrets.binding(env.root!)?.genesisHash, gW, 'binding unchanged');
    for (const s of ['', '-wal', '-shm']) { fs.rmSync(env.ledgerPath + s, { force: true }); }
    fs.copyFileSync(path.join(env.dir, 'S', 'soa_ledger.db'), env.ledgerPath);
    const swapped = await openLedger(env);
    const report = await swapped.verifyLedger();
    assert.equal(report.anchor.status, 'ledger-mismatch');
    assert.equal(report.ok, false);
    swapped.close();
  });

  test('a forged first row reusing another genesis hash is not adopted and binds nothing (review M1)', async () => {
    const sRows = await otherAnchoredLedger();
    const freshRoot = path.join(env.dir, 'workspace-fresh');
    fs.mkdirSync(freshRoot);
    const target = path.join(env.dir, 'forged', 'soa_ledger.db');
    (await openLedger(env, { ledgerPath: target, root: null })).close();
    await forgeOnto(target, sRows, { message: 'SOA Ledger initialized' });
    const mgr = await openLedger(env, { ledgerPath: target, root: freshRoot });
    assert.equal(mgr.verifyChain(), false);
    assert.equal(env.secrets.binding(freshRoot), null);
    mgr.close();
  });

  test('a stored CREATE TABLE text carrying a second statement is refused by rotation (review S1)', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 1);
    await mgr.flushAnchor();
    mgr.close();
    const raw = new Database(env.ledgerPath);
    try {
      raw.unsafeMode(true);
      raw.pragma('writable_schema = ON');
      const sql = (raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'soa_ledger'").get() as { sql: string }).sql;
      raw.prepare("UPDATE sqlite_master SET sql = ? WHERE name = 'soa_ledger'").run(`${sql}; DROP TABLE agent_trust`);
    } finally { raw.close(); }
    const again = await openLedger(env);
    await assert.rejects(again.startNewLedger('test'));
    const tables = (again.getDatabase().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    assert.ok(tables.includes('agent_trust'), 'agent_trust survives');
    assert.equal(again.getEntryCount(), 2);
    again.close();
  });

  test('rotation refuses when the retired target file exists and changes nothing', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 1);
    const now = new Date('2026-10-15T12:00:00.000Z');
    fs.writeFileSync(path.join(path.dirname(env.ledgerPath), retiredFileName(now)), 'occupied');
    await assert.rejects(mgr.startNewLedger('test', { now }), /already exists/);
    assert.equal(mgr.getEntryCount(), 2);
    mgr.close();
  });

  test('rotation retires soa_ledger rows only; other tables and a cached handle survive (regression check)', async () => {
    const mgr = await openLedger(env);
    await appendN(mgr, 3);
    await mgr.flushAnchor();
    const db = mgr.getDatabase();
    db.prepare("INSERT INTO agent_trust (did, persona, public_key, trust_score, trust_stage, is_quarantined, verifications_completed, created_at, updated_at) VALUES ('did:q', 'p', 'k', 0.1, 'CBT', 1, 0, 'x', 'x')").run();
    db.prepare("INSERT INTO agent_rbac (agent_did, role, assigned_at) VALUES ('did:q', 'viewer', 'x')").run();
    db.prepare('DELETE FROM soa_ledger WHERE id = 4').run();   // latch: head 4 missing
    const before = rawRows(mgr);
    const oldGenesis = before[0].entry_hash;
    assert.equal(quiet(() => mgr.verifyChain()), false);
    const { retiredFile, genesisId } = await mgr.startNewLedger('recover');
    const retiredPath = path.join(path.dirname(env.ledgerPath), retiredFile);
    const retired = new Database(retiredPath, { readonly: true });
    try {
      assert.deepEqual(retired.prepare('SELECT * FROM soa_ledger ORDER BY id').all(), before);
      assert.deepEqual(retired.prepare('PRAGMA table_info(soa_ledger)').all(), db.prepare('PRAGMA table_info(soa_ledger)').all());
    } finally { retired.close(); }
    assert.equal((db.prepare('SELECT is_quarantined q FROM agent_trust WHERE did = ?').get('did:q') as { q: number }).q, 1);
    assert.equal((db.prepare('SELECT role FROM agent_rbac WHERE agent_did = ?').get('did:q') as { role: string }).role, 'viewer');
    const now = db.prepare('SELECT * FROM soa_ledger').all() as SoaLedgerRow[];
    assert.equal(now.length, 1);
    assert.equal(now[0].id, before[before.length - 1].id + 1);
    assert.equal(genesisId, now[0].id);
    const payload = JSON.parse(now[0].payload!);
    assert.equal(payload.retired.genesisHash, oldGenesis);
    assert.equal(payload.supersededBinding, oldGenesis);
    assert.equal(mgr.verifyChain(), true);
    mgr.close();
    const again = await openLedger(env);
    assert.equal((await again.verifyLedger()).anchor.status, 'verified');
    again.close();
    const oldRecord = env.secrets.record(oldGenesis);
    assert.equal(verifyRows(before, env.secrets.map.get('ledgerSecret'), { record: oldRecord, binding: null, workspaceBound: false, sessionStatus: 'verified' }).ok, false);
  });
});
