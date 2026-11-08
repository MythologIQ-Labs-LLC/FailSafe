import { spawn } from 'child_process';
import {
  isSafePythonCommand,
  trustedPythonPath,
  type PythonInterpreterResolver,
  type ResolvedInterpreter,
} from './PythonInterpreterResolver';
import { MIN_QOR_LOGIC_VERSION, TESTED_AGAINST_QOR_LOGIC_VERSION, FROZEN_QOR_LOGIC_VERSION } from './hostLayouts';
import { withVerifiedQorWheel, WheelVerificationError } from './frozenWheel';

export interface InstallerRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  spawnError?: string;
}

export interface InstallerRunOptions {
  timeoutMs: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export type InstallerRun = (
  cmd: string,
  args: ReadonlyArray<string>,
  options: InstallerRunOptions,
) => Promise<InstallerRunResult>;

export interface OutputChannelLike {
  appendLine(line: string): void;
}

export type InstallError =
  | 'no-python-found'
  | 'timeout'
  | 'pip-failed'
  | 'spawn-failed'
  | 'verified-wheel-required'
  | 'invalid-wheel-path'
  | 'unverified-wheel'
  | 'package-state-unknown'
  | 'version-divergence'
  | 'post-install-mismatch'
  | 'dependencies-unsatisfied';

export interface QorLogicInstallResult {
  ok: boolean;
  command: string;
  version?: string;
  stdout?: string;
  stderr?: string;
  error?: InstallError;
}

export interface QorLogicVersionStatus {
  installed: string | null;
  minimum: string;
  meetsFloor: boolean;
  /** The version the FX942 conformance probe last passed against (#233 Scope A). */
  testedAgainst: string;
  /**
   * Whether `installed` is exactly `testedAgainst`. ADVISORY: an untested
   * combination is a fact to report, never a reason to refuse a read. The
   * resolution is to run the probe, not to edit a constant.
   */
  matchesTested: boolean;
}

export interface IQorLogicPackageInstaller {
  isInstalled(): Promise<boolean>;
  /** Explicitly approved, local exact wheel only. No automatic PyPI install. */
  install(approvedWheelPath?: string): Promise<QorLogicInstallResult>;
  version(): Promise<string | null>;
  verifyInstalledVersion(): Promise<QorLogicVersionStatus>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const PIP_SHOW_TIMEOUT_MS = 30_000;
const PACKAGE = 'qor-logic';

export class QorLogicPackageInstaller implements IQorLogicPackageInstaller {
  constructor(
    private readonly resolver: PythonInterpreterResolver,
    private readonly output: OutputChannelLike,
    private readonly run: InstallerRun,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async isInstalled(): Promise<boolean> {
    const py = await this.resolver.resolve();
    if (!py.ok) return false;
    const result = await this.runPipShow(py);
    if (result.code !== 0) return false;
    return /^Name:\s*qor-logic/im.test(result.stdout);
  }

  async install(approvedWheelPath?: string): Promise<QorLogicInstallResult> {
    // No implicit version updates, network or package changes, including on startup.
    if (!approvedWheelPath) return { ok: false, command: '', error: 'verified-wheel-required' };
    const py = await this.resolver.resolve();
    if (!py.ok) return { ok: false, command: '', error: 'no-python-found' };

    // A missing package is different from a failed/ambiguous pip probe.
    const before = await this.runSafely(() => this.runPipShow(py));
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
        this.output.appendLine('[qor-logic] installing locally verified 0.176.1 wheel (offline, no dependencies)');
        const run = await this.runSafely(() => this.run(py.command, args, { timeoutMs: this.timeoutMs }));
        if (!run) return { ok: false, command: cmdString, error: 'spawn-failed' };
        const mapped = mapInstallResult(run, cmdString, this.output);
        if (!mapped.ok) return mapped;
        const after = await this.runSafely(() => this.runPipShow(py));
        if (!after || after.code !== 0 || !/^Name:\\s*qor-logic\\s*$/im.test(after.stdout)
          || parseVersionLine(after.stdout) !== FROZEN_QOR_LOGIC_VERSION) {
          return { ok: false, command: cmdString, error: 'post-install-mismatch' };
        }
        const dep = await this.runSafely(() => this.run(py.command,
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

  async version(): Promise<string | null> {
    const py = await this.resolver.resolve();
    if (!py.ok) return null;
    const result = await this.runPipShow(py);
    if (result.code !== 0) return null;
    const match = /^Version:\s*(\d+\.\d+\.\d+)/im.exec(result.stdout);
    return match ? match[1] : null;
  }

  async verifyInstalledVersion(): Promise<QorLogicVersionStatus> {
    const minimum = MIN_QOR_LOGIC_VERSION;
    const unresolved = unknownVersionStatus(minimum);
    const py = await this.resolver.resolve();
    if (!py.ok) return unresolved;
    const result = await this.runSafely(() => this.runPipShow(py));
    if (!result || result.code !== 0) return unresolved;
    const installed = parseVersionLine(result.stdout);
    if (!installed) return unresolved;
    return {
      installed,
      minimum,
      meetsFloor: compareVersions(installed, minimum) >= 0,
      testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION,
      matchesTested: installed === TESTED_AGAINST_QOR_LOGIC_VERSION,
    };
  }

  private async runSafely(fn: () => Promise<InstallerRunResult>): Promise<InstallerRunResult | null> {
    try { return await fn(); } catch { return null; }
  }

  private runPipShow(py: ResolvedInterpreter): Promise<InstallerRunResult> {
    const args = [...py.args, '-P', '-m', 'pip', 'show', PACKAGE];
    return this.run(py.command, args, { timeoutMs: PIP_SHOW_TIMEOUT_MS });
  }
}

/** No version resolved: below the floor AND untested, since neither was verified. */
export function unknownVersionStatus(minimum: string = MIN_QOR_LOGIC_VERSION): QorLogicVersionStatus {
  return {
    installed: null,
    minimum,
    meetsFloor: false,
    testedAgainst: TESTED_AGAINST_QOR_LOGIC_VERSION,
    matchesTested: false,
  };
}

function parseVersionLine(stdout: string): string | null {
  const match = /^Version:\s*([^\s]+)/im.exec(stdout);
  return match ? match[1] : null;
}

function normalizeVersion(version: string): number[] {
  const numericPart = version.split('-')[0];
  return numericPart.split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a);
  const right = normalizeVersion(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const li = left[i] ?? 0;
    const ri = right[i] ?? 0;
    if (li > ri) return 1;
    if (li < ri) return -1;
  }
  return 0;
}

function formatCommand(cmd: string, args: ReadonlyArray<string>): string {
  return [cmd, ...args].join(' ');
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

export const defaultInstallerRun: InstallerRun = (cmd, args, options) => new Promise((resolve) => {
  let stdout = '';
  let stderr = '';
  let settled = false;
  if (!isSafePythonCommand(cmd)) {
    resolve({
      stdout,
      stderr: `Unsupported Python executable: ${cmd}`,
      code: null,
      timedOut: false,
      spawnError: 'unsafe-python-command',
    });
    return;
  }
  const spawnEnv = options.env ? { ...process.env, ...options.env } : process.env;
  const spawnOptions = {
    shell: false as const,
    cwd: options.cwd,
    env: spawnEnv as NodeJS.ProcessEnv,
  };
  // LD12: re-checked against this run's cwd (the workspace for skill installs).
  let exe: string;
  try { exe = trustedPythonPath(cmd, options.cwd); } catch (err) {
    resolve({ stdout, stderr, code: null, timedOut: false, spawnError: err instanceof Error ? err.message : String(err) });
    return;
  }
  const argv = [...args];
  const child = spawn(exe, argv, spawnOptions); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute interpreter path, argv array, no shell
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    try { child.kill(); } catch { /* ignore */ }
    resolve({ stdout, stderr, code: null, timedOut: true });
  }, options.timeoutMs);
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve({ stdout, stderr, code: null, timedOut: false, spawnError: err.message });
  });
  child.on('close', (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve({ stdout, stderr, code, timedOut: false });
  });
});
