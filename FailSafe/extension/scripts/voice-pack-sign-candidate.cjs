"use strict";
// #732: sign a reverified candidate with an OWNER-provisioned Ed25519 key.
// Never generates a key, takes a caller-supplied replacement trust root,
// creates a GitHub release, or publishes to a marketplace.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { verifyCandidate } = require("./verify-voice-release-candidate.cjs");
const { signCandidate, verifySignedCandidate } = require("./voice-pack-auth.cjs");

const PIN = path.resolve(__dirname, "..", "src", "voice-pack", "publisher-public-key.pem");

function option(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error("missing argument " + name);
  return process.argv[i + 1];
}
function requirePublisherKey() {
  let stat;
  try { stat = fs.lstatSync(PIN); }
  catch { throw new Error("publisher trust root unavailable: approved key not provisioned"); }
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 8192,
    "publisher trust root must be a bounded regular pinned file");
  return fs.readFileSync(PIN, "utf8");
}
function requirePrivateKey() {
  const b64 = process.env.VOICE_PACK_SIGNING_KEY_PEM_B64;
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length > 16384) {
    throw new Error("publisher signing credential unavailable");
  }
  const bytes = Buffer.from(b64, "base64");
  if (bytes.toString("base64") !== b64) throw new Error("invalid signing credential encoding");
  return bytes.toString("utf8");
}
function signApprovedCandidate(dir, version, sourceSha) {
  const pub = requirePublisherKey();
  const priv = requirePrivateKey();
  const verified = verifyCandidate(dir, version, sourceSha);
  const recorded = JSON.parse(fs.readFileSync(path.join(dir, "voice-pack-candidate.json"), "utf8"));
  assert.deepEqual(recorded, verified, "candidate receipt not bound to reverified archive");
  const signed = signCandidate(verified, priv, pub);
  verifySignedCandidate(verified, signed.payload, signed.signature, pub);
  const recordPath = path.join(dir, "voice-pack-release.json");
  const sigPath = recordPath + ".sig";
  try {
    fs.writeFileSync(recordPath, signed.payload, { flag: "wx", mode: 0o600 });
    fs.writeFileSync(sigPath, signed.signature.toString("base64") + "\n",
      { flag: "wx", mode: 0o600 });
  } catch (e) {
    // A partial signer job must not leave output indistinguishable from success.
    fs.rmSync(recordPath, { force: true });
    fs.rmSync(sigPath, { force: true });
    throw e;
  }
  return { status: "SIGNED_CANDIDATE_NOT_PUBLISHED", version, sourceSha,
    archiveSha256: verified.archiveSha256 };
}
if (require.main === module) {
  try {
    const version = option("--version");
    const sourceSha = option("--source");
    const dist = path.resolve(option("--dist"));
    console.log("[voice-sign] " + JSON.stringify(signApprovedCandidate(dist, version, sourceSha)));
  } catch (e) {
    console.error("[voice-sign] REFUSED: " + e.message);
    process.exitCode = 1;
  }
}
module.exports = { signApprovedCandidate };
