/** Refuse a release downgrade while a newer publisher-authenticated pack
 * is installed. A removed/corrupted install cannot establish monotonic state:
 * this is not a hardware-backed rollback counter.
 */
import { probeVoicePackState } from './voice-pack-detector';

function newerThan(current: string, requested: string): boolean {
  const a = current.split('.').map(BigInt);
  const b = requested.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export async function refuseSignedVoiceDowngrade(
  storageRoot: string, requestedVersion: string,
): Promise<void> {
  const state = await probeVoicePackState(storageRoot, requestedVersion);
  if (state.state === 'installed' && state.version &&
      newerThan(state.version, requestedVersion)) {
    throw new Error('publisher authentication refused: signed Voice Pack downgrade from ' +
      state.version + ' to ' + requestedVersion);
  }
}
