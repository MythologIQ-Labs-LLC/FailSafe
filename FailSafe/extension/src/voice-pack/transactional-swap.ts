/**
 * #710: failure-atomic replacement of an already-validated optional Voice Pack.
 *
 * This does NOT validate a tar archive or authenticate a downloaded manifest.
 * Call only after extraction to a private staging directory and complete
 * content/provenance verification.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomBytes } from 'crypto';
import { VOICE_ASSETS } from './safe-archive';

export interface VoiceSwapOps {
  existsSync: typeof fs.existsSync;
  lstatSync: typeof fs.lstatSync;
  readFileSync: typeof fs.readFileSync;
  readdirSync: typeof fs.readdirSync;
  mkdirSync: typeof fs.mkdirSync;
  copyFileSync: typeof fs.copyFileSync;
  renameSync: typeof fs.renameSync;
  rmSync: typeof fs.rmSync;
}
export interface VoiceSwapResult {
  staleBackup?: string;
  cleanupWarnings: string[];
}

const REQUIRED_FILES = new Set([...VOICE_ASSETS, 'voice-pack.manifest.json']);
const REQUIRED_DIRS = new Set(['piper', 'whisper']);

/** The copy phase must not trust a mutable staging directory's inventory. */
function copyPayload(
  source: string, target: string, stagingTarball: string, io: VoiceSwapOps,
  seen: Set<string>, prefix = '',
): void {
  for (const ent of io.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, ent.name);
    if (src === stagingTarball) continue;
    const rel = prefix ? prefix + '/' + ent.name : ent.name;
    const dest = path.join(target, ent.name);
    if (ent.isSymbolicLink()) throw new Error('voice pack contains a symlink: ' + rel);
    if (ent.isDirectory()) {
      if (!REQUIRED_DIRS.has(rel)) throw new Error('unlisted staged voice directory: ' + rel);
      io.mkdirSync(dest, { recursive: false, mode: 0o700 });
      copyPayload(src, dest, stagingTarball, io, seen, rel);
    } else if (ent.isFile()) {
      if (!REQUIRED_FILES.has(rel) || seen.has(rel)) throw new Error('unlisted staged voice asset: ' + rel);
      io.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
      seen.add(rel);
    } else {
      throw new Error('voice pack contains unsupported filesystem entry: ' + rel);
    }
  }
}

/** Recheck copied final bytes, not only the previously validated archive. */
function verifyPrepared(prepared: string, seen: Set<string>, io: VoiceSwapOps, tarball: string): void {
  const requested = /^failsafe-voice-pack-(\d+\.\d+\.\d+)\.tar\.gz$/.exec(path.basename(tarball));
  if (!requested) throw new Error('unexpected voice archive filename for promotion');
  if (seen.size !== REQUIRED_FILES.size || [...REQUIRED_FILES].some(name => !seen.has(name))) {
    throw new Error('incomplete staged voice asset inventory');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(io.readFileSync(path.join(prepared, 'voice-pack.manifest.json'), 'utf8')); }
  catch { throw new Error('prepared voice manifest cannot be read'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('prepared voice manifest schema mismatch');
  }
  const m = parsed as { version?: unknown; builtAt?: unknown; expectedFiles?: unknown; sha256?: unknown };
  if (m.version !== requested[1] || typeof m.builtAt !== 'string') {
    throw new Error('prepared voice manifest version differs from requested archive');
  }
  const expected = [...VOICE_ASSETS].sort();
  const hashes = m.sha256;
  if (!Array.isArray(m.expectedFiles) || JSON.stringify([...m.expectedFiles].sort()) !== JSON.stringify(expected) ||
      !hashes || typeof hashes !== 'object' || Array.isArray(hashes) ||
      JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(expected)) {
    throw new Error('prepared voice manifest inventory mismatch');
  }
  for (const name of VOICE_ASSETS) {
    const value = (hashes as Record<string, unknown>)[name];
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) ||
        createHash('sha256').update(io.readFileSync(path.join(prepared, name))).digest('hex') !== value) {
      throw new Error('prepared voice asset checksum mismatch: ' + name);
    }
  }
}

function entryExists(file: string, io: VoiceSwapOps): boolean {
  try { io.lstatSync(file); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function requireRealDestination(final: string, io: VoiceSwapOps): boolean {
  if (!entryExists(final, io)) return false;
  const stat = io.lstatSync(final);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('voice pack destination must be a real directory');
  }
  return true;
}

function checkSwapPaths(stage: string, dest: string, tar: string, io: VoiceSwapOps) {
  if (!path.isAbsolute(stage) || !path.isAbsolute(dest)) {
    throw new Error('voice pack installation requires absolute paths');
  }
  const staging = path.resolve(stage);
  const final = path.resolve(dest);
  const stagingStat = io.lstatSync(staging);
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()) {
    throw new Error('voice pack staging root must be a real directory');
  }
  if (staging === final || staging.startsWith(final + path.sep) || final.startsWith(staging + path.sep)) {
    throw new Error('staging and destination must be disjoint');
  }
  if (path.resolve(tar) !== path.join(staging, path.basename(tar))) {
    throw new Error('voice pack tarball must be directly within staging');
  }
  return { staging, final };
}

function promotePrepared(prepared: string, final: string, backup: string, io: VoiceSwapOps): boolean {
  const movedOld = requireRealDestination(final, io);
  if (movedOld) io.renameSync(final, backup);
  try { io.renameSync(prepared, final); }
  catch (installError) {
    if (!movedOld) throw installError;
    try { io.renameSync(backup, final); }
    catch (restoreError) {
      throw new AggregateError(
        [installError, restoreError],
        'Voice pack promotion and rollback failed. Prior installation is preserved at ' + backup,
      );
    }
    throw installError;
  }
  return movedOld;
}

function cleanupAfterPromotion(
  staging: string, backup: string, movedOld: boolean, io: VoiceSwapOps,
): VoiceSwapResult {
  const warnings: string[] = [];
  if (movedOld) {
    try { io.rmSync(backup, { recursive: true, force: true }); }
    catch (e) { warnings.push('Previous voice pack backup cleanup failed: ' + String(e)); }
  }
  try { io.rmSync(staging, { recursive: true, force: true }); }
  catch (e) { warnings.push('Temporary voice pack cleanup failed: ' + String(e)); }
  return {
    staleBackup: movedOld && io.existsSync(backup) ? backup : undefined,
    cleanupWarnings: warnings,
  };
}

/** Recoverably install a validated staging directory without trusting existing transaction links. */
export function atomicSwapVoicePack(
  stagingDir: string,
  finalDir: string,
  stagingTarball: string,
  options: { ops?: VoiceSwapOps; token?: string } = {},
): VoiceSwapResult {
  const io: VoiceSwapOps = options.ops ?? fs;
  const { staging, final } = checkSwapPaths(stagingDir, finalDir, stagingTarball, io);
  const token = options.token ?? randomBytes(12).toString('hex');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(token)) throw new Error('invalid transaction token');
  const backup = final + '.old-' + token;
  const prepared = final + '.new-' + token;
  if (entryExists(backup, io) || entryExists(prepared, io)) {
    throw new Error('voice pack transaction path collision; refusing overwrite');
  }
  requireRealDestination(final, io);
  io.mkdirSync(path.dirname(final), { recursive: true });
  try {
    io.mkdirSync(prepared, { recursive: false, mode: 0o700 });
    const seen = new Set<string>();
    copyPayload(staging, prepared, path.resolve(stagingTarball), io, seen);
    verifyPrepared(prepared, seen, io, stagingTarball);
    const movedOld = promotePrepared(prepared, final, backup, io);
    return cleanupAfterPromotion(staging, backup, movedOld, io);
  } catch (error) {
    if (entryExists(prepared, io)) {
      try { io.rmSync(prepared, { recursive: true, force: true }); }
      catch { /* leave forensic evidence of interrupted preparation; keep original error */ }
    }
    throw error;
  }
}

/** Keep both installer and staging-cleanup errors instead of hiding the recovery cause. */
export function preserveVoiceInstallFailure(
  stagingDir: string, original: unknown, io: Pick<VoiceSwapOps, 'rmSync'> = fs,
): Error {
  const primary = original instanceof Error ? original : new Error(String(original));
  try { io.rmSync(stagingDir, { recursive: true, force: true }); }
  catch (cleanupError) {
    return new AggregateError(
      [primary, cleanupError], 'Voice pack install and cleanup failed: ' + primary.message,
    );
  }
  return primary;
}

/** Diagnostic channels may be disposed while an upgrade completes. Never misreport success. */
export function reportVoiceCleanupWarning(
  output: { appendLine(message: string): void } | undefined, warning: string,
): void {
  try { output?.appendLine('[voice-pack] install cleanup warning: ' + warning); }
  catch { /* a disposed output channel cannot undo a committed installation */ }
}
