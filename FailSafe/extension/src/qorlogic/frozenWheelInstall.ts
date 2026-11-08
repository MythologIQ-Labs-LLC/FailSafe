/** #463 exact, offline wheel installation. No network, upgrades or implicit mutation. */
import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';
import type { InstallerRun, InstallerRunResult, OutputChannelLike, QorLogicInstallResult } from './QorLogicPackageInstaller';
import { FROZEN_QOR_LOGIC_VERSION } from './hostLayouts';
import { withVerifiedQorWheel, WheelVerificationError } from './frozenWheel';

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

export async function installFrozenWheel(args: {
  resolver: PythonInterpreterResolver;
  run: InstallerRun;
  output: OutputChannelLike;
  timeoutMs: number;
  approvedWheelPath?: string;
}): Promise<QorLogicInstallResult> {
  const { resolver, run, output, timeoutMs, approvedWheelPath } = args;
    // No implicit version updates, network or package changes, including on startup.
    if (!approvedWheelPath) return { ok: false, command: '', error: 'verified-wheel-required' };
    const py = await resolver.resolve();
    if (!py.ok) return { ok: false, command: '', error: 'no-python-found' };

    // A missing package is different from a failed/ambiguous pip probe.
    const before = await runSafely(() => runPipShow(py, run));
    if (!before || before.timedOut || before.spawnError) {
      return { ok: false, command: '', error: 'package-state-unknown' };
    }
    if (before.code === 0) {
      const existing = /^Name:\\s*qor-logic\\s*$/im.test(before.stdout)
        ? parseVersionLine(before.stdout) : null;
      if (!existing) return { ok: false, command: '', error: 'package-state-unknown' };
      if (existing !== FROZEN_QOR_LOGIC_VERSION) {
        return { ok: false, command: '', version: existing, error: 'version-divergence' };
      }
      return { ok: true, command: 'already-installed', version: existing };
    }
    if (before.code !== 1 || !/Package\\(s\\) not found:\\s*qor-logic/i.test(before.stderr)) {
      return { ok: false, command: '', error: 'package-state-unknown' };
    }

    try {
      return await withVerifiedQorWheel(approvedWheelPath, async (verifiedPath) => {
        // --isolated ignores pip environment/config, --no-index/--no-deps
        // prevents unverified network/transitive dependencies.
        const args = [...py.args, '-P', '-m', 'pip', '--isolated', 'install',
          '--no-index', '--no-deps', '--no-cache-dir', '--no-compile', verifiedPath];
        const cmdString = formatCommand(py.command, args);
        output.appendLine('[qor-logic] installing locally verified 0.176.1 wheel (offline, no dependencies)');
        const run = await runSafely(() => run(py.command, args, { timeoutMs: timeoutMs }));
        if (!run) return { ok: false, command: cmdString, error: 'spawn-failed' };
        const mapped = mapInstallResult(run, cmdString, output);
        if (!mapped.ok) return mapped;
        const after = await runSafely(() => runPipShow(py, run));
        if (!after || after.code !== 0 || !/^Name:\\s*qor-logic\\s*$/im.test(after.stdout)
          || parseVersionLine(after.stdout) !== FROZEN_QOR_LOGIC_VERSION) {
          return { ok: false, command: cmdString, error: 'post-install-mismatch' };
        }
        const dep = await runSafely(() => run(py.command,
          [...py.args, '-P', '-m', 'pip', '--isolated', 'check'],
          { timeoutMs: PIP_SHOW_TIMEOUT_MS }));
        if (!dep || dep.code !== 0 || dep.timedOut || dep.spawnError) {
          return { ok: false, command: cmdString, error: 'dependencies-unsatisfied',
            stderr: dep?.stderr || dep?.stdout };
        }
        return { ok: true, command: cmdString, version: FROZEN_QOR_LOGIC_VERSION,
          stdout: mapped.stdout, stderr: mapped.stderr };
      });
    } catch (err) {
      if (err instanceof WheelVerificationError) {
        return { ok: false, command: '', error: err.reason };
      }
      return { ok: false, command: '', error: 'invalid-wheel-path' };
    }
}

function mapInstallResult(
  result: InstallerRunResult,
  cmdString: string,
  output: OutputChannelLike,
): QorLogicInstallResult {
  if (result.timedOut) {
    output.appendLine(`[qor-logic] timeout after install`);
    return { ok: false, command: cmdString, error: 'timeout', stdout: result.stdout, stderr: result.stderr };
  }
  if (result.spawnError) {
    output.appendLine(`[qor-logic] spawn error: ${result.spawnError}`);
    return { ok: false, command: cmdString, error: 'spawn-failed', stderr: result.spawnError };
  }
  if (result.code !== 0) {
    output.appendLine(`[qor-logic] pip exited with code ${result.code}`);
    if (result.stderr) output.appendLine(result.stderr);
    return { ok: false, command: cmdString, error: 'pip-failed', stdout: result.stdout, stderr: result.stderr };
  }
  return { ok: true, command: cmdString, stdout: result.stdout, stderr: result.stderr };
}

