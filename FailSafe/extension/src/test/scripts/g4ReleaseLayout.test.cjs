"use strict";
/**
 * G4 (#638) release mode, audits #936/#937 note N6: the verifier itself did not
 * reject extra paths, a missing timestamp query, or non-regular entries under
 * tools/g4/checkpoints; only the operator's Git checks did. A release
 * verification now refuses any committed checkpoint tree that is not exactly
 * five regular files per g4-NNNNNN directory.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../../scripts/lib/g4/timestamp.cjs");
const layout = require("../../../scripts/lib/g4/layout.cjs");
const { sha256 } = require("../../../scripts/lib/g4/bytes.cjs");
const S = require("./g4Scenario.cjs");

const found = ts.findOpenssl();
const skip = found ? false : "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run";
const it = (name, fn) => test(name, { skip }, fn);
const CODE = "RELEASE_EVIDENCE_LAYOUT";

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

/** Release inputs for the current HEAD of `dir` (the head pin is cp2's manifest). */
function releaseInputs(dir) {
  const manifest = fs.readFileSync(path.join(S.cpDir(dir, base.cp2.id), layout.FILES.manifest));
  return { release: true, trustFingerprint: base.signer.fingerprint, trustedHead: `${base.cp2.id}:${sha256(manifest)}`,
    repository: "test/failsafe-g4", expectedCommit: S.git(dir, "rev-parse", "HEAD") };
}

function expectLayoutRefusal(dir, pattern) {
  assert.equal(S.git(dir, "status", "--porcelain", "--untracked-files=all"), "", "the checkout must be clean, so only the layout check can refuse");
  const r = S.verify(dir, releaseInputs(dir));
  assert.equal(r.verdict, "REFUSED", `expected REFUSED ${CODE}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.code, CODE, r.detail);
  assert.match(r.detail, pattern);
}

const inCp2 = (name) => path.posix.join(layout.CHECKPOINTS_DIR, base.cp2.id, name);

it("control: the unmodified base still PASSES a release verification", () => {
  const dir = S.copyRepo(base);
  const r = S.verify(dir, releaseInputs(dir));
  assert.equal(r.verdict, "PASS", `${r.code}: ${r.detail}`);
  assert.deepEqual(r.limitations, []);
});

it("--release refuses an extra committed file inside a checkpoint directory", () => {
  const dir = S.copyRepo(base);
  S.write(dir, inCp2("notes.txt"), Buffer.from("extra\n"));
  S.commitAll(dir, "extra file in checkpoint");
  expectLayoutRefusal(dir, /notes\.txt/);
});

it("--release refuses a committed file directly under tools/g4/checkpoints", () => {
  const dir = S.copyRepo(base);
  S.write(dir, path.posix.join(layout.CHECKPOINTS_DIR, "README.md"), Buffer.from("stray\n"));
  S.commitAll(dir, "stray file");
  expectLayoutRefusal(dir, /README\.md/);
});

it("--release refuses a nested path and a directory that is not g4-NNNNNN", () => {
  const nested = S.copyRepo(base);
  S.write(nested, inCp2("sub/manifest.json"), Buffer.from("{}\n"));
  S.commitAll(nested, "nested");
  expectLayoutRefusal(nested, /sub\/manifest\.json/);
  const other = S.copyRepo(base);
  S.write(other, path.posix.join(layout.CHECKPOINTS_DIR, "g4-3", layout.FILES.manifest), Buffer.from("{}\n"));
  S.commitAll(other, "odd directory");
  expectLayoutRefusal(other, /g4-3\/manifest\.json/);
});

it("--release refuses a checkpoint whose timestamp query was removed", () => {
  const dir = S.copyRepo(base);
  S.git(dir, "rm", "-q", inCp2(layout.FILES.query));
  S.commitAll(dir, "drop the query");
  expectLayoutRefusal(dir, new RegExp(`${base.cp2.id}.*${layout.FILES.query.replace(".", "\\.")}`));
});

for (const [label, mode] of [["a symbolic link", "120000"], ["an executable file", "100755"]]) {
  it(`--release refuses ${label} in place of a checkpoint file`, () => {
    const dir = S.copyRepo(base);
    S.git(dir, "config", "core.symlinks", "false");
    S.git(dir, "config", "core.filemode", "false");
    const rel = inCp2(layout.FILES.chain);
    const blob = S.git(dir, "rev-parse", `HEAD:${rel}`);
    S.git(dir, "update-index", "--cacheinfo", `${mode},${blob},${rel}`);
    S.git(dir, "commit", "-q", "-m", `mode ${mode}`);
    assert.match(S.git(dir, "ls-tree", "HEAD", "--", rel), new RegExp(`^${mode} `));
    expectLayoutRefusal(dir, new RegExp(`${mode}.*${layout.FILES.chain.replace(".", "\\.")}`));
  });
}

it("--release refuses a submodule entry under tools/g4/checkpoints", () => {
  const dir = S.copyRepo(base);
  const rel = path.posix.join(layout.CHECKPOINTS_DIR, "g4-000009");
  S.git(dir, "update-index", "--add", "--cacheinfo", `160000,${S.git(dir, "rev-parse", "HEAD")},${rel}`);
  S.git(dir, "commit", "-q", "-m", "gitlink");
  const r = S.verify(dir, releaseInputs(dir));
  assert.equal(r.verdict, "REFUSED", `${r.code}: ${r.detail}`);
  assert.equal(r.code, CODE, r.detail);
  assert.match(r.detail, /160000/);
});

it("a diagnostic run is unchanged: the layout rule applies to release mode only", () => {
  const dir = S.copyRepo(base);
  S.write(dir, inCp2("notes.txt"), Buffer.from("extra\n"));
  S.commitAll(dir, "extra file in checkpoint");
  const r = S.verify(dir);
  assert.equal(r.mode, "diagnostic");
  assert.notEqual(r.code, CODE);
});
