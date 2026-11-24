'use strict';
/**
 * #707: transactional replacement of committed browser voice assets: stage
 * every output, promote with backups, roll back only still-owned files.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_ASSET } = require('./vendor-voice-source.cjs');
const {
  ROOT, VENDOR, assertVendorAncestry, existingVendorEntry, requireRegularVendorTarget,
  hashExistingVendorAsset, sameVendorEntry, assertOwnedBackup,
} = require('./vendor-voice-fs.cjs');

/** Preflight one destination and its transaction names before any bytes are staged. */
function prepareVoiceOutput(rel, bytes, root, io, token, trustedRoot) {
  if (!/^(piper|whisper)\/[A-Za-z0-9_.-]+$/.test(rel)) throw new Error('invalid vendor destination');
  const target = path.join(root, rel);
  const dir = path.dirname(target);
  assertVendorAncestry(dir, io, trustedRoot, true);
  io.mkdirSync(dir, { recursive: true });
  const dirStat = io.lstatSync(dir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error('vendor directory must be a real directory');
  }
  assertVendorAncestry(target, io, trustedRoot);
  const original = requireRegularVendorTarget(io, target);
  const pending = target + '.new-' + token;
  const backup = target + '.old-' + token;
  if (existingVendorEntry(io, pending) || existingVendorEntry(io, backup)) {
    throw new Error('voice vendor transaction collision');
  }
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) ||
      bytes.length === 0 || bytes.length > MAX_ASSET) {
    throw new Error('invalid pinned vendor output bytes');
  }
  const expectedSha256 = crypto.createHash('sha256').update(bytes).digest();
  const originalSha256 = original ? hashExistingVendorAsset(io, target, original) : null;
  return { target, pending, backup, original, originalSha256, bytes, expectedSize: bytes.length, expectedSha256 };
}

function stageVoiceOutputs(outputs, root, io, token, staged, trustedRoot) {
  assertVendorAncestry(root, io, trustedRoot, true);
  io.mkdirSync(root, { recursive: true });
  const rootStat = io.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('voice vendor root must be a real directory');
  }
  // Preflight ALL destinations and transaction names before staging any bytes.
  const prepared = [];
  for (const [rel, bytes] of outputs) prepared.push(prepareVoiceOutput(rel, bytes, root, io, token, trustedRoot));
  for (const { bytes, ...item } of prepared) {
    // Record first: writeFileSync can create a partial file before throwing.
    staged.push(item);
    io.writeFileSync(item.pending, bytes, { flag: 'wx', mode: 0o600 });
    // Capture this transaction's newly created staging inode for later validation.
    item.pendingWritten = requireRegularVendorTarget(io, item.pending);
    if (!item.pendingWritten) throw new Error('voice vendor staged file vanished after write');
  }
}

function promoteVoiceOutputs(staged, io, moved, promoted, trustedRoot) {
  for (const item of staged) {
    assertVendorAncestry(item.target, io, trustedRoot);
    const original = requireRegularVendorTarget(io, item.target);
    if (!sameVendorEntry(item.original, original)) {
      throw new Error('voice vendor destination changed during promotion');
    }
    // An attacker or concurrent process may create a collision after preflight.
    // This check is not a race-free directory-handle capability.
    if (existingVendorEntry(io, item.backup)) {
      throw new Error('voice vendor transaction collision');
    }
    const pending = existingVendorEntry(io, item.pending);
    if (!pending || !pending.isFile() || pending.isSymbolicLink() ||
        !sameVendorEntry(item.pendingWritten, pending)) {
      throw new Error('voice vendor staged file changed during promotion');
    }
    // Enforce the exact pinned bytes, not merely a regular staged file.
    // Stat checks alone cannot detect an in-place edit or copied replacement.
    const stagedBytes = io.readFileSync(item.pending);
    if (!Buffer.isBuffer(stagedBytes) || stagedBytes.length !== item.expectedSize ||
        !crypto.timingSafeEqual(crypto.createHash('sha256').update(stagedBytes).digest(), item.expectedSha256)) {
      throw new Error('voice vendor staged asset content mismatch');
    }
    if (!sameVendorEntry(pending, requireRegularVendorTarget(io, item.pending))) {
      throw new Error('voice vendor staged file changed during promotion');
    }
    if (original) {
      io.renameSync(item.target, item.backup);
      moved.push(item);
    }
    io.renameSync(item.pending, item.target);
    promoted.push(item);
  }
}

/** Refuse unless the promoted target is still this transaction's staged inode and bytes. */
function assertOwnedPromoted(io, item) {
  const current = existingVendorEntry(io, item.target);
  if (!current || !current.isFile() || current.isSymbolicLink() ||
      !item.pendingWritten ||
      (item.pendingWritten.ino !== 0 &&
        (current.dev !== item.pendingWritten.dev || current.ino !== item.pendingWritten.ino)) ||
      current.size !== item.expectedSize ||
      !crypto.timingSafeEqual(
        crypto.createHash('sha256').update(io.readFileSync(item.target)).digest(),
        item.expectedSha256)) {
    throw new Error('voice vendor rollback refuses changed promoted asset');
  }
}

function restoreVoiceOutputs(io, moved, promoted) {
  const failures = [];
  for (const item of promoted.reverse()) {
    try {
      assertOwnedPromoted(io, item);
      // Only the still-owned, byte-identical promoted output may be removed.
      // This remains pathname based and does not claim race-free OS containment.
      io.rmSync(item.target, { force: true });
    } catch (e) { failures.push(e); }
  }
  for (const item of moved.reverse()) {
    try {
      assertOwnedBackup(io, item, 'voice vendor rollback refuses changed backup');
      // POSIX rename overwrites an occupied target, so refuse before restore.
      if (existingVendorEntry(io, item.target)) {
        throw new Error('voice vendor rollback refuses occupied destination');
      }
      io.renameSync(item.backup, item.target);
    } catch (e) { failures.push(e); }
  }
  return failures;
}

function cleanupVoiceOutputs(io, staged, moved) {
  for (const item of staged) {
    try {
      const current = existingVendorEntry(io, item.pending);
      if (!current) continue;
      // A write that failed before recording an inode has UNKNOWN ownership.
      // It may have hit EEXIST after another actor created this path. Never
      // delete an unowned entry merely because it uses our random filename.
      // A partial own write must be inspected/removed by the operator; the
      // inventory guard refuses to ship leftover .new-* files in the VSIX.
      if (!item.pendingWritten || !current.isFile() || current.isSymbolicLink() ||
          item.pendingWritten.ino === 0 || current.dev !== item.pendingWritten.dev ||
          current.ino !== item.pendingWritten.ino) continue;
      io.rmSync(item.pending, { force: true });
    } catch { /* unpromoted staging cleanup best-effort */ }
  }
  if (!moved) return [];
  const warnings = [];
  for (const item of moved) {
    try {
      assertOwnedBackup(io, item, 'voice vendor cleanup refuses foreign backup');
      io.rmSync(item.backup, { force: true });
    } catch (e) { warnings.push('stale backup: ' + item.backup + ' (' + String(e) + ')'); }
  }
  return warnings;
}

function commitOutputs(outputs, root = VENDOR, io = fs, trustedRoot = ROOT) {
  const token = crypto.randomBytes(12).toString('hex');
  const staged = [];
  const moved = [];
  const promoted = [];
  try {
    stageVoiceOutputs(outputs, root, io, token, staged, trustedRoot);
    promoteVoiceOutputs(staged, io, moved, promoted, trustedRoot);
  } catch (err) {
    const failures = restoreVoiceOutputs(io, moved, promoted);
    if (failures.length) throw new AggregateError([err, ...failures], 'voice vendor failed, recovery may be required');
    throw err;
  } finally {
    cleanupVoiceOutputs(io, staged);
  }
  return cleanupVoiceOutputs(io, [], moved);
}

module.exports = { commitOutputs };
