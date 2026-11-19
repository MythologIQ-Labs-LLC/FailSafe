#!/usr/bin/env node
/**
 * #707: explicit, pinned browser Voice Pack re-vendoring.
 *
 * Downloads only the two original npm package archives; it does NOT install
 * their transitive dependencies or execute package lifecycle scripts.
 * SHA-512 pins are from the previously accepted extension package-lock.json.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Readable } = require('stream');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'src', 'roadmap', 'ui', 'vendor');
const PACKAGES = Object.freeze({
  piper: {
    url: 'https://registry.npmjs.org/piper-tts-web/-/piper-tts-web-1.1.2.tgz',
    integrity: 'sha512-M0yf82S+f6DzhBhGd0IN88ovPEDoIZCYlPtRaz3j11a1FS6FKrHIMyLy2s2crOTbLyssf2PEbuPBNYSEUb7uUg==',
    outputs: {
      'package/dist/piper-tts-web.js': 'piper/piper.min.js',
      'package/dist/piper/piper_phonemize.wasm': 'piper/piper_phonemize.wasm',
      'package/dist/piper/piper_phonemize.data': 'piper/piper_phonemize.data',
    },
  },
  whisper: {
    url: 'https://registry.npmjs.org/@xenova/transformers/-/transformers-2.17.2.tgz',
    integrity: 'sha512-lZmHqzrVIkSvZdKZEx7IYY51TK0WDrC8eR0c5IMnBsO8di8are1zzw8BlLhyO2TklZKLN5UffNGs1IJwT6oOqQ==',
    outputs: {
      'package/dist/transformers.min.js': 'whisper/transformers.min.js',
      'package/dist/ort-wasm-simd.wasm': 'whisper/ort-wasm-simd.wasm',
      'package/dist/ort-wasm-simd-threaded.wasm': 'whisper/ort-wasm-simd-threaded.wasm',
    },
  },
});
const MAX_DOWNLOAD = 120 * 1024 * 1024;
const MAX_ASSET = 75 * 1024 * 1024;

function assertPinnedDigest(bytes, integrity) {
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) throw new Error('invalid pinned integrity');
  const actual = crypto.createHash('sha512').update(bytes).digest();
  const expected = Buffer.from(integrity.slice(7), 'base64');
  if (expected.length !== 64 || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('voice source tarball SHA-512 mismatch');
  }
}

async function downloadPinned(url, integrity, fetchFn = globalThis.fetch) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'registry.npmjs.org' || u.port || u.username || u.password) {
    throw new Error('unsupported voice source URL');
  }
  const response = await fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error('voice source download failed: HTTP ' + response.status);
  const claimed = Number(response.headers.get('content-length'));
  if (Number.isFinite(claimed) && claimed > MAX_DOWNLOAD) throw new Error('voice archive exceeds download budget');
  const chunks = []; let size = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    size += chunk.length;
    if (size > MAX_DOWNLOAD) throw new Error('voice archive exceeds download budget');
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  assertPinnedDigest(bytes, integrity);
  return bytes;
}

function extractApprovedArchiveMembers(tarballPath, entries) {
  const directory = path.dirname(tarballPath);
  const name = path.basename(tarballPath);
  const extracted = new Map();
  for (const [member, dest] of Object.entries(entries)) {
    if (!/^package\/dist\/[A-Za-z0-9_./-]+$/.test(member) ||
        member.split('/').includes('..') || !/^(piper|whisper)\/[A-Za-z0-9_.-]+$/.test(dest)) {
      throw new Error('invalid pinned voice archive member');
    }
    // -O writes bytes to stdout, never unpacks arbitrary archive members to disk.
    const result = spawnSync('tar', ['-xOzf', name, member], {
      cwd: directory, shell: false, maxBuffer: MAX_ASSET + 1024,
    });
    if (result.status !== 0 || result.error || !result.stdout || result.stdout.length === 0) {
      throw new Error('required voice archive member unavailable: ' + member);
    }
    if (result.stdout.length > MAX_ASSET) throw new Error('voice asset exceeds size limit: ' + member);
    extracted.set(dest, result.stdout);
  }
  return extracted;
}

function sanitizeWhisperBrowserBundle(bytes) {
  // Preserve the pre-existing vendor sanitization policy in bundle.cjs so
  // re-vendoring and ordinary builds are deterministic and no eval shim ships.
  let code = bytes.toString('utf8');
  code = code.replace(
    'var mod=eval("quire".replace(/^/,"re"))(moduleName);if(mod&&(mod.length||Object.keys(mod).length))return mod',
    'var mod=null',
  );
  code = code.split('new Function("return this")').join('(function(){return this})()');
  return Buffer.from(code, 'utf8');
}

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

function stageVoiceOutputs(outputs, root, io, token, staged, trustedRoot) {
  assertVendorAncestry(root, io, trustedRoot, true);
  io.mkdirSync(root, { recursive: true });
  const rootStat = io.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('voice vendor root must be a real directory');
  }
  for (const [rel, bytes] of outputs) {
    if (!/^(piper|whisper)\/[A-Za-z0-9_.-]+$/.test(rel)) throw new Error('invalid vendor destination');
    const target = path.join(root, rel);
    const dir = path.dirname(target);
    assertVendorAncestry(dir, io, trustedRoot, true);
    io.mkdirSync(dir, { recursive: true });
    if (io.lstatSync(dir).isSymbolicLink()) throw new Error('vendor directory is a symlink');
    assertVendorAncestry(target, io, trustedRoot);
    if (io.existsSync(target) && !io.lstatSync(target).isFile()) {
      throw new Error('unexpected vendor destination type');
    }
    const pending = target + '.new-' + token;
    const backup = target + '.old-' + token;
    if (io.existsSync(pending) || io.existsSync(backup)) throw new Error('voice vendor transaction collision');
    // Record first: writeFileSync can create a partial file before throwing.
    staged.push({ target, pending, backup });
    io.writeFileSync(pending, bytes, { flag: 'wx', mode: 0o600 });
  }
}

function promoteVoiceOutputs(staged, io, moved, promoted, trustedRoot) {
  for (const item of staged) {
    assertVendorAncestry(item.target, io, trustedRoot);
    if (io.existsSync(item.target)) {
      io.renameSync(item.target, item.backup);
      moved.push(item);
    }
    io.renameSync(item.pending, item.target);
    promoted.push(item);
  }
}

function restoreVoiceOutputs(io, moved, promoted) {
  const failures = [];
  for (const item of promoted.reverse()) {
    try { io.rmSync(item.target, { force: true }); }
    catch (e) { failures.push(e); }
  }
  for (const item of moved.reverse()) {
    try { io.renameSync(item.backup, item.target); }
    catch (e) { failures.push(e); }
  }
  return failures;
}

function cleanupVoiceOutputs(io, staged, moved) {
  for (const item of staged) {
    try { io.rmSync(item.pending, { force: true }); }
    catch { /* unpromoted staging cleanup best-effort */ }
  }
  if (!moved) return [];
  const warnings = [];
  for (const item of moved) {
    try { io.rmSync(item.backup, { force: true }); }
    catch (e) { warnings.push('stale backup: ' + item.backup + ' (' + String(e) + ')'); }
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
  for (const [rel, expected] of outputs) {
    if (!/^(piper|whisper)\/[A-Za-z0-9_.-]+$/.test(rel) ||
        !(Buffer.isBuffer(expected) || expected instanceof Uint8Array) ||
        expected.length === 0 || expected.length > MAX_ASSET) {
      throw new Error('invalid pinned committed voice asset');
    }
    const gitRel = 'FailSafe/extension/src/roadmap/ui/vendor/' + rel;
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
  return outputs.size;
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--piper-only', '--verify']);
  if (args.some(a => !allowed.has(a)) || new Set(args).size !== args.length) {
    throw new Error('usage: node vendor-voice.cjs [--piper-only] [--verify]');
  }
  const selected = args.includes('--piper-only') ? ['piper'] : ['piper', 'whisper'];
  const verifyOnly = args.includes('--verify');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-vendor-'));
  try {
    const outputs = new Map();
    for (const name of selected) {
      const pkg = PACKAGES[name];
      const bytes = await downloadPinned(pkg.url, pkg.integrity);
      const tarball = path.join(tmp, name + '.tgz');
      fs.writeFileSync(tarball, bytes, { flag: 'wx', mode: 0o600 });
      for (const [dest, contents] of extractApprovedArchiveMembers(tarball, pkg.outputs)) {
        if (outputs.has(dest)) throw new Error('duplicate voice vendor destination');
        outputs.set(dest, dest === 'whisper/transformers.min.js'
          ? sanitizeWhisperBrowserBundle(contents) : contents);
      }
    }
    if (verifyOnly) {
      const verified = verifyPinnedVendorOutputs(outputs);
      verifyCommittedVendorOutputs(outputs);
      console.log('[vendor:voice] pinned upstream bytes match ' + verified + ' browser assets on disk and committed HEAD; no source files changed');
    } else {
      const warnings = commitOutputs(outputs);
      for (const warning of warnings) console.warn('[vendor:voice] ' + warning);
      console.log('[vendor:voice] pinned archives verified; updated ' + outputs.size + ' browser assets');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
module.exports = { PACKAGES, assertPinnedDigest, downloadPinned, extractApprovedArchiveMembers, sanitizeWhisperBrowserBundle, assertVendorAncestry, commitOutputs, verifyPinnedVendorOutputs, verifyCommittedVendorOutputs };
if (require.main === module) main().catch(err => { console.error('[vendor:voice] ' + err.message); process.exitCode = 1; });
