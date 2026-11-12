#!/usr/bin/env node
/**
 * G4 (#638) FreeTSA qualification, MANUAL and LIVE. Not part of any automated test.
 *
 *   node qualify-freetsa.cjs <repo root> <out dir>
 *
 * Uses the exact committed candidate files tools/g4/tsa-policy.json and the root
 * PEM it names. Network: FreeTSA receives only `openssl ts -query` requests over
 * SHA-256 of 64 fresh random bytes, at most one request every 2 s. Outage cases
 * use 127.0.0.1 and a reserved `.invalid` name only.
 *
 * Part A: real tokens checked by OpenSSL against the pinned root only, plus
 * rejections (wrong roots, substituted imprint, malformed tokens, out-of-window
 * verification times). Part B: the real G4 verifier in --release mode over
 * throwaway repositories that carry the exact policy and root, with an ephemeral
 * software test signer (never an owner key), plus policy and outage rejections.
 */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const [REPO, OUT] = process.argv.slice(2).map((p) => path.resolve(p));
const EXT = path.join(REPO, "FailSafe", "extension");
const ts = require(path.join(EXT, "scripts/lib/g4/timestamp.cjs"));
const layout = require(path.join(EXT, "scripts/lib/g4/layout.cjs"));
const { G4Refusal, sha256 } = require(path.join(EXT, "scripts/lib/g4/bytes.cjs"));
const S = require(path.join(EXT, "src/test/scripts/g4Scenario.cjs"));
const { createTestSigner } = require(path.join(EXT, "src/test/scripts/g4TestPki.cjs"));

const TSA_URL = "https://freetsa.org/tsr";
const POLICY = fs.readFileSync(path.join(REPO, layout.TSA_POLICY_PATH));
const ROOT_REL = JSON.parse(POLICY).trustedRoots[0].certificatePath;
const ROOT_PEM = fs.readFileSync(path.join(REPO, ROOT_REL));
const BIN = ts.requireOpenssl();
const results = [];
let lastRequest = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDigest = () => crypto.createHash("sha256").update(crypto.randomBytes(64)).digest("hex");
const tail = (s) => s.split(/\r?\n/).filter(Boolean).slice(-2).join(" | ");

function record(part, name, expected, actual, detail) {
  const pass = expected === actual;
  results.push({ part, name, expected, actual, pass, detail });
  process.stdout.write(`${pass ? "ok  " : "FAIL"} ${part} ${name}: expected ${expected}, got ${actual}${detail ? ` (${detail})` : ""}\n`);
}

/** One rate-limited FreeTSA request. Returns the raw token bytes. */
async function freetsa(tsqBytes) {
  const wait = lastRequest + 2000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const res = await ts.postQuery(TSA_URL, tsqBytes);
  if (res.status !== 200) throw new G4Refusal("BLOCKED", "TSA_OFFLINE", `${TSA_URL} answered HTTP ${res.status}`);
  return res.body;
}

async function stamp(dir, digest) {
  fs.mkdirSync(dir, { recursive: true });
  const tsq = path.join(dir, "token.tsq");
  ts.buildQuery(BIN, digest, tsq);
  const tsr = path.join(dir, "token.tsr");
  fs.writeFileSync(tsr, await freetsa(fs.readFileSync(tsq)));
  const chain = path.join(dir, "chain.pem");
  ts.extractChain(BIN, tsr, chain);
  const info = ts.tokenInfo(BIN, tsr);
  fs.writeFileSync(path.join(dir, "token.txt"), info.text + "\n");
  return { dir, digest, tsr, chain, info };
}

function verdict(r) {
  return r.ok ? "OK" : "FAIL";
}

module.exports = { REPO, OUT, EXT, BIN, ROOT_PEM, ROOT_REL, POLICY, TSA_URL, ts, layout, S, sha256, G4Refusal, createTestSigner, record, freetsa, stamp, verdict, randomDigest, tail, results, http };

if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  const partA = require("./qualify-part-a.cjs");
  const partB = require("./qualify-part-b.cjs");
  (async () => {
    const env = { probedUtc: new Date().toISOString(), openssl: ts.findOpenssl().version, node: process.version, tsaUrl: TSA_URL, policySha256: sha256(POLICY), rootPemSha256: sha256(ROOT_PEM) };
    await partA.run();
    await partB.run();
    const failed = results.filter((r) => !r.pass).length;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ ...env, finishedUtc: new Date().toISOString(), failed, results }, null, 2) + "\n");
    process.stdout.write(`\n${results.length - failed}/${results.length} expectations met\n`);
    process.exitCode = failed ? 1 : 0;
  })().catch((e) => { process.stderr.write(`[qualify] ${e.stack || e}\n`); process.exitCode = 2; });
}
