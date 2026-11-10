"use strict";
/**
 * G4 (#638) release mode, audit VETO #933: the evidence files a release
 * verification reads from the checkout must be the committed blobs (git status
 * can be told to look away), a flag must never be swallowed as a value, the
 * result must carry its mode, and replace refs must not hide a tampered ledger.
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

function expectVerdict(r, verdict, code) {
  assert.equal(r.verdict, verdict, `expected ${verdict} ${code}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.code, code, `expected ${code}, got ${r.code}: ${r.detail}`);
}

function releaseInputs(dir) {
  const manifest = fs.readFileSync(path.join(S.cpDir(dir, base.cp2.id), layout.FILES.manifest));
  return { release: true, trustFingerprint: base.signer.fingerprint, trustedHead: `${base.cp2.id}:${sha256(manifest)}`,
    repository: "test/failsafe-g4", expectedCommit: S.git(dir, "rev-parse", "HEAD") };
}

function cliArgs(dir, i) {
  return [CLI, "--repo-root", dir, "--release", "--trust-fingerprint", i.trustFingerprint, "--trusted-head", i.trustedHead,
    "--repository", i.repository, "--commit", i.expectedCommit];
}

/** Flip one byte of the committed token, keeping its size. Returns the paths. */
function corruptToken(dir) {
  const rel = path.posix.join(layout.CHECKPOINTS_DIR, base.cp2.id, layout.FILES.token);
  const abs = path.join(dir, rel);
  const stat = fs.statSync(abs);
  const bytes = fs.readFileSync(abs);
  bytes[bytes.length - 1] ^= 0xff;
  fs.writeFileSync(abs, bytes);
  return { rel, abs, stat };
}

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

for (const flag of ["--skip-worktree", "--assume-unchanged"]) {
  it(`--release refuses a checkpoint file changed behind git update-index ${flag}`, () => {
    const dir = S.copyRepo(base);
    const inputs = releaseInputs(dir);
    const { rel } = corruptToken(dir);
    S.git(dir, "update-index", flag, rel);
    assert.equal(S.git(dir, "status", "--porcelain"), "", "git status must be blind to this change for the test to mean anything");
    const r = S.verify(dir, inputs);
    expectVerdict(r, "REFUSED", "RELEASE_TREE_MISMATCH");
    assert.match(r.detail, /g4-000002/);
  });
}

it("--release refuses a same-size swap of a checkpoint file with its mtime restored", () => {
  const dir = S.copyRepo(base);
  const inputs = releaseInputs(dir);
  S.git(dir, "status", "--porcelain");
  const { rel, abs, stat } = corruptToken(dir);
  fs.utimesSync(abs, stat.atime, stat.mtime);
  // Timestamp restoration can still be detected by git on other platforms.
  // Hide the modified tracked blob deliberately to exercise byte binding.
  S.git(dir, "update-index", "--assume-unchanged", rel);
  assert.equal(S.git(dir, "status", "--porcelain"), "", "test requires git status to be blind");
  expectVerdict(S.verify(dir, inputs), "REFUSED", "RELEASE_TREE_MISMATCH");
});

it("--release refuses a certificate file that differs from the committed blob", () => {
  const dir = S.copyRepo(base);
  const inputs = releaseInputs(dir);
  const rel = path.posix.join(layout.KEYS_DIR, `${base.signer.fingerprint}.cer`);
  fs.appendFileSync(path.join(dir, rel), Buffer.from([0]));
  S.git(dir, "update-index", "--skip-worktree", rel);
  expectVerdict(S.verify(dir, inputs), "REFUSED", "RELEASE_TREE_MISMATCH");
});

it("--release is BLOCKED on a git-ignored file under tools/g4 outside the checkpoints", () => {
  const dir = S.copyRepo(base);
  S.write(dir, ".gitignore", Buffer.from("*.ignored\n"));
  S.commitAll(dir, "ignore rule");
  const inputs = releaseInputs(dir);
  fs.writeFileSync(path.join(dir, layout.KEYS_DIR, "extra.ignored"), "x");
  expectVerdict(S.verify(dir, inputs), "BLOCKED", "RELEASE_TREE_DIRTY");
});

it("--release reports a malformed commit or repository as malformed", () => {
  const dir = S.copyRepo(base);
  const good = releaseInputs(dir);
  const bad = S.verify(dir, { ...good, expectedCommit: "HEAD" });
  expectVerdict(bad, "BLOCKED", "RELEASE_INPUT_MALFORMED");
  assert.match(bad.detail, /expectedCommit/);
  const repo = S.verify(dir, { ...good, repository: "no-slash" });
  expectVerdict(repo, "BLOCKED", "RELEASE_INPUT_MALFORMED");
  assert.match(repo.detail, /repository/);
});

it("the result and the CLI output carry the mode, so a diagnostic PASS cannot pass for release evidence", () => {
  const dir = S.copyRepo(base);
  assert.equal(S.verify(dir, releaseInputs(dir)).mode, "release");
  assert.equal(S.verify(dir).mode, "diagnostic");
  const rel = spawnSync(process.execPath, cliArgs(dir, releaseInputs(dir)), { encoding: "utf8" });
  assert.equal(rel.status, 0, rel.stdout + rel.stderr);
  assert.match(rel.stdout, /\[g4-verify\] mode: release\n/);
  const diag = spawnSync(process.execPath, [CLI, "--repo-root", dir], { encoding: "utf8" });
  assert.match(diag.stdout, /\[g4-verify\] mode: diagnostic \(NOT release evidence\)\n/);
});

it("CLI: a flag is never swallowed as another flag's value (--commit --release)", () => {
  const dir = S.copyRepo(base);
  const i = releaseInputs(dir);
  fs.appendFileSync(path.join(dir, layout.LEDGER_PATH), "\nuncommitted\n");
  const r = spawnSync(process.execPath, [CLI, "--repo-root", dir, "--trust-fingerprint", i.trustFingerprint,
    "--trusted-head", i.trustedHead, "--repository", i.repository, "--commit", "--release"], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--commit needs a value/);
  assert.doesNotMatch(r.stdout, /PASS/);
});

it("a replace ref cannot hide a tampered ledger at HEAD", () => {
  const dir = S.copyRepo(base);
  const ledger = path.join(dir, layout.LEDGER_PATH);
  const original = S.git(dir, "rev-parse", `HEAD:${layout.LEDGER_PATH}`);
  const bytes = fs.readFileSync(ledger);
  bytes[100] ^= 0x01;
  fs.writeFileSync(ledger, bytes);
  S.commitAll(dir, "tamper an early ledger byte");
  expectVerdict(S.verify(dir), "REFUSED", "PREFIX_BROKEN");
  S.git(dir, "replace", S.git(dir, "rev-parse", `HEAD:${layout.LEDGER_PATH}`), original);
  expectVerdict(S.verify(dir), "REFUSED", "PREFIX_BROKEN");
});
