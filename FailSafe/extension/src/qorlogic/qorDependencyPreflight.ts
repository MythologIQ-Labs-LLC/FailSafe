/** #463: resolve frozen-wheel dependencies offline without mutating packages. */
import type { ResolvedInterpreter } from './PythonInterpreterResolver';
import type { InstallerRun, InstallerRunResult } from './QorLogicPackageInstaller';

export type DependencyPreflight =
  | { ok: true }
  | { ok: false; error: 'dependency-preflight-failed' | 'dependency-preflight-unknown'; details?: string };

/** No --no-deps here: pip must prove every required dependency is already available. */
export async function preflightFrozenDependencies(
  py: ResolvedInterpreter,
  verifiedWheelPath: string,
  run: InstallerRun,
  timeoutMs: number,
): Promise<DependencyPreflight> {
  const args = [...py.args, '-P', '-m', 'pip', '--isolated', 'install',
    '--dry-run', '--no-index', '--no-cache-dir', '--only-binary', ':all:', verifiedWheelPath];
  let result: InstallerRunResult;
  try { result = await run(py.command, args, { timeoutMs }); }
  catch { return { ok: false, error: 'dependency-preflight-unknown' }; }
  if (result.timedOut || result.spawnError || result.code === null) {
    return { ok: false, error: 'dependency-preflight-unknown' };
  }
  if (result.code !== 0) {
    return { ok: false, error: 'dependency-preflight-failed',
      details: (result.stderr || result.stdout).slice(-1000) };
  }
  return { ok: true };
}
