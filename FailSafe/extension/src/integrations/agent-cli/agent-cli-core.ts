/**
 * agent-cli-core — shared substrate for FailSafe's CLI agent-wrapper integrations
 * (Group B: Continue #104, Aider #107). Detects the binary, classifies the risk
 * of a quarantined change set, and emits a receipt. The run itself happens in a
 * disposable worktree (isolated-run.ts, #475); nothing here writes the workspace.
 *
 * argv-form ONLY — the runner spawns with `shell: false`; command strings are
 * never constructed (no shell-injection surface). Secrets (API keys) travel via
 * the child ENV, never argv and never the receipt.
 *
 * Executables (LD7): detection resolves `aider` / `cn` to an absolute PATH
 * entry outside the workspace and records it under the literal agent name; the
 * production runner spawns only that recorded path and nothing else.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** argv-form process runner. `opts.env` carries secrets to the child only.
 *  `onSpawn` receives the child PID so the process tree can be tracked;
 *  `detached` makes the child a process-group leader (POSIX). Injected in
 *  tests; `defaultAgentRun` in prod. */
export interface AgentRunResult { stdout: string; stderr: string; code: number | null }
export interface AgentRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: Buffer | string;
  detached?: boolean;
  onSpawn?: (pid: number) => void;
}
export type AgentRunFn = (cmd: string, args: ReadonlyArray<string>, opts?: AgentRunOptions) => Promise<AgentRunResult>;

export { AGENT_OS_CONTAINMENT_AVAILABLE } from './agent-containment';
// Pure risk, receipt and outcome builders (split out for the Section 4 file cap).
export * from './agent-run-outcome';

export interface DetectResult { available: boolean; version?: string }

/** The agent CLIs FailSafe runs. */
export type AgentName = 'aider' | 'cn';

export interface ResolveOptions {
  pathEnv?: string;
  platform?: NodeJS.Platform;
  /** Directories (and everything inside them) never searched. */
  excludeDirs?: ReadonlyArray<string>;
}
export type ResolveAgentFn = (name: AgentName, opts: ResolveOptions) => string | undefined;

const canonical = (p: string, win: boolean): string => {
  let r: string;
  try { r = fs.realpathSync(p); } catch { r = path.resolve(p); }
  return win ? r.toLowerCase() : r;
};

const within = (p: string, dir: string): boolean => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

function isRunnable(file: string, win: boolean): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (!win) fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** First absolute PATH entry holding `name` (win32: .exe or .com only; POSIX: an
 *  executable regular file). Relative entries and anything inside `excludeDirs`
 *  (compared after realpath, case-insensitively on win32) are skipped. */
export function resolveAgentExecutable(name: string, opts: ResolveOptions = {}): string | undefined {
  const win = (opts.platform ?? process.platform) === 'win32';
  const excluded = (opts.excludeDirs ?? []).map((d) => canonical(d, win));
  const outside = (p: string): boolean => !excluded.some((ex) => within(canonical(p, win), ex));
  for (const dir of (opts.pathEnv ?? process.env.PATH ?? '').split(win ? ';' : ':')) {
    if (!(win ? /^([A-Za-z]:[\\/]|\\\\)/.test(dir) : dir.startsWith('/')) || !outside(dir)) continue;
    for (const file of win ? [`${name}.exe`, `${name}.com`] : [name]) {
      const full = path.join(dir, file);
      if (isRunnable(full, win) && outside(full)) return full;
    }
  }
  return undefined;
}

/** Absolute executables recorded by detection, keyed by the literal agent names. */
const agentPaths: { aider?: string; cn?: string } = {};

function recordAgentPath(name: AgentName, exe: string | undefined): void {
  if (name === 'aider') agentPaths.aider = exe;
  else agentPaths.cn = exe;
}

export interface DetectOptions {
  /** The workspace root; PATH entries inside it are never used. */
  workspaceRoot: string;
  /** Injected in tests; `resolveAgentExecutable` in production. */
  resolve?: ResolveAgentFn;
}

/** Detect an agent CLI: resolve it outside the workspace, record the path, then
 *  probe `<name> <versionArgs>` through that path from the OS temp directory.
 *  available iff resolved and the probe exits 0; otherwise the record is deleted. */
export async function detectBinary(
  name: AgentName,
  versionArgs: ReadonlyArray<string>,
  run: AgentRunFn,
  opts: DetectOptions,
): Promise<DetectResult> {
  const exe = (opts.resolve ?? resolveAgentExecutable)(name, { excludeDirs: [opts.workspaceRoot] });
  recordAgentPath(name, exe);
  if (!exe) return { available: false };
  try {
    const res = await run(name, versionArgs, { cwd: os.tmpdir() });
    if (res.code === 0) {
      const m = /\d+\.\d+(?:\.\d+)?/.exec(`${res.stdout} ${res.stderr}`);
      return { available: true, version: m ? m[0] : undefined };
    }
  } catch { /* reported unavailable below */ }
  recordAgentPath(name, undefined);
  return { available: false };
}

/** Collect a spawned child's output; reports its PID through `opts.onSpawn` and
 *  writes `opts.input` to its stdin. */
export function collectChild(child: ChildProcess, opts?: AgentRunOptions): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    if (child.pid !== undefined) opts?.onSpawn?.(child.pid);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.stdin?.on('error', () => { /* the agent may close stdin early */ });
    child.on('error', (err) => resolve({ stdout, stderr: `${stderr}${String(err)}`, code: 127 }));
    child.on('close', (code: number | null) => resolve({ stdout, stderr, code }));
    if (opts?.input !== undefined) child.stdin?.end(opts.input); else child.stdin?.end();
  });
}

const refused = (stderr: string): Promise<AgentRunResult> => Promise.resolve({ stdout: '', stderr, code: 126 });

/** Default runner (production): spawns only the path detection recorded for the
 *  literal agent name, argv-form; with no recorded path it refuses (126). */
export const defaultAgentRun: AgentRunFn = (cmd, args, opts) => {
  let exe: string | undefined;
  if (cmd === 'aider') exe = agentPaths.aider;
  else if (cmd === 'cn') exe = agentPaths.cn;
  else return refused(`Unsupported agent executable: ${cmd}`);
  if (!exe) return refused(`${cmd} has no detected executable; nothing was started`);
  let child: ChildProcess;
  try {
    child = spawn(exe, [...args], {
      shell: false, windowsHide: true, cwd: opts?.cwd, env: opts?.env ?? process.env, detached: opts?.detached ?? false,
    });
  } catch (err) {
    return Promise.resolve({ stdout: '', stderr: String(err), code: 127 });
  }
  return collectChild(child, opts);
};
