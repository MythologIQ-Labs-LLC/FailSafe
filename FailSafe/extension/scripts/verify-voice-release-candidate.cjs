"use strict";
// #732: verify genuine optional-voice archive output before any release action.
// This source-only verifier does NOT establish publisher authenticity.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const REPO = "MythologIQ-Labs-LLC/FailSafe";
const FILES = Object.freeze([
  "piper/piper.min.js", "piper/piper_phonemize.wasm",
  "piper/piper_phonemize.data", "whisper/transformers.min.js",
  "whisper/ort-wasm-simd.wasm", "whisper/ort-wasm-simd-threaded.wasm",
]);
const MEMBERS = [...FILES, "piper/", "whisper/", "voice-pack.manifest.json"].sort();
const MAX_PACK = 96 * 1024 * 1024;
const MAX_FILE = 75 * 1024 * 1024;
const MAX_TOTAL = 160 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function requireRegular(file, maximum) {
  const st = fs.lstatSync(file);
  assert.ok(st.isFile() && !st.isSymbolicLink() && st.size > 0 &&
    st.size <= maximum, "not a bounded regular file: " + path.basename(file));
}
function tarRead(file, args, maxBuffer) {
  const run = spawnSync("tar", [...args.slice(0, 1), path.basename(file), ...args.slice(1)], {
    cwd: path.dirname(file), encoding: null, maxBuffer,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, "tar refused candidate archive");
  return run.stdout;
}
function requireInventory(file) {
  const bytes = tarRead(file, ["-tzf"], 16 * 1024);
  const names = bytes.toString("utf8").trim().split("\n").sort();
  assert.deepEqual(names, MEMBERS, "candidate has unexpected archive members");
}
function readMember(file, name, maximum) {
  const data = tarRead(file, ["-xOzf", name], maximum + 1);
  assert.ok(data.length > 0 && data.length <= maximum, "invalid member size: " + name);
  return data;
}
function requireManifest(raw, version) {
  assert.ok(raw.length <= 64 * 1024, "oversized voice manifest");
  const m = JSON.parse(raw.toString("utf8"));
  assert.deepEqual(Object.keys(m).sort(),
    ["builtAt", "expectedFiles", "sha256", "version"], "unexpected manifest keys");
  assert.equal(m.version, version, "version mismatch");
  assert.equal(typeof m.builtAt, "string");
  assert.deepEqual([...m.expectedFiles].sort(), [...FILES].sort(), "wrong six-asset inventory");
  assert.deepEqual(Object.keys(m.sha256).sort(), [...FILES].sort(), "wrong hash inventory");
  assert.ok(FILES.every(name => typeof m.sha256[name] === "string" &&
    DIGEST.test(m.sha256[name])), "invalid manifest digest");
  return m;
}
function requireChecksum(archive) {
  const file = archive + ".sha256";
  requireRegular(file, 8 * 1024);
  const body = fs.readFileSync(file, "utf8");
  const digest = sha(fs.readFileSync(archive));
  assert.equal(body, digest + "  " + path.basename(archive) + "\n",
    "archive checksum record mismatches exact asset bytes/name");
  return digest;
}
function verifyCandidate(dist, version, sourceSha) {
  assert.match(version, /^\d+\.\d+\.\d+$/, "strict extension version required");
  assert.match(sourceSha, /^[a-f0-9]{40}$/, "exact 40-hex source required");
  const filename = "failsafe-voice-pack-" + version + ".tar.gz";
  const archive = path.join(dist, filename);
  requireRegular(archive, MAX_PACK);
  const archiveSha256 = requireChecksum(archive);
  requireInventory(archive);
  const manifestBytes = readMember(archive, "voice-pack.manifest.json", 64 * 1024);
  const manifest = requireManifest(manifestBytes, version);
  let total = 0;
  for (const name of FILES) {
    const data = readMember(archive, name, MAX_FILE);
    total += data.length;
    assert.ok(total <= MAX_TOTAL, "expanded voice pack size exceeded");
    assert.equal(sha(data), manifest.sha256[name], "asset hash mismatch: " + name);
  }
  return { status: "UNSIGNED_CANDIDATE_ONLY", repository: REPO, version,
    sourceSha, filename, archiveSha256, manifestSha256: sha(manifestBytes),
    filesVerified: FILES.length };
}
function flag(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) throw new Error("missing argument " + name);
  return argv[i + 1];
}
if (require.main === module) {
  try {
    const version = flag(process.argv, "--version");
    const source = flag(process.argv, "--source");
    const dist = path.resolve(flag(process.argv, "--dist"));
    const result = verifyCandidate(dist, version, source);
    fs.writeFileSync(path.join(dist, "voice-pack-candidate.json"),
      JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("[voice-release] verified UNSIGNED, NON-PUBLISHABLE candidate:",
      JSON.stringify(result));
  } catch (error) {
    console.error("[voice-release] REFUSED:", error.message);
    process.exitCode = 1;
  }
}
module.exports = { verifyCandidate, FILES, MEMBERS };
