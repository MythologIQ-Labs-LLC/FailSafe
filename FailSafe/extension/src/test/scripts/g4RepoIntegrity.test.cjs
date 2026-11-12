"use strict";
/**
 * G4 (#638) falsification: the local Git object database (audit VETO #962).
 * The commit-graph file is never trusted, and every object must re-hash to its
 * id (git fsck --full) before any history check. TEST ONLY PKI and keys.
 */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LATER_CRL = "tools/g4/tsa-crls/later.crl";

const bases = [];
after(() => { for (const b of bases) fs.rmSync(b.work, { recursive: true, force: true }); });

/** A base repository whose newest commits add a key-compromise CRL for the TSA signer. */
async function revokedBase() {
  const b = await S.buildBase(found.bin);
  bases.push(b);
  b.good = S.git(b.repo, "rev-parse", "HEAD");
  await sleep(1100);
  b.tsa.revokeSigner("keyCompromise");
  S.write(b.repo, LATER_CRL, b.tsa.crl({ lastMs: Date.now() }));
  S.commitAll(b.repo, "test: revoking CRL");
  return b;
}

/** Point `child`'s first parent at `parent` inside a written commit-graph file. */
function rewireGraphParent(gitDir, child, parent) {
  const file = path.join(gitDir, "objects", "info", "commit-graph");
  const buf = fs.readFileSync(file);
  const chunks = {};
  for (let i = 0; i < buf[6]; i += 1) chunks[buf.toString("latin1", 8 + i * 12, 12 + i * 12)] = Number(buf.readBigUInt64BE(12 + i * 12));
  const count = buf.readUInt32BE(chunks.OIDF + 255 * 4);
  const oids = Array.from({ length: count }, (_, i) => buf.toString("hex", chunks.OIDL + i * 20, chunks.OIDL + i * 20 + 20));
  buf.writeUInt32BE(oids.indexOf(parent), chunks.CDAT + oids.indexOf(child) * 36 + 20);
  fs.chmodSync(file, 0o666);
  fs.writeFileSync(file, buf);
}

it("a forged commit-graph cannot hide a removed CRL (audit #962 V8)", async () => {
  const b = await revokedBase();
  fs.rmSync(path.join(b.repo, LATER_CRL));
  S.commitAll(b.repo, "test: drop the revoking CRL");
  S.commitAll(b.repo, "test: top");
  const head = S.git(b.repo, "rev-parse", "HEAD");
  const dir = path.join(b.work, "forged-graph");
  S.git(b.work, "-c", "core.autocrlf=false", "clone", "-q", url.pathToFileURL(b.repo).href, dir);
  S.git(dir, "commit-graph", "write", "--reachable");
  rewireGraphParent(path.join(dir, ".git"), head, b.good);
  const viaGraph = S.git(dir, "-c", "core.commitGraph=true", "rev-list", "--count", "HEAD");
  assert.ok(Number(viaGraph) < Number(S.git(b.repo, "rev-list", "--count", "HEAD")), "precondition: Git itself follows the forged graph");
  const r = S.verify(dir);
  assert.equal(r.code, "TSA_CRL_HISTORY", `${r.verdict} ${r.code}: ${r.detail}`);
});

it("an object substituted under the same id is BLOCKED (audit #962 V9)", async () => {
  const b = await revokedBase();
  assert.equal(S.verify(b.repo).code, "TSA_SIGNER_REVOKED", "precondition: the revoking CRL is seen");
  const dir = S.copyRepo(b);
  const loose = (id) => path.join(dir, ".git", "objects", id.slice(0, 2), id.slice(2));
  const revoking = S.git(dir, "rev-parse", `HEAD:${LATER_CRL}`);
  const older = S.git(dir, "rev-parse", `HEAD:${S.CRL_PATH}`);
  fs.chmodSync(loose(revoking), 0o666);
  fs.copyFileSync(loose(older), loose(revoking));
  const r = S.verify(dir);
  assert.equal(r.code, "REPO_INTEGRITY", `${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.verdict, "BLOCKED");
});
