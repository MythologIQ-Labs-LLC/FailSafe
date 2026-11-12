"use strict";
/**
 * G4 (#638) falsification: the archived CRLs (audit VETO #959 V3 and V4).
 * Every archived CRL from the signer's root is consulted, not only the one
 * current at the token time, and archived CRLs are append-only. TEST ONLY PKI.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LATER_CRL = "tools/g4/tsa-crls/later.crl";

function refused(r, code) {
  assert.equal(r.code, code, `expected ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.verdict, "REFUSED");
}

const bases = [];
async function freshBase() {
  const b = await S.buildBase(found.bin);
  bases.push(b);
  return b;
}
after(() => { for (const b of bases) fs.rmSync(b.work, { recursive: true, force: true }); });

let base;
before(async () => {
  if (!skip) base = await freshBase();
});

it("a CRL issued after a token, listing the signer as revoked before it, is refused", async () => {
  const b = await freshBase();
  await sleep(1100);
  b.tsa.revokeSigner("superseded");
  await sleep(1100);
  S.appendEntry(b.repo, 940);
  S.commitAll(b.repo, "test: entry 940");
  await S.checkpoint(b.repo, b.tsa, b.signer);
  assert.equal(S.verify(b.repo).verdict, "PASS", "precondition: no archived CRL lists the revocation yet");
  await sleep(1100);
  S.write(b.repo, LATER_CRL, b.tsa.crl({ lastMs: Date.now() }));
  S.commitAll(b.repo, "test: a later CRL listing the earlier revocation");
  refused(S.verify(b.repo), "TSA_SIGNER_REVOKED");
});

it("a signer revoked for key compromise is refused for every token, earlier ones included", async () => {
  const b = await freshBase();
  await sleep(1100);
  b.tsa.revokeSigner("keyCompromise");
  S.write(b.repo, LATER_CRL, b.tsa.crl({ lastMs: Date.now() }));
  S.commitAll(b.repo, "test: CRL revoking the signer for key compromise");
  const r = S.verify(b.repo);
  refused(r, "TSA_SIGNER_REVOKED");
  assert.match(r.detail, /g4-000001/, "the genesis token, made before the revocation, is refused too");
});

for (const [label, reason] of [["with no reasonCode", undefined], ["on certificateHold", "certificateHold"], ["for CA compromise", "CACompromise"]]) {
  it(`a signer revoked ${label} after the tokens invalidates them all (RFC 3161 section 4; audit #960 V5)`, async () => {
    const b = await freshBase();
    await sleep(1100);
    b.tsa.revokeSigner(reason);
    S.write(b.repo, LATER_CRL, b.tsa.crl({ lastMs: Date.now() }));
    S.commitAll(b.repo, `test: CRL revoking the signer ${label}`);
    refused(S.verify(b.repo), "TSA_SIGNER_REVOKED");
  });
}

/** Commit a revoking CRL on a side branch, then merge it into the base branch with `mergeArgs`, dropping the CRL. */
async function mergeDroppingCrl(mergeArgs, resolve) {
  const b = await freshBase();
  const main = S.git(b.repo, "rev-parse", "--abbrev-ref", "HEAD");
  S.git(b.repo, "checkout", "-q", "-b", "side");
  await sleep(1100);
  b.tsa.revokeSigner("keyCompromise");
  S.write(b.repo, LATER_CRL, b.tsa.crl({ lastMs: Date.now() }));
  S.commitAll(b.repo, "test: revoking CRL on a side branch");
  assert.equal(S.verify(b.repo).code, "TSA_SIGNER_REVOKED", "precondition: the side branch refuses");
  S.git(b.repo, "checkout", "-q", main);
  S.git(b.repo, "merge", "-q", "--no-ff", ...mergeArgs, "side");
  if (resolve) resolve(b.repo);
  return b;
}

it("a CRL dropped by a merge resolution is refused (audit #960 V6)", async () => {
  const b = await mergeDroppingCrl(["--no-commit"], (dir) => {
    S.git(dir, "rm", "-q", "--cached", LATER_CRL);
    fs.rmSync(path.join(dir, LATER_CRL));
    S.git(dir, "commit", "-q", "-m", "test: merge that drops the CRL");
  });
  refused(S.verify(b.repo), "TSA_CRL_HISTORY");
});

it("a CRL dropped by merging its branch with -s ours is refused (audit #960 V6)", async () => {
  const b = await mergeDroppingCrl(["-s", "ours", "-m", "test: ours merge"]);
  assert.equal(fs.existsSync(path.join(b.repo, LATER_CRL)), false, "precondition: the CRL is absent at HEAD");
  refused(S.verify(b.repo), "TSA_CRL_HISTORY");
});

it("a signer revoked for another reason after a token leaves that token valid", async () => {
  const b = await freshBase();
  await sleep(1100);
  b.tsa.revokeSigner("superseded");
  await sleep(1100);
  S.write(b.repo, LATER_CRL, b.tsa.crl({ lastMs: Date.now() }));
  S.commitAll(b.repo, "test: CRL revoking the signer as superseded");
  assert.equal(S.verify(b.repo).verdict, "PASS");
});

it("deleting an archived CRL is refused (append-only)", () => {
  const dir = S.copyRepo(base);
  fs.rmSync(path.join(dir, S.CRL_PATH));
  S.commitAll(dir, "test: delete the archived CRL");
  refused(S.verify(dir), "TSA_CRL_HISTORY");
});

it("changing an archived CRL is refused (append-only)", () => {
  const dir = S.copyRepo(base);
  S.write(dir, S.CRL_PATH, base.tsa.crl());
  S.commitAll(dir, "test: replace the archived CRL");
  refused(S.verify(dir), "TSA_CRL_HISTORY");
});

it("a deletion hidden by later restoring the file is still refused", () => {
  const dir = S.copyRepo(base);
  const bytes = fs.readFileSync(path.join(dir, S.CRL_PATH));
  fs.rmSync(path.join(dir, S.CRL_PATH));
  S.commitAll(dir, "test: delete");
  S.write(dir, S.CRL_PATH, bytes);
  S.commitAll(dir, "test: restore");
  refused(S.verify(dir), "TSA_CRL_HISTORY");
});

it("adding a further CRL is allowed", () => {
  const dir = S.copyRepo(base);
  S.write(dir, LATER_CRL, base.tsa.crl());
  S.commitAll(dir, "test: add a newer CRL");
  assert.equal(S.verify(dir).verdict, "PASS");
});
