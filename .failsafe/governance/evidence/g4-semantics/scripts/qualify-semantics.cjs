#!/usr/bin/env node
/**
 * G4 (#638) LIVE check of token-time validation, notice tokens and a key
 * rotation with real FreeTSA tokens and the committed FreeTSA CRL.
 *
 *   node qualify-semantics.cjs <repo root> <out dir>
 *
 * Uses qualify-freetsa.cjs (same directory) for the rate-limited FreeTSA client
 * and the exact committed policy and root. Exactly 5 FreeTSA requests, each for
 * a framed SHA-256 imprint of throwaway test data. Ephemeral software test keys.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const Q = require("./qualify-freetsa.cjs");
const { writeTransition, stampRegistry } = require(path.join(Q.EXT, "scripts/lib/g4/records.cjs"));

const DIR = path.join(Q.OUT, "semantics");
const REPOSITORY = "test/failsafe-g4";
const CRL_REL = "tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl";
const S = Q.S;
let copies = 0;

function initRepo(dir, signer) {
  fs.mkdirSync(dir, { recursive: true });
  S.initRepo(dir, { rootPem: Q.ROOT_PEM }, signer);
  fs.rmSync(path.join(dir, "tools/g4/tsa-roots"), { recursive: true, force: true });
  S.write(dir, Q.ROOT_REL, Q.ROOT_PEM);
  S.write(dir, Q.layout.TSA_POLICY_PATH, Q.POLICY);
  S.write(dir, CRL_REL, fs.readFileSync(path.join(Q.REPO, CRL_REL)));
  return S.commitAll(dir, "test: exact FreeTSA policy, root and committed CRL");
}

function releaseOpts(dir, pin, last) {
  const manifest = fs.readFileSync(path.join(S.cpDir(dir, last), Q.layout.FILES.manifest));
  return { release: true, trustFingerprint: pin, trustedHead: `${last}:${Q.sha256(manifest)}`, repository: REPOSITORY, expectedCommit: S.git(dir, "rev-parse", "HEAD") };
}

function expect(name, dir, opts, want) {
  const r = S.verify(dir, opts);
  const got = `${r.verdict} ${r.code}${r.verdict === "PASS" ? ` mode:${r.mode} limitations:${r.limitations.length}` : ""}`;
  Q.record("S", name, want, got, r.detail);
}

function variant(base, name, change, want) {
  const dir = path.join(DIR, `case-${++copies}`);
  fs.cpSync(base.repo, dir, { recursive: true });
  change(dir);
  S.commitAll(dir, `test: ${name}`);
  expect(name, dir, releaseOpts(dir, base.a.fingerprint, "g4-000002"), want);
}

async function build() {
  const a = Q.createTestSigner(Q.BIN, path.join(DIR, "key-a"), "A");
  const b = Q.createTestSigner(Q.BIN, path.join(DIR, "key-b"), "B");
  const repo = path.join(DIR, "base");
  const tsa = { request: Q.freetsa };
  initRepo(repo, a);
  await S.checkpoint(repo, tsa, a, { repository: REPOSITORY });
  S.addKey(repo, b);
  S.write(repo, Q.layout.REGISTRY_PATH, S.registryBytes(2, [{ fingerprintSha256: "f".repeat(64), effectiveUtc: new Date(Date.now() - 86400e3).toISOString(), reason: "test" }]));
  S.commitAll(repo, "test: key B and registry v2");
  await stampRegistry({ repoRoot: repo, tsa });
  S.commitAll(repo, "test: registry v2 notice token");
  S.appendEntry(repo, 9101);
  S.commitAll(repo, "test: entry 9101");
  await S.checkpoint(repo, tsa, a, { repository: REPOSITORY });
  return { repo, a, b, tsa };
}

async function rotate(base) {
  const dir = path.join(DIR, "rotated");
  fs.cpSync(base.repo, dir, { recursive: true });
  await writeTransition({ repoRoot: dir, kind: "rotation", fromFingerprint: base.a.fingerprint, toFingerprint: base.b.fingerprint,
    afterCheckpoint: "g4-000002", repository: REPOSITORY, signer: base.a, tsa: base.tsa });
  S.commitAll(dir, "test: rotation A to B");
  S.appendEntry(dir, 9102);
  S.commitAll(dir, "test: entry 9102");
  await S.checkpoint(dir, base.tsa, base.b, { repository: REPOSITORY });
  expect("rotation A->B with FreeTSA-stamped record: release, pinned genesis key A", dir, releaseOpts(dir, base.a.fingerprint, "g4-000003"), "PASS OK mode:release limitations:0");
}

async function run() {
  fs.mkdirSync(DIR, { recursive: true });
  const base = await build();
  expect("two FreeTSA checkpoints, stamped registry v2, token-time with the real CRL", base.repo, releaseOpts(base.repo, base.a.fingerprint, "g4-000002"), "PASS OK mode:release limitations:0");
  variant(base, "committed CRL removed (archived CRLs are append-only)", (d) => fs.rmSync(path.join(d, CRL_REL)), "REFUSED TSA_CRL_HISTORY");
  variant(base, "registry v2 notice token removed", (d) => fs.rmSync(path.join(d, Q.layout.noticeTokenPath(2))), "REFUSED REVOCATION_UNSTAMPED");
  variant(base, "a second certificate appended to the root file", (d) => fs.appendFileSync(path.join(d, Q.ROOT_REL), fs.readFileSync(path.join(Q.OUT, "..", "forged-root.pem"))), "REFUSED TSA_ROOT_MALFORMED");
  await rotate(base);
}

if (require.main === module) {
  run().then(() => {
    const failed = Q.results.filter((r) => !r.pass).length;
    fs.writeFileSync(path.join(Q.OUT, "results.json"), JSON.stringify({ finishedUtc: new Date().toISOString(), openssl: Q.ts.findOpenssl().version, failed, results: Q.results }, null, 2) + "\n");
    process.stdout.write(`\n${Q.results.length - failed}/${Q.results.length} expectations met\n`);
    process.exitCode = failed ? 1 : 0;
  }, (e) => { process.stderr.write(`[semantics] ${e.stack || e}\n`); process.exitCode = 2; });
}
