// Voice-pack install-handler — operator-triggered download + verify + extract.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.
// F3 remediation (audit cycle 1): Node 20+ built-in fetch with redirect:follow
// plus bounded post-fetch host allowlist (no body to disk from non-GitHub).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import {
  ALLOWED_REDIRECT_HOSTS,
  InstallReport,
  InstallVoicePackOptions,
  InstallProgressEvent,
  VoicePackManifest,
} from './types';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const PACK_FILENAME = (version: string) => `failsafe-voice-pack-${version}.tar.gz`;
const RELEASE_BASE = 'https://github.com/MythologIQ/FailSafe/releases/download';

/** Resolve the canonical GitHub Releases asset URL for a given extension version. */
export function resolveVoicePackUrl(version: string): string {
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    throw new Error(`invalid version (semver MAJOR.MINOR.PATCH required): ${version}`);
  }
  return `${RELEASE_BASE}/v${version}-voice/${PACK_FILENAME(version)}`;
}

/** Resolve the companion sha256 file URL. */
function resolveVoicePackChecksumUrl(version: string): string {
  return `${resolveVoicePackUrl(version)}.sha256`;
}

/** Public entry — download, verify, extract, atomic-rename. Throws on failure. */
export async function installVoicePack(opts: InstallVoicePackOptions): Promise<InstallReport> {
  const { globalStoragePath, version } = opts;
  const tarballUrl = resolveVoicePackUrl(version);
  const checksumUrl = resolveVoicePackChecksumUrl(version);

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-staging-'));
  const stagingTarball = path.join(stagingDir, PACK_FILENAME(version));

  try {
    emit(opts, { phase: 'download', status: 'running' });
    await downloadToFile(tarballUrl, stagingTarball);
    emit(opts, { phase: 'download', status: 'success' });

    emit(opts, { phase: 'verify', status: 'running' });
    const expected = await fetchChecksum(checksumUrl);
    const actual = sha256OfFile(stagingTarball);
    if (actual !== expected) {
      throw new Error(`sha256 mismatch: expected ${expected}, got ${actual}`);
    }
    emit(opts, { phase: 'verify', status: 'success' });

    emit(opts, { phase: 'extract', status: 'running' });
    await runTarExtract(stagingTarball, stagingDir);
    emit(opts, { phase: 'extract', status: 'success' });

    emit(opts, { phase: 'manifest-verify', status: 'running' });
    const manifest = readAndValidateExtractedManifest(stagingDir);
    emit(opts, { phase: 'manifest-verify', status: 'success' });

    const finalDir = path.join(globalStoragePath, 'voice-pack');
    atomicSwap(stagingDir, finalDir, stagingTarball);

    return { ok: true, version: manifest.version, finalPath: finalDir };
  } catch (err) {
    cleanup(stagingDir);
    const msg = err instanceof Error ? err.message : String(err);
    emit(opts, { phase: currentPhaseFromError(msg), status: 'error', error: msg });
    throw err;
  }
}

/** Public entry — rm-rf <globalStoragePath>/voice-pack/. Idempotent. */
export function uninstallVoicePack(globalStoragePath: string): void {
  const packDir = path.join(globalStoragePath, 'voice-pack');
  fs.rmSync(packDir, { recursive: true, force: true });
}

// ── Internals ──────────────────────────────────────────────────────────

function emit(opts: InstallVoicePackOptions, evt: InstallProgressEvent): void {
  opts.onProgress?.(evt);
  if (opts.output && evt.status !== 'running') {
    opts.output.appendLine(`[voice-pack] ${evt.phase} ${evt.status}${evt.error ? `: ${evt.error}` : ''}`);
  }
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  }
  assertGitHubHost(res.url);
  if (!res.body) throw new Error('download failed: empty response body');
  await pipeline(Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream), fs.createWriteStream(destPath));
}

async function fetchChecksum(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`checksum fetch failed: HTTP ${res.status} for ${url}`);
  }
  assertGitHubHost(res.url);
  const text = await res.text();
  // sha256 file format: "<64-char-hex>  <filename>\n"
  const match = /^([a-f0-9]{64})\b/i.exec(text.trim());
  if (!match) {
    throw new Error('checksum fetch failed: malformed sha256 file');
  }
  return match[1].toLowerCase();
}

function assertGitHubHost(finalUrl: string): void {
  let host: string;
  try {
    host = new URL(finalUrl).hostname;
  } catch {
    throw new Error(`redirect target rejected: malformed final URL ${finalUrl}`);
  }
  if (!ALLOWED_REDIRECT_HOSTS.includes(host)) {
    throw new Error(`redirect target rejected: host ${host} not in allowlist`);
  }
}

function sha256OfFile(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function runTarExtract(tarballPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // --force-local: tells GNU tar / Cygwin tar to treat Windows-style paths
    // with drive letters as local filenames rather than as `host:path` SSH
    // remotes. Windows 10+ built-in tar.exe accepts the flag. Mirrors the
    // package-voice-pack.cjs assembler.
    const child = spawn('tar', ['--force-local', '-xzf', tarballPath, '-C', destDir], { shell: false });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(`tar extract failed (exit ${code}): ${stderr.trim()}`));
    });
  });
}

function readAndValidateExtractedManifest(stagingDir: string): VoicePackManifest {
  const manifestPath = path.join(stagingDir, 'voice-pack.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('extracted pack missing voice-pack.manifest.json');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as VoicePackManifest;
  for (const rel of manifest.expectedFiles) {
    const abs = path.join(stagingDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`extracted pack missing ${rel}`);
    }
    const expected = manifest.sha256[rel];
    if (!expected) {
      throw new Error(`manifest missing sha256 for ${rel}`);
    }
    const actual = sha256OfFile(abs);
    if (actual !== expected) {
      throw new Error(`extracted file sha256 mismatch for ${rel}`);
    }
  }
  return manifest;
}

function atomicSwap(stagingDir: string, finalDir: string, _stagingTarball: string): void {
  // Move staging payload to a sibling next to finalDir, then rename swap.
  // fs.renameSync is atomic on the same filesystem (globalStorage is one fs).
  const parent = path.dirname(finalDir);
  fs.mkdirSync(parent, { recursive: true });
  const oldDir = `${finalDir}.old-${Date.now()}`;
  const newDir = `${finalDir}.new-${Date.now()}`;
  // Build the new dir from staging (exclude the staging tarball + the staging root)
  fs.mkdirSync(newDir, { recursive: true });
  copyExtractedPayload(stagingDir, newDir);
  // Move existing finalDir aside (if any), then put newDir in place
  if (fs.existsSync(finalDir)) {
    fs.renameSync(finalDir, oldDir);
  }
  fs.renameSync(newDir, finalDir);
  fs.rmSync(oldDir, { recursive: true, force: true });
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

function copyExtractedPayload(srcDir: string, destDir: string): void {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    // Skip the tarball itself; keep only the extracted contents.
    if (entry.name.startsWith('failsafe-voice-pack-') && entry.name.endsWith('.tar.gz')) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyExtractedPayload(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanup(stagingDir: string): void {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

function currentPhaseFromError(msg: string): InstallProgressEvent['phase'] {
  if (/sha256|checksum/i.test(msg)) return 'verify';
  if (/tar extract/i.test(msg)) return 'extract';
  if (/manifest/i.test(msg)) return 'manifest-verify';
  return 'download';
}
