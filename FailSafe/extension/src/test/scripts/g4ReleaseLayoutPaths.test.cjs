"use strict";
/**
 * G4 (#638) release mode, audit VETO on the first evidence-layout change:
 * B1 a tab inside a committed path was cut off before the checks ran;
 * B2 a path that differs from tools/g4/checkpoints only by letter case checks
 *    out into the real evidence directory on a case-insensitive filesystem,
 *    where every exact-path Git check missed it (a release PASS on Windows);
 * and Git could be pointed at another repository through its environment.
 * The trees are built in the index, so each case runs on every platform.
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
const CODE = "RELEASE_EVIDENCE_LAYOUT";
const CLI = path.resolve(__dirname, "..", "..", "..", "scripts", "g4-verify-checkpoint.cjs");
const ZERO = "0".repeat(40);

let base;
before(async () => { if (!skip) base = await S.buildBase(found.bin); });
after(() => { if (base) fs.rmSync(base.work, { recursive: true, force: true }); });

function releaseInputs(dir) {
  // The owner's head pin never changes: it is the manifest of the honest base, whatever `dir` now commits.
  const bytes = fs.readFileSync(path.join(S.cpDir(base.repo, base.cp2.id), layout.FILES.manifest));
  return { release: true, trustFingerprint: base.signer.fingerprint, trustedHead: `${base.cp2.id}:${sha256(bytes)}`,
    repository: "test/failsafe-g4", expectedCommit: S.git(dir, "rev-parse", "HEAD") };
}

/** Run git with stdin; NTFS path protection is off so any path can be committed. */
function gitIn(dir, input, ...args) {
  const r = spawnSync("git", ["-C", dir, "-c", "core.protectNTFS=false", ...args], { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Commit index changes: `add` maps a new path to the committed path whose blob it reuses; `drop` removes paths. */
function commitIndex(dir, { add = {}, drop = [] }) {
  const records = Object.entries(add).map(([to, from]) => `100644 ${S.git(dir, "rev-parse", `HEAD:${from}`)}\t${to}`)
    .concat(drop.map((p) => `0 ${ZERO}\t${p}`));
  gitIn(dir, records.map((r) => `${r}\0`).join(""), "update-index", "-z", "--index-info");
  gitIn(dir, "", "commit", "-q", "-m", "test: crafted tree");
}

function expectRefused(dir, pattern) {
  const r = S.verify(dir, releaseInputs(dir));
  assert.equal(r.verdict, "REFUSED", `expected REFUSED ${CODE}, got ${r.verdict} ${r.code}: ${r.detail}`);
  assert.equal(r.code, CODE, r.detail);
  assert.match(r.detail, pattern);
}

const cp = (name, id = base.cp2.id, root = layout.CHECKPOINTS_DIR) => `${root}/${id}/${name}`;
const allFiles = () => Object.values(layout.FILES);

it("a tab inside a committed path cannot hide an extra entry or a missing file", () => {
  const extra = S.copyRepo(base);
  commitIndex(extra, { add: { [cp("manifest.json\tx")]: cp("manifest.json") } });
  expectRefused(extra, /manifest\.json\\tx/);
  const swapped = S.copyRepo(base);
  commitIndex(swapped, { add: { [cp("timestamp.tsq\t")]: cp("timestamp.tsq") }, drop: [cp("timestamp.tsq")] });
  expectRefused(swapped, /timestamp\.tsq\\t/);
});

for (const root of ["tools/g4/Checkpoints", "Tools/g4/checkpoints", "tools/G4/checkpoints", "tools/g4/Keys"]) {
  it(`a path that differs from the evidence directories only by case is refused (${root})`, () => {
    const dir = S.copyRepo(base);
    commitIndex(dir, { add: { [`${root}/${base.cp2.id}/notes.txt`]: cp("manifest.json") } });
    expectRefused(dir, /only by case or Unicode form/);
  });
}

it("the head checkpoint moved to a case-variant directory, with its query dropped and extras added, is refused", () => {
  const dir = S.copyRepo(base);
  const alias = "tools/g4/Checkpoints";
  const add = Object.fromEntries(allFiles().filter((f) => f !== layout.FILES.query).map((f) => [cp(f, base.cp2.id, alias), cp(f)]));
  add[cp("notes.txt", base.cp2.id, alias)] = cp("manifest.json");
  commitIndex(dir, { add, drop: allFiles().map((f) => cp(f)) });
  expectRefused(dir, /only by case or Unicode form/);
});

it("a full-width look-alike of the evidence directory is refused", () => {
  const dir = S.copyRepo(base);
  commitIndex(dir, { add: { [`tools/g4/ｃheckpoints/${base.cp2.id}/manifest.json`]: cp("manifest.json") } });
  expectRefused(dir, /only by case or Unicode form/);
});

it("each of the five files is required, and near-miss names are not accepted", () => {
  for (const f of allFiles()) {
    const dir = S.copyRepo(base);
    commitIndex(dir, { drop: [cp(f)] });
    expectRefused(dir, new RegExp(`${base.cp2.id}.*lacks ${f.replace(".", "\\.")}`));
  }
  for (const name of ["manifest.json.bak", "MANIFEST.JSON", "xmanifest.json", "manifest.json "]) {
    const dir = S.copyRepo(base);
    commitIndex(dir, { add: { [cp(name)]: cp("manifest.json") } });
    expectRefused(dir, /not a checkpoint directory or one of its five regular files/);
  }
});

/** A copy of `tree` with `line` added at the directory path `parts` (plumbing; trees may be empty). */
function graft(dir, tree, parts, line) {
  const lines = S.git(dir, "ls-tree", tree).split("\n").filter(Boolean);
  if (!parts.length) return gitIn(dir, `${lines.concat(line).join("\n")}\n`, "mktree");
  const at = lines.findIndex((l) => l.endsWith(`\t${parts[0]}`));
  const child = graft(dir, lines[at].split(/[ \t]/)[2], parts.slice(1), line);
  lines[at] = `040000 tree ${child}\t${parts[0]}`;
  return gitIn(dir, `${lines.join("\n")}\n`, "mktree");
}

/** Commit an empty directory `name` at the directory path `at`. */
function commitEmptyTree(dir, at, name) {
  const tree = graft(dir, S.git(dir, "rev-parse", "HEAD^{tree}"), at.split("/"), `040000 tree ${gitIn(dir, "", "mktree")}\t${name}`);
  S.git(dir, "update-ref", "HEAD", gitIn(dir, "", "commit-tree", tree, "-p", "HEAD", "-m", "test: empty directory"));
}

it("a committed empty directory under the checkpoints is refused", () => {
  const sibling = S.copyRepo(base);
  commitEmptyTree(sibling, layout.CHECKPOINTS_DIR, "g4-000003");
  expectRefused(sibling, /g4-000003.*lacks/);
  const inside = S.copyRepo(base);
  commitEmptyTree(inside, `${layout.CHECKPOINTS_DIR}/${base.cp2.id}`, "emptysub");
  expectRefused(inside, /emptysub/);
});

/** Run the real CLI in release mode on `dir` with extra environment variables. */
function cliRelease(dir, extraEnv) {
  const i = releaseInputs(dir);
  return spawnSync(process.execPath, [CLI, "--repo-root", dir, "--release", "--trust-fingerprint", i.trustFingerprint,
    "--trusted-head", i.trustedHead, "--repository", i.repository, "--commit", i.expectedCommit], { encoding: "utf8", env: { ...process.env, ...extraEnv } });
}

it("GIT_DIR and GIT_WORK_TREE cannot point a release verification at another repository", () => {
  const dirty = S.copyRepo(base);
  S.write(dirty, cp("notes.txt"), Buffer.from("extra\n"));
  S.commitAll(dirty, "extra file in checkpoint");
  const clean = S.copyRepo(base);
  const r = cliRelease(dirty, { GIT_DIR: path.join(clean, ".git"), GIT_WORK_TREE: clean });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, new RegExp(`REFUSED ${CODE}`));
  assert.doesNotMatch(r.stdout, /PASS/);
});

it("GIT_WORK_TREE cannot hide an untracked file from the clean-checkout check", () => {
  const dir = S.copyRepo(base);
  const clean = S.copyRepo(base);
  assert.equal(cliRelease(dir, {}).status, 0, "control: this checkout passes before the stray file exists");
  fs.writeFileSync(path.join(dir, "stray.txt"), "untracked\n");
  const r = cliRelease(dir, { GIT_WORK_TREE: clean });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /BLOCKED RELEASE_TREE_DIRTY/);
});
