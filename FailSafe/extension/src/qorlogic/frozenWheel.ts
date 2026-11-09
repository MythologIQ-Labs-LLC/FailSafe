/**
 * #463: immutable, independently PyPI-attested qor-logic v0.176.1 wheel identity.
 * Verifies staged bytes, NOT installed consumer behavior or dependency provenance.
 * A bounded read/copy prevents a user-selected giant file from exhausting memory.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const FROZEN_QOR_WHEEL_NAME = 'qor_logic-0.176.1-py3-none-any.whl';
export const FROZEN_QOR_WHEEL_SHA256 = 'dd6eec66ce54b3f13f19b6af2cd802b02dde1787142b2f81a27a7ba8ee5c0e31';
/** The published wheel is ~2.6 MB. Reject unexpected oversized inputs. */
export const MAX_FROZEN_QOR_WHEEL_BYTES = 16 * 1024 * 1024;

type WheelRefusal = 'invalid-wheel-path' | 'unverified-wheel' | 'wheel-too-large';
export class WheelVerificationError extends Error {
  constructor(public readonly reason: WheelRefusal) {
    super(reason);
    this.name = 'WheelVerificationError';
  }
}

/** Hash and stage an already-open file descriptor, never an unchecked path. */
function copyAndVerify(sourceFd: number, staged: string): void {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(128 * 1024);
  const destFd = fs.openSync(staged, 'wx', 0o600);
  let total = 0;
  try {
    while (true) {
      const read = fs.readSync(sourceFd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      total += read;
      if (total > MAX_FROZEN_QOR_WHEEL_BYTES) {
        throw new WheelVerificationError('wheel-too-large');
      }
      hash.update(buffer.subarray(0, read));
      let written = 0;
      while (written < read) {
        const n = fs.writeSync(destFd, buffer, written, read - written);
        if (n <= 0) throw new WheelVerificationError('unverified-wheel');
        written += n;
      }
    }
  } finally {
    fs.closeSync(destFd);
  }
  if (!total || hash.digest('hex') !== FROZEN_QOR_WHEEL_SHA256) {
    throw new WheelVerificationError('unverified-wheel');
  }
}

/** Verify private staged bytes; clean up on success, refusal and errors. */
export async function withVerifiedQorWheel<T>(
  selectedPath: string,
  use: (verifiedPath: string) => Promise<T>,
): Promise<T> {
  if (!path.isAbsolute(selectedPath) || path.basename(selectedPath) !== FROZEN_QOR_WHEEL_NAME) {
    throw new WheelVerificationError('invalid-wheel-path');
  }
  // Reject direct links. After opening, fstat binds size/type to the exact
  // file descriptor rather than a possibly replaced pathname.
  let entry: fs.Stats;
  try { entry = fs.lstatSync(selectedPath); } catch {
    throw new WheelVerificationError('invalid-wheel-path');
  }
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new WheelVerificationError('invalid-wheel-path');
  }
  let sourceFd: number | undefined;
  try {
    sourceFd = fs.openSync(selectedPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const stat = fs.fstatSync(sourceFd);
    if (!stat.isFile() || stat.size <= 0) {
      throw new WheelVerificationError('invalid-wheel-path');
    }
    if (stat.size > MAX_FROZEN_QOR_WHEEL_BYTES) {
      throw new WheelVerificationError('wheel-too-large');
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-qor-wheel-'));
    try {
      fs.chmodSync(dir, 0o700);
      const staged = path.join(dir, FROZEN_QOR_WHEEL_NAME);
      copyAndVerify(sourceFd, staged);
      return await use(staged);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    if (sourceFd !== undefined) fs.closeSync(sourceFd);
  }
}
