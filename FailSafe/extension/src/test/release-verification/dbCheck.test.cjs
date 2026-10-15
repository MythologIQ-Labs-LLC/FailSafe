/**
 * Wave 0 (#521) FX967: SQLite readiness is checked on a copy, with node:sqlite,
 * never with the artifact's own better-sqlite3 and never in place.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const { checkNode } = require(fx.rv("rv.cjs"));
const SKIP = checkNode(process.versions.node) ? false : `node:sqlite needs Node 22.13 or later; this is ${process.versions.node}`;
if (SKIP) console.log(`# dbCheck.test.cjs skipped: ${SKIP}`);

const { checkDatabase, checkWorkspace, DATABASES } = require(fx.rv("lib/dbcheck.cjs"));

function openDb(file) {
  const { DatabaseSync } = require("node:sqlite");
  return new DatabaseSync(file);
}

function listing(dir) {
  return fs.readdirSync(dir).sort().map((n) => `${n}:${fs.statSync(path.join(dir, n)).mtimeMs}:${fs.statSync(path.join(dir, n)).size}`);
}

test("a WAL database whose rows sit only in the -wal file reports those rows from the copy", { skip: SKIP }, () => {
  const dir = fx.tmpDir("rv-db");
  const file = path.join(dir, "soa_ledger.db");
  const db = openDb(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE soa_ledger (x INTEGER);");
  db.exec("INSERT INTO soa_ledger VALUES (1), (2), (3);");
  assert.ok(fs.statSync(`${file}-wal`).size > 0, "rows are in the -wal file");
  try {
    const r = checkDatabase(file, fx.tmpDir("rv-copy"));
    assert.equal(r.status, "pass", r.detail);
    assert.equal(r.tables.soa_ledger, 3);
  } finally {
    db.close();
  }
});

test("the source directory is unchanged by a check: same files, same mtimes, no new -shm or -wal", { skip: SKIP }, () => {
  const dir = fx.tmpDir("rv-db");
  const file = path.join(dir, "shadow_genome.db");
  const db = openDb(file);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE shadow_genome (x INTEGER); INSERT INTO shadow_genome VALUES (1);");
  db.close();
  const before = listing(dir);
  assert.deepEqual(before.map((l) => l.split(":")[0]), ["shadow_genome.db"]);
  const r = checkDatabase(file, fx.tmpDir("rv-copy"));
  assert.equal(r.status, "pass", r.detail);
  assert.deepEqual(listing(dir), before);
});

test("snapshot.created rows are counted apart from other checkpoint types", { skip: SKIP }, () => {
  const dir = fx.tmpDir("rv-db");
  const file = path.join(dir, "soa_ledger.db");
  const db = openDb(file);
  db.exec("CREATE TABLE failsafe_checkpoints (id INTEGER PRIMARY KEY, checkpoint_type TEXT NOT NULL);");
  db.exec("INSERT INTO failsafe_checkpoints (checkpoint_type) VALUES ('snapshot.created'), ('phase.entered'), ('snapshot.created');");
  db.close();
  const r = checkDatabase(file, fx.tmpDir("rv-copy"));
  assert.equal(r.snapshotCreated, 2);
  assert.equal(r.tables.failsafe_checkpoints, 3);
});

test("an overwritten page is integrity not ok; a missing database is missing; both fail", { skip: SKIP }, () => {
  const dir = fx.tmpDir("rv-db");
  const file = path.join(dir, "sentinel-rag.db");
  const db = openDb(file);
  db.exec("PRAGMA page_size = 4096; CREATE TABLE sentinel_observations (id INTEGER PRIMARY KEY, body TEXT);");
  const insert = db.prepare("INSERT INTO sentinel_observations (body) VALUES (?)");
  for (let i = 0; i < 200; i++) insert.run(`observation ${i} ${"x".repeat(40)}`);
  db.close();
  const fd = fs.openSync(file, "r+");
  fs.writeSync(fd, Buffer.alloc(512, 0xa5), 0, 512, 4096 + 8);
  fs.closeSync(fd);
  const bad = checkDatabase(file, fx.tmpDir("rv-copy"));
  assert.equal(bad.status, "fail");
  assert.notEqual(bad.integrity, "ok");
  const missing = checkDatabase(path.join(dir, "nope.db"), fx.tmpDir("rv-copy"));
  assert.equal(missing.status, "fail");
  assert.equal(missing.exists, false);
});

test("checkWorkspace checks the three FailSafe databases at their workspace paths", { skip: SKIP }, () => {
  assert.deepEqual(DATABASES.map((d) => d.rel), [".failsafe/ledger/soa_ledger.db", ".failsafe/ledger/shadow_genome.db", ".failsafe/rag/sentinel-rag.db"]);
  const ws = fx.tmpDir("rv-ws");
  for (const d of DATABASES) {
    fs.mkdirSync(path.dirname(path.join(ws, d.rel)), { recursive: true });
    const db = openDb(path.join(ws, d.rel));
    db.exec("CREATE TABLE t (x INTEGER);");
    db.close();
  }
  const copies = fx.tmpDir("rv-copy");
  const r = checkWorkspace(ws, copies);
  assert.deepEqual(Object.keys(r), ["soa_ledger", "shadow_genome", "sentinel-rag"]);
  assert.ok(Object.values(r).every((x) => x.status === "pass"));
  assert.ok(fs.existsSync(path.join(copies, "soa_ledger", "soa_ledger.db")), "copies live under the given directory");
});
