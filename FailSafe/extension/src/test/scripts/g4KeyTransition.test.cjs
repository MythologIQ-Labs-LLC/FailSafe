"use strict";
/**
 * G4 (#638) falsification: planned key rotation with verified continuity and
 * emergency recovery that never claims it (owner item 6). TEST ONLY keys.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { sha256 } = require("../../../scripts/lib/g4/bytes.cjs");
const { SCHEMA, transitionImprint } = require("../../../scripts/lib/g4/transition.cjs");
const { writeTransition, stampRegistry, requestToken } = require("../../../scripts/lib/g4/records.cjs");
const { createTestSigner } = require("./g4TestPki.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const REPOSITORY = "test/failsafe-g4";
const CLI = path.resolve(__dirname, "..", "..", "..", "scripts", "g4-verify-checkpoint.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function refused(r, code) {
  assert.equal(r.code, code, `expected ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.verdict, "REFUSED");
}

let base;
let keyB;
let keyC;
before(async () => {
  if (skip) return;
  base = await S.buildBase(found.bin);
  keyB = createTestSigner(found.bin, path.join(base.work, "keys-b"), "B");
  keyC = createTestSigner(found.bin, path.join(base.work, "keys-c"), "C");
});
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

/** A copy with B's certificate committed and, optionally, A revoked (stamped registry v2). */
async function prepare({ revokeA = false } = {}) {
  const dir = S.copyRepo(base);
  S.addKey(dir, keyB);
  S.commitAll(dir, "test: commit key B");
  if (revokeA) {
    await sleep(1100);
    S.write(dir, layout.REGISTRY_PATH, S.registryBytes(2, [{ fingerprintSha256: base.signer.fingerprint, effectiveUtc: new Date().toISOString(), reason: "TPM lost" }]));
    S.commitAll(dir, "test: revoke A");
    await stampRegistry({ repoRoot: dir, tsa: base.tsa });
    S.commitAll(dir, "test: registry v2 token");
    // Token times have one-second resolution; let the next token fall clearly after the revocation.
    await sleep(1100);
  }
  return dir;
}

const record = (kind, extra = {}) => ({ repoRoot: null, kind, fromFingerprint: base.signer.fingerprint, toFingerprint: keyB.fingerprint,
  afterCheckpoint: "g4-000002", repository: REPOSITORY, tsa: base.tsa, ...extra });

/** Commit a transition record, then a checkpoint signed by `next`. */
async function transitionThenCheckpoint(dir, opts, next = keyB) {
  await writeTransition({ ...opts, repoRoot: dir });
  S.commitAll(dir, `test: ${opts.kind} record`);
  S.appendEntry(dir, 930);
  S.commitAll(dir, "test: entry 930");
  await S.checkpoint(dir, base.tsa, next);
}

function releaseOpts(dir) {
  const manifest = fs.readFileSync(path.join(S.cpDir(dir, "g4-000003"), layout.FILES.manifest));
  return { release: true, trustFingerprint: base.signer.fingerprint, trustedHead: `g4-000003:${sha256(manifest)}`, repository: REPOSITORY, expectedCommit: S.git(dir, "rev-parse", "HEAD") };
}

it("rotation signed by the old key: continuity verified, release PASS with no limitation", async () => {
  const dir = await prepare();
  await transitionThenCheckpoint(dir, record("rotation", { signer: base.signer }));
  const r = S.verify(dir, releaseOpts(dir));
  assert.equal(r.verdict, "PASS", r.detail);
  assert.deepEqual(r.limitations, []);
});

it("the genesis pin still decides: pinning the new key instead is refused", async () => {
  const dir = await prepare();
  await transitionThenCheckpoint(dir, record("rotation", { signer: base.signer }));
  refused(S.verify(dir, { ...releaseOpts(dir), trustFingerprint: keyB.fingerprint }), "KEY_UNTRUSTED");
});

/** Write a hand-made record signed by `signer`, bypassing the builder's checks. */
async function forgeRecord(dir, fields, signer, { stamp = true } = {}) {
  const r = { schema: SCHEMA, kind: "rotation", repository: REPOSITORY, fromFingerprintSha256: base.signer.fingerprint,
    toFingerprintSha256: keyB.fingerprint, afterCheckpoint: "g4-000002", createdUtc: new Date().toISOString(), ...fields };
  const bytes = Buffer.from(JSON.stringify(r, null, 2) + "\n");
  const sig = signer.sign(bytes);
  const p = layout.transitionPaths(base.signer.fingerprint);
  S.write(dir, p.record, bytes);
  S.write(dir, p.signature, sig);
  if (stamp) S.write(dir, p.token, await requestToken(transitionImprint(bytes, sig), base.tsa, fs.mkdtempSync(path.join(base.work, "st-"))));
  S.commitAll(dir, "test: forged transition record");
  S.appendEntry(dir, 931);
  S.commitAll(dir, "test: entry 931");
  await S.checkpoint(dir, base.tsa, keyB);
}

for (const [name, fields, signerOf, stamp] of [
  ["a rotation signed by the new key instead of the old one", {}, () => keyB, true],
  ["a rotation naming the wrong previous checkpoint", { afterCheckpoint: "g4-000001" }, () => base.signer, true],
  ["a rotation to a different key than the one that signs next", { toFingerprintSha256: "c".repeat(64) }, () => base.signer, true],
  ["a rotation for another repository", { repository: "other/repo" }, () => base.signer, true],
  ["a rotation record without its token", {}, () => base.signer, false],
]) {
  it(`refused: ${name}`, async () => {
    const dir = await prepare();
    await forgeRecord(dir, fields, signerOf(), { stamp });
    refused(S.verify(dir), "KEY_TRANSITION_INVALID");
  });
}

it("refused: a rotation record edited after it was signed", async () => {
  const dir = await prepare();
  await transitionThenCheckpoint(dir, record("rotation", { signer: base.signer }));
  const p = path.join(dir, layout.transitionPaths(base.signer.fingerprint).record);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"createdUtc": "[^"]+"/, '"createdUtc": "2026-01-01T00:00:00.000Z"'));
  S.commitAll(dir, "test: edit the record");
  refused(S.verify(dir), "KEY_TRANSITION_INVALID");
});

it("refused: a rotation away from a key already revoked", async () => {
  const dir = await prepare({ revokeA: true });
  await transitionThenCheckpoint(dir, record("rotation", { signer: base.signer }));
  refused(S.verify(dir), "KEY_TRANSITION_INVALID");
});

it("refused: a third key reached by no record", async () => {
  const dir = await prepare();
  S.addKey(dir, keyC);
  S.commitAll(dir, "test: commit key C");
  S.appendEntry(dir, 932);
  S.commitAll(dir, "test: entry 932");
  await S.checkpoint(dir, base.tsa, keyC);
  refused(S.verify(dir), "KEY_RESET");
});

it("recovery: refused until acknowledged; accepted only with the limitation that continuity is NOT verified", async () => {
  const dir = await prepare({ revokeA: true });
  await transitionThenCheckpoint(dir, record("recovery", { signer: keyB }));
  refused(S.verify(dir), "KEY_RECOVERY_UNACKNOWLEDGED");
  refused(S.verify(dir, { acceptRecovery: [`g4-000002:${"0".repeat(64)}`] }), "KEY_RECOVERY_UNACKNOWLEDGED");
  const recordBytes = fs.readFileSync(path.join(dir, layout.transitionPaths(base.signer.fingerprint).record));
  const ack = `g4-000002:${sha256(recordBytes)}`;
  const r = S.verify(dir, { ...releaseOpts(dir), acceptRecovery: [ack] });
  assert.equal(r.verdict, "PASS", r.detail);
  assert.equal(r.mode, "release");
  assert.equal(r.limitations.length, 1);
  assert.match(r.limitations[0], /continuity across it is NOT verified/);
  const i = releaseOpts(dir);
  const cli = spawnSync(process.execPath, [CLI, "--repo-root", dir, "--release", "--trust-fingerprint", i.trustFingerprint, "--trusted-head", i.trustedHead,
    "--repository", i.repository, "--commit", i.expectedCommit, "--accept-recovery", ack], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /limitation: emergency key recovery after g4-000002/);
});

it("recovery: refused while the lost key is not revoked", async () => {
  const dir = await prepare();
  await transitionThenCheckpoint(dir, record("recovery", { signer: keyB }));
  refused(S.verify(dir), "KEY_RECOVERY_UNREVOKED");
});

it("recovery: a record signed by the old key instead of the new one is refused", async () => {
  const dir = await prepare({ revokeA: true });
  await forgeRecord(dir, { kind: "recovery" }, base.signer);
  refused(S.verify(dir), "KEY_TRANSITION_INVALID");
});

it("the record builder refuses a signer that does not match the kind, and never replaces a record", async () => {
  const dir = await prepare();
  await assert.rejects(writeTransition({ ...record("rotation", { signer: keyB }), repoRoot: dir }), /must be signed by/);
  await writeTransition({ ...record("rotation", { signer: base.signer }), repoRoot: dir });
  await assert.rejects(writeTransition({ ...record("rotation", { signer: base.signer }), repoRoot: dir }), /never replaced/);
});
