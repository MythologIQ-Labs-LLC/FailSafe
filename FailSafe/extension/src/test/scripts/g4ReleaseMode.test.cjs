"use strict";
/**
 * G4 (#638) release-mode enforcement (audit #931 N-b, N5): `--release` must be
 * unable to PASS without the out-of-band trust inputs, on anything but a clean
 * checkout of the exact qualified commit, or with any test-only override.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { sha256 } = require("../../../scripts/lib/g4/bytes.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const CLI = path.resolve(__dirname, "..", "..", "..", "scripts", "g4-verify-checkpoint.cjs");
const REPOSITORY = "test/failsafe-g4";

function expectVerdict(r, verdict, code) {
  assert.equal(r.verdict, verdict, `expected ${verdict} ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
}

/** The complete, correct release inputs for a repository copy. */
function releaseInputs(dir) {
  const manifest = fs.readFileSync(path.join(S.cpDir(dir, base.cp2.id), layout.FILES.manifest));
  return {
    release: true,
    trustFingerprint: base.signer.fingerprint,
    trustedHead: `${base.cp2.id}:${sha256(manifest)}`,
    repository: REPOSITORY,
    expectedCommit: S.git(dir, "rev-parse", "HEAD"),
  };
}

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

it("control: --release with every trust input on a clean exact checkout passes with no limitation", () => {
  const dir = S.copyRepo(base);
  const r = S.verify(dir, releaseInputs(dir));
  expectVerdict(r, "PASS", "OK");
  assert.deepEqual(r.limitations, []);
});

for (const missing of ["trustFingerprint", "trustedHead", "repository", "expectedCommit"]) {
  it(`--release without ${missing} is BLOCKED and names it`, () => {
    const dir = S.copyRepo(base);
    const inputs = releaseInputs(dir);
    delete inputs[missing];
    const r = S.verify(dir, inputs);
    expectVerdict(r, "BLOCKED", "RELEASE_INPUT_MISSING");
    assert.match(r.detail, new RegExp(missing));
  });
}

it("--release with a malformed fingerprint or head is BLOCKED, never treated as absent", () => {
  const dir = S.copyRepo(base);
  expectVerdict(S.verify(dir, { ...releaseInputs(dir), trustFingerprint: "abc" }), "BLOCKED", "RELEASE_INPUT_MALFORMED");
  expectVerdict(S.verify(dir, { ...releaseInputs(dir), trustedHead: base.cp2.id }), "BLOCKED", "RELEASE_INPUT_MALFORMED");
});

it("--release refuses a wrong owner fingerprint, external head or repository", () => {
  const dir = S.copyRepo(base);
  const good = releaseInputs(dir);
  expectVerdict(S.verify(dir, { ...good, trustFingerprint: "0".repeat(64) }), "REFUSED", "KEY_UNTRUSTED");
  expectVerdict(S.verify(dir, { ...good, trustedHead: `${base.cp2.id}:${"0".repeat(64)}` }), "REFUSED", "HEAD_MISMATCH");
  expectVerdict(S.verify(dir, { ...good, repository: "MythologIQ-Labs-LLC/FailSafe" }), "REFUSED", "REPOSITORY_MISMATCH");
});

it("--release refuses a checkout that is not the exact qualified commit", () => {
  const dir = S.copyRepo(base);
  const inputs = releaseInputs(dir);
  S.appendEntry(dir, 928);
  S.commitAll(dir, "later commit");
  expectVerdict(S.verify(dir, inputs), "REFUSED", "RELEASE_COMMIT_MISMATCH");
});

it("--release is BLOCKED on a modified tracked file", () => {
  const dir = S.copyRepo(base);
  const inputs = releaseInputs(dir);
  fs.appendFileSync(path.join(dir, layout.LEDGER_PATH), "\nuncommitted\n");
  const r = S.verify(dir, inputs);
  expectVerdict(r, "BLOCKED", "RELEASE_TREE_DIRTY");
  assert.match(r.detail, /META_LEDGER\.md/);
});

it("--release is BLOCKED on an untracked file planted beside the checkpoints", () => {
  const dir = S.copyRepo(base);
  const inputs = releaseInputs(dir);
  fs.writeFileSync(path.join(S.cpDir(dir, base.cp2.id), "planted.bin"), "x");
  expectVerdict(S.verify(dir, inputs), "BLOCKED", "RELEASE_TREE_DIRTY");
});

it("--release is BLOCKED on a git-ignored file under tools/g4", () => {
  const dir = S.copyRepo(base);
  S.write(dir, ".gitignore", Buffer.from("*.ignored\n"));
  S.commitAll(dir, "ignore rule");
  const inputs = releaseInputs(dir);
  fs.writeFileSync(path.join(dir, layout.CHECKPOINTS_DIR, "extra.ignored"), "x");
  expectVerdict(S.verify(dir, inputs), "BLOCKED", "RELEASE_TREE_DIRTY");
});

it("--release refuses the --checkpoints and --tsa-ca overrides", () => {
  const dir = S.copyRepo(base);
  const inputs = releaseInputs(dir);
  expectVerdict(S.verify(dir, { ...inputs, checkpointsDir: path.join(dir, layout.CHECKPOINTS_DIR) }), "BLOCKED", "RELEASE_OVERRIDE_REFUSED");
  expectVerdict(S.verify(dir, { ...inputs, tsaCaFile: path.join(base.work, "tsa", "ca.crt") }), "BLOCKED", "TSA_OVERRIDE_NOT_RELEASE");
});

it("without --release the same repository still verifies and reports the unanchored limitation", () => {
  const r = S.verify(base.repo);
  expectVerdict(r, "PASS", "OK");
  assert.match(r.limitations.join("\n"), /not externally anchored/);
});

it("CLI: --release without inputs exits 2; with --commit and all inputs exits 0", () => {
  const dir = S.copyRepo(base);
  const i = releaseInputs(dir);
  const bare = spawnSync(process.execPath, [CLI, "--repo-root", dir, "--release"], { encoding: "utf8" });
  assert.equal(bare.status, 2, bare.stdout + bare.stderr);
  assert.match(bare.stdout, /BLOCKED RELEASE_INPUT_MISSING/);
  const full = spawnSync(process.execPath, [CLI, "--repo-root", dir, "--release", "--trust-fingerprint", i.trustFingerprint,
    "--trusted-head", i.trustedHead, "--repository", i.repository, "--commit", i.expectedCommit], { encoding: "utf8" });
  assert.equal(full.status, 0, full.stdout + full.stderr);
  assert.match(full.stdout, /PASS OK/);
});
