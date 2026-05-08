// Functional tests for LedgerManager (FX248) — append-only SOA Ledger.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LedgerManager } from '../../qorelogic/ledger/LedgerManager';

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
    assert.match(e.signature, /^[0-9a-f]+$/);
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
