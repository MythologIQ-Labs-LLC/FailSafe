"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { verifyCandidate, FILES } = require("../../../scripts/verify-voice-release-candidate.cjs");

const VERSION = "6.1.0";
const SOURCE = "c".repeat(40);
const hash = b => crypto.createHash("sha256").update(b).digest("hex");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-voice-delivery-"));
  const stage = path.join(root, "payload");
  const dist = path.join(root, "dist");
  fs.mkdirSync(stage);
  fs.mkdirSync(dist);
  const hashes = {};
  for (const name of FILES) {
    const file = path.join(stage, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = Buffer.from("fixture-" + name);
    fs.writeFileSync(file, body);
    hashes[name] = hash(body);
  }
  const manifest = { version: VERSION, builtAt: "2026-11-20T00:00:00Z",
    expectedFiles: FILES, sha256: hashes };
  const write = () => fs.writeFileSync(path.join(stage, "voice-pack.manifest.json"),
    JSON.stringify(manifest));
  const archive = path.join(dist, "failsafe-voice-pack-" + VERSION + ".tar.gz");
  const pack = (extra = []) => {
    const args = ["-czf", path.basename(archive), "-C", stage,
      "piper", "whisper", "voice-pack.manifest.json", ...extra];
    const res = cp.spawnSync("tar", args, { cwd: dist, encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    fs.writeFileSync(archive + ".sha256", hash(fs.readFileSync(archive)) +
      "  " + path.basename(archive) + "\n");
  };
  write();
  pack();
  return { root, stage, dist, archive, manifest, write, pack };
}
function withFixture(run) {
  const x = createFixture();
  try { run(x); }
  finally { fs.rmSync(x.root, { recursive: true, force: true }); }
}
function verify(x) { return verifyCandidate(x.dist, VERSION, SOURCE); }

test("real six-asset tar and exact named SHA-256 are independently admitted", () =>
  withFixture(x => {
    const result = verify(x);
    assert.equal(result.status, "UNSIGNED_CANDIDATE_ONLY");
    assert.equal(result.filesVerified, 6);
    assert.equal(result.sourceSha, SOURCE);
    assert.equal(result.archiveSha256, hash(fs.readFileSync(x.archive)));
    assert.equal(result.manifestSha256, hash(fs.readFileSync(
      path.join(x.stage, "voice-pack.manifest.json"))));
  }));

test("wrong source and version are refused before asset verification", () =>
  withFixture(x => {
    assert.throws(() => verifyCandidate(x.dist, VERSION, "not-a-source"), /source/);
    assert.throws(() => verifyCandidate(x.dist, "6.1.0-voice", SOURCE), /version/);
    assert.throws(() => verifyCandidate(x.dist, "6.0.13", SOURCE), /ENOENT|archive/);
  }));

test("tampered archive is refused despite a matching versioned filename", () =>
  withFixture(x => {
    fs.appendFileSync(x.archive, "UNAUTHORIZED");
    assert.throws(() => verify(x), /checksum record mismatches/);
  }));

test("a bogus same-release checksum is not accepted as the claimed archive", () =>
  withFixture(x => {
    fs.writeFileSync(x.archive + ".sha256", hash(fs.readFileSync(x.archive)) +
      "  wrong-name.tar.gz\n");
    assert.throws(() => verify(x), /checksum record mismatches/);
  }));

test("unexpected tar member is refused even with a valid archive checksum", () =>
  withFixture(x => {
    fs.writeFileSync(path.join(x.stage, "foreign.js"), "unexpected executable");
    x.pack(["foreign.js"]);
    assert.throws(() => verify(x), /unexpected archive members/);
  }));

test("missing required browser asset is refused", () =>
  withFixture(x => {
    fs.rmSync(path.join(x.stage, FILES[0]));
    x.pack();
    assert.throws(() => verify(x), /unexpected archive members/);
  }));

test("wrong manifest hash and wrong manifest version both fail closed", () =>
  withFixture(x => {
    x.manifest.sha256[FILES[0]] = "a".repeat(64);
    x.write(); x.pack();
    assert.throws(() => verify(x), /asset hash mismatch/);
    x.manifest.sha256[FILES[0]] = hash(fs.readFileSync(path.join(x.stage, FILES[0])));
    x.manifest.version = "0.0.0";
    x.write(); x.pack();
    assert.throws(() => verify(x), /version mismatch/);
  }));

test("empty manifest inventory is not treated as a valid pack", () =>
  withFixture(x => {
    x.manifest.expectedFiles = [];
    x.manifest.sha256 = {};
    x.write(); x.pack();
    assert.throws(() => verify(x), /wrong six-asset inventory/);
  }));

test("linked candidate archive is refused before tar or hashing", { skip: process.platform === "win32" }, () =>
  withFixture(x => {
    const other = path.join(x.root, "linked.tar.gz");
    fs.renameSync(x.archive, other);
    fs.symlinkSync(other, x.archive);
    assert.throws(() => verify(x), /not a bounded regular file/);
  }));

test("ordinary release tag filter cannot reinterpret v*-voice as a VSIX release", () => {
  const f = path.resolve(__dirname, "../../../../../.github/workflows/release.yml");
  const source = fs.readFileSync(f, "utf8");
  const match = /tags:\s*\[([^\]]+)\]/.exec(source);
  assert.ok(match, "release must specify tag filter");
  assert.match(match[1], /["']v\*["']/);
  assert.match(match[1], /["']!v\*-voice["']/);
  assert.ok(match[1].indexOf("v*") < match[1].indexOf("!v*-voice"),
    "GitHub negation must follow positive pattern");
});

test("candidate workflow never grants GitHub release or marketplace write authority", () => {
  const f = path.resolve(__dirname, "../../../../../.github/workflows/voice-pack-candidate.yml");
  const source = fs.readFileSync(f, "utf8");
  assert.match(source, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(source, /contents:\s*write|gh release create|publish-release/i);
  assert.match(source, /sign_candidate == true/);
  assert.match(source, /environment: production/);
  assert.match(source, /workflow_dispatch/);
});
