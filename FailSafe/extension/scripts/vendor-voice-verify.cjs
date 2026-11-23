'use strict';
/**
 * #707: read-only verification that committed browser voice assets equal the
 * bytes derived from the SHA-512-pinned npm archives, on disk and in Git HEAD.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { MAX_ASSET } = require('./vendor-voice-source.cjs');
const { ROOT, VENDOR, assertVendorAncestry } = require('./vendor-voice-fs.cjs');

/**
 * Compare committed browser assets against only the six bytes derived from
 * SHA-512-pinned npm archives, using the identical deterministic Whisper
 * sanitization. Read-only: never restore, rewrite or normalize source files.
 * A missing or changed file is a release-qualification failure.
 */
function verifyPinnedVendorOutputs(outputs, root = VENDOR, io = fs, trustedRoot = ROOT) {
  if (!(outputs instanceof Map) || outputs.size === 0 || outputs.size > 6) {
    throw new Error('voice verification requires a nonempty approved asset map');
  }
  assertVendorAncestry(root, io, trustedRoot);
  const rootInfo = io.lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('voice vendor root must be a real directory');
  }
  for (const [rel, expected] of outputs) {
    if (!/^(piper|whisper)\/[A-Za-z0-9_.-]+$/.test(rel) ||
        !(Buffer.isBuffer(expected) || expected instanceof Uint8Array) ||
        expected.length === 0 || expected.length > MAX_ASSET) {
      throw new Error('invalid pinned voice verification asset');
    }
    const target = path.join(root, rel);
    assertVendorAncestry(target, io, trustedRoot);
    let stat;
    try { stat = io.lstatSync(target); }
    catch (err) {
      if (err.code === 'ENOENT') throw new Error('pinned browser voice asset missing: ' + rel);
      throw err;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_ASSET) {
      throw new Error('invalid browser voice asset: ' + rel);
    }
    if (stat.size !== expected.length || !io.readFileSync(target).equals(Buffer.from(expected))) {
      throw new Error('pinned browser voice asset mismatch: ' + rel);
    }
  }
  return outputs.size;
}

/** Refuse unless `git rev-parse --show-toplevel` names the intended checkout root. */
function assertExpectedCheckoutRoot(repoRoot, run) {
  const top = run('git', ['rev-parse', '--show-toplevel'], {
    cwd: repoRoot, shell: false, encoding: 'utf8', maxBuffer: 4096,
  });
  let actualRoot;
  try { actualRoot = fs.realpathSync.native(String(top.stdout || '').trim()); }
  catch { throw new Error('voice verification requires the expected Git checkout root'); }
  const intendedRoot = fs.realpathSync.native(repoRoot);
  if (top.status !== 0 || top.error ||
      (process.platform === 'win32'
        ? actualRoot.toLowerCase() !== intendedRoot.toLowerCase()
        : actualRoot !== intendedRoot)) {
    throw new Error('voice verification requires the expected Git checkout root');
  }
}

/** One asset: a regular 100644 blob at HEAD whose bytes equal the pinned output. */
function assertCommittedAsset(repoRoot, rel, expected, run) {
  if (!/^(piper|whisper)\/[A-Za-z0-9_.-]+$/.test(rel) ||
      !(Buffer.isBuffer(expected) || expected instanceof Uint8Array) ||
      expected.length === 0 || expected.length > MAX_ASSET) {
    throw new Error('invalid pinned committed voice asset');
  }
  const gitRel = 'FailSafe/extension/src/roadmap/ui/vendor/' + rel;
  const treeEntry = run('git', ['ls-tree', 'HEAD', '--', gitRel], {
    cwd: repoRoot, shell: false, encoding: 'utf8', maxBuffer: 4096,
  });
  const entry = String(treeEntry.stdout || '').trimEnd().split(String.fromCharCode(9));
  if (treeEntry.status !== 0 || treeEntry.error || entry.length !== 2 ||
      !/^100644 blob [a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(entry[0]) ||
      entry[1] !== gitRel) {
    throw new Error('committed browser voice asset is not a regular Git blob: ' + rel);
  }
  const snapshot = run('git', ['show', 'HEAD:' + gitRel], {
    cwd: repoRoot, shell: false, maxBuffer: MAX_ASSET + 1024,
  });
  if (snapshot.status !== 0 || snapshot.error || !Buffer.isBuffer(snapshot.stdout)) {
    throw new Error('committed browser voice asset unavailable: ' + rel);
  }
  if (snapshot.stdout.length !== expected.length ||
      !snapshot.stdout.equals(Buffer.from(expected))) {
    throw new Error('pinned committed browser voice asset mismatch: ' + rel);
  }
}

/**
 * Verify the SHA-512-pinned upstream outputs against committed Git HEAD blobs,
 * not just mutable checkout files. A local repair without a reviewed commit
 * must not be reported as release-source parity.
 */
function verifyCommittedVendorOutputs(outputs, extensionRoot = ROOT, run = spawnSync) {
  if (!(outputs instanceof Map) || outputs.size === 0 || outputs.size > 6) {
    throw new Error('voice committed verification requires a nonempty approved asset map');
  }
  const repoRoot = path.resolve(extensionRoot, '..', '..');
  assertExpectedCheckoutRoot(repoRoot, run);
  for (const [rel, expected] of outputs) assertCommittedAsset(repoRoot, rel, expected, run);
  return outputs.size;
}

module.exports = { verifyPinnedVendorOutputs, verifyCommittedVendorOutputs };
