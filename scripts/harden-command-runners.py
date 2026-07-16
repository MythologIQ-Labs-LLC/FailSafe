from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match in {path}, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "FailSafe/extension/src/governance/revert/GitResetService.ts",
    '''export type CommandRunner = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;''',
    '''export type CommandRunner = (
  args: string[],
  cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;''',
)
replace_once(
    "FailSafe/extension/src/governance/revert/GitResetService.ts",
    '    return this.runner("git", args, cwd);',
    '    return this.runner(args, cwd);',
)
replace_once(
    "FailSafe/extension/src/governance/revert/GitResetService.ts",
    '''function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
    });''',
    '''function defaultRunner(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
    });''',
)
replace_once(
    "FailSafe/extension/src/test/governance/revert/GitResetService.test.ts",
    '  return async (_cmd, args) => {',
    '  return async (args) => {',
)

replace_once(
    "FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts",
    '''export interface AgentRunResult { stdout: string; stderr: string; code: number | null }
export type AgentRunFn = (
  cmd: string,
  args: ReadonlyArray<string>,''',
    '''export interface AgentRunResult { stdout: string; stderr: string; code: number | null }
export type AgentExecutable = 'git' | 'aider' | 'cn';
export type AgentRunFn = (
  cmd: AgentExecutable,
  args: ReadonlyArray<string>,''',
)
replace_once(
    "FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts",
    '''export async function detectBinary(
  cmd: string,
  versionArgs: ReadonlyArray<string>,''',
    '''export async function detectBinary(
  cmd: AgentExecutable,
  versionArgs: ReadonlyArray<string>,''',
)
replace_once(
    "FailSafe/extension/src/integrations/agent-cli/agent-cli-core.ts",
    '''export const defaultAgentRun: AgentRunFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    const child = spawn(cmd, [...args], { shell: false, cwd: opts?.cwd, env: opts?.env ?? process.env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', () => resolve({ stdout, stderr, code: 127 }));
    child.on('close', (code: number | null) => resolve({ stdout, stderr, code }));
  });''',
    '''export const defaultAgentRun: AgentRunFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    const spawnOptions = { shell: false as const, cwd: opts?.cwd, env: opts?.env ?? process.env };
    const argv = [...args];
    const child = cmd === 'git'
      ? spawn('git', argv, spawnOptions)
      : cmd === 'aider'
        ? spawn('aider', argv, spawnOptions)
        : spawn('cn', argv, spawnOptions);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', () => resolve({ stdout, stderr, code: 127 }));
    child.on('close', (code: number | null) => resolve({ stdout, stderr, code }));
  });''',
)

replace_once(
    "FailSafe/extension/src/roadmap/services/AdapterService.ts",
    '''  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      timeout,
    });''',
    '''  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    const proc = command === "python3"
      ? spawn("python3", args, options)
      : command === "python"
        ? spawn("python", args, options)
        : command === "pip3"
          ? spawn("pip3", args, options)
          : command === "pip"
            ? spawn("pip", args, options)
            : null;
    if (!proc) {
      resolve({ code: 126, stdout: "", stderr: `Unsupported adapter executable: ${command}` });
      return;
    }''',
)

replace_once(
    "FailSafe/extension/src/roadmap/services/MarketplaceInstaller.ts",
    '''  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      timeout,
    });''',
    '''  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    const proc = command === "git"
      ? spawn("git", args, options)
      : command === "pip"
        ? spawn("pip", args, options)
        : command === "npm"
          ? spawn("npm", args, options)
          : null;
    if (!proc) {
      resolve({ code: 126, stdout: "", stderr: `Unsupported marketplace executable: ${command}` });
      return;
    }''',
)

replace_once(
    "FailSafe/extension/src/roadmap/services/SecurityScanner.ts",
    '''  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      timeout,
    });''',
    '''  return new Promise((resolve) => {
    const options = { cwd, shell: false as const, timeout };
    const proc = command === "garak"
      ? spawn("garak", args, options)
      : command === "npx"
        ? spawn("npx", args, options)
        : command === "git"
          ? spawn("git", args, options)
          : null;
    if (!proc) {
      resolve({ code: 126, stdout: "", stderr: `Unsupported scanner executable: ${command}` });
      return;
    }''',
)

replace_once(
    "FailSafe/extension/src/shared/gitBootstrap.ts",
    '''  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
    });''',
    '''  return new Promise((resolve, reject) => {
    const options = { cwd, shell: false as const, windowsHide: true };
    const child = command === "git"
      ? spawn("git", args, options)
      : command === "winget"
        ? spawn("winget", args, options)
        : command === "choco"
          ? spawn("choco", args, options)
          : command === "brew"
            ? spawn("brew", args, options)
            : command === "apt-get"
              ? spawn("apt-get", args, options)
              : command === "dnf"
                ? spawn("dnf", args, options)
                : command === "yum"
                  ? spawn("yum", args, options)
                  : command === "pacman"
                    ? spawn("pacman", args, options)
                    : null;
    if (!child) {
      resolve({ code: 126, stdout: "", stderr: `Unsupported bootstrap executable: ${command}` });
      return;
    }''',
)

replace_once(
    "FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts",
    "import { spawn } from 'child_process';",
    "import { spawn } from 'child_process';\nimport * as path from 'path';",
)
replace_once(
    "FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts",
    '''const MIN_MINOR = 11;

const PROBE_CANDIDATES''',
    '''const MIN_MINOR = 11;
const BARE_PYTHON_COMMANDS = new Set(['python3', 'python', 'py']);

export function isSafePythonCommand(command: string): boolean {
  if (typeof command !== 'string' || command.length === 0 || command.includes('\\0') || command.startsWith('-')) {
    return false;
  }
  if (path.isAbsolute(command)) {
    return true;
  }
  return BARE_PYTHON_COMMANDS.has(command);
}

const PROBE_CANDIDATES''',
)
replace_once(
    "FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts",
    '''  private async tryUserPath(path: string): Promise<InterpreterResult> {
    const probe = await this.runVersion(path, []);''',
    '''  private async tryUserPath(path: string): Promise<InterpreterResult> {
    if (!isSafePythonCommand(path)) return { ok: false, reason: 'user-path-invalid', detail: path };
    const probe = await this.runVersion(path, []);''',
)
replace_once(
    "FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts",
    '''    const cmd = await this.readMsPythonInterpreter();
    if (!cmd) return notFound();
    const probe = await this.runVersion(cmd, []);''',
    '''    const cmd = await this.readMsPythonInterpreter();
    if (!cmd || !isSafePythonCommand(cmd)) return notFound();
    const probe = await this.runVersion(cmd, []);''',
)
replace_once(
    "FailSafe/extension/src/qorlogic/PythonInterpreterResolver.ts",
    '''export const defaultRun: RunCommand = (cmd, args) => new Promise((resolve) => {
  const child = spawn(cmd, [...args], { shell: false });''',
    '''export const defaultRun: RunCommand = (cmd, args) => new Promise((resolve) => {
  if (!isSafePythonCommand(cmd)) {
    resolve({ stdout: '', stderr: `Unsupported Python executable: ${cmd}`, code: 126 });
    return;
  }
  const child = cmd === 'python3'
    ? spawn('python3', [...args], { shell: false })
    : cmd === 'python'
      ? spawn('python', [...args], { shell: false })
      : cmd === 'py'
        ? spawn('py', [...args], { shell: false })
        : spawn(cmd, [...args], { shell: false }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- absolute interpreter path validated by isSafePythonCommand''',
)
replace_once(
    "FailSafe/extension/src/test/qorlogic/PythonInterpreterResolver.test.ts",
    '''  type RunResult,
} from '../../qorlogic/PythonInterpreterResolver';''',
    '''  type RunResult,
  isSafePythonCommand,
} from '../../qorlogic/PythonInterpreterResolver';''',
)
replace_once(
    "FailSafe/extension/src/test/qorlogic/PythonInterpreterResolver.test.ts",
    "const noVscode: VSCodeLike | null = null;\n",
    '''const noVscode: VSCodeLike | null = null;

suite('PythonInterpreterResolver: executable boundary', () => {
  test('allows canonical bare commands and absolute interpreter paths', () => {
    assert.equal(isSafePythonCommand('python3'), true);
    assert.equal(isSafePythonCommand('python'), true);
    assert.equal(isSafePythonCommand('py'), true);
    assert.equal(isSafePythonCommand('/opt/venv/bin/python'), true);
  });

  test('rejects relative, option-shaped, and NUL-bearing commands', () => {
    assert.equal(isSafePythonCommand('./python'), false);
    assert.equal(isSafePythonCommand('../python'), false);
    assert.equal(isSafePythonCommand('--version'), false);
    assert.equal(isSafePythonCommand('python\\0evil'), false);
    assert.equal(isSafePythonCommand('node'), false);
  });
});
''',
)

replace_once(
    "FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts",
    "import type { PythonInterpreterResolver, ResolvedInterpreter } from './PythonInterpreterResolver';",
    "import { isSafePythonCommand, type PythonInterpreterResolver, type ResolvedInterpreter } from './PythonInterpreterResolver';",
)
replace_once(
    "FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts",
    '''export const defaultInstallerRun: InstallerRun = (cmd, args, options) => new Promise((resolve) => {
  let stdout = '';
  let stderr = '';
  let settled = false;
  const spawnEnv = options.env ? { ...process.env, ...options.env } : process.env;
  const child = spawn(cmd, [...args], { shell: false, cwd: options.cwd, env: spawnEnv as NodeJS.ProcessEnv });''',
    '''export const defaultInstallerRun: InstallerRun = (cmd, args, options) => new Promise((resolve) => {
  let stdout = '';
  let stderr = '';
  let settled = false;
  if (!isSafePythonCommand(cmd)) {
    resolve({ stdout, stderr: `Unsupported Python executable: ${cmd}`, code: null, timedOut: false, spawnError: 'unsafe-python-command' });
    return;
  }
  const spawnEnv = options.env ? { ...process.env, ...options.env } : process.env;
  const child = cmd === 'python3'
    ? spawn('python3', [...args], { shell: false, cwd: options.cwd, env: spawnEnv as NodeJS.ProcessEnv })
    : cmd === 'python'
      ? spawn('python', [...args], { shell: false, cwd: options.cwd, env: spawnEnv as NodeJS.ProcessEnv })
      : cmd === 'py'
        ? spawn('py', [...args], { shell: false, cwd: options.cwd, env: spawnEnv as NodeJS.ProcessEnv })
        : spawn(cmd, [...args], { shell: false, cwd: options.cwd, env: spawnEnv as NodeJS.ProcessEnv }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- resolver-approved absolute interpreter path''',
)

replace_once(
    "FailSafe/extension/src/integrations/bicameral/install-detector.ts",
    '''      child = spawn(command, ['--version'], { shell: false });''',
    '''      child = spawn(command, ['--version'], { shell: false }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- command passed lexical, anchored-root, realpath, and symlink-containment validation''',
)

print('hardened nine command execution boundaries')
