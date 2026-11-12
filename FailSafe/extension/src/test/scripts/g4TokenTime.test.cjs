"use strict";
/**
 * G4 (#638) falsification: token-time validation with archived CRLs (owner
 * item 9), single-certificate root files, and timestamped revocation notices
 * (owner item 7). TEST ONLY PKI from g4TestPki.cjs.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { noticeImprint } = require("../../../scripts/lib/g4/notices.cjs");
const { witnessImprint } = require("../../../scripts/lib/g4/bytes.cjs");
const { stampRegistry, requestToken } = require("../../../scripts/lib/g4/records.cjs");
const { createLocalTsa, createTestSigner } = require("./g4TestPki.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const DAY = 86400e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function refused(r, code, verdict = "REFUSED") {
  assert.equal(r.code, code, `expected ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.verdict, verdict);
}

let base;
before(async () => {
  if (skip) return;
  base = await S.buildBase(found.bin);
});
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

let fresh = 0;
/** A new repository whose archived CRL is `bytes` from the start (null: none), with one checkpoint. */
async function withCrl(bytes) {
  const dir = path.join(base.work, `fresh-${++fresh}`);
  fs.mkdirSync(dir, { recursive: true });
  S.initRepo(dir, bytes === null ? { rootPem: base.tsa.rootPem } : { rootPem: base.tsa.rootPem, crl: () => bytes }, base.signer);
  await S.checkpoint(dir, base.tsa, base.signer);
  return dir;
}

/** The base repository with `files` ({rel: bytes}) added in a new commit. */
function adding(files) {
  const dir = S.copyRepo(base);
  for (const [rel, bytes] of Object.entries(files)) S.write(dir, rel, bytes);
  S.commitAll(dir, "test: add files under tools/g4/tsa-crls");
  return dir;
}

it("the base chain passes with its archived CRL", () => {
  const r = S.verify(base.repo);
  assert.equal(r.verdict, "PASS", r.detail);
});

it("no archived CRL: BLOCKED, never a pass on the token alone", async () => {
  refused(S.verify(await withCrl(null)), "TSA_REVOCATION_EVIDENCE_MISSING", "BLOCKED");
});

it("a CRL that had expired before the token time does not count", async () => {
  const now = Date.now();
  refused(S.verify(await withCrl(base.tsa.crl({ lastMs: now - 3 * DAY, nextMs: now - 2 * DAY }))), "TSA_REVOCATION_EVIDENCE_MISSING", "BLOCKED");
});

it("a CRL issued after the token time does not count", async () => {
  refused(S.verify(await withCrl(base.tsa.crl({ lastMs: Date.now() + 3600e3 }))), "TSA_REVOCATION_EVIDENCE_MISSING", "BLOCKED");
});

it("a CRL from another key under the same CA name is refused when loaded", () => {
  const other = createLocalTsa(found.bin, path.join(base.work, "other-ca"));
  refused(S.verify(adding({ "tools/g4/tsa-crls/other.crl": other.crl() })), "TSA_CRL_UNTRUSTED");
});

it("anything but exactly one PEM CRL per .crl file is refused (audit #959 V1)", () => {
  const other = createLocalTsa(found.bin, path.join(base.work, "smuggled-ca"));
  const crl = base.tsa.crl();
  refused(S.verify(adding({ "tools/g4/tsa-crls/bad.crl": Buffer.from("not a crl\n") })), "TSA_CRL_MALFORMED");
  refused(S.verify(adding({ "tools/g4/tsa-crls/notes.txt": Buffer.from("x\n") })), "TSA_CRL_MALFORMED");
  refused(S.verify(adding({ "tools/g4/tsa-crls/two.crl": Buffer.concat([crl, crl]) })), "TSA_CRL_MALFORMED");
  refused(S.verify(adding({ "tools/g4/tsa-crls/smuggled.crl": Buffer.concat([crl, other.rootPem, other.crl()]) })), "TSA_CRL_MALFORMED");
});

it("a root file holding a second certificate is refused (audit #956 N1)", () => {
  const dir = S.copyRepo(base);
  const other = createLocalTsa(found.bin, path.join(base.work, "appended-ca"));
  S.write(dir, "tools/g4/tsa-roots/g4-test-only-root.pem", Buffer.concat([base.tsa.rootPem, other.rootPem]));
  S.commitAll(dir, "test: append a certificate to the root file");
  refused(S.verify(dir), "TSA_ROOT_MALFORMED");
});

it("a token stays valid after its TSA signer expires, because the chain is checked at token time", async () => {
  const work = path.join(base.work, "expiring");
  const tsa = createLocalTsa(found.bin, path.join(work, "tsa"), { signerValidMs: 8000 });
  const signer = createTestSigner(found.bin, path.join(work, "keys"), "E");
  const repo = path.join(work, "repo");
  fs.mkdirSync(repo, { recursive: true });
  S.initRepo(repo, tsa, signer);
  await S.checkpoint(repo, tsa, signer);
  await sleep(9000);
  const cp = S.cpDir(repo, "g4-000001");
  const read = (f) => fs.readFileSync(path.join(cp, layout.FILES[f]));
  const now = ts.verifyToken(found.bin, { imprintHex: witnessImprint(read("manifest"), read("signature")),
    tsrPath: path.join(cp, layout.FILES.token), caFile: tsa.rootPath, untrustedFile: path.join(cp, layout.FILES.chain) });
  assert.equal(now.ok, false, "precondition: a current-time check of this token would fail");
  assert.match(now.out, /certificate has expired/);
  const r = S.verify(repo);
  assert.equal(r.verdict, "PASS", r.detail);
});

it("a TSA signer revoked before a token's time is refused; earlier tokens stay valid", async () => {
  const b2 = await S.buildBase(found.bin);
  try {
    // Times have one-second resolution, and a revocation in a token's own second counts as before it.
    await sleep(1100);
    b2.tsa.revokeSigner();
    await sleep(1100);
    S.write(b2.repo, "tools/g4/tsa-crls/after-revocation.crl", b2.tsa.crl({ lastMs: Date.now() }));
    S.commitAll(b2.repo, "test: CRL listing the revoked TSA signer");
    assert.equal(S.verify(b2.repo).verdict, "PASS", "tokens from before the revocation stay valid");
    S.appendEntry(b2.repo, 929);
    S.commitAll(b2.repo, "test: entry 929");
    await sleep(1100);
    await S.checkpoint(b2.repo, b2.tsa, b2.signer);
    refused(S.verify(b2.repo), "TSA_SIGNER_REVOKED");
  } finally {
    fs.rmSync(b2.work, { recursive: true, force: true });
  }
});

const notice = (fp, ms) => ({ fingerprintSha256: fp, effectiveUtc: new Date(ms).toISOString(), reason: "test" });

async function registryVersion(dir, version, revocations, stamp = true) {
  S.write(dir, layout.REGISTRY_PATH, S.registryBytes(version, revocations));
  S.commitAll(dir, `test: registry v${version}`);
  if (stamp) await stampRegistry({ repoRoot: dir, tsa: base.tsa });
  return S.commitAll(dir, `test: registry v${version} token`);
}

it("a registry version without its notice token is refused", async () => {
  const dir = S.copyRepo(base);
  await registryVersion(dir, 2, [notice("b".repeat(64), Date.now() - DAY)], false);
  refused(S.verify(dir), "REVOCATION_UNSTAMPED");
});

it("a stamped registry version passes", async () => {
  const dir = S.copyRepo(base);
  await registryVersion(dir, 2, [notice("b".repeat(64), Date.now() - DAY)]);
  assert.equal(S.verify(dir).verdict, "PASS");
});

it("a notice dated after its own token time is refused", async () => {
  const dir = S.copyRepo(base);
  await registryVersion(dir, 2, [notice("b".repeat(64), Date.now() + DAY)]);
  refused(S.verify(dir), "REVOCATION_POSTDATED");
});

it("one version's token reused for the next version is refused", async () => {
  const dir = S.copyRepo(base);
  const first = notice("b".repeat(64), Date.now() - DAY);
  await registryVersion(dir, 2, [first]);
  await registryVersion(dir, 3, [first, notice("c".repeat(64), Date.now() - DAY)], false);
  S.write(dir, layout.noticeTokenPath(3), fs.readFileSync(path.join(dir, layout.noticeTokenPath(2))));
  S.commitAll(dir, "test: v2 token as v3");
  refused(S.verify(dir), "TOKEN_IMPRINT_MISMATCH");
});

it("version tokens out of time order are refused", async () => {
  const dir = S.copyRepo(base);
  const v2 = [notice("b".repeat(64), Date.now() - DAY)];
  const v3 = [...v2, notice("c".repeat(64), Date.now() - DAY)];
  const stage = fs.mkdtempSync(path.join(base.work, "stage-"));
  const early = await requestToken(noticeImprint(S.registryBytes(3, v3)), base.tsa, stage);
  await sleep(1100);
  await registryVersion(dir, 2, v2);
  S.write(dir, layout.REGISTRY_PATH, S.registryBytes(3, v3));
  S.write(dir, layout.noticeTokenPath(3), early);
  S.commitAll(dir, "test: v3 with a token older than v2's");
  refused(S.verify(dir), "REVOCATION_TIME_ORDER");
});
