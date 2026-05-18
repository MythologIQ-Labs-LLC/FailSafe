// Voice-pack detector — install-state probe over <globalStoragePath>/voice-pack/.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { VoicePackManifest, VoicePackProbeResult } from './types';

const MANIFEST_FILENAME = 'voice-pack.manifest.json';
const PACK_DIR = 'voice-pack';
const SAFE_PATH_RE = /\.\.[\\/]/;

/**
 * Probe install state of the voice pack at <globalStoragePath>/voice-pack/.
 * Reads manifest, validates each expectedFile against its declared sha256,
 * compares manifest.version against requiredMinVersion. Pure-fs read; no
 * spawn, no network.
 *
 * Returns:
 *   - { state: 'absent' } when the pack directory does not exist
 *   - { state: 'installed', version, manifestPath } when manifest + files
 *     valid and version >= requiredMinVersion
 *   - { state: 'stale', version } when manifest valid but version is below
 *     requiredMinVersion (downgrade-tolerant: operator decides)
 *   - { state: 'corrupt', missingFiles } when manifest exists but at least
 *     one expectedFile is missing OR fails sha256
 *
 * Throws on path traversal in globalStoragePath (defense in depth).
 */
export async function probeVoicePackState(
  globalStoragePath: string,
  requiredMinVersion: string,
): Promise<VoicePackProbeResult> {
  if (typeof globalStoragePath !== 'string' || globalStoragePath.length === 0) {
    throw new Error('unsafe globalStoragePath: empty');
  }
  if (SAFE_PATH_RE.test(globalStoragePath)) {
    throw new Error('unsafe globalStoragePath: path traversal segment detected');
  }

  const packDir = path.join(globalStoragePath, PACK_DIR);
  if (!fs.existsSync(packDir)) {
    return { state: 'absent' };
  }

  const manifestPath = path.join(packDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return { state: 'corrupt', manifestPath, missingFiles: [MANIFEST_FILENAME] };
  }

  let manifest: VoicePackManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as VoicePackManifest;
  } catch {
    return { state: 'corrupt', manifestPath, missingFiles: [MANIFEST_FILENAME] };
  }
  if (!isValidManifest(manifest)) {
    return { state: 'corrupt', manifestPath, missingFiles: [MANIFEST_FILENAME] };
  }

  const missing = verifyFiles(packDir, manifest);
  if (missing.length > 0) {
    return { state: 'corrupt', version: manifest.version, manifestPath, missingFiles: missing };
  }

  if (compareSemver(manifest.version, requiredMinVersion) < 0) {
    return { state: 'stale', version: manifest.version, manifestPath };
  }

  return { state: 'installed', version: manifest.version, manifestPath };
}

function isValidManifest(m: unknown): m is VoicePackManifest {
  if (!m || typeof m !== 'object') return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.version === 'string'
    && typeof obj.builtAt === 'string'
    && Array.isArray(obj.expectedFiles)
    && obj.sha256 !== null
    && typeof obj.sha256 === 'object'
  );
}

function verifyFiles(packDir: string, manifest: VoicePackManifest): string[] {
  const missing: string[] = [];
  for (const rel of manifest.expectedFiles) {
    const abs = path.join(packDir, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const expected = manifest.sha256[rel];
    if (!expected) {
      missing.push(rel);
      continue;
    }
    const actual = createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (actual !== expected) {
      missing.push(rel);
    }
  }
  return missing;
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b. Strict 3-part semver only. */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}
