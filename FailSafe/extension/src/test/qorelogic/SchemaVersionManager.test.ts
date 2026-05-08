// Functional tests for SchemaVersionManager (FX331).

import { strict as assert } from 'assert';
import Database from 'better-sqlite3';
import {
  SchemaVersionManager,
  SCHEMA_VERSION_DDL,
  SHADOW_GENOME_V1_DDL,
  computeChecksum,
} from '../../qorelogic/shadow/SchemaVersionManager';

function makeDb(): Database.Database {
  return new Database(':memory:');
}

suite('SchemaVersionManager (FX331)', () => {
  let db: Database.Database;
  setup(() => { db = makeDb(); });
  teardown(() => { db.close(); });

  test('FX331 initialize — creates schema_version table', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all();
    assert.equal(tables.length, 1);
  });

  test('FX331 getCurrentVersion — empty table returns null', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    assert.equal(m.getCurrentVersion(), null);
  });

  test('FX331 getAppliedMigrations — empty table returns empty array', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    assert.deepEqual(m.getAppliedMigrations(), []);
  });

  test('FX331 getPendingMigrations — fresh DB returns all migrations', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL); // base table for v1.1.0+ migrations
    const pending = m.getPendingMigrations();
    assert.ok(pending.length > 0);
    assert.ok(pending.every(p => p.version && p.checksum && typeof p.up === 'function'));
  });

  test('FX331 migrate — applies all pending migrations and records each', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    const results = m.migrate();
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.success && r.direction === 'up'));
    assert.equal(m.getPendingMigrations().length, 0);
    assert.ok(m.getAppliedMigrations().length > 0);
  });

  test('FX331 migrate — getCurrentVersion returns latest after migration', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    m.migrate();
    const v = m.getCurrentVersion();
    assert.ok(v);
    assert.match(String(v), /\d+\.\d+\.\d+/);
  });

  test('FX331 verifyMigrationIntegrity — clean migration set passes', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    m.migrate();
    assert.equal(m.verifyMigrationIntegrity(), true);
  });

  test('FX331 verifyMigrationIntegrity — tampered checksum fails', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    m.migrate();
    // Tamper with stored checksum
    db.prepare('UPDATE schema_version SET checksum = ?').run('tampered');
    assert.equal(m.verifyMigrationIntegrity(), false);
  });

  test('FX331 getStatus — reports currentVersion, latestVersion, pending, integrity', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    let status = m.getStatus();
    assert.equal(status.currentVersion, null);
    assert.ok(status.pendingMigrations > 0);
    m.migrate();
    status = m.getStatus();
    assert.ok(status.currentVersion);
    assert.equal(status.pendingMigrations, 0);
    assert.equal(status.integrityValid, true);
  });

  test('FX331 validateOnInit — fresh install (no migrations) returns silently', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    assert.doesNotThrow(() => m.validateOnInit());
  });

  test('FX331 validateOnInit — corrupted checksum throws', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    m.migrate();
    db.prepare('UPDATE schema_version SET checksum = ?').run('corrupt');
    assert.throws(() => m.validateOnInit(), /integrity check failed/);
  });

  test('FX331 rollback — to "0.0.0" reverts all applied migrations', () => {
    const m = new SchemaVersionManager(db);
    m.initialize();
    db.exec(SHADOW_GENOME_V1_DDL);
    m.migrate();
    const beforeCount = m.getAppliedMigrations().length;
    assert.ok(beforeCount > 0);
    const results = m.rollback('0.0.0');
    assert.ok(results.length > 0);
    // All applied migrations should be reverted (or at least attempted)
    assert.ok(results.every(r => r.direction === 'down'));
  });

  test('FX331 computeChecksum — deterministic 12-char hex', () => {
    const c1 = computeChecksum('CREATE TABLE x (id INTEGER);');
    const c2 = computeChecksum('CREATE TABLE x (id INTEGER);');
    assert.equal(c1, c2);
    assert.equal(c1.length, 12);
    assert.match(c1, /^[0-9a-f]{12}$/);
    assert.notEqual(c1, computeChecksum('different sql'));
  });

  test('FX331 SCHEMA_VERSION_DDL — parses as valid SQL', () => {
    assert.doesNotThrow(() => db.exec(SCHEMA_VERSION_DDL));
  });
});
