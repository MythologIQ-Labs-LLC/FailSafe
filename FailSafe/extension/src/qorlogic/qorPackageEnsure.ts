/** #463: installed-version decisions are separate from old readable-version floor. */
import type { IQorLogicPackageInstaller } from './QorLogicPackageInstaller';
import { FROZEN_QOR_LOGIC_VERSION } from './hostLayouts';

type EnsureResult =
  | { ok: true; command: string }
  | { ok: false; error: string; stderrTail?: string };

/** Read-only gate. Never mutate packages based on metadata that merely meets a floor. */
export async function checkFrozenQorPackage(
  installer: IQorLogicPackageInstaller,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = await installer.verifyInstalledVersion();
  if (status.installed === FROZEN_QOR_LOGIC_VERSION) {
    const health = await installer.verifyInstalledDependencies();
    return health.ok ? { ok: true } : { ok: false, error: health.error };
  }
  if (status.installed !== null) return { ok: false, error: `version-divergence: ${status.installed}` };
  return { ok: false, error: 'verified-wheel-required' };
}

/** Only a caller-provided approved wheel can trigger a fresh offline install. */
export async function ensureFrozenQorPackage(
  installer: IQorLogicPackageInstaller,
  approvedWheelPath?: string,
): Promise<EnsureResult> {
  const status = await installer.verifyInstalledVersion();
  if (status.installed === FROZEN_QOR_LOGIC_VERSION) {
    const health = await installer.verifyInstalledDependencies();
    if (!health.ok) return { ok: false, error: health.error, stderrTail: health.details };
    return { ok: true, command: `qor-logic ${status.installed} already installed (conformance not attested)` };
  }
  if (status.installed !== null) {
    return { ok: false, error: `version-divergence: installed ${status.installed}; frozen target ${FROZEN_QOR_LOGIC_VERSION}. No implicit replacement.` };
  }
  if (!approvedWheelPath) return { ok: false, error: 'verified-wheel-required' };
  const installed = await installer.install(approvedWheelPath);
  if (!installed.ok) return { ok: false, error: installed.error ?? 'install-failed', stderrTail: installed.stderr };
  const verified = await installer.verifyInstalledVersion();
  if (verified.installed !== FROZEN_QOR_LOGIC_VERSION) return { ok: false, error: 'post-install-mismatch' };
  const health = await installer.verifyInstalledDependencies();
  if (!health.ok) return { ok: false, error: health.error, stderrTail: health.details };
  return { ok: true, command: installed.command };
}
