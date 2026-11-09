/** #463 exact, offline wheel installation. No network, upgrades or implicit mutation. */
import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';
import type { InstallerRun, InstallerRunResult, OutputChannelLike, QorLogicInstallResult } from './QorLogicPackageInstaller';
import { FROZEN_QOR_LOGIC_VERSION } from './hostLayouts';
import { withVerifiedQorWheel, WheelVerificationError } from './frozenWheel';
import { preflightFrozenDependencies } from './qorDependencyPreflight';

const PIP_SHOW_TIMEOUT_MS = 30_000;
const formatCommand = (cmd: string, args: ReadonlyArray<string>): string => [cmd, ...args].join(' ');
const parseVersionLine = (stdout: string): string | null =>
  /^Version:\s*([^\s]+)/im.exec(stdout)?.[1] ?? null;

async function runSafely(fn: () => Promise<InstallerRunResult>): Promise<InstallerRunResult | null> {
  try { return await fn(); } catch { return null; }
}
function runPipShow(py: ResolvedInterpreter, run: InstallerRun): Promise<InstallerRunResult> {
  return run(py.command, [...py.args, '-P', '-m', 'pip', 'show', 'qor-logic'], { timeoutMs: PIP_SHOW_TIMEOUT_MS });
}

type InstallContext = {
  resolver: PythonInterpreterResolver;
  run: InstallerRun;
  output: OutputChannelLike;
  timeoutMs: number;
  approvedWheelPath?: string;
};

function stateBeforeInstall(before: InstallerRunResult | null): QorLogicInstallResult | null {
  if (!before || before.timedOut || before.spawnError) {
    return { ok: false, command: '', error: 'package-state-unknown' };
  }
  if (before.code === 0) {
    const existing = /^Name:\s*qor-logic\s*$/im.test(before.stdout)
      ? parseVersionLine(before.stdout) : null;
    if (!existing) return { ok: false, command: '', error: 'package-state-unknown' };
    if (existing !== FROZEN_QOR_LOGIC_VERSION) {
      return { ok: false, command: '', version: existing, error: 'version-divergence' };
    }
    return { ok: true, command: 'already-installed', version: existing };
  }
  if (before.code !== 1 || !/Package\(s\) not found:\s*qor-logic/i.test(before.stderr)) {
    return { ok: false, command: '', error: 'package-state-unknown' };
  }
  return null; // Explicitly absent, rather than a failed/ambiguous probe.
}

async function postInstallCheck(
  py: ResolvedInterpreter, run: InstallerRun, command: string,
): Promise<QorLogicInstallResult | null> {
  const after = await runSafely(() => runPipShow(py, run));
  if (!after || after.code !== 0 || !/^Name:\s*qor-logic\s*$/im.test(after.stdout)
    || parseVersionLine(after.stdout) !== FROZEN_QOR_LOGIC_VERSION) {
    return { ok: false, command, error: 'post-install-mismatch' };
  }
  const dep = await runSafely(() => run(py.command,
    [...py.args, '-P', '-m', 'pip', '--isolated', 'check'],
    { timeoutMs: PIP_SHOW_TIMEOUT_MS }));
  if (!dep || dep.code !== 0 || dep.timedOut || dep.spawnError) {
    return { ok: false, command, error: 'dependencies-unsatisfied',
      stderr: dep?.stderr || dep?.stdout };
  }
  return null;
}

async function installStagedWheel(
  py: ResolvedInterpreter, run: InstallerRun, output: OutputChannelLike,
  timeoutMs: number, verifiedPath: string,
): Promise<QorLogicInstallResult> {
  const args = [...py.args, '-P', '-m', 'pip', '--isolated', 'install',
    '--no-index', '--no-deps', '--no-cache-dir', '--no-compile', verifiedPath];
  const command = formatCommand(py.command, args);
  // Check dependency resolution in dry-run mode before any installation.
  // This still cannot guarantee rollback if the actual pip install fails.
  const readiness = await preflightFrozenDependencies(py, verifiedPath, run, timeoutMs);
  if (!readiness.ok) {
    return { ok: false, command: '', error: readiness.error, stderr: readiness.details };
  }
  output.appendLine('[qor-logic] dependency preflight passed; installing verified 0.176.1 wheel offline');
  const result = await runSafely(() => run(py.command, args, { timeoutMs }));
  if (!result) return { ok: false, command, error: 'spawn-failed' };
  const mapped = mapInstallResult(result, command, output);
  if (!mapped.ok) return mapped;
  const rejected = await postInstallCheck(py, run, command);
  if (rejected) return rejected;
  return { ok: true, command, version: FROZEN_QOR_LOGIC_VERSION,
    stdout: mapped.stdout, stderr: mapped.stderr };
}

export async function installFrozenWheel(ctx: InstallContext): Promise<QorLogicInstallResult> {
  const { resolver, run, output, timeoutMs, approvedWheelPath } = ctx;
  if (!approvedWheelPath) return { ok: false, command: '', error: 'verified-wheel-required' };
  const py = await resolver.resolve();
  if (!py.ok) return { ok: false, command: '', error: 'no-python-found' };
  const before = await runSafely(() => runPipShow(py, run));
  const state = stateBeforeInstall(before);
  if (state) return state;
  try {
    return await withVerifiedQorWheel(approvedWheelPath,
      (wheel) => installStagedWheel(py, run, output, timeoutMs, wheel));
  } catch (err) {
    if (err instanceof WheelVerificationError) {
      return { ok: false, command: '', error: err.reason };
    }
    return { ok: false, command: '', error: 'invalid-wheel-path' };
  }
}

function mapInstallResult(
  result: InstallerRunResult,
  command: string,
  output: OutputChannelLike,
): QorLogicInstallResult {
  if (result.timedOut) {
    output.appendLine('[qor-logic] timeout after install');
    return { ok: false, command, error: 'timeout', stdout: result.stdout, stderr: result.stderr };
  }
  if (result.spawnError) {
    output.appendLine(`[qor-logic] spawn error: ${result.spawnError}`);
    return { ok: false, command, error: 'spawn-failed', stderr: result.spawnError };
  }
  if (result.code !== 0) {
    output.appendLine(`[qor-logic] pip exited with code ${result.code}`);
    if (result.stderr) output.appendLine(result.stderr);
    return { ok: false, command, error: 'pip-failed', stdout: result.stdout, stderr: result.stderr };
  }
  return { ok: true, command, stdout: result.stdout, stderr: result.stderr };
}
