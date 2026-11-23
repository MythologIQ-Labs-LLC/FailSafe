'use strict';
/**
 * #707: filesystem guards for the browser voice vendor tree: path ancestry,
 * entry identity, the bounded hash of an existing asset, the shipped-file
 * inventory and the committed-asset check run by every build.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_ASSET } = require('./vendor-voice-source.cjs');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'src', 'roadmap', 'ui', 'vendor');
const COMMITTED_VOICE_ASSETS = Object.freeze([
  'piper/piper.min.js',
  'piper/piper_phonemize.wasm',
  'piper/piper_phonemize.data',
  'whisper/transformers.min.js',
  'whisper/ort-wasm-simd.wasm',
  'whisper/ort-wasm-simd-threaded.wasm',
]);

function assertVendorAncestry(target, io, trustedRoot, allowMissing = false) {
  const base = path.resolve(trustedRoot);
  const rel = path.relative(base, path.resolve(target));
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error('voice vendor path is outside the trusted root');
  }
  let cursor = base;
  for (const part of ['.', ...rel.split(path.sep).slice(0, -1)]) {
    if (part !== '.') cursor = path.join(cursor, part);
    let st;
    try { st = io.lstatSync(cursor); }
    catch (err) {
      if (allowMissing && err.code === 'ENOENT') break;
      throw err;
    }
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('voice vendor ancestor must be a real directory');
  }
}

/** lstat, not existsSync: a dangling symlink is still an occupied pathname. */
function existingVendorEntry(io, file) {
  try { return io.lstatSync(file); }
  catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function requireRegularVendorTarget(io, file) {
  const stat = existingVendorEntry(io, file);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
    throw new Error('unexpected vendor destination type');
  }
  return stat;
}

/**
 * Hash an already-installed asset through a bounded file descriptor. An lstat
 * size check alone would still permit a concurrent writer to enlarge the file
 * before an unbounded readFileSync. Verify inode/metadata on both sides and
 * refuse a file that grows beyond the same budget as a pinned replacement.
 * This is not same-principal race-free filesystem containment.
 */
function hashExistingVendorAsset(io, file, original) {
  if (!Number.isSafeInteger(original.size) || original.size === 0 ||
      original.size > MAX_ASSET) {
    throw new Error('existing voice vendor asset exceeds size budget or is empty');
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const fd = io.openSync(file, flags);
  try {
    const initial = io.fstatSync(fd);
    if (!initial.isFile() || !sameVendorEntry(original, initial)) {
      throw new Error('existing voice vendor asset changed before read');
    }
    const digest = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    for (;;) {
      // Read at most MAX_ASSET+1 bytes, regardless of file changes.
      const count = io.readSync(fd, buffer, 0,
        Math.min(buffer.length, MAX_ASSET + 1 - total), null);
      if (count === 0) break;
      total += count;
      if (total > MAX_ASSET) {
        throw new Error('existing voice vendor asset exceeds size budget');
      }
      digest.update(buffer.subarray(0, count));
    }
    if (total !== original.size || !sameVendorEntry(original, io.fstatSync(fd))) {
      throw new Error('existing voice vendor asset changed during read');
    }
    return digest.digest();
  } finally {
    io.closeSync(fd);
  }
}

/**
 * Metadata equality detects a replaced regular inode and routine edits to
 * that inode between preflight and promotion. This is NOT an atomic guarantee
 * against a concurrent same-user actor changing the path after rechecking.
 */
function sameVendorEntry(before, after) {
  if (!before || !after) return before === after;
  return before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs;
}

/** Refuse unless the backup is still this transaction's original inode and bytes. */
function assertOwnedBackup(io, item, message) {
  const backup = requireRegularVendorTarget(io, item.backup);
  if (!backup || !item.original || !item.originalSha256 ||
      (item.original.ino !== 0 &&
        (backup.dev !== item.original.dev || backup.ino !== item.original.ino)) ||
      backup.size !== item.original.size ||
      !crypto.timingSafeEqual(
        crypto.createHash('sha256').update(io.readFileSync(item.backup)).digest(),
        item.originalSha256)) {
    throw new Error(message);
  }
}

/**
 * The build recursively copies the UI tree. Fail closed if a staged, backup,
 * linked or otherwise unapproved voice file would be shipped in the VSIX.
 * This is source-tree hygiene, not a replacement for pinned-byte validation.
 */
function assertVoiceVendorInventory(root = VENDOR, io = fs, trustedRoot = ROOT) {
  const allowed = {
    piper: new Set(['VENDOR.md', 'piper.min.js', 'piper_phonemize.wasm', 'piper_phonemize.data']),
    whisper: new Set(['VENDOR.md', 'transformers.min.js', 'ort-wasm-simd.wasm', 'ort-wasm-simd-threaded.wasm']),
  };
  for (const [scope, files] of Object.entries(allowed)) {
    const dir = path.join(root, scope);
    assertVendorAncestry(dir, io, trustedRoot);
    const directoryInfo = io.lstatSync(dir);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error('invalid browser voice vendor directory: ' + scope);
    }
    for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (!files.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
        throw new Error('unexpected browser voice vendor entry: ' + scope + '/' + entry.name);
      }
      assertVendorAncestry(full, io, trustedRoot);
      const stat = io.lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('unexpected browser voice vendor entry: ' + scope + '/' + entry.name);
      }
    }
  }
}

/**
 * The browser assets are shipped from committed vendor files, not installed by
 * core npm ci; re-vendoring is the explicit pinned `npm run vendor:voice`.
 * vendor:voice refuses to replace an empty or oversized existing asset, so the
 * message for those tells the operator to remove the file first.
 */
function assertCommittedVoiceAssets(vendorRoot = VENDOR, io = fs, trustedRoot = ROOT) {
  for (const relative of COMMITTED_VOICE_ASSETS) {
    const file = path.join(vendorRoot, relative);
    assertVendorAncestry(file, io, trustedRoot);
    let stat;
    try { stat = io.lstatSync(file); }
    catch { throw new Error('Missing browser voice asset: ' + relative + '. Run npm run vendor:voice'); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_ASSET) {
      throw new Error('Invalid browser voice asset: ' + relative + '. Remove it, then run npm run vendor:voice');
    }
  }
  // Do not recursively copy abandoned .new/.old transaction files or unreviewed
  // voice payloads merely because the six approved assets exist.
  assertVoiceVendorInventory(vendorRoot, io, trustedRoot);
}

module.exports = {
  ROOT, VENDOR, assertVendorAncestry, existingVendorEntry, requireRegularVendorTarget,
  hashExistingVendorAsset, sameVendorEntry, assertOwnedBackup, assertVoiceVendorInventory,
  assertCommittedVoiceAssets,
};
