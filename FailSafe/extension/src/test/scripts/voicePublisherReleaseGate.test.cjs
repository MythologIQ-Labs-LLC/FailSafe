"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { requiresPublisherPin, requirePublisherPinForRelease } =
  require("../../../scripts/voice-publisher-release-gate.cjs");
const ENTRY = "extension/dist/extension/publisher-public-key.pem";

function fixture(run) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "voice-publisher-gate-"));
  try {
    const dest = path.join(root, "src", "voice-pack");
    fs.mkdirSync(dest, { recursive: true });
    const file = path.join(dest, "publisher-public-key.pem");
    const pair = crypto.generateKeyPairSync("ed25519");
    const bytes = Buffer.from(pair.publicKey.export({ type: "spki", format: "pem" }));
    run({ root, file, bytes });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const allowed = bytes => ({ archiveEntries: ENTRY + "\n",
  readPackageBytes: () => bytes });

test("v6.0.13 remains a frozen, unaffected legacy release", () => {
  assert.equal(requiresPublisherPin("6.0.13"), false);
  assert.equal(requirePublisherPinForRelease("6.0.13", {
    extensionRoot: "/no/owner/key" }).required, false);
});
test("v6.1.0 and later releases require publisher verification", () => {
  for (const v of ["6.1.0", "6.9.1", "7.0.0"]) assert.equal(requiresPublisherPin(v), true);
  assert.throws(() => requiresPublisherPin("6.1.0-voice"), /strict numeric version/);
});
test("a v6.1 release without owner public key cannot pass source preflight", () =>
  fixture(({ root }) => {
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root }), /approved public key missing/);
  }));
test("only a bounded regular Ed25519 public key can authorize packaging", () =>
  fixture(({ root, file, bytes }) => {
    fs.writeFileSync(file, bytes);
    assert.match(requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root }).publisherKeyId, /^sha256:[a-f0-9]{64}$/);
    fs.writeFileSync(file, "garbage");
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root }), /invalid Ed25519 SPKI/);
    fs.writeFileSync(file, crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
      .publicKey.export({ type: "spki", format: "pem" }));
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root }), /wrong publisher key algorithm/);
  }));
test("a symlinked public key is refused even if it points to valid bytes", {
  skip: process.platform === "win32" }, () =>
  fixture(({ root, file, bytes }) => {
    const elsewhere = path.join(root, "external.pem");
    fs.writeFileSync(elsewhere, bytes);
    fs.symlinkSync(elsewhere, file);
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root }), /unsafe public key/);
  }));
test("shipping a v6.1 VSIX without its public key is refused", () =>
  fixture(({ root, file, bytes }) => {
    fs.writeFileSync(file, bytes);
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root, archiveEntries: "", readPackageBytes: () => bytes }),
    /must contain exactly one publisher key/);
  }));
test("a duplicate key entry in the archive is refused", () =>
  fixture(({ root, file, bytes }) => {
    fs.writeFileSync(file, bytes);
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root, archiveEntries: ENTRY + "\n" + ENTRY + "\n",
      readPackageBytes: () => bytes }), /must contain exactly one publisher key/);
  }));
test("packaged key must match exact source bytes, not just Ed25519 algorithm", () =>
  fixture(({ root, file, bytes }) => {
    fs.writeFileSync(file, bytes);
    const other = crypto.generateKeyPairSync("ed25519").publicKey
      .export({ type: "spki", format: "pem" });
    assert.throws(() => requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root, ...allowed(Buffer.from(other)) }),
    /packaged key differs from reviewed source/);
  }));
test("approved key matches the actual bytes shipped inside the VSIX", () =>
  fixture(({ root, file, bytes }) => {
    fs.writeFileSync(file, bytes);
    const checked = requirePublisherPinForRelease("6.1.0", {
      extensionRoot: root, ...allowed(bytes) });
    assert.equal(checked.required, true);
    assert.match(checked.publisherKeyId, /^sha256:[a-f0-9]{64}$/);
  }));
