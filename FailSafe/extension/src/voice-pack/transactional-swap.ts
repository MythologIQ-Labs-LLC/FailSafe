/**
 * #710: failure-atomic replacement of an already-validated optional Voice Pack.
 *
 * This does NOT validate a tar archive or authenticate a downloaded manifest.
 * Call only after extraction to a private staging directory and complete
 * content/provenance verification.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export interface VoiceSwapOps {
  existsSync: typeof fs.existsSync;
  lstatSync: typeof fs.lstatSync;
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

function copyPayload(source: string, target: string, stagingTarball: string, io: VoiceSwapOps): void {
  for (const ent of io.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, ent.name);
    if (src === stagingTarball) continue;
    const dest = path.join(target, ent.name);
    if (ent.isSymbolicLink()) throw new Error('voice pack contains a symlink: ' + ent.name);
    if (ent.isDirectory()) {
      io.mkdirSync(dest, { recursive: false, mode: 0o700 });
      copyPayload(src, dest, stagingTarball, io);
    } else if (ent.isFile()) {
      io.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
    } else {
      throw new Error('voice pack contains unsupported filesystem entry: ' + ent.name);
    }
  }
}

/**
 * Commits a verified staging directory to global storage.
 * If promotion fails after moving the old pack aside, restore the old pack.
 * If recovery itself fails, preserve the old directory at .old-<token>.
 * Post-promotion cleanup warnings do not misreport a successful installation.
 */
export function atomicSwapVoicePack(
  stagingDir: string,
  finalDir: string,
  stagingTarball: string,
  options: { ops?: VoiceSwapOps; token?: string } = {},
): VoiceSwapResult {
  const io: VoiceSwapOps = options.ops ?? fs;
  const stagingStat = io.lstatSync(stagingDir);
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()) {
    throw new Error('voice pack staging root must be a real directory');
  }
  if (!path.isAbsolute(finalDir) || !path.isAbsolute(stagingDir)) {
    throw new Error('voice pack installation requires absolute paths');
  }
  const final = path.resolve(finalDir);
  const staging = path.resolve(stagingDir);
  const parent = path.dirname(final);
  if (staging === final || staging.startsWith(final + path.sep) || final.startsWith(staging + path.sep)) {
    throw new Error('staging and destination must be disjoint');
  }
  if (path.resolve(stagingTarball) !== path.join(staging, path.basename(stagingTarball))) {
    throw new Error('voice pack tarball must be directly within staging');
  }
  io.mkdirSync(parent, { recursive: true });

  const token = options.token ?? randomBytes(12).toString('hex');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(token)) throw new Error('invalid transaction token');
  const backup = final + '.old-' + token;
  const prepared = final + '.new-' + token;
  if (io.existsSync(backup) || io.existsSync(prepared)) {
    throw new Error('voice pack transaction path collision; refusing overwrite');
  }
  const warnings: string[] = [];
  let movedOld = false;
  let promoted = false;
  let rollbackFailed = false;
  try {
    io.mkdirSync(prepared, { recursive: false, mode: 0o700 });
    copyPayload(staging, prepared, path.resolve(stagingTarball), io);
    if (io.existsSync(final)) {
      io.renameSync(final, backup);
      movedOld = true;
    }
    try {
      io.renameSync(prepared, final);
      promoted = true;
    } catch (installError) {
      if (movedOld) {
        try {
          io.renameSync(backup, final);
          movedOld = false;
        } catch (restoreError) {
          rollbackFailed = true;
          throw new AggregateError(
            [installError, restoreError],
            'Voice pack promotion and rollback failed. Prior installation is preserved at ' + backup,
          );
        }
      }
      throw installError;
    }
  } finally {
    if (!promoted && io.existsSync(prepared)) {
      try { io.rmSync(prepared, { recursive: true, force: true }); }
      catch (e) { warnings.push('Failed to remove unpromoted voice pack staging: ' + String(e)); }
    }
    if (rollbackFailed && !io.existsSync(backup)) {
      warnings.push('Voice pack rollback failed and backup is unexpectedly missing');
    }
  }
  if (movedOld) {
    try { io.rmSync(backup, { recursive: true, force: true }); }
    catch (e) { warnings.push('Previous voice pack backup cleanup failed: ' + String(e)); }
  }
  try { io.rmSync(staging, { recursive: true, force: true }); }
  catch (e) { warnings.push('Temporary voice pack cleanup failed: ' + String(e)); }
  return { staleBackup: movedOld && io.existsSync(backup) ? backup : undefined, cleanupWarnings: warnings };
}
