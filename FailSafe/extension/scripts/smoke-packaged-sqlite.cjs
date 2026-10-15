#!/usr/bin/env node
/**
 * #502 (FX950): load the better-sqlite3 binary taken FROM a packaged VSIX (not
 * node_modules) and run a real SQLite round trip on this machine.
 *
 *   node scripts/smoke-packaged-sqlite.cjs <file.vsix> [--keep <dir>]
 *
 * Extracts extension/node_modules/better-sqlite3/** with a dependency-free zip
 * reader (works in a bare node:22-alpine container and under ELECTRON_RUN_AS_NODE),
 * then opens a database, writes and reads a row, and reports platform/arch/N-API.
 * Exits non-zero on any failure.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const PREFIX = "extension/node_modules/better-sqlite3/";

/** Extract the zip entries under `prefix` into `outDir`; returns the entry names. */
function extractPrefix(zipBuffer, prefix, outDir) {
  const eocd = zipBuffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip archive (no end-of-central-directory record)");
  const count = zipBuffer.readUInt16LE(eocd + 10);
  let p = zipBuffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (zipBuffer.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry ${i}`);
    const method = zipBuffer.readUInt16LE(p + 10);
    const compressed = zipBuffer.readUInt32LE(p + 20);
    const nameLen = zipBuffer.readUInt16LE(p + 28);
    const extraLen = zipBuffer.readUInt16LE(p + 30);
    const commentLen = zipBuffer.readUInt16LE(p + 32);
    const local = zipBuffer.readUInt32LE(p + 42);
    const name = zipBuffer.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.startsWith(prefix) || name.endsWith("/")) continue;
    if (name.split("/").includes("..")) throw new Error(`unsafe entry ${name}`);
    const start = local + 30 + zipBuffer.readUInt16LE(local + 26) + zipBuffer.readUInt16LE(local + 28);
    const data = zipBuffer.subarray(start, start + compressed);
    const out = path.join(outDir, ...name.split("/"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (method === 8) fs.writeFileSync(out, zlib.inflateRawSync(data));
    else if (method === 0) fs.writeFileSync(out, data);
    else throw new Error(`unsupported compression ${method} for ${name}`);
    names.push(name);
  }
  return names;
}

function main() {
  const argv = process.argv.slice(2);
  const vsix = argv[0];
  if (!vsix) { console.error("usage: smoke-packaged-sqlite.cjs <file.vsix> [--keep <dir>]"); process.exit(2); }
  const keepIndex = argv.indexOf("--keep");
  const outDir = keepIndex >= 0 ? path.resolve(argv[keepIndex + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "fs-smoke-"));
  try {
    const names = extractPrefix(fs.readFileSync(vsix), PREFIX, outDir);
    const binaries = names.filter((n) => n.endsWith(".node"));
    if (binaries.length !== 1) throw new Error(`expected exactly one packaged .node, found ${binaries.length}: ${binaries.join(", ")}`);
    const Database = require(path.join(outDir, "extension", "node_modules", "better-sqlite3"));
    const dbFile = path.join(outDir, "smoke.sqlite");
    const db = new Database(dbFile);
    db.exec("create table t (x integer)");
    db.prepare("insert into t values (?)").run(42);
    const row = db.prepare("select x from t").get();
    db.close();
    const reopened = new Database(dbFile, { readonly: true });
    const again = reopened.prepare("select count(*) as n from t").get();
    reopened.close();
    if (!row || row.x !== 42 || again.n !== 1) throw new Error("SQLite round trip returned the wrong rows");
    console.log(`[PASS] ${path.basename(vsix)}: ${binaries[0]} loads on ${process.platform}-${process.arch}, ` +
      `node ${process.version}, napi ${process.versions.napi}${process.versions.electron ? `, electron ${process.versions.electron}` : ""}`);
  } catch (err) {
    console.error(`[FAIL] ${path.basename(vsix)}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    // Windows keeps a loaded .node locked until exit; a leftover temp dir is harmless.
    if (keepIndex < 0) { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* locked */ } }
  }
}

module.exports = { extractPrefix };

if (require.main === module) main();
