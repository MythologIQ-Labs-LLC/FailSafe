// Voice Pack activation probe. Treat on-disk manifests as untrusted input.
// A successfully downloaded archive can be modified before a later launch.
// This is a bounded read-only check, not proof of publisher authenticity.
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { VOICE_ASSETS } from './safe-archive';
import * as publisher from './publisher-auth';
import type { VoicePackManifest, VoicePackProbeResult } from './types';

const MANIFEST = 'voice-pack.manifest.json';
const MAX_MANIFEST = 64 * 1024;
const MAX_FILE = 75 * 1024 * 1024;
const MAX_TOTAL = 160 * 1024 * 1024;
const EXPECTED = [...VOICE_ASSETS].sort();
const OPEN_SAFE = fs.constants.O_RDONLY |
  (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
const VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;

function regular(file: string, limit: number): fs.Stats {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size === 0 || st.size > limit) {
    throw new Error('voice asset must be a bounded regular file');
  }
  return st;
}

function openChecked(file: string, before: fs.Stats): number {
  const fd = fs.openSync(file, OPEN_SAFE);
  try {
    const now = fs.fstatSync(fd);
    if (!now.isFile() || now.size !== before.size ||
        now.dev !== before.dev || now.ino !== before.ino) {
      throw new Error('voice file changed during inspection');
    }
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
  return fd;
}

function readBoundedBytes(file: string, limit: number): Buffer {
  const before = regular(file, limit);
  const fd = openChecked(file, before);
  try {
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (read === 0) throw new Error('voice manifest truncated');
      offset += read;
    }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error('voice manifest grew during inspection');
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function validManifest(value: unknown): value is VoicePackManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  const sha = m.sha256;
  if (JSON.stringify(Object.keys(m).sort()) !==
      JSON.stringify(['builtAt', 'expectedFiles', 'sha256', 'version']) ||
      typeof m.version !== 'string' || !VERSION.test(m.version) ||
      typeof m.builtAt !== 'string' ||
      !Array.isArray(m.expectedFiles) ||
      m.expectedFiles.some((item: unknown) => typeof item !== 'string') ||
      JSON.stringify([...m.expectedFiles].sort()) !== JSON.stringify(EXPECTED) ||
      !sha || typeof sha !== 'object' || Array.isArray(sha) ||
      JSON.stringify(Object.keys(sha).sort()) !== JSON.stringify(EXPECTED)) return false;
  return EXPECTED.every(name =>
    typeof (sha as Record<string, unknown>)[name] === 'string' &&
    SHA256.test((sha as Record<string, string>)[name]));
}

function hashBounded(file: string, before: fs.Stats): string {
  const fd = openChecked(file, before);
  const hash = createHash('sha256');
  const buf = Buffer.allocUnsafe(64 * 1024);
  try {
    let remaining = before.size;
    while (remaining) {
      const n = fs.readSync(fd, buf, 0, Math.min(remaining, buf.length), null);
      if (n === 0) throw new Error('voice asset truncated during inspection');
      hash.update(buf.subarray(0, n));
      remaining -= n;
    }
    if (fs.readSync(fd, buf, 0, 1, null) !== 0) {
      throw new Error('voice asset grew during inspection');
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function verifyPayload(packDir: string, manifest: VoicePackManifest): string[] {
  const bad: string[] = [];
  const top = fs.readdirSync(packDir, { withFileTypes: true });
  const allowedTop = new Set([MANIFEST, 'piper', 'whisper',
    'voice-pack-release.json', 'voice-pack-release.json.sig']);
  for (const entry of top) if (!allowedTop.has(entry.name)) bad.push(entry.name);

  let total = 0;
  for (const group of ['piper', 'whisper']) {
    const folder = path.join(packDir, group);
    const groupFiles = EXPECTED.filter(name => name.startsWith(group + '/'));
    try {
      const st = fs.lstatSync(folder);
      if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('linked voice directory');
      const allowed = new Set(groupFiles.map(name => path.basename(name)));
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (!allowed.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
          bad.push(group + '/' + entry.name);
        }
      }
    } catch {
      bad.push(...groupFiles);
      continue;
    }
    for (const rel of groupFiles) {
      try {
        const file = path.join(packDir, rel);
        const st = regular(file, MAX_FILE);
        total += st.size;
        if (total > MAX_TOTAL || hashBounded(file, st) !== manifest.sha256[rel]) {
          bad.push(rel);
        }
      } catch { bad.push(rel); }
    }
  }
  return [...new Set(bad)];
}

function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** Read-only status; any untrusted or malformed installed tree is CORRUPT. */
export async function probeVoicePackState(
  globalStoragePath: string,
  requiredMinVersion: string,
): Promise<VoicePackProbeResult> {
  if (!path.isAbsolute(globalStoragePath) ||
      globalStoragePath.split(/[\\/]/).includes('..')) {
    throw new Error('unsafe globalStoragePath: absolute path without traversal required');
  }
  const packDir = path.join(globalStoragePath, 'voice-pack');
  const manifestPath = path.join(packDir, MANIFEST);
  const corrupt = (names: string[] = [MANIFEST]): VoicePackProbeResult =>
    ({ state: 'corrupt', manifestPath, missingFiles: names });

  let pack: fs.Stats;
  try { pack = fs.lstatSync(packDir); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
    return corrupt();
  }
  if (!pack.isDirectory() || pack.isSymbolicLink()) return corrupt();
  let manifest: unknown;
  let manifestSha = '';
  try {
    const raw = readBoundedBytes(manifestPath, MAX_MANIFEST);
    manifestSha = createHash('sha256').update(raw).digest('hex');
    manifest = JSON.parse(raw.toString('utf8'));
  } catch { return corrupt(); }
  if (!validManifest(manifest)) return corrupt();

  let bad: string[];
  try { bad = verifyPayload(packDir, manifest); }
  catch { return corrupt(); }
  if (bad.length) return { state: 'corrupt', version: manifest.version, manifestPath, missingFiles: bad };
  try {
    const record = readBoundedBytes(path.join(packDir, 'voice-pack-release.json'), 4096);
    const signature = readBoundedBytes(path.join(packDir, 'voice-pack-release.json.sig'), 90);
    publisher.verifyInstalledVoiceAttestation(record, signature,
      publisher.loadPinnedVoicePublisherKey(), manifest.version, manifestSha);
  } catch {
    // Local SHA-256s alone never establish who published the executable assets.
    return corrupt(['voice-pack-release.json', 'voice-pack-release.json.sig']);
  }
  if (!VERSION.test(requiredMinVersion)) return corrupt();
  if (compareVersions(manifest.version, requiredMinVersion) < 0) {
    return { state: 'stale', version: manifest.version, manifestPath };
  }
  return { state: 'installed', version: manifest.version, manifestPath };
}
