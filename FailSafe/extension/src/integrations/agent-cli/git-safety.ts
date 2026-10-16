/**
 * git-safety — FailSafe's own git invocations for isolated agent runs (#475, LD2).
 *
 * Every call runs with the system and global config neutralized (an agent could
 * have rewritten ~/.gitconfig) and with fsmonitor, hooks, excludes and attribute
 * files disabled. The handful of user settings needed for a working checkout
 * (EOL handling, safe.directory trust, long paths, LFS filters) are read with
 * ordinary git BEFORE the agent runs and written into a private global config
 * file. Output is captured as raw bytes so binary patches survive intact.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { trustedGitPath } from '../../shared/git/trustedGit';
import { killProcessTree } from '../../shared/exec/killTree';

export interface GitResult { code: number | null; stdout: Buffer; stderr: string; timedOut?: boolean }

/** `timeoutMs`: on expiry the git tree is killed (if git is still running) and the read settles timed out (B213). */
export interface GitRunOptions { input?: Buffer; env?: Record<string, string>; timeoutMs?: number }

export interface SafeGit {
  /** Run git with the hardened config; throws GitCommandError on a non-zero exit. */
  run(cwd: string, args: ReadonlyArray<string>, opts?: GitRunOptions): Promise<Buffer>;
  /** Same, but returns the result instead of throwing. */
  tryRun(cwd: string, args: ReadonlyArray<string>, opts?: GitRunOptions): Promise<GitResult>;
  dispose(): void;
}

export class GitCommandError extends Error {
  constructor(readonly args: ReadonlyArray<string>, readonly code: number | null, readonly stderr: string) {
    super(`git ${args.join(' ')} failed (exit ${code}): ${stderr.trim().slice(0, 300)}`);
  }
}

/** Pinned diff flags: no external diff/textconv, fixed prefixes, binary-safe. */
export const PINNED_DIFF = ['--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/', '--binary', '--full-index'] as const;

const CARRIED_SINGLE = ['core.autocrlf', 'core.eol', 'core.safecrlf', 'core.longpaths'] as const;

function readUserConfig(repo: string, key: string, all = false): string[] {
  let exe: string;
  try { exe = trustedGitPath(repo); } catch { return []; }
  const res = spawnSync(exe, ['config', all ? '--get-all' : '--get', key], { cwd: repo, encoding: 'utf8', windowsHide: true }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
  return res.status === 0 ? res.stdout.split(/\r?\n/).filter((v) => v.length > 0) : [];
}

function readLfsFilter(repo: string): Array<[string, string]> {
  let exe: string;
  try { exe = trustedGitPath(repo); } catch { return []; }
  const res = spawnSync(exe, ['config', '--get-regexp', '^filter\\.lfs\\.'], { cwd: repo, encoding: 'utf8', windowsHide: true }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
  if (res.status !== 0) return [];
  return res.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf(' ');
    return [line.slice(0, i), line.slice(i + 1)] as [string, string];
  });
}

const quote = (v: string): string => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Private global config carrying only the settings a checkout needs. */
export function buildCarriedConfig(repo: string): string {
  const lines: string[] = ['[core]'];
  for (const key of CARRIED_SINGLE) {
    const [value] = readUserConfig(repo, key);
    if (value !== undefined) lines.push(`\t${key.split('.')[1]} = ${quote(value)}`);
  }
  const safeDirs = readUserConfig(repo, 'safe.directory', true);
  if (safeDirs.length) lines.push('[safe]', ...safeDirs.map((d) => `\tdirectory = ${quote(d)}`));
  const lfs = readLfsFilter(repo);
  if (lfs.length) {
    lines.push('[filter "lfs"]');
    for (const [k, v] of lfs) lines.push(`\t${k.replace(/^filter\.lfs\./, '')} = ${quote(v)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Create the hardened git context for one isolated run. */
export function createSafeGit(repo: string): SafeGit {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-git-'));
  const hooksDir = path.join(dir, 'hooks');
  const empty = path.join(dir, 'empty');
  const globalCfg = path.join(dir, 'gitconfig');
  fs.mkdirSync(hooksDir);
  fs.writeFileSync(empty, '');
  fs.writeFileSync(globalCfg, buildCarriedConfig(repo));
  const baseArgs = [
    '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${hooksDir}`,
    '-c', `core.excludesFile=${empty}`, '-c', `core.attributesFile=${empty}`,
    '-c', 'core.untrackedCache=false', '-c', 'diff.noprefix=false',
  ];
  const baseEnv: Record<string, string> = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalCfg, GIT_TERMINAL_PROMPT: '0' };

  const tryRun: SafeGit['tryRun'] = (cwd, args, opts) => new Promise((resolve) => {
    let exe: string;
    try { exe = trustedGitPath(cwd); } catch (e) { resolve({ code: 127, stdout: Buffer.alloc(0), stderr: String(e) }); return; }
    const timeoutMs = opts?.timeoutMs;
    const child = spawn(exe, [...baseArgs, ...args], { // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
      cwd, shell: false, windowsHide: true, env: { ...process.env, ...baseEnv, ...(opts?.env ?? {}) },
      // POSIX: its own process group, so a timeout can kill git and what it started.
      detached: timeoutMs !== undefined && process.platform !== 'win32',
    });
    const out: Buffer[] = [];
    let err = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (r: GitResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(r);
    };
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    child.on('error', (e) => settle({ code: 127, stdout: Buffer.alloc(0), stderr: String(e) }));
    child.on('close', (code) => settle({ code, stdout: Buffer.concat(out), stderr: err }));
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        // killProcessTree kills only a live git; one that exited while a descendant holds its pipes is left.
        killProcessTree(child);
        settle({ code: null, stdout: Buffer.concat(out), stderr: err, timedOut: true });
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin.destroy();
      }, timeoutMs);
    }
    if (opts?.input) child.stdin.end(opts.input); else child.stdin.end();
  });

  return {
    tryRun,
    async run(cwd, args, opts) {
      const res = await tryRun(cwd, args, opts);
      if (res.code !== 0) throw new GitCommandError(args, res.code, res.stderr);
      return res.stdout;
    },
    dispose() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
