// Functional tests for LedgerQueryAPI (FX323) + LedgerRetentionPolicy (FX324).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import Database from 'better-sqlite3';
import { LedgerQueryAPI } from '../../qorelogic/ledger/LedgerQueryAPI';
import { LedgerRetentionPolicy } from '../../qorelogic/ledger/LedgerRetentionPolicy';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE soa_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent_did TEXT NOT NULL,
      risk_grade TEXT,
      artifact_path TEXT,
      payload TEXT
    );
  `);
  return db;
}

function insert(db: Database.Database, row: {
  timestamp: string; event_type: string; agent_did: string;
  risk_grade?: string | null; artifact_path?: string | null; payload?: string | null;
}): void {
  db.prepare(`
    INSERT INTO soa_ledger (timestamp, event_type, agent_did, risk_grade, artifact_path, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.timestamp, row.event_type, row.agent_did,
    row.risk_grade ?? null, row.artifact_path ?? null, row.payload ?? null);
}

suite('LedgerQueryAPI (FX323)', () => {
  let db: Database.Database;
  setup(() => { db = makeDb(); });
  teardown(() => { db.close(); });

  test('FX323 query — no filters returns all rows DESC by timestamp', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'x' });
    insert(db, { timestamp: '2026-02-01T00:00:00Z', event_type: 'B', agent_did: 'x' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({});
    assert.equal(rows.length, 2);
    assert.equal(rows[0].timestamp, '2026-02-01T00:00:00Z'); // DESC
    assert.equal(rows[1].timestamp, '2026-01-01T00:00:00Z');
  });

  test('FX323 query — filters by agent', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'alice' });
    insert(db, { timestamp: '2026-01-02T00:00:00Z', event_type: 'A', agent_did: 'bob' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ agent: 'alice' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent_did, 'alice');
  });

  test('FX323 query — filters by riskGrade', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'x', risk_grade: 'L1' });
    insert(db, { timestamp: '2026-01-02T00:00:00Z', event_type: 'A', agent_did: 'x', risk_grade: 'L3' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ riskGrade: 'L3' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].risk_grade, 'L3');
  });

  test('FX323 query — filters by eventType', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'AUDIT_PASS', agent_did: 'x' });
    insert(db, { timestamp: '2026-01-02T00:00:00Z', event_type: 'AUDIT_FAIL', agent_did: 'x' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ eventType: 'AUDIT_FAIL' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event_type, 'AUDIT_FAIL');
  });

  test('FX323 query — filters by dateFrom (inclusive)', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'x' });
    insert(db, { timestamp: '2026-02-15T00:00:00Z', event_type: 'A', agent_did: 'x' });
    insert(db, { timestamp: '2026-03-01T00:00:00Z', event_type: 'A', agent_did: 'x' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ dateFrom: '2026-02-01T00:00:00Z' });
    assert.equal(rows.length, 2);
  });

  test('FX323 query — filters by dateTo (inclusive)', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'x' });
    insert(db, { timestamp: '2026-02-15T00:00:00Z', event_type: 'A', agent_did: 'x' });
    insert(db, { timestamp: '2026-03-01T00:00:00Z', event_type: 'A', agent_did: 'x' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ dateTo: '2026-02-15T00:00:00Z' });
    assert.equal(rows.length, 2);
  });

  test('FX323 query — filters by artifactPath', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'x', artifact_path: 'src/a.ts' });
    insert(db, { timestamp: '2026-01-02T00:00:00Z', event_type: 'A', agent_did: 'x', artifact_path: 'src/b.ts' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ artifactPath: 'src/a.ts' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].artifact_path, 'src/a.ts');
  });

  test('FX323 query — combines multiple filters with AND', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'alice', risk_grade: 'L1' });
    insert(db, { timestamp: '2026-01-02T00:00:00Z', event_type: 'A', agent_did: 'alice', risk_grade: 'L3' });
    insert(db, { timestamp: '2026-01-03T00:00:00Z', event_type: 'A', agent_did: 'bob', risk_grade: 'L3' });
    const api = new LedgerQueryAPI(db);
    const rows = api.query({ agent: 'alice', riskGrade: 'L3' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent_did, 'alice');
    assert.equal(rows[0].risk_grade, 'L3');
  });

  test('FX323 query — empty result when no rows match', () => {
    insert(db, { timestamp: '2026-01-01T00:00:00Z', event_type: 'A', agent_did: 'x' });
    const api = new LedgerQueryAPI(db);
    assert.deepEqual(api.query({ agent: 'no-such-agent' }), []);
  });

  test('FX323 query — limit caps at 500 rows', () => {
    for (let i = 0; i < 600; i++) {
      insert(db, { timestamp: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`, event_type: 'A', agent_did: 'x' });
    }
    const api = new LedgerQueryAPI(db);
    const rows = api.query({});
    assert.equal(rows.length, 500);
  });
});

suite('LedgerRetentionPolicy (FX324)', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrp-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function makeManager(entries: any[], appended: any[]): any {
    return {
      getRecentEntries: async (_n: number) => entries,
      appendEntry: async (e: any) => { appended.push(e); return { id: appended.length }; },
    };
  }

  test('FX324 archive — no old entries → archived 0, no file written, no append', async () => {
    const appended: any[] = [];
    const lm = makeManager([{ timestamp: '2026-04-01T00:00:00Z' }], appended);
    const p = new LedgerRetentionPolicy(lm, dir);
    const r = await p.archive(new Date('2026-01-01T00:00:00Z'));
    assert.deepEqual(r, { archived: 0, hash: '' });
    assert.equal(appended.length, 0);
    assert.equal(fs.readdirSync(dir).length, 0);
  });

  test('FX324 archive — old entries written to gzipped file with hash-based name', async () => {
    const appended: any[] = [];
    const lm = makeManager([
      { id: 1, timestamp: '2025-01-01T00:00:00Z', event_type: 'OLD' },
      { id: 2, timestamp: '2026-04-01T00:00:00Z', event_type: 'RECENT' },
    ], appended);
    const p = new LedgerRetentionPolicy(lm, dir);
    const r = await p.archive(new Date('2026-01-01T00:00:00Z'));
    assert.equal(r.archived, 1);
    assert.equal(r.hash.length, 64);
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^ledger-archive-[0-9a-f]{12}\.json\.gz$/);
  });

  test('FX324 archive — gzipped file decompresses to JSON of old entries', async () => {
    const oldEntry = { id: 1, timestamp: '2025-01-01T00:00:00Z', event_type: 'OLD' };
    const lm = makeManager([oldEntry, { id: 2, timestamp: '2026-04-01T00:00:00Z' }], []);
    const p = new LedgerRetentionPolicy(lm, dir);
    await p.archive(new Date('2026-01-01T00:00:00Z'));
    const file = path.join(dir, fs.readdirSync(dir)[0]);
    const decompressed = zlib.gunzipSync(fs.readFileSync(file)).toString('utf-8');
    const archived = JSON.parse(decompressed);
    assert.equal(archived.length, 1);
    assert.deepEqual(archived[0], oldEntry);
  });

  test('FX324 archive — appends LEDGER_ARCHIVED system event with archiveHash + count + path', async () => {
    const appended: any[] = [];
    const lm = makeManager([
      { id: 1, timestamp: '2025-01-01T00:00:00Z' },
      { id: 2, timestamp: '2025-02-01T00:00:00Z' },
    ], appended);
    const p = new LedgerRetentionPolicy(lm, dir);
    const r = await p.archive(new Date('2026-01-01T00:00:00Z'));
    assert.equal(appended.length, 1);
    const entry = appended[0];
    assert.equal(entry.eventType, 'SYSTEM_EVENT');
    assert.equal(entry.agentDid, 'system:retention-policy');
    assert.equal(entry.payload.action, 'LEDGER_ARCHIVED');
    assert.equal(entry.payload.archiveHash, r.hash);
    assert.equal(entry.payload.count, 2);
    assert.match(entry.payload.path, /ledger-archive-[0-9a-f]{12}\.json\.gz$/);
  });

  test('FX324 archive — creates archive directory if missing', async () => {
    const subdir = path.join(dir, 'archive');
    const lm = makeManager([{ id: 1, timestamp: '2025-01-01T00:00:00Z' }], []);
    const p = new LedgerRetentionPolicy(lm, subdir);
    await p.archive(new Date('2026-01-01T00:00:00Z'));
    assert.ok(fs.existsSync(subdir));
    assert.equal(fs.readdirSync(subdir).length, 1);
  });
});
