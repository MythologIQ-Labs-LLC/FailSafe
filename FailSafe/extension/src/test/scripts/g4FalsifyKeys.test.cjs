"use strict";
/**
 * G4 (#638) falsification: keys, key windows, key reset, revocation registry.
 * TEST ONLY keys: ephemeral software P-256 keys from g4TestPki.cjs.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { sha256 } = require("../../../scripts/lib/g4/bytes.cjs");
const { createTestSigner } = require("./g4TestPki.cjs");
const S = require("./g4Scenario.cjs");
const { stampRegistry } = require("../../../scripts/lib/g4/records.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const DAY = 86400e3;

function refused(r, code) {
  assert.notEqual(r.verdict, "PASS", `expected refusal ${code}, got PASS`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
}

const notice = (fp, effectiveMs, reason = "test") => ({ fingerprintSha256: fp, effectiveUtc: new Date(effectiveMs).toISOString(), reason });

function setRegistry(dir, version, revocations, msg) {
  S.write(dir, layout.REGISTRY_PATH, S.registryBytes(version, revocations));
  return S.commitAll(dir, msg);
}

/** A registry version with its independent notice token, as owner item 7 requires. */
async function setStampedRegistry(dir, version, revocations, msg) {
  setRegistry(dir, version, revocations, msg);
  await stampRegistry({ repoRoot: dir, tsa: base.tsa });
  return S.commitAll(dir, `${msg}: notice token`);
}

const it = (name, fn) => test(name, { skip }, fn);

let base;
let keyB;
before(async () => {
  if (skip) return;
  base = await S.buildBase(found.bin);
  keyB = createTestSigner(found.bin, path.join(base.work, "keys-b"), "B");
});
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

it("wrong key: cp2 signature replaced by another key's signature over the same manifest", () => {
  const dir = S.copyRepo(base);
  const cp = S.cpDir(dir, "g4-000002");
  const manifest = fs.readFileSync(path.join(cp, layout.FILES.manifest));
  fs.writeFileSync(path.join(cp, layout.FILES.signature), keyB.sign(manifest));
  refused(S.verify(dir), "SIGNATURE_INVALID");
});

it("unknown key: a new checkpoint signed by a key with no committed certificate", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append");
  await S.forgeNext(dir, base, { signer: keyB });
  refused(S.verify(dir), "KEY_UNKNOWN");
});

it("key reset: a new key's certificate committed, then used for the next checkpoint", async () => {
  const dir = S.copyRepo(base);
  S.addKey(dir, keyB);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "new key + append");
  await S.forgeNext(dir, base, { signer: keyB });
  refused(S.verify(dir), "KEY_RESET");
});

it("key reset by full re-genesis: undetectable unpinned; refused with a pinned key or trusted head", async () => {
  const dir = S.copyRepo(base);
  const head = `g4-000002:${sha256(fs.readFileSync(path.join(base.cp2.dir, layout.FILES.manifest)))}`;
  fs.rmSync(path.join(dir, layout.CHECKPOINTS_DIR), { recursive: true, force: true });
  S.addKey(dir, keyB);
  S.commitAll(dir, "drop checkpoints, add key B");
  await S.checkpoint(dir, base.tsa, keyB);
  const unpinned = S.verify(dir);
  assert.equal(unpinned.verdict, "PASS", "recorded limitation: without an external anchor, a re-genesis verifies");
  refused(S.verify(dir, { trustFingerprint: base.signer.fingerprint }), "KEY_UNTRUSTED");
  refused(S.verify(dir, { trustedHead: head }), "HEAD_MISMATCH");
});

it("pinned trust: the real chain is refused when a different key is pinned", () => {
  refused(S.verify(base.repo, { trustFingerprint: keyB.fingerprint }), "KEY_UNTRUSTED");
});

it("revoked key: revocation effective before the checkpoints' token times", async () => {
  const dir = S.copyRepo(base);
  await setStampedRegistry(dir, 2, [notice(base.signer.fingerprint, Date.now() - DAY)], "revoke A");
  refused(S.verify(dir), "KEY_REVOKED");
});

it("revocation effective after the checkpoints: they stay valid, marked as predating it", async () => {
  const dir = S.copyRepo(base);
  await new Promise((r) => setTimeout(r, 1100));
  await setStampedRegistry(dir, 2, [notice(base.signer.fingerprint, Date.now())], "revoke A later");
  const r = S.verify(dir);
  assert.equal(r.verdict, "PASS", r.detail);
  assert.match(r.checkpoints[0].revocation, /predates revocation/);
});

it("expired key window: token time after the certificate's notAfter", async () => {
  const dir = path.join(base.work, "expired");
  fs.mkdirSync(dir);
  const expired = createTestSigner(found.bin, path.join(base.work, "keys-e"), "E", { notBeforeMs: Date.now() - 2 * DAY, notAfterMs: Date.now() - 3600e3 });
  S.initRepo(dir, base.tsa, expired);
  await S.checkpoint(dir, base.tsa, expired);
  refused(S.verify(dir), "KEY_WINDOW");
});

it("not-yet-valid key window: token time before the certificate's notBefore", async () => {
  const dir = path.join(base.work, "future");
  fs.mkdirSync(dir);
  const early = createTestSigner(found.bin, path.join(base.work, "keys-f"), "F", { notBeforeMs: Date.now() + DAY, notAfterMs: Date.now() + 2 * DAY });
  S.initRepo(dir, base.tsa, early);
  await S.checkpoint(dir, base.tsa, early);
  refused(S.verify(dir), "KEY_WINDOW");
});

it("revocation registry deleted", () => {
  const dir = S.copyRepo(base);
  fs.rmSync(path.join(dir, layout.REGISTRY_PATH));
  S.commitAll(dir, "delete registry");
  refused(S.verify(dir), "REGISTRY_MISSING");
});

it("revocation registry edited without a version bump", () => {
  const dir = S.copyRepo(base);
  setRegistry(dir, 1, [notice(keyB.fingerprint, Date.now())], "silent edit");
  refused(S.verify(dir), "REGISTRY_EDITED");
});

it("an earlier revocation notice removed under a version bump", () => {
  const dir = S.copyRepo(base);
  setRegistry(dir, 2, [notice(keyB.fingerprint, Date.now())], "v2");
  setRegistry(dir, 3, [], "v3 drops the v2 notice");
  refused(S.verify(dir), "REGISTRY_EDITED");
});

it("registry rolled back after a checkpoint bound the newer version, plus a new valid checkpoint", async () => {
  const dir = S.copyRepo(base);
  setRegistry(dir, 2, [notice(keyB.fingerprint, Date.now())], "v2");
  await S.checkpoint(dir, base.tsa, base.signer);
  setRegistry(dir, 1, [], "roll back to v1");
  await S.forgeNext(dir, base);
  refused(S.verify(dir), "REGISTRY_ROLLBACK");
});

it("a checkpoint binding a registry digest the commit does not hold", async () => {
  const dir = S.copyRepo(base);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "append");
  await S.forgeNext(dir, base, { mutate: (m) => { m.revocationRegistry.sha256 = "1".repeat(64); } });
  refused(S.verify(dir), "REGISTRY_MISMATCH");
});
