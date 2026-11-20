"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { signCandidate, verifySignedCandidate, publisherKeyId } =
  require("../../../scripts/voice-pack-auth.cjs");

const candidate = () => ({
  status: "UNSIGNED_CANDIDATE_ONLY", repository: "MythologIQ-Labs-LLC/FailSafe",
  version: "6.1.0", sourceSha: "a".repeat(40),
  filename: "failsafe-voice-pack-6.1.0.tar.gz",
  archiveSha256: "b".repeat(64), manifestSha256: "c".repeat(64),
  filesVerified: 6,
});
function keys() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKey: pair.publicKey.export({ format: "pem", type: "spki" }),
  };
}

test("matched pinned publisher signs a purpose-bound exact candidate", () => {
  const k = keys(), item = candidate();
  const { payload, signature } = signCandidate(item, k.privateKey, k.publicKey);
  const record = verifySignedCandidate(item, payload, signature, k.publicKey);
  assert.equal(record.tag, "v6.1.0-voice");
  assert.equal(record.signerKeyId, publisherKeyId(k.publicKey));
  assert.equal(record.archiveSha256, item.archiveSha256);
  assert.equal(signature.length, 64);
});

test("an unrecognized signing key cannot sign under the pinned owner key", () => {
  const publisher = keys(), attacker = keys();
  assert.throws(() => signCandidate(candidate(), attacker.privateKey, publisher.publicKey),
    /signing key does not match pinned publisher/);
});

test("a valid signature from another signer is refused under the pinned key", () => {
  const publisher = keys(), attacker = keys();
  const receipt = signCandidate(candidate(), attacker.privateKey, attacker.publicKey);
  assert.throws(() =>
    verifySignedCandidate(candidate(), receipt.payload, receipt.signature, publisher.publicKey),
  /signed identity, signer or digest does not match/);
});

test("altered signed archive digest, source or version is refused", () => {
  const k = keys(), original = candidate();
  const receipt = signCandidate(original, k.privateKey, k.publicKey);
  for (const update of [
    { archiveSha256: "d".repeat(64) },
    { manifestSha256: "e".repeat(64) },
    { sourceSha: "f".repeat(40) },
    { version: "6.1.1", filename: "failsafe-voice-pack-6.1.1.tar.gz" },
  ]) {
    assert.throws(() => verifySignedCandidate({ ...original, ...update },
      receipt.payload, receipt.signature, k.publicKey), /signed identity, signer or digest does not match/);
  }
});

test("tampered version is refused by schema and corrupted signature by Ed25519", () => {
  const k = keys(), item = candidate();
  const receipt = signCandidate(item, k.privateKey, k.publicKey);
  const altered = Buffer.from(receipt.payload);
  altered[altered.indexOf(Buffer.from("6.1.0"))] = "7".charCodeAt(0);
  assert.throws(() => verifySignedCandidate(item, altered, receipt.signature, k.publicKey),
    /Expected values to be strictly equal|signed identity, signer or digest does not match/);
  const wrongSignature = Buffer.from(receipt.signature);
  wrongSignature[0] ^= 0x01;
  assert.throws(() => verifySignedCandidate(item, receipt.payload, wrongSignature, k.publicKey),
    /publisher signature invalid/);
});

test("wrong signature size and missing publisher pin fail closed", () => {
  const k = keys(), item = candidate();
  const receipt = signCandidate(item, k.privateKey, k.publicKey);
  assert.throws(() => verifySignedCandidate(item, receipt.payload,
    Buffer.alloc(0), k.publicKey), /invalid Ed25519 signature/);
  assert.throws(() => verifySignedCandidate(item, receipt.payload,
    receipt.signature, null), /publisher trust root not provisioned/);
});

test("unexpected JSON fields and noncanonical encoding cannot be signed substitutes", () => {
  const k = keys(), item = candidate();
  const receipt = signCandidate(item, k.privateKey, k.publicKey);
  const extra = Buffer.from(JSON.stringify({
    ...JSON.parse(receipt.payload.toString("utf8")), unreviewed: true,
  }) + "\n");
  assert.throws(() => verifySignedCandidate(item, extra, receipt.signature, k.publicKey),
    /unexpected signed record fields/);
  const spaced = Buffer.from(" " + receipt.payload.toString("utf8"));
  assert.throws(() => verifySignedCandidate(item, spaced, receipt.signature, k.publicKey),
    /signed record is not canonical/);
});

test("a record for a different repository or asset name cannot be issued", () => {
  const k = keys();
  assert.throws(() => signCandidate({ ...candidate(), repository: "other/repo" },
    k.privateKey, k.publicKey), /Expected values to be strictly equal/);
  assert.throws(() => signCandidate({ ...candidate(), filesVerified: 5 },
    k.privateKey, k.publicKey), /Expected values to be strictly equal/);
});
