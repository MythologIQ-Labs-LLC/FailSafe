"use strict";
/**
 * G4 (#638): create revocation-notice tokens and key-transition records.
 * OWNER WORKSTATION ONLY for real use; the tests drive it with a local test TSA
 * and software test keys. Nothing here commits. Each output is staged and
 * moved into place only when complete, and an existing output is never
 * replaced.
 */
const fs = require("node:fs");
const path = require("node:path");
const { refuse, block, isHex64, sha256 } = require("./bytes.cjs");
const { requireBlob } = require("./git.cjs");
const layout = require("./layout.cjs");
const registry = require("./registry.cjs");
const ts = require("./timestamp.cjs");
const { loadCertificate, verifySignature } = require("./signer.cjs");
const { noticeImprint } = require("./notices.cjs");
const { SCHEMA, transitionImprint } = require("./transition.cjs");

/** Request a granted RFC 3161 token for `imprintHex`; returns its bytes. */
async function requestToken(imprintHex, tsa, stageDir) {
  const bin = ts.requireOpenssl();
  const tsq = path.join(stageDir, "request.tsq");
  const tsr = path.join(stageDir, "reply.tsr");
  ts.buildQuery(bin, imprintHex, tsq);
  const bytes = await tsa.request(fs.readFileSync(tsq));
  if (!bytes || bytes.length === 0) throw block("TSA_OFFLINE", "the TSA returned no token");
  fs.writeFileSync(tsr, bytes);
  if (!ts.tokenInfo(bin, tsr).granted) throw block("TSA_REJECTED", "the TSA did not grant the request");
  return bytes;
}

/** Refuse linked parents and paths outside the checkout before writing any record. */
function realOutputDirectory(repoRoot, rels) {
  const root = path.resolve(repoRoot);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw refuse("RECORD_PATH", "repository root must be a real directory");
  if (!rels.length || new Set(rels).size !== rels.length) throw refuse("RECORD_PATH", "record output names must be unique");
  const targets = rels.map((rel) => {
    if (typeof rel !== "string" || !rel || path.isAbsolute(rel)) throw refuse("RECORD_PATH", "record output must be relative");
    const target = path.resolve(root, rel);
    const inside = path.relative(root, target);
    if (!inside || inside === ".." || inside.startsWith(".." + path.sep) || path.isAbsolute(inside)) {
      throw refuse("RECORD_PATH", "record output escapes repository");
    }
    return target;
  });
  const parent = path.dirname(targets[0]);
  if (targets.some((target) => path.dirname(target) !== parent)) {
    throw refuse("RECORD_PATH", "one record transaction must have a single output directory");
  }
  const parentRel = path.relative(root, parent);
  let current = root;
  for (const segment of parentRel.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try { fs.mkdirSync(current, { mode: 0o700 }); }
    catch (err) { if (err.code !== "EEXIST") throw err; }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw refuse("RECORD_PATH", "record output ancestor is not a real directory");
  }
  return { parent, targets };
}

function refuseExisting(targets, rels) {
  for (let i = 0; i < targets.length; i++) {
    try {
      fs.lstatSync(targets[i]);
      throw refuse("RECORD_EXISTS", `${rels[i]} already exists; records are never replaced`);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}

/** Write complete staged bytes with exclusive create; flush bytes before publishing links. */
function stageOutput(file, bytes) {
  const fd = fs.openSync(file, "wx", 0o600);
  try {
    const data = Buffer.from(bytes);
    for (let offset = 0; offset < data.length;) {
      const written = fs.writeSync(fd, data, offset, data.length - offset, offset);
      if (written < 1) throw new Error("G4 staging write made no progress");
      offset += written;
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Best-effort directory metadata flush where the host supports directory fsync. */
function syncDirectory(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch (err) {
    // Directory fsync is unsupported on some Windows and macOS filesystems.
    // A genuine I/O failure (EIO/ENOSPC/EROFS), or Linux permission failure,
    // is NOT an optional feature: fail and roll back our own published files.
    const unsupported = process.platform === "win32"
      ? ["EISDIR", "EINVAL", "EPERM", "EACCES", "ENOTSUP"]
      : process.platform === "darwin"
        ? ["EINVAL", "ENOTSUP"]
        : [];
    if (!unsupported.includes(err.code)) throw err;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Publish a record's complete outputs without ever replacing a final path.
 * A per-record directory lock serializes contenders, and same-filesystem
 * hardlinks create each final path with atomic NO-OVERWRITE semantics.
 * A failed attempt rolls back ONLY the inodes it actually published.
 * Filesystem crashes can still interrupt a multi-file publish: a retained
 * lock/partial triplet is a fail-closed manual-recovery signal, not a PASS.
 */
async function writeNew(repoRoot, rels, make) {
  const { parent, targets } = realOutputDirectory(repoRoot, rels);
  refuseExisting(targets, rels);
  const lock = path.join(parent, ".g4-record-" + sha256(Buffer.from([...rels].sort().join("\n"))).slice(0, 20) + ".lock");
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch (err) {
    if (err.code === "EEXIST") throw refuse("RECORD_BUSY",
      "an earlier writer or interrupted record owns the lock; inspect record paths and staged bytes before manual recovery");
    throw err;
  }

  // Capture lock identity before any asynchronous TSA/key operation. A later
  // writer must not trick cleanup into recursively deleting a replacement dir.
  const ownedLock = fs.lstatSync(lock);
  if (!ownedLock.isDirectory() || ownedLock.isSymbolicLink() || ownedLock.ino === 0) {
    throw refuse("RECORD_BUSY", "G4 lock directory ownership could not be established; inspect it manually");
  }
  let ownedStage = null;
  const published = [];
  let retainLock = false;
  try {
    refuseExisting(targets, rels); // a writer may have raced the initial preflight
    const stage = fs.mkdtempSync(path.join(lock, "stage-"));
    const stageInfo = fs.lstatSync(stage);
    if (!stageInfo.isDirectory() || stageInfo.isSymbolicLink() || stageInfo.ino === 0) {
      throw refuse("RECORD_BUSY", "G4 stage directory ownership could not be established; inspect it manually");
    }
    ownedStage = { path: stage, dev: stageInfo.dev, ino: stageInfo.ino };
    const out = await make(stage);
    if (!out || typeof out !== "object" || Array.isArray(out) ||
        Object.keys(out).length !== rels.length || rels.some((rel) => !Object.hasOwn(out, rel))) {
      throw refuse("RECORD_OUTPUT", "the prepared record file set differs from the requested record");
    }
    const staged = rels.map((rel, index) => {
      const bytes = out[rel];
      if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) || bytes.length === 0) {
        throw refuse("RECORD_OUTPUT", "record output must contain nonempty binary data");
      }
      const name = path.join(stage, `output-${index}`);
      stageOutput(name, bytes);
      if (!fs.readFileSync(name).equals(Buffer.from(bytes))) {
        throw refuse("RECORD_OUTPUT", "staged record bytes changed before publication");
      }
      return name;
    });
    refuseExisting(targets, rels); // any existing destination, including a dangling link, must refuse
    for (let i = 0; i < targets.length; i++) {
      // hardlink is atomic and fails EEXIST; unlike rename it NEVER overwrites.
      const info = fs.lstatSync(staged[i]);
      fs.linkSync(staged[i], targets[i]);
      published.push({ dest: targets[i], dev: info.dev, ino: info.ino });
    }
    syncDirectory(parent);
    return [...rels];
  } catch (primary) {
    const cleanupErrors = [];
    for (const item of published.reverse()) {
      try {
        const current = fs.lstatSync(item.dest);
        if (!current.isFile() || current.isSymbolicLink() ||
            current.dev !== item.dev || current.ino !== item.ino) {
          throw new Error("published record path no longer has the inode owned by this attempt");
        }
        fs.unlinkSync(item.dest);
      } catch (err) {
        retainLock = true;
        cleanupErrors.push(new Error(`rollback of ${path.basename(item.dest)}: ${err.message}`));
      }
    }
    if (!cleanupErrors.length && published.length) {
      try { syncDirectory(parent); }
      catch (err) { retainLock = true; cleanupErrors.push(err); }
    }
    if (cleanupErrors.length) {
      throw new AggregateError([primary, ...cleanupErrors],
        "G4 record publication failed; ownership-safe rollback incomplete; retained lock requires manual inspection");
    }
    throw primary;
  } finally {
    if (!retainLock) {
      // Never recursively delete an unknown replacement lock, a moved stage,
      // or unrelated content injected under the owned lock. Any ambiguity is
      // preserved for operator inspection, rather than silently lost.
      let current;
      try { current = fs.lstatSync(lock); }
      catch { throw refuse("RECORD_BUSY", "G4 owned lock disappeared; manual inspection required"); }
      if (!current.isDirectory() || current.isSymbolicLink() ||
          current.dev !== ownedLock.dev || current.ino !== ownedLock.ino) {
        throw refuse("RECORD_BUSY", "G4 lock identity changed; foreign directory preserved for manual inspection");
      }
      const entries = fs.readdirSync(lock);
      if (ownedStage) {
        const stageNow = fs.lstatSync(ownedStage.path);
        if (!stageNow.isDirectory() || stageNow.isSymbolicLink() ||
            stageNow.dev !== ownedStage.dev || stageNow.ino !== ownedStage.ino ||
            entries.length !== 1 || entries[0] !== path.basename(ownedStage.path)) {
          throw refuse("RECORD_BUSY", "G4 lock contents changed; manual inspection required");
        }
      } else if (entries.length) {
        throw refuse("RECORD_BUSY", "G4 lock has unowned content; manual inspection required");
      }
      // The stage may contain only files this transaction could have created.
      // A foreign file under an otherwise-owned stage is not our evidence to
      // delete. Never recursively remove the lock, even after an lstat check:
      // rmdir fails closed if anything new appears before final removal.
      if (ownedStage) {
        const allowed = new Set([
          "request.tsq", "reply.tsr",
          ...rels.map((_, index) => `output-${index}`),
        ]);
        const stageEntries = fs.readdirSync(ownedStage.path);
        if (stageEntries.some((name) => !allowed.has(name))) {
          throw refuse("RECORD_BUSY", "G4 stage contains unowned files; manual inspection required");
        }
        // Check every entry before removing any. Symlinks, replacement
        // directories and other unsupported node types are never unlinked.
        for (const name of stageEntries) {
          const info = fs.lstatSync(path.join(ownedStage.path, name));
          if (!info.isFile() || info.isSymbolicLink()) {
            throw refuse("RECORD_BUSY", "G4 stage contains nonregular files; manual inspection required");
          }
        }
        for (const name of stageEntries) fs.unlinkSync(path.join(ownedStage.path, name));
        fs.rmdirSync(ownedStage.path);
      }
      fs.rmdirSync(lock);
    }
  }
}

/** Timestamp the registry version committed at `commit` (default HEAD). */
async function stampRegistry({ repoRoot, tsa, commit = "HEAD" }) {
  const bytes = requireBlob(repoRoot, commit, layout.REGISTRY_PATH, "REGISTRY_MISSING");
  const { version } = registry.parse(bytes);
  if (version < 2) throw refuse("REGISTRY_UNCHANGED", "registry version 1 needs no notice token");
  const rel = layout.noticeTokenPath(version);
  return writeNew(repoRoot, [rel], async (stage) => ({ [rel]: await requestToken(noticeImprint(bytes), tsa, stage) }));
}

/**
 * Write a transition record for the key `fromFingerprint`, signed by `signer`
 * (the old key for "rotation", the new key for "recovery"), and timestamp it.
 */
async function writeTransition({ repoRoot, kind, fromFingerprint, toFingerprint, afterCheckpoint, repository, signer, tsa, createdUtc }) {
  if (!isHex64(fromFingerprint) || !isHex64(toFingerprint)) throw refuse("TRANSITION_INPUT", "fingerprints must be 64 lowercase hex");
  const expected = kind === "rotation" ? fromFingerprint : toFingerprint;
  if (signer.fingerprint !== expected) throw refuse("TRANSITION_INPUT", `a ${kind} record must be signed by ${expected.slice(0, 16)}`);
  const afterManifest = path.join(repoRoot, layout.CHECKPOINTS_DIR, afterCheckpoint, layout.FILES.manifest);
  if (!fs.existsSync(afterManifest)) throw refuse("TRANSITION_INPUT", `${afterCheckpoint} has no manifest in this checkout`);
  const record = { schema: SCHEMA, kind, repository, fromFingerprintSha256: fromFingerprint, toFingerprintSha256: toFingerprint,
    afterCheckpoint, afterCheckpointManifestSha256: sha256(fs.readFileSync(afterManifest)), createdUtc: createdUtc || new Date().toISOString() };
  const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + "\n");
  const signatureBytes = signer.sign(recordBytes);
  if (!verifySignature(recordBytes, signatureBytes, loadCertificate(signer.certificateDer))) throw refuse("SIGNATURE_INVALID", "signer output does not verify");
  const p = layout.transitionPaths(fromFingerprint);
  return writeNew(repoRoot, [p.record, p.signature, p.token], async (stage) => ({
    [p.record]: recordBytes,
    [p.signature]: signatureBytes,
    [p.token]: await requestToken(transitionImprint(recordBytes, signatureBytes), tsa, stage),
  }));
}

module.exports = { requestToken, stampRegistry, writeTransition, writeNew };
