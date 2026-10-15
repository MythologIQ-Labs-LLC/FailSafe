/**
 * Real-git fixtures for the isolated-run / promotion suites (#475). Repos live
 * under os.tmpdir() with short names (Windows MAX_PATH). The scripted agent is
 * a node script run with process.execPath; inside the VS Code test host that is
 * Electron, so ELECTRON_RUN_AS_NODE=1 is set.
 */

import { execFileSync, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectChild, type AgentRunFn, type AgentRunOptions } from '../../../integrations/agent-cli/agent-cli-core';

export const gitEnv = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...gitEnv }, windowsHide: true });
}

/** A committed repo with a.txt, b.txt and .gitignore (*.log, build/). */
export function makeRepo(files: Record<string, string> = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsr-')));
  git(root, 'init', '-q', '-b', 'main');
  const all = { 'a.txt': 'alpha\n', 'b.txt': 'bravo\n', '.gitignore': '*.log\nbuild/\n', ...files };
  for (const [rel, body] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

export function removeRepo(root: string): void {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

/** Worktrees registered on the repo besides the main one. */
export function extraWorktrees(root: string): string[] {
  return git(root, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).slice(1);
}

export interface ScriptedAgent { run: AgentRunFn; calls: Array<{ cmd: string; cwd?: string }> }

/** Runner whose agent command `agent` executes `script` (node source) with the
 *  given env; any other command fails as not found. */
export function scriptedAgent(script: string, env: Record<string, string> = {}): ScriptedAgent {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsa-script-'));
  const file = path.join(dir, 'agent.js');
  fs.writeFileSync(file, script);
  const calls: ScriptedAgent['calls'] = [];
  const run: AgentRunFn = (cmd, args, opts?: AgentRunOptions) => {
    calls.push({ cmd, cwd: opts?.cwd });
    if (cmd !== 'agent') return Promise.resolve({ stdout: '', stderr: 'not found', code: 127 });
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [file, ...args], {
        shell: false, windowsHide: true, cwd: opts?.cwd, detached: opts?.detached ?? false,
        env: { ...process.env, ...gitEnv, ...(opts?.env ?? {}), ...env, ELECTRON_RUN_AS_NODE: '1' },
      });
    } catch (err) {
      return Promise.resolve({ stdout: '', stderr: String(err), code: 127 });
    }
    return collectChild(child, opts);
  };
  return { run, calls };
}

/** Point git's system and global config at private files (empty unless given)
 *  so results do not depend on the machine; returns a restore function. */
export function useGitConfig(content: { global?: string; system?: string } = {}): { dir: string; restore: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsg-'));
  const keys = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'] as const;
  const saved = keys.map((k) => process.env[k]);
  fs.writeFileSync(path.join(dir, 'global'), content.global ?? '');
  fs.writeFileSync(path.join(dir, 'system'), content.system ?? '');
  process.env.GIT_CONFIG_GLOBAL = path.join(dir, 'global');
  process.env.GIT_CONFIG_SYSTEM = path.join(dir, 'system');
  delete process.env.GIT_CONFIG_NOSYSTEM;
  return {
    dir,
    restore: () => {
      keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
      removeRepo(dir);
    },
  };
}

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');
