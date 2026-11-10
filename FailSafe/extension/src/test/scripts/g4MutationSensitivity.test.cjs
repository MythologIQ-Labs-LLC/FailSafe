"use strict";
/**
 * G4 (#638) mutation sensitivity: each security check has a falsification
 * fixture that becomes ACCEPTED if that one check is removed.
 *
 * This is a regression gate, not a substitute for independent audit or real
 * TPM/TSA acceptance. No production key or network TSA is used.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { witnessImprint, sha256 } = require("../../../scripts/lib/g4/bytes.cjs");
const { createTestSigner } = require("./g4TestPki.cjs");
const S = require("./g4Scenario.cjs");

const LIB = path.resolve(__dirname, "../../../scripts/lib/g4");
const VERIFIER = require.resolve("../../../scripts/lib/g4/verify.cjs");
const found = ts.findOpenssl();
let base;
let keyB;

before(async () => {
  assert.ok(found, "G4 mutation qualification requires OpenSSL; must not silently skip");
  base = await S.buildBase(found.bin);
  keyB = createTestSigner(found.bin, path.join(base.work, "mutation-key-b"), "mutation-B");
});
after(() => {
  if (base) fs.rmSync(base.work, { recursive: true, force: true });
});

/**
 * Replace exactly one check and load the verifier against that mutant.
 * Restore Node's module cache even if the mutant throws. Each fixture must
 * first REFUSE under the original verifier and PASS under the mutant.
 */
function runMutant(filename, needle, replacement, repoRoot, options = {}) {
  const target = path.join(LIB, filename);
  const original = fs.readFileSync(target, "utf8");
  assert.equal(original.split(needle).length - 1, 1,
    filename + ": expected exactly one targeted check; a removed/changed guard is a test failure");
  const oldTarget = require.cache[target];
  const oldVerifier = require.cache[VERIFIER];
  try {
    const mutant = new Module(target, module);
    mutant.filename = target;
    mutant.paths = Module._nodeModulePaths(path.dirname(target));
    mutant._compile(original.replace(needle, replacement), target);
    require.cache[target] = mutant;
    if (target !== VERIFIER) delete require.cache[VERIFIER];
    return require(VERIFIER).verifyCheckpoints({ repoRoot, ...options });
  } finally {
    if (oldTarget) require.cache[target] = oldTarget;
    else delete require.cache[target];
    if (oldVerifier) require.cache[VERIFIER] = oldVerifier;
    else delete require.cache[VERIFIER];
  }
}

function expectKill(repoRoot, expectedCode, filename, needle, replacement, options = {}) {
  const safe = S.verify(repoRoot, options);
  assert.equal(safe.verdict, "REFUSED", "original verifier must refuse: " + safe.code);
  assert.equal(safe.code, expectedCode, "wrong refusal: " + safe.detail);
  const unsafe = runMutant(filename, needle, replacement, repoRoot, options);
  assert.equal(unsafe.verdict, "PASS",
    filename + ": deletion of the targeted check was NOT detected by the fixture: " +
    unsafe.verdict + " " + unsafe.code + " " + unsafe.detail);
}

test("mutation 1: signature verification is essential even with a valid matching TSA token", async () => {
  const dir = S.copyRepo(base);
  const cp = S.cpDir(dir, "g4-000002");
  const manifest = fs.readFileSync(path.join(cp, layout.FILES.manifest));
  const badSignature = keyB.sign(manifest);
  fs.writeFileSync(path.join(cp, layout.FILES.signature), badSignature);
  const query = path.join(base.work, "mutation-signature.tsq");
  ts.buildQuery(found.bin, witnessImprint(manifest, badSignature), query);
  fs.writeFileSync(path.join(cp, layout.FILES.token),
    await base.tsa.request(fs.readFileSync(query)));
  ts.extractChain(found.bin, path.join(cp, layout.FILES.token),
    path.join(cp, layout.FILES.chain));
  expectKill(dir, "SIGNATURE_INVALID", "verify-witness.cjs",
    "  checkSignature(m, files, certInfo);", "  /* mutant: signature check removed */");
});

test("mutation 2: OpenSSL token/imprint verification is essential", () => {
  const dir = S.copyRepo(base);
  for (const f of [layout.FILES.token, layout.FILES.chain]) {
    fs.copyFileSync(path.join(S.cpDir(dir, "g4-000001"), f),
      path.join(S.cpDir(dir, "g4-000002"), f));
  }
  expectKill(dir, "TOKEN_IMPRINT_MISMATCH", "verify-witness.cjs",
    "  if (!r.ok) {", "  if (false) {");
});

test("mutation 3: HEAD must preserve every previously attested ledger byte", () => {
  const dir = S.copyRepo(base);
  const p = path.join(dir, layout.LEDGER_PATH);
  const original = fs.readFileSync(p, "utf8");
  assert.ok(original.includes("**Verdict**: PUBLISHED"), "ledger fixture marker absent");
  fs.writeFileSync(p, original.replace("**Verdict**: PUBLISHED", "**Verdict**: VETO"));
  S.commitAll(dir, "mutate HEAD ledger after last checkpoint");
  expectKill(dir, "PREFIX_BROKEN", "verify.cjs",
    "  checkHeadLedger(ctx, last);", "  /* mutant: HEAD ledger prefix check removed */");
});

test("mutation 4: a transient registry rollback matters even when HEAD restores the correct bytes", () => {
  const dir = S.copyRepo(base);
  const original = fs.readFileSync(path.join(dir, layout.REGISTRY_PATH));
  const notice = {
    fingerprintSha256: keyB.fingerprint,
    effectiveUtc: "2026-11-10T00:00:00Z",
    reason: "mutation-test"
  };
  S.write(dir, layout.REGISTRY_PATH, S.registryBytes(2, [notice]));
  S.commitAll(dir, "registry v2");
  S.write(dir, layout.REGISTRY_PATH, original);
  S.commitAll(dir, "restore v1 after illegal rollback");
  expectKill(dir, "REGISTRY_ROLLBACK", "verify.cjs",
    "  registry.assertGitHistoryMonotonic(repoRoot, layout.REGISTRY_PATH);",
    "  /* mutant: registry history enforcement removed */");
});

test("mutation 5: a new recognized key cannot reset the chain silently", async () => {
  const dir = S.copyRepo(base);
  S.addKey(dir, keyB);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "add key B and append");
  await S.forgeNext(dir, base, { signer: keyB });
  expectKill(dir, "KEY_RESET", "verify-witness.cjs",
    "  if (prev && prev.fingerprint !== fp) {", "  if (false) {");
});

test("mutation 6: independently pinned checkpoint HEAD must reject truncation", () => {
  const dir = S.copyRepo(base);
  const manifest = fs.readFileSync(path.join(S.cpDir(dir, "g4-000002"), layout.FILES.manifest));
  const trustedHead = "g4-000002:" + sha256(manifest);
  fs.rmSync(S.cpDir(dir, "g4-000002"), { recursive: true });
  S.commitAll(dir, "delete latest checkpoint");
  expectKill(dir, "HEAD_MISMATCH", "verify.cjs",
    "  if (last.id !== id || sha256(last.manifestBytes) !== digest) {",
    "  if (false) {", { trustedHead });
});
