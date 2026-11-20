"use strict";
// #732: purpose-bound Ed25519 publisher attestation for an exactly verified
// six-asset candidate. No production key is embedded or generated here.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const DOMAIN = Buffer.from("MythologIQ/FailSafe/VoicePack/v1\0", "utf8");
const REPO = "MythologIQ-Labs-LLC/FailSafe";
const FIELDS = ["archiveSha256", "filename", "manifestSha256", "repository",
  "schema", "signerKeyId", "sourceSha", "tag", "version"].sort();
const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");

function parseEd25519Public(pem) {
  assert.ok(pem, "publisher trust root not provisioned");
  const key = crypto.createPublicKey(pem);
  assert.equal(key.asymmetricKeyType, "ed25519", "publisher key is not Ed25519");
  return key;
}
function publisherKeyId(pem) {
  const der = parseEd25519Public(pem).export({ format: "der", type: "spki" });
  return "sha256:" + sha256(der);
}
function requireCandidate(c) {
  assert.ok(c && typeof c === "object");
  assert.equal(c.status, "UNSIGNED_CANDIDATE_ONLY");
  assert.equal(c.repository, REPO);
  assert.match(c.version, VERSION);
  assert.match(c.sourceSha, HEX40);
  assert.equal(c.filename, "failsafe-voice-pack-" + c.version + ".tar.gz");
  assert.match(c.archiveSha256, HEX64);
  assert.match(c.manifestSha256, HEX64);
  assert.equal(c.filesVerified, 6);
}
function makeRecord(candidate, pinnedPublicKeyPem) {
  requireCandidate(candidate);
  return {
    schema: "failsafe.voice-pack.publisher.v1",
    repository: REPO,
    version: candidate.version,
    sourceSha: candidate.sourceSha,
    tag: "v" + candidate.version + "-voice",
    filename: candidate.filename,
    archiveSha256: candidate.archiveSha256,
    manifestSha256: candidate.manifestSha256,
    signerKeyId: publisherKeyId(pinnedPublicKeyPem),
  };
}
function encodeRecord(record) {
  return Buffer.from(JSON.stringify(record) + "\n", "utf8");
}
function validateSignedRecord(record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record));
  assert.deepEqual(Object.keys(record).sort(), FIELDS, "unexpected signed record fields");
  assert.equal(record.schema, "failsafe.voice-pack.publisher.v1");
  assert.equal(record.repository, REPO);
  assert.match(record.version, VERSION);
  assert.match(record.sourceSha, HEX40);
  assert.match(record.archiveSha256, HEX64);
  assert.match(record.manifestSha256, HEX64);
  assert.match(record.signerKeyId, /^sha256:[a-f0-9]{64}$/);
  assert.equal(record.tag, "v" + record.version + "-voice");
  assert.equal(record.filename, "failsafe-voice-pack-" + record.version + ".tar.gz");
}
function signCandidate(candidate, privatePem, pinnedPublicKeyPem) {
  const privateKey = crypto.createPrivateKey(privatePem);
  assert.equal(privateKey.asymmetricKeyType, "ed25519");
  const derived = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const pinned = parseEd25519Public(pinnedPublicKeyPem).export({ format: "der", type: "spki" });
  assert.ok(derived.equals(pinned), "signing key does not match pinned publisher");
  const payload = encodeRecord(makeRecord(candidate, pinnedPublicKeyPem));
  return { payload, signature: crypto.sign(null, Buffer.concat([DOMAIN, payload]), privateKey) };
}
function verifySignedCandidate(candidate, payload, signature, pinnedPublicKeyPem) {
  assert.ok(Buffer.isBuffer(payload) && payload.length <= 4096);
  assert.ok(Buffer.isBuffer(signature) && signature.length === 64, "invalid Ed25519 signature");
  const parsed = JSON.parse(payload.toString("utf8"));
  validateSignedRecord(parsed);
  assert.ok(payload.equals(encodeRecord(parsed)), "signed record is not canonical");
  assert.deepEqual(parsed, makeRecord(candidate, pinnedPublicKeyPem),
    "signed identity, signer or digest does not match admitted candidate");
  const key = parseEd25519Public(pinnedPublicKeyPem);
  assert.ok(crypto.verify(null, Buffer.concat([DOMAIN, payload]), key, signature),
    "publisher signature invalid");
  return parsed;
}
module.exports = { makeRecord, signCandidate, verifySignedCandidate, publisherKeyId };
