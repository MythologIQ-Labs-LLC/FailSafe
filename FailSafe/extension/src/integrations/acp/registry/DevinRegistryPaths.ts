// Devin Desktop ACP registry path + platform-key resolution (GH #172 Part 2).
//
// Devin Desktop launches ACP agents from a local registry. FailSafe registers a
// governed-proxy agent there so Devin launches the proxy (which wraps the real
// agent). Paths + the per-platform composite keys are verified against
// https://docs.devin.ai/desktop/acp (Devin keeps the `windsurf` naming
// post-rebrand; no `.devin` registry migration).
//
// Pure: no fs/network — `os.homedir()`/`process` are injectable for tests.

import * as os from 'os';
import * as path from 'path';

export type DevinChannel = 'stable' | 'next';

/**
 * Resolve the Devin Desktop local ACP registry file for a channel.
 *   stable → `<home>/.windsurf/acp/registry.json`
 *   next   → `<home>/.windsurf-next/acp/registry.json`
 */
export function devinRegistryPath(channel: DevinChannel = 'stable', home: string = os.homedir()): string {
  const dir = channel === 'next' ? '.windsurf-next' : '.windsurf';
  return path.join(home, dir, 'acp', 'registry.json');
}

/** The six Devin composite platform keys under `distribution.binary`. */
export type DevinPlatformKey =
  | 'darwin-aarch64' | 'darwin-x86_64'
  | 'linux-aarch64' | 'linux-x86_64'
  | 'windows-aarch64' | 'windows-x86_64';

export const DEVIN_PLATFORM_KEYS: readonly DevinPlatformKey[] = [
  'darwin-aarch64', 'darwin-x86_64', 'linux-aarch64', 'linux-x86_64', 'windows-aarch64', 'windows-x86_64',
];

/**
 * Map a Node `platform`+`arch` to the Devin composite platform key, or `null`
 * when unsupported (so the caller can fail-loud rather than write a bad entry).
 * win32→windows, arm64→aarch64, x64→x86_64.
 */
export function devinPlatformKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): DevinPlatformKey | null {
  const osPart = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : platform === 'win32' ? 'windows' : null;
  const cpuPart = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : null;
  if (!osPart || !cpuPart) return null;
  return `${osPart}-${cpuPart}` as DevinPlatformKey;
}
