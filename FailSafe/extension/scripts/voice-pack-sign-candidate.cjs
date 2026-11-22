"use strict";
// #732: sign a reverified candidate with an OWNER-provisioned Ed25519 key.
// Never generates a key, takes a caller-supplied replacement trust root,
// creates a GitHub release, or publishes to a marketplace.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { verifySourceBoundCandidate } = require("./verify-voice-release-candidate.cjs");
const { signCandidate, verifySignedCandidate } = require("./voice-pack-auth.cjs");

const PIN = path.resolve(__dirname, "..", "src", "voice-pack", "publisher-public-key.pem");

function option(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error("missing argument " + name);
  return process.argv[i + 1];
}
function requirePublisherKey() {
  let stat;
  try { stat = fs.lstatSync(PIN); }
  catch { throw new Error("publisher trust root unavailable: approved key not provisioned"); }
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 8192,
    "publisher trust root must be a bounded regular pinned file");
  return fs.readFileSync(PIN, "utf8");
}
function requirePrivateKey() {
  const b64 = process.env.VOICE_PACK_SIGNING_KEY_PEM_B64;
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length > 16384) {
    throw new Error("publisher signing credential unavailable");
  }
  const bytes = Buffer.from(b64, "base64");
  if (bytes.toString("base64") !== b64) throw new Error("invalid signing credential encoding");
  return bytes.toString("utf8");
}
/**
 * Signer output is never published or overwritten. Retain inode identity from
 * the exclusive file descriptor before writing bytes. Rollback may unlink only
 * exact regular-file inodes owned by this invocation; another writer's
 * replacement is preserved with an explicit manual-inspection refusal.
 * This is a synchronous best-effort rollback, NOT a race-free filesystem
 * capability or multi-file crash-atomic transaction.
 */
function writeSignedArtifacts(dir, payload, signature, io = fs) {
  const folder = io.lstatSync(dir);
  if (!folder.isDirectory() || folder.isSymbolicLink() || folder.ino === 0) {
    throw new Error("voice signer output directory is not a verifiable real directory");
  }
  const recordPath = path.join(dir, "voice-pack-release.json");
  const sigPath = recordPath + ".sig";
  const writes = [
    { file: recordPath, bytes: Buffer.from(payload) },
    { file: sigPath, bytes: Buffer.from(signature.toString("base64") + "\n", "utf8") },
  ];
  const owned = [];
  try {
    for (const item of writes) {
      if (!item.bytes.length || item.bytes.length > 65536) {
        throw new Error("voice signer output is missing or oversized");
      }
      const fd = io.openSync(item.file, "wx", 0o600);
      try {
        const stat = io.fstatSync(fd);
        if (!stat.isFile() || stat.ino === 0) {
          throw new Error("voice signer cannot prove exclusive file identity");
        }
        owned.push({ file: item.file, dev: stat.dev, ino: stat.ino });
        for (let offset = 0; offset < item.bytes.length;) {
          const wrote = io.writeSync(fd, item.bytes, offset, item.bytes.length - offset, offset);
          if (!Number.isInteger(wrote) || wrote <= 0) {
            throw new Error("voice signer output write made no progress");
          }
          offset += wrote;
        }
        io.fsyncSync(fd);
      } finally {
        io.closeSync(fd);
      }
    }
  } catch (primary) {
    const warnings = [];
    let currentFolder;
    try { currentFolder = io.lstatSync(dir); }
    catch (e) { warnings.push(new Error("signing output directory disappeared")); }
    if (!currentFolder || !currentFolder.isDirectory() || currentFolder.isSymbolicLink() ||
        currentFolder.dev !== folder.dev || currentFolder.ino !== folder.ino) {
      warnings.push(new Error("signing output directory identity changed"));
    } else {
      for (const item of owned.reverse()) {
        let current;
        try { current = io.lstatSync(item.file); }
        catch (e) {
          if (e.code !== "ENOENT") warnings.push(new Error("unable to inspect owned signing output"));
          continue;
        }
        if (!current.isFile() || current.isSymbolicLink() ||
            current.dev !== item.dev || current.ino !== item.ino) {
          warnings.push(new Error("foreign signing output preserved: " + path.basename(item.file)));
          continue;
        }
        try { io.unlinkSync(item.file); }
        catch (e) { warnings.push(new Error("owned signing output cleanup failed: " + e.message)); }
      }
    }
    if (warnings.length) {
      throw new AggregateError([primary, ...warnings],
        "voice signer refused: unknown output ownership; manual inspection required");
    }
    throw primary;
  }
}

function signApprovedCandidate(dir, version, sourceSha) {
  const pub = requirePublisherKey();
  const priv = requirePrivateKey();
  const verified = verifySourceBoundCandidate(dir, version, sourceSha);
  const recorded = JSON.parse(fs.readFileSync(path.join(dir, "voice-pack-candidate.json"), "utf8"));
  assert.deepEqual(recorded, verified, "candidate receipt not bound to reverified archive");
  const signed = signCandidate(verified, priv, pub);
  verifySignedCandidate(verified, signed.payload, signed.signature, pub);
  writeSignedArtifacts(dir, signed.payload, signed.signature);
  return { status: "SIGNED_CANDIDATE_NOT_PUBLISHED", version, sourceSha,
    archiveSha256: verified.archiveSha256 };
}
if (require.main === module) {
  try {
    const version = option("--version");
    const sourceSha = option("--source");
    const dist = path.resolve(option("--dist"));
    console.log("[voice-sign] " + JSON.stringify(signApprovedCandidate(dist, version, sourceSha)));
  } catch (e) {
    console.error("[voice-sign] REFUSED: " + e.message);
    process.exitCode = 1;
  }
}
module.exports = { signApprovedCandidate, writeSignedArtifacts };
