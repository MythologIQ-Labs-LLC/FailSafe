// Functional tests for CheckpointStore (FX319).
// Tests cover both memory-only mode (db=null) and SQLite-backed mode.

import { strict as assert } from 'assert';
import Database from 'better-sqlite3';
import {
  buildCheckpointRecord,
  persistCheckpoint,
  getRecentCheckpoints,
  getRecentVerdicts,
  getAllCheckpointsAsc,
  verifyCheckpointChain,
  verifyLatestCheckpoint,
  getCheckpointSummary,
  verifyCheckpointRecord,
  CHECKPOINT_INIT_SQL,
  type CheckpointRecord,
} from '../../roadmap/services/CheckpointStore';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(CHECKPOINT_INIT_SQL);
  return db;
}

function build(overrides: { type?: string; phase?: string; status?: any; policyVerdict?: string; payload?: any } = {}, db: any = null, memory: CheckpointRecord[] = []): CheckpointRecord {
  return buildCheckpointRecord(
    {
      checkpointType: overrides.type ?? 'plan.created',
      actor: 'test-actor',
      phase: overrides.phase ?? 'plan',
      status: overrides.status ?? 'validated',
      policyVerdict: overrides.policyVerdict ?? 'PASS',
      evidenceRefs: ['evidence-1'],
      payload: overrides.payload ?? { x: 1 },
    },
    new Date().toISOString(),
    'run-1',
    db,
    memory,
    'a'.repeat(40),
  );
}

suite('CheckpointStore (FX319)', () => {
  test('FX319 buildCheckpointRecord — produces valid record with payloadHash + entryHash', () => {
    const r = build();
    assert.equal(r.checkpointType, 'plan.created');
    assert.equal(r.runId, 'run-1');
    assert.match(r.payloadHash, /^[0-9a-f]{64}$/);
    assert.match(r.entryHash, /^[0-9a-f]{64}$/);
    assert.equal(r.prevHash, 'GENESIS_CHECKPOINT'); // empty memory + null db → genesis
  });

  test('FX319 buildCheckpointRecord — chains entryHash to previous via prevHash', () => {
    const memory: CheckpointRecord[] = [];
    const r1 = build({}, null, memory);
    persistCheckpoint(r1, null, memory);
    const r2 = build({}, null, memory);
    assert.equal(r2.prevHash, r1.entryHash);
    assert.equal(r2.parentId, r1.checkpointId);
  });

  test('FX319 persistCheckpoint — memory mode unshifts to front', () => {
    const memory: CheckpointRecord[] = [];
    const r1 = build({}, null, memory);
    persistCheckpoint(r1, null, memory);
    const r2 = build({}, null, memory);
    persistCheckpoint(r2, null, memory);
    assert.equal(memory[0].checkpointId, r2.checkpointId);
    assert.equal(memory[1].checkpointId, r1.checkpointId);
  });

  test('FX319 persistCheckpoint — memory mode caps at 500 entries', () => {
    const memory: CheckpointRecord[] = [];
    // Pre-fill with 510 fake recent records
    for (let i = 0; i < 510; i++) {
      memory.push({
        ...build({}, null, []),
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
      });
    }
    const r = build({}, null, memory);
    persistCheckpoint(r, null, memory);
    assert.ok(memory.length <= 500, `expected <=500, got ${memory.length}`);
  });

  test('FX319 persistCheckpoint — db mode writes to SQLite', () => {
    const db = makeDb() as any;
    const r = build({}, db, []);
    persistCheckpoint(r, db, []);
    const row = db.prepare('SELECT count(*) as c FROM failsafe_checkpoints').get() as { c: number };
    assert.equal(row.c, 1);
    db.close();
  });

  test('FX319 getRecentCheckpoints — memory mode returns slice of memory', () => {
    const memory: CheckpointRecord[] = [];
    for (let i = 0; i < 5; i++) {
      const r = build({}, null, memory);
      persistCheckpoint(r, null, memory);
    }
    const recent = getRecentCheckpoints(null, memory, 3);
    assert.equal(recent.length, 3);
  });

  test('FX319 getRecentCheckpoints — db mode reads from SQLite DESC', () => {
    const db = makeDb() as any;
    for (let i = 0; i < 4; i++) {
      const r = build({ phase: `phase-${i}` }, db, []);
      persistCheckpoint(r, db, []);
    }
    const recent = getRecentCheckpoints(db, [], 2);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].phase, 'phase-3'); // DESC by id
    db.close();
  });

  test('FX319 getRecentVerdicts — filters checkpointType=policy.checked + parses payload_json', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({ type: 'plan.created' }, null, memory), null, memory);
    persistCheckpoint(build({ type: 'policy.checked', payload: { verdict: 'PASS' } }, null, memory), null, memory);
    persistCheckpoint(build({ type: 'policy.checked', payload: { verdict: 'BLOCK' } }, null, memory), null, memory);
    const verdicts = getRecentVerdicts(null, memory, 10);
    assert.equal(verdicts.length, 2);
    assert.ok(verdicts.every(v => 'verdict' in v && 'timestamp' in v));
  });

  test('FX110 getRecentVerdicts — payload timestamp wins over the persist stamp (memory + db)', () => {
    const verdictTs = '2026-08-20T12:00:00.000Z';
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({ type: 'policy.checked', payload: { verdict: 'WARN', timestamp: verdictTs } }, null, memory), null, memory);
    const memVerdicts = getRecentVerdicts(null, memory, 10);
    assert.equal(memVerdicts[0].timestamp, verdictTs,
      'memory branch: verdict origin timestamp survives, persist stamp does not override');

    const db = makeDb() as any;
    persistCheckpoint(build({ type: 'policy.checked', payload: { verdict: 'WARN', timestamp: verdictTs } }, db, []), db, []);
    const dbVerdicts = getRecentVerdicts(db, [], 10);
    assert.equal(dbVerdicts[0].timestamp, verdictTs,
      'db branch: verdict origin timestamp survives, row stamp does not override');
    db.close();
  });

  test('FX110 getRecentVerdicts — falls back to the record stamp when payload has no timestamp', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({ type: 'policy.checked', payload: { verdict: 'PASS' } }, null, memory), null, memory);
    const verdicts = getRecentVerdicts(null, memory, 10);
    assert.equal(verdicts[0].timestamp, memory[0].timestamp,
      'pre-fix checkpoints keep the persist stamp as fallback');
  });

  test('FX319 getAllCheckpointsAsc — memory mode reverses to ASC order', () => {
    const memory: CheckpointRecord[] = [];
    const r1 = build({ phase: 'first' }, null, memory);
    persistCheckpoint(r1, null, memory);
    const r2 = build({ phase: 'second' }, null, memory);
    persistCheckpoint(r2, null, memory);
    const all = getAllCheckpointsAsc(null, memory);
    assert.equal(all[0].phase, 'first');
    assert.equal(all[1].phase, 'second');
  });

  test('FX319 verifyCheckpointChain — empty chain is valid', () => {
    assert.equal(verifyCheckpointChain(null, []), true);
  });

  test('FX319 verifyCheckpointChain — intact chain validates', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({}, null, memory), null, memory);
    persistCheckpoint(build({}, null, memory), null, memory);
    persistCheckpoint(build({}, null, memory), null, memory);
    assert.equal(verifyCheckpointChain(null, memory), true);
  });

  test('FX319 verifyCheckpointChain — tampered payload fails verification', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({}, null, memory), null, memory);
    persistCheckpoint(build({}, null, memory), null, memory);
    // Tamper with the most recent record's payload_json (without recomputing payloadHash)
    memory[0].payloadJson = '{"tampered":true}';
    assert.equal(verifyCheckpointChain(null, memory), false);
  });

  test('FX319 verifyCheckpointChain — broken chain link fails', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({}, null, memory), null, memory);
    persistCheckpoint(build({}, null, memory), null, memory);
    memory[0].prevHash = 'a'.repeat(64); // override link
    assert.equal(verifyCheckpointChain(null, memory), false);
  });

  test('FX319 verifyLatestCheckpoint — empty → true', () => {
    assert.equal(verifyLatestCheckpoint(null, []), true);
  });

  test('FX319 verifyLatestCheckpoint — clean latest → true', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({}, null, memory), null, memory);
    persistCheckpoint(build({}, null, memory), null, memory);
    assert.equal(verifyLatestCheckpoint(null, memory), true);
  });

  test('FX319 verifyLatestCheckpoint — tampered latest payload → false', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({}, null, memory), null, memory);
    memory[0].payloadJson = '{"tampered":true}';
    assert.equal(verifyLatestCheckpoint(null, memory), false);
  });

  test('FX319 getCheckpointSummary — empty → total 0, chainValid true', () => {
    const s = getCheckpointSummary(null, [], true, null);
    assert.equal(s.total, 0);
    assert.equal(s.chainValid, true);
    assert.equal(s.latestType, null);
  });

  test('FX319 getCheckpointSummary — latest fields populated from most recent', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({ type: 'audit.completed', policyVerdict: 'PASS' }, null, memory), null, memory);
    const s = getCheckpointSummary(null, memory, true, '2026-05-07T00:00:00Z');
    assert.equal(s.total, 1);
    assert.equal(s.latestType, 'audit.completed');
    assert.equal(s.latestVerdict, 'PASS');
    assert.equal(s.chainValidAt, '2026-05-07T00:00:00Z');
  });

  test('FX319 getCheckpointSummary — cachedChainValid=false produces chainValid=false', () => {
    const memory: CheckpointRecord[] = [];
    persistCheckpoint(build({}, null, memory), null, memory);
    const s = getCheckpointSummary(null, memory, false, null);
    assert.equal(s.chainValid, false);
  });

  // #532 (plan-532c LD8/LD8a, B284): the record names the HEAD it is given, and a stored row can
  // be checked against its recorded hashes (plain unkeyed SHA-256: an edit that does not recompute
  // them is detected; a writer that recomputes them is not).
  test('B284 buildCheckpointRecord records the given HEAD, not one read from the process directory', () => {
    const head = 'f'.repeat(40);
    const r = buildCheckpointRecord({
      checkpointType: 'plan.created', actor: 'a', phase: 'plan', status: 'validated', policyVerdict: 'PASS', evidenceRefs: [], payload: {},
    }, new Date().toISOString(), 'run-1', null, [], head);
    assert.equal(r.gitHash, head);
  });

  test('B284 verifyCheckpointRecord: an intact row verifies; an edited git_hash, payload_json or entry_hash does not', () => {
    for (const column of ['git_hash', 'payload_json', 'entry_hash'] as const) {
      const db = makeDb();
      const r = build({}, db, []);
      persistCheckpoint(r, db as never, []);
      assert.equal(verifyCheckpointRecord(db as never, [], r.checkpointId), true, 'intact');
      const value = column === 'payload_json' ? '{"x":2}' : 'e'.repeat(64);
      db.prepare(`UPDATE failsafe_checkpoints SET ${column} = ? WHERE checkpoint_id = ?`).run(value, r.checkpointId);
      assert.equal(verifyCheckpointRecord(db as never, [], r.checkpointId), false, `edited ${column}`);
      db.close();
    }
    const memory: CheckpointRecord[] = [];
    const m = build({}, null, memory);
    persistCheckpoint(m, null, memory);
    assert.equal(verifyCheckpointRecord(null, memory, m.checkpointId), true);
    memory[0] = { ...memory[0], gitHash: 'e'.repeat(40) };
    assert.equal(verifyCheckpointRecord(null, memory, m.checkpointId), false, 'edited memory row');
    assert.equal(verifyCheckpointRecord(null, memory, 'no-such-id'), false, 'an absent row does not verify');
  });
});
