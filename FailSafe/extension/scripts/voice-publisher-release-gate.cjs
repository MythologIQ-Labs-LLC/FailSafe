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
  let before;
  try { before = fs.lstatSync(file); }
  catch { throw new Error("voice publisher release gate: approved public key missing"); }
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size > 0 &&
    before.size <= 8192, "voice publisher release gate: unsafe public key");
  const flags = fs.constants.O_RDONLY |
    (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  let fd;
  try { fd = fs.openSync(file, flags); }
  catch { throw new Error("voice publisher release gate: unable to open regular key"); }
  let bytes;
  try {
    const now = fs.fstatSync(fd);
    assert.ok(now.isFile() && now.size === before.size &&
      now.dev === before.dev && now.ino === before.ino,
    "voice publisher release gate: key changed during inspection");
    bytes = Buffer.alloc(now.size);
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (n === 0) throw new Error("voice publisher release gate: key truncated");
      offset += n;
    }
    assert.equal(fs.readSync(fd, Buffer.alloc(1), 0, 1, null), 0,
      "voice publisher release gate: key grew during inspection");
  } finally { fs.closeSync(fd); }
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
