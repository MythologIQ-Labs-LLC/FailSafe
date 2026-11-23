'use strict';
/**
 * #707: pinned browser voice sources. Downloads only the two original npm
 * package archives; it does NOT install their transitive dependencies or
 * execute package lifecycle scripts. SHA-512 pins are from the previously
 * accepted extension package-lock.json.
 */
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Readable } = require('stream');

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

module.exports = {
  PACKAGES, MAX_DOWNLOAD, MAX_ASSET, assertPinnedDigest, downloadPinned,
  extractApprovedArchiveMembers, sanitizeWhisperBrowserBundle,
};
