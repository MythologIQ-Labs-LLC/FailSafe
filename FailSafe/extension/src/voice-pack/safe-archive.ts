/**
 * #710: Fail-closed reader for the seven-file optional Voice Pack.
 * Parse and authenticate every tar member BEFORE creating any extracted path.
 * Only ordinary USTAR files and the two expected directories are admitted.
 * PAX/GNU extensions, links, devices, ambiguous paths and extras are refused.
 * This bounds allocations; it does not independently authenticate the publisher.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import type { VoicePackManifest } from './types';

export const VOICE_ASSETS = Object.freeze([
  'piper/piper.min.js', 'piper/piper_phonemize.wasm',
  'piper/piper_phonemize.data', 'whisper/transformers.min.js',
  'whisper/ort-wasm-simd.wasm', 'whisper/ort-wasm-simd-threaded.wasm',
]);
const MANIFEST = 'voice-pack.manifest.json';
const MAX_COMPRESSED = 96 * 1024 * 1024;
const MAX_EXPANDED = 160 * 1024 * 1024;
const MAX_FILE = 75 * 1024 * 1024;
const MAX_MANIFEST = 64 * 1024;
const BLOCK = 512;
const files = new Set([...VOICE_ASSETS, MANIFEST]);
const dirs = new Set(['piper/', 'whisper/']);

function fail(reason: string): never { throw new Error('tar extract refused: ' + reason); }

function field(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  if (end >= 0 && raw.subarray(end).some(b => b !== 0)) fail('ambiguous tar field');
  return raw.subarray(0, end < 0 ? length : end).toString('utf8');
}
function octal(block: Buffer, offset: number, length: number): number {
  const raw = block.subarray(offset, offset + length);
  const nul = raw.indexOf(0);
  if (nul >= 0 && raw.subarray(nul).some(b => b !== 0 && b !== 32)) fail('invalid tar numeric padding');
  const value = raw.subarray(0, nul < 0 ? raw.length : nul).toString('ascii').trim();
  if (!/^[0-7]+$/.test(value)) fail('invalid tar numeric field');
  const n = parseInt(value, 8);
  if (!Number.isSafeInteger(n)) fail('tar numeric field overflow');
  return n;
}
function entryHeader(block: Buffer): { name: string; size: number; directory: boolean } {
  const checksum = octal(block, 148, 8);
  let total = 0;
  for (let i = 0; i < BLOCK; i++) total += i >= 148 && i < 156 ? 32 : block[i];
  if (checksum !== total) fail('tar header checksum mismatch');
  if (field(block, 257, 6) !== 'ustar') fail('unsupported tar header format');
  if (field(block, 345, 155) || field(block, 157, 100)) fail('tar prefix or link is forbidden');
  const name = field(block, 0, 100);
  const kind = block[156];
  const directory = kind === 53;
  if (!directory && kind !== 48 && kind !== 0) fail('tar entry type forbidden');
  if (!/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.includes('\\') ||
      name.startsWith('/') || name.includes('//') || name.split('/').includes('..') ||
      name.split('/').includes('.') || name.includes(':')) fail('unsafe tar member name');
  if (!(directory ? dirs.has(name) : files.has(name))) fail('unexpected tar member: ' + name);
  const size = octal(block, 124, 12);
  if ((directory && size !== 0) || size > (name === MANIFEST ? MAX_MANIFEST : MAX_FILE)) {
    fail('invalid tar member size');
  }
  return { name, size, directory };
}
function inspectTar(bytes: Buffer): Map<string, Buffer> {
  const found = new Set<string>();
  const extracted = new Map<string, Buffer>();
  let offset = 0;
  let terminated = false;
  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK);
    if (header.every(b => b === 0)) { terminated = true; break; }
    const { name, size, directory } = entryHeader(header);
    if (found.has(name) || found.size >= 9) fail('duplicate or excessive tar members');
    found.add(name);
    offset += BLOCK;
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (offset + padded > bytes.length) fail('truncated tar member');
    if (bytes.subarray(offset + size, offset + padded).some(b => b !== 0)) fail('tar padding not zero');
    if (!directory) extracted.set(name, bytes.subarray(offset, offset + size));
    offset += padded;
  }
  if (!terminated || offset + 2 * BLOCK > bytes.length ||
      bytes.subarray(offset).some(b => b !== 0)) fail('invalid tar end markers');
  if (extracted.size !== files.size || [...files].some(name => !extracted.has(name))) {
    fail('missing required voice files');
  }
  return extracted;
}
function validateManifest(contents: Map<string, Buffer>, version: string): VoicePackManifest {
  let manifest: unknown;
  try { manifest = JSON.parse(contents.get(MANIFEST)!.toString('utf8')); }
  catch { return fail('invalid voice pack manifest JSON'); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('invalid manifest');
  const m = manifest as VoicePackManifest;
  if (JSON.stringify(Object.keys(m).sort()) !==
      JSON.stringify(['builtAt', 'expectedFiles', 'sha256', 'version'])) fail('unexpected manifest fields');
  if (m.version !== version || typeof m.builtAt !== 'string' ||
      !Array.isArray(m.expectedFiles) || !m.sha256 ||
      typeof m.sha256 !== 'object' || Array.isArray(m.sha256)) fail('manifest schema/version mismatch');
  const expected = [...VOICE_ASSETS].sort();
  if (JSON.stringify([...m.expectedFiles].sort()) !== JSON.stringify(expected) ||
      JSON.stringify(Object.keys(m.sha256).sort()) !== JSON.stringify(expected)) {
    fail('manifest file inventory mismatch');
  }
  for (const name of VOICE_ASSETS) {
    const hash = m.sha256[name];
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) ||
        createHash('sha256').update(contents.get(name)!).digest('hex') !== hash) {
      fail('manifest sha256 mismatch: ' + name);
    }
  }
  return m;
}
function unusedDestination(file: string): void {
  try { fs.lstatSync(file); fail('staging path already exists'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
/** Parse, verify and then materialize a strictly bounded Voice Pack, no tar subprocess. */
export function extractValidatedVoiceArchive(tarball: string, stage: string, version: string): VoicePackManifest {
  const stat = fs.lstatSync(tarball);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_COMPRESSED) fail('compressed archive budget');
  const root = fs.lstatSync(stage);
  if (!root.isDirectory() || root.isSymbolicLink()) fail('unsafe staging root');
  let bytes: Buffer;
  try { bytes = gunzipSync(fs.readFileSync(tarball), { maxOutputLength: MAX_EXPANDED }); }
  catch { fail('invalid or oversized gzip stream'); }
  const entries = inspectTar(bytes);
  const manifest = validateManifest(entries, version);
  for (const dir of ['piper', 'whisper', MANIFEST]) unusedDestination(path.join(stage, dir));
  for (const dir of ['piper', 'whisper']) fs.mkdirSync(path.join(stage, dir), { mode: 0o700 });
  for (const [name, data] of entries) {
    fs.writeFileSync(path.join(stage, name), data, { flag: 'wx', mode: 0o600 });
  }
  return manifest;
}
