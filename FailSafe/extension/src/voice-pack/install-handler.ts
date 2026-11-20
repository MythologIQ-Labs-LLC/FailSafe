// Voice-pack install-handler — operator-triggered download + verify + extract.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.
// #538 (B261): redirects are followed one hop at a time by fetchAllowlisted —
// each hop checked against the GitHub host allowlist before it is requested,
// each response checked for a redirect the fetch followed by itself — so no
// body reaches disk from a non-GitHub host.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { extractValidatedVoiceArchive } from './safe-archive';
import { assertRemovableVoicePack } from './uninstall-boundary';
import { fetchAllowlisted } from './allowlisted-fetch';
import * as publisher from './publisher-auth';
import { verifyPublisherBeforePromotion } from './release-attestation-fetch';
import { refuseSignedVoiceDowngrade } from './signed-version-guard';
import { atomicSwapVoicePack, preserveVoiceInstallFailure, reportVoiceCleanupWarning } from './transactional-swap';
import {
  InstallReport,
  InstallVoicePackOptions,
  InstallProgressEvent,
  VoicePackDownloadProvenance,
  VoicePackManifest,
} from './types';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const MAX_PACK_DOWNLOAD_BYTES = 96 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 8 * 1024;
const PACK_FILENAME = (version: string) => `failsafe-voice-pack-${version}.tar.gz`;
const RELEASE_BASE = 'https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download';

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

/** Resolve and verify both voice release downloads before touching installed assets. */
async function downloadAndVerifyPack(
  opts: InstallVoicePackOptions,
  tarballUrl: string, checksumUrl: string, stagingTarball: string,
) {
  emit(opts, { phase: 'download', status: 'running' });
  const tarball = await downloadToFile(tarballUrl, stagingTarball);
  emit(opts, { phase: 'download', status: 'success' });

  emit(opts, { phase: 'verify', status: 'running' });
  const { expected, provenance: checksum } = await fetchChecksum(checksumUrl, path.basename(stagingTarball));
  const actual = sha256OfFile(stagingTarball);
  if (actual !== expected) {
    throw new Error(`sha256 mismatch: expected ${expected}, got ${actual}`);
  }
  logProvenance(opts, 'tarball', tarball, actual);
  logProvenance(opts, 'checksum', checksum, expected);
  return { tarball, checksum, actual };
}

/**
 * The VS Code globalStorage path is trusted only when it names a real local
 * directory. Never follow a link at the application storage boundary into
 * another directory during an opt-in install or uninstall.
 */
function requireVoiceStorageRoot(root: string): string {
  if (!path.isAbsolute(root)) throw new Error('voice pack storage root must be absolute');
  const canonical = path.resolve(root);
  if (canonical === path.parse(canonical).root) {
    throw new Error('voice pack storage root must not be a filesystem root');
  }
  let cursor = path.parse(canonical).root;
  // Check each existing ancestor before creating a missing child: recursive
  // mkdir would otherwise follow a linked parent outside VS Code's storage.
  for (const segment of canonical.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const stat = fs.lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error('voice pack storage root must be a real directory, without linked ancestors');
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      fs.mkdirSync(cursor, { mode: 0o700 });
    }
  }
  return canonical;
}

/** Public entry — download, verify, extract, atomic-rename. Throws on failure. */
export async function installVoicePack(opts: InstallVoicePackOptions): Promise<InstallReport> {
  const { globalStoragePath, version } = opts;
  const tarballUrl = resolveVoicePackUrl(version);
  const checksumUrl = resolveVoicePackChecksumUrl(version);

  // Refuse linked/untrusted storage before downloading unverified archive bytes.
  const storageRoot = requireVoiceStorageRoot(globalStoragePath);
  // The canonical public key is part of the reviewed VSIX, never a field
  // supplied by the caller or downloaded alongside the Voice Pack.
  const pinnedPublisher = publisher.loadPinnedVoicePublisherKey();
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-staging-'));
  const stagingTarball = path.join(stagingDir, PACK_FILENAME(version));

  try {
    await refuseSignedVoiceDowngrade(storageRoot, version);
    const { tarball, checksum, actual } = await downloadAndVerifyPack(opts, tarballUrl, checksumUrl, stagingTarball);

    emit(opts, { phase: 'extract', status: 'running' });
    // No external tar extraction. Complete header, path, type, size, manifest
    // and SHA-256 validation before any voice asset is written to staging.
    const manifest = extractValidatedVoiceArchive(stagingTarball, stagingDir, version);
    emit(opts, { phase: 'extract', status: 'success' });
    emit(opts, { phase: 'manifest-verify', status: 'success' });

    // Require a publisher signature bound to *this* archive and the exact
    // verified manifest bytes, before displacing any existing installation.
    const signed = await verifyPublisherBeforePromotion(version, actual,
      path.join(stagingDir, 'voice-pack.manifest.json'), pinnedPublisher);
    // Persist the exact authenticated receipt with the payload. On the next
    // launch the read-only probe can independently reauthenticate the files.
    fs.writeFileSync(path.join(stagingDir, 'voice-pack-release.json'),
      signed.record, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(stagingDir, 'voice-pack-release.json.sig'),
      signed.signature, { flag: 'wx', mode: 0o600 });
    emit(opts, { phase: 'verify', status: 'success' });

    const finalDir = path.join(storageRoot, 'voice-pack');
    // A newer, still-authentic pack must not be replaced mid-download.
    await refuseSignedVoiceDowngrade(storageRoot, version);
    const swap = atomicSwapVoicePack(stagingDir, finalDir, stagingTarball);
    for (const warning of swap.cleanupWarnings) {
      reportVoiceCleanupWarning(opts.output, warning);
    }

    return { ok: true, version: manifest.version, finalPath: finalDir, provenance: { tarball, checksum, sha256: actual } };
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    const failure = preserveVoiceInstallFailure(stagingDir, err);
    try {
      emit(opts, { phase: currentPhaseFromError(originalMessage), status: 'error', error: failure.message });
    } catch { /* a reporting callback must not replace the installation failure */ }
    throw failure;
  }
}

/** Public entry — rm-rf <globalStoragePath>/voice-pack/. Idempotent. */
export function uninstallVoicePack(globalStoragePath: string): void {
  const storageRoot = requireVoiceStorageRoot(globalStoragePath);
  const packDir = path.join(storageRoot, 'voice-pack');
  let stat: fs.Stats;
  try { stat = fs.lstatSync(packDir); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('voice pack uninstall refused: destination is not a real directory');
  }
  assertRemovableVoicePack(packDir);
  fs.rmSync(packDir, { recursive: true, force: false });
}

// ── Internals ──────────────────────────────────────────────────────────

function emit(opts: InstallVoicePackOptions, evt: InstallProgressEvent): void {
  opts.onProgress?.(evt);
  if (opts.output && evt.status !== 'running') {
    opts.output.appendLine(`[voice-pack] ${evt.phase} ${evt.status}${evt.error ? `: ${evt.error}` : ''}`);
  }
}

function logProvenance(opts: InstallVoicePackOptions, what: string, p: VoicePackDownloadProvenance, sha256: string): void {
  opts.output?.appendLine(`[voice-pack] provenance ${what} ${p.requestedUrl} -> ${p.finalUrl} sha256 ${sha256}`);
}

async function downloadToFile(url: string, destPath: string): Promise<VoicePackDownloadProvenance> {
  const { response: res, requestedUrl, finalUrl } = await fetchAllowlisted(url, 'download failed');
  if (!res.body) throw new Error('download failed: empty response body');
  const claimed = Number(res.headers.get('content-length'));
  if (Number.isFinite(claimed) && claimed > MAX_PACK_DOWNLOAD_BYTES) {
    throw new Error('download failed: compressed voice pack exceeds size budget');
  }
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > MAX_PACK_DOWNLOAD_BYTES) {
        done(new Error('download failed: compressed voice pack exceeds size budget'));
      } else done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream),
    limiter, fs.createWriteStream(destPath, { flags: 'wx', mode: 0o600 }));
  return { requestedUrl, finalUrl };
}

async function fetchChecksum(url: string, expectedFilename: string): Promise<{ expected: string; provenance: VoicePackDownloadProvenance }> {
  const { response: res, requestedUrl, finalUrl } = await fetchAllowlisted(url, 'checksum fetch failed');
  if (!res.body) throw new Error('checksum fetch failed: empty body');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream)) {
    bytes += chunk.length;
    if (bytes > MAX_CHECKSUM_BYTES) throw new Error('checksum fetch failed: response exceeds budget');
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  // Require the one exact output from our packager, not a digest prefix
  // followed by a different asset name, extra records, or a shell marker.
  const match = /^([a-f0-9]{64}) {2}([^\r\n]+)\r?\n?$/i.exec(text);
  if (!match || match[2] !== expectedFilename) {
    throw new Error('checksum fetch failed: malformed or mismatched archive filename');
  }
  return { expected: match[1].toLowerCase(), provenance: { requestedUrl, finalUrl } };
}

function sha256OfFile(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}


/** Classify by the failure prefix only; a message can quote a hostname (#538). */
function currentPhaseFromError(msg: string): InstallProgressEvent['phase'] {
  if (msg.startsWith('download failed')) return 'download';
  if (msg.startsWith('checksum fetch failed') || msg.startsWith('sha256 mismatch') ||
      msg.startsWith('publisher authentication refused')) return 'verify';
  if (msg.startsWith('tar extract')) return 'extract';
  if (/^(extracted |manifest )/.test(msg)) return 'manifest-verify';
  // A failed filesystem promotion or unsafe storage root must not tell the
  // operator the network download failed. The exact cause remains in error.
  return 'install';
}
