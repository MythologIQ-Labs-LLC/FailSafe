/**
 * Wave 0 (#521): SQLite readiness of FailSafe's three stores, checked on a copy.
 *
 * Opening a WAL database in place, even read-only, creates -shm and -wal files
 * next to it (observed 2026-10-15), and loading the artifact's own
 * better-sqlite3 would tie the checker to the thing under test. So each
 * NAME.db (with any -wal and -shm) is copied into the caller's directory and
 * the copy is opened read-only with node:sqlite, loaded lazily so the rest of
 * the toolchain does not depend on it.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DATABASES = Object.freeze([
  { name: "soa_ledger", rel: ".failsafe/ledger/soa_ledger.db" },
  { name: "shadow_genome", rel: ".failsafe/ledger/shadow_genome.db" },
  { name: "sentinel-rag", rel: ".failsafe/rag/sentinel-rag.db" },
]);

function loadSqlite() {
  return require("node:sqlite");
}

/**
 * @returns {{ name: string, path: string, exists: boolean, integrity: string|null,
 *   tables: Record<string, number>, snapshotCreated: number|null, status: "pass"|"fail", detail: string }}
 */
function checkDatabase(srcFile, copyDir) {
  const name = path.basename(srcFile, ".db");
  const base = { name, path: srcFile, exists: false, integrity: null, tables: {}, snapshotCreated: null };
  if (!fs.existsSync(srcFile)) return { ...base, status: "fail", detail: `missing: ${srcFile}` };
  fs.mkdirSync(copyDir, { recursive: true });
  const copy = path.join(copyDir, path.basename(srcFile));
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(srcFile + suffix)) fs.copyFileSync(srcFile + suffix, copy + suffix);
  }
  const { DatabaseSync } = loadSqlite();
  let db;
  try {
    db = new DatabaseSync(copy, { readOnly: true });
    const rows = db.prepare("PRAGMA integrity_check").all();
    const integrity = rows.map((r) => Object.values(r)[0]).join("; ");
    const tables = {};
    for (const { name: t } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      tables[t] = db.prepare(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n;
    }
    const snapshotCreated = "failsafe_checkpoints" in tables
      ? db.prepare("SELECT count(*) AS n FROM failsafe_checkpoints WHERE checkpoint_type = 'snapshot.created'").get().n
      : null;
    const ok = integrity === "ok";
    return { ...base, exists: true, integrity, tables, snapshotCreated, status: ok ? "pass" : "fail", detail: ok ? `integrity ok, ${Object.keys(tables).length} tables` : `integrity_check: ${integrity}` };
  } catch (err) {
    return { ...base, exists: true, integrity: `error: ${err.message}`, status: "fail", detail: `cannot read the copy: ${err.message}` };
  } finally {
    try { db?.close(); } catch { /* already closed */ }
  }
}

/** All three databases of a workspace; copies go to copyDir/<name>/. */
function checkWorkspace(wsDir, copyDir) {
  const out = {};
  for (const d of DATABASES) out[d.name] = checkDatabase(path.join(wsDir, ...d.rel.split("/")), path.join(copyDir, d.name));
  return out;
}

module.exports = { DATABASES, checkDatabase, checkWorkspace };
