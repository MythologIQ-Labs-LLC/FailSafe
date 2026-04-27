import { spawn } from 'child_process';
import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';

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
  | 'spawn-failed';

export interface QorLogicInstallResult {
  ok: boolean;
  command: string;
  version?: string;
  stdout?: string;
  stderr?: string;
  error?: InstallError;
}

export interface IQorLogicPackageInstaller {
  isInstalled(): Promise<boolean>;
  install(): Promise<QorLogicInstallResult>;
  version(): Promise<string | null>;
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

  async install(): Promise<QorLogicInstallResult> {
    const py = await this.resolver.resolve();
    if (!py.ok) {
      return { ok: false, command: '', error: 'no-python-found' };
    }
    const args = [...py.args, '-m', 'pip', 'install', PACKAGE];
    const cmdString = formatCommand(py.command, args);
    this.output.appendLine(`[qor-logic] ${cmdString}`);
    const result = await this.run(py.command, args, { timeoutMs: this.timeoutMs });
    return mapInstallResult(result, cmdString, this.output);
  }

  async version(): Promise<string | null> {
    const py = await this.resolver.resolve();
    if (!py.ok) return null;
    const result = await this.runPipShow(py);
    if (result.code !== 0) return null;
    const match = /^Version:\s*(\d+\.\d+\.\d+)/im.exec(result.stdout);
    return match ? match[1] : null;
  }

  private runPipShow(py: ResolvedInterpreter): Promise<InstallerRunResult> {
    const args = [...py.args, '-m', 'pip', 'show', PACKAGE];
    return this.run(py.command, args, { timeoutMs: PIP_SHOW_TIMEOUT_MS });
  }
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
  const spawnEnv = options.env ? { ...process.env, ...options.env } : process.env;
  const child = spawn(cmd, [...args], { shell: false, cwd: options.cwd, env: spawnEnv as NodeJS.ProcessEnv });
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
