import { spawn } from 'child_process';
import * as path from 'path';

export type RunResult = { stdout: string; stderr: string; code: number | null };
export type RunCommand = (cmd: string, args: ReadonlyArray<string>) => Promise<RunResult>;

export interface ConfigLike {
  get(key: string): string | undefined;
}

export interface VSCodeExtensionLike {
  isActive: boolean;
  activate(): PromiseLike<unknown>;
  exports: unknown;
}

export interface VSCodeLike {
  extensions: { getExtension(id: string): VSCodeExtensionLike | undefined };
}

export interface ResolvedInterpreter {
  ok: true;
  command: string;
  args: string[];
  version: string;
  source: 'user-setting' | 'ms-python' | 'probe';
}

export interface UnresolvedInterpreter {
  ok: false;
  reason: 'no-python-found' | 'version-too-old' | 'user-path-invalid';
  detail?: string;
}

export type InterpreterResult = ResolvedInterpreter | UnresolvedInterpreter;

const SETTING_KEY = 'failsafe.qorlogic.pythonPath';
const MIN_MAJOR = 3;
const MIN_MINOR = 11;
const BARE_PYTHON_COMMANDS = new Set(['python3', 'python', 'py']);

export function isSafePythonCommand(command: string): boolean {
  if (
    typeof command !== 'string'
    || command.length === 0
    || command.includes('\0')
    || command.startsWith('-')
  ) {
    return false;
  }
  if (path.isAbsolute(command)) {
    return true;
  }
  return BARE_PYTHON_COMMANDS.has(command);
}

const PROBE_CANDIDATES: ReadonlyArray<{ cmd: string; args: ReadonlyArray<string> }> = [
  { cmd: 'python3', args: [] },
  { cmd: 'python', args: [] },
  { cmd: 'py', args: ['-3'] },
];

interface VersionProbe {
  found: boolean;
  version: string;
  raw: string;
}

export class PythonInterpreterResolver {
  private cached: InterpreterResult | null = null;

  constructor(
    private readonly config: ConfigLike,
    private readonly vscode: VSCodeLike | null,
    private readonly run: RunCommand,
  ) {}

  async resolve(): Promise<InterpreterResult> {
    if (this.cached) return this.cached;
    const result = await this.resolveUncached();
    this.cached = result;
    return result;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async resolveUncached(): Promise<InterpreterResult> {
    const userPath = this.config.get(SETTING_KEY);
    if (userPath && userPath.trim()) {
      return this.tryUserPath(userPath.trim());
    }
    const msResult = await this.tryMsPython();
    if (msResult.ok) return msResult;
    return this.probeCandidates();
  }

  private async tryUserPath(command: string): Promise<InterpreterResult> {
    if (!isSafePythonCommand(command)) {
      return { ok: false, reason: 'user-path-invalid', detail: command };
    }
    const probe = await this.runVersion(command, []);
    if (!probe.found) return { ok: false, reason: 'user-path-invalid', detail: command };
    if (!isAcceptable(probe.version)) {
      return { ok: false, reason: 'version-too-old', detail: probe.raw };
    }
    return { ok: true, command, args: [], version: probe.version, source: 'user-setting' };
  }

  private async tryMsPython(): Promise<InterpreterResult> {
    const cmd = await this.readMsPythonInterpreter();
    if (!cmd || !isSafePythonCommand(cmd)) return notFound();
    const probe = await this.runVersion(cmd, []);
    if (!probe.found || !isAcceptable(probe.version)) return notFound();
    return { ok: true, command: cmd, args: [], version: probe.version, source: 'ms-python' };
  }

  private async readMsPythonInterpreter(): Promise<string | null> {
    if (!this.vscode) return null;
    const ext = this.vscode.extensions.getExtension('ms-python.python');
    if (!ext) return null;
    if (!ext.isActive) {
      try { await ext.activate(); } catch { return null; }
    }
    return readExecCommand(ext.exports);
  }

  private async probeCandidates(): Promise<InterpreterResult> {
    for (const cand of PROBE_CANDIDATES) {
      const probe = await this.runVersion(cand.cmd, cand.args);
      if (probe.found && isAcceptable(probe.version)) {
        return {
          ok: true,
          command: cand.cmd,
          args: [...cand.args],
          version: probe.version,
          source: 'probe',
        };
      }
    }
    return { ok: false, reason: 'no-python-found' };
  }

  private async runVersion(cmd: string, prefixArgs: ReadonlyArray<string>): Promise<VersionProbe> {
    const result = await this.run(cmd, [...prefixArgs, '--version']);
    if (result.code !== 0) return { found: false, version: '', raw: '' };
    const text = (result.stdout || result.stderr).trim();
    const match = /Python (\d+)\.(\d+)\.(\d+)/.exec(text);
    if (!match) return { found: false, version: '', raw: text };
    return { found: true, version: `${match[1]}.${match[2]}.${match[3]}`, raw: text };
  }
}

function isAcceptable(version: string): boolean {
  const match = /(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major > MIN_MAJOR) return true;
  if (major < MIN_MAJOR) return false;
  return minor >= MIN_MINOR;
}

function notFound(): UnresolvedInterpreter {
  return { ok: false, reason: 'no-python-found' };
}

function readExecCommand(exports: unknown): string | null {
  if (!exports || typeof exports !== 'object') return null;
  const settings = (exports as { settings?: unknown }).settings;
  if (!settings || typeof settings !== 'object') return null;
  const fn = (settings as { getExecutionDetails?: unknown }).getExecutionDetails;
  if (typeof fn !== 'function') return null;
  try {
    const details = (fn as (arg: unknown) => unknown).call(settings, undefined);
    const execCommand = readArrayHead(details);
    return execCommand;
  } catch {
    return null;
  }
}

function readArrayHead(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const arr = (details as { execCommand?: unknown }).execCommand;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const head = arr[0];
  return typeof head === 'string' ? head : null;
}

export const defaultRun: RunCommand = (cmd, args) => new Promise((resolve) => {
  if (!isSafePythonCommand(cmd)) {
    resolve({ stdout: '', stderr: `Unsupported Python executable: ${cmd}`, code: 126 });
    return;
  }
  const argv = [...args];
  const child = cmd === 'python3'
    ? spawn('python3', argv, { shell: false })
    : cmd === 'python'
      ? spawn('python', argv, { shell: false })
      : cmd === 'py'
        ? spawn('py', argv, { shell: false })
        : spawn(cmd, argv, { shell: false }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- absolute interpreter path validated by isSafePythonCommand
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', () => resolve({ stdout, stderr, code: 127 }));
  child.on('close', (code) => resolve({ stdout, stderr, code }));
});
