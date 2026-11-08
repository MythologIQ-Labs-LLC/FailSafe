/**
 * #463: immutable, independently PyPI-attested qor-logic v0.176.1 wheel identity.
 * This verifies bytes only, not consumer conformance or dependency provenance.
 * No network I/O and no subprocess here. Copy to a private directory before
 * verifying so pip never consumes a mutable operator-selected source path.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const FROZEN_QOR_WHEEL_NAME = 'qor_logic-0.176.1-py3-none-any.whl';
export const FROZEN_QOR_WHEEL_SHA256 = 'dd6eec66ce54b3f13f19b6af2cd802b02dde1787142b2f81a27a7ba8ee5c0e31';

export class WheelVerificationError extends Error {
  constructor(public readonly reason: 'invalid-wheel-path' | 'unverified-wheel') {
    super(reason);
    this.name = 'WheelVerificationError';
  }
}

/** Verify a private staged copy; remove the copy on success, refusal or failure. */
export async function withVerifiedQorWheel<T>(
  selectedPath: string,
  use: (verifiedPath: string) => Promise<T>,
): Promise<T> {
  if (!path.isAbsolute(selectedPath) || path.basename(selectedPath) !== FROZEN_QOR_WHEEL_NAME) {
    throw new WheelVerificationError('invalid-wheel-path');
  }
  let stat: fs.Stats;
  try { stat = fs.lstatSync(selectedPath); } catch { throw new WheelVerificationError('invalid-wheel-path'); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new WheelVerificationError('invalid-wheel-path');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-qor-wheel-'));
  try {
    fs.chmodSync(dir, 0o700);
    const staged = path.join(dir, FROZEN_QOR_WHEEL_NAME);
    fs.copyFileSync(selectedPath, staged, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(staged, 0o600);
    const bytes = fs.readFileSync(staged);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== FROZEN_QOR_WHEEL_SHA256) throw new WheelVerificationError('unverified-wheel');
    return await use(staged);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
