"use strict";
// #732: no v6.1+ extension release may ship an absent or changed publisher pin.
// Source key presence proves packaging consistency, not owner authorization.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REL = "dist/extension/publisher-public-key.pem";
const PACKAGED = "extension/" + REL;
function requiresPublisherPin(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  assert.ok(match, "voice publisher release gate: strict numeric version required");
  const [major, minor] = match.slice(1).map(Number);
  return major > 6 || (major === 6 && minor >= 1);
}
function readApprovedPin(root) {
  const file = path.join(root, "src", "voice-pack", "publisher-public-key.pem");
  let st;
  try { st = fs.lstatSync(file); }
  catch { throw new Error("voice publisher release gate: approved public key missing"); }
  assert.ok(st.isFile() && !st.isSymbolicLink() && st.size > 0 &&
    st.size <= 8192, "voice publisher release gate: unsafe public key");
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, st.size, "voice publisher release gate: key changed");
  let key;
  try { key = crypto.createPublicKey(bytes); }
  catch { throw new Error("voice publisher release gate: invalid Ed25519 SPKI"); }
  assert.equal(key.asymmetricKeyType, "ed25519",
    "voice publisher release gate: wrong publisher key algorithm");
  return { bytes, id: "sha256:" + crypto.createHash("sha256").update(
    key.export({ type: "spki", format: "der" })).digest("hex") };
}
function requirePublisherPinForRelease(version, options = {}) {
  if (!requiresPublisherPin(version)) return { required: false };
  const root = options.extensionRoot || path.resolve(__dirname, "..");
  const { bytes, id } = readApprovedPin(root);
  if (options.archiveEntries !== undefined) {
    const entries = options.archiveEntries.split(/\r?\n/);
    assert.equal(entries.filter(e => e === PACKAGED).length, 1,
      "voice publisher release gate: VSIX must contain exactly one publisher key");
    assert.equal(typeof options.readPackageBytes, "function",
      "voice publisher release gate: archive reader required");
    const packaged = options.readPackageBytes(PACKAGED);
    assert.ok(Buffer.isBuffer(packaged) && bytes.equals(packaged),
      "voice publisher release gate: packaged key differs from reviewed source");
  }
  return { required: true, publisherKeyId: id };
}
module.exports = { requirePublisherPinForRelease, requiresPublisherPin };
