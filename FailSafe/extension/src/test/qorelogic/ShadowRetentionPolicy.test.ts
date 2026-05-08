// Functional tests for shadow/RetentionPolicy (FX330).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import {
  pruneOldEntries,
  archiveEntries,
  getRetentionStats,
  executeRetentionMaintenance,
} from '../../qorelogic/shadow/RetentionPolicy';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE shadow_genome (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      remediation_status TEXT NOT NULL,
      input_vector TEXT
    );
  `);
  return db;
}

function insert(db: Database.Database, row: { created_at: string; remediation_status: string; input_vector?: string }): void {
  db.prepare('INSERT INTO shadow_genome (created_at, remediation_status, input_vector) VALUES (?, ?, ?)').run(
    row.created_at, row.remediation_status, row.input_vector ?? '',
  );
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const mapRow = (r: Record<string, unknown>) => ({
  id: r.id as number,
  createdAt: r.created_at as string,
  remediationStatus: r.remediation_status as string,
  inputVector: r.input_vector as string,
} as never);

suite('Shadow RetentionPolicy (FX330)', () => {
  let db: Database.Database;
  setup(() => { db = makeDb(); });
  teardown(() => { db.close(); });

  test('FX330 pruneOldEntries — old RESOLVED entries pruned at 90-day cutoff', () => {
    insert(db, { created_at: daysAgo(100), remediation_status: 'RESOLVED' });
    insert(db, { created_at: daysAgo(50), remediation_status: 'RESOLVED' });
    const r = pruneOldEntries(db);
    assert.equal(r.resolvedPruned, 1);
    assert.equal(r.unresolvedPruned, 0);
    assert.equal(r.totalPruned, 1);
  });

  test('FX330 pruneOldEntries — old UNRESOLVED entries pruned at 180-day cutoff', () => {
    insert(db, { created_at: daysAgo(200), remediation_status: 'UNRESOLVED' });
    insert(db, { created_at: daysAgo(100), remediation_status: 'UNRESOLVED' });
    const r = pruneOldEntries(db);
    assert.equal(r.unresolvedPruned, 1);
    assert.equal(r.resolvedPruned, 0);
  });

  test('FX330 pruneOldEntries — WONT_FIX and SUPERSEDED treated as resolved', () => {
    insert(db, { created_at: daysAgo(100), remediation_status: 'WONT_FIX' });
    insert(db, { created_at: daysAgo(100), remediation_status: 'SUPERSEDED' });
    const r = pruneOldEntries(db);
    assert.equal(r.resolvedPruned, 2);
  });

  test('FX330 pruneOldEntries — custom retention config respected', () => {
    insert(db, { created_at: daysAgo(40), remediation_status: 'RESOLVED' });
    const r = pruneOldEntries(db, { resolvedRetentionDays: 30 });
    assert.equal(r.resolvedPruned, 1);
  });

  test('FX330 archiveEntries — writes JSON file with archive metadata', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-arch-'));
    try {
      insert(db, { created_at: daysAgo(100), remediation_status: 'RESOLVED', input_vector: 'A' });
      insert(db, { created_at: daysAgo(95), remediation_status: 'RESOLVED', input_vector: 'B' });
      const file = path.join(dir, 'archive.json');
      const count = archiveEntries(db, file, 90, mapRow);
      assert.equal(count, 2);
      const archive = JSON.parse(fs.readFileSync(file, 'utf-8'));
      assert.equal(archive.entryCount, 2);
      assert.equal(archive.entries.length, 2);
      assert.ok(archive.exportedAt);
      assert.equal(archive.retentionPolicy.olderThanDays, 90);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('FX330 archiveEntries — no entries → returns 0, no file written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-arch-'));
    try {
      insert(db, { created_at: daysAgo(50), remediation_status: 'RESOLVED' });
      const file = path.join(dir, 'archive.json');
      const count = archiveEntries(db, file, 90, mapRow);
      assert.equal(count, 0);
      assert.equal(fs.existsSync(file), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('FX330 getRetentionStats — totals + resolved/unresolved counts', () => {
    insert(db, { created_at: daysAgo(10), remediation_status: 'RESOLVED' });
    insert(db, { created_at: daysAgo(20), remediation_status: 'WONT_FIX' });
    insert(db, { created_at: daysAgo(30), remediation_status: 'UNRESOLVED' });
    const stats = getRetentionStats(db);
    assert.equal(stats.totalEntries, 3);
    assert.equal(stats.resolvedEntries, 2);
    assert.equal(stats.unresolvedEntries, 1);
  });

  test('FX330 getRetentionStats — entriesOver90Days + entriesOver180Days', () => {
    insert(db, { created_at: daysAgo(50), remediation_status: 'RESOLVED' });
    insert(db, { created_at: daysAgo(100), remediation_status: 'RESOLVED' });
    insert(db, { created_at: daysAgo(200), remediation_status: 'UNRESOLVED' });
    const stats = getRetentionStats(db);
    assert.equal(stats.entriesOver90Days, 2);
    assert.equal(stats.entriesOver180Days, 1);
  });

  test('FX330 getRetentionStats — estimatedPruneCount = old resolved + very old unresolved', () => {
    insert(db, { created_at: daysAgo(100), remediation_status: 'RESOLVED' });
    insert(db, { created_at: daysAgo(200), remediation_status: 'UNRESOLVED' });
    insert(db, { created_at: daysAgo(50), remediation_status: 'UNRESOLVED' }); // not yet eligible
    const stats = getRetentionStats(db);
    assert.equal(stats.estimatedPruneCount, 2);
  });

  test('FX330 executeRetentionMaintenance — archive + prune in single pass', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-mtn-'));
    try {
      insert(db, { created_at: daysAgo(100), remediation_status: 'RESOLVED' });
      const result = await executeRetentionMaintenance(db, {
        autoArchiveBeforePrune: true,
        archivePath: path.join(dir, 'archive.json'),
      }, mapRow);
      assert.equal(result.archivedCount, 1);
      assert.equal(result.resolvedPruned, 1);
      assert.ok(result.archivePath?.includes(dir));
      // Pruned from db
      const remaining = db.prepare('SELECT count(*) as c FROM shadow_genome').get() as { c: number };
      assert.equal(remaining.c, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
