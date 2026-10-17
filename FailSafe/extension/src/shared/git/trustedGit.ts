/**
 * trustedGit — the one place FailSafe decides which git executable to run
 * (v6.0.7 lane E, plan-v607-final-integration LD3).
 *
 * Node on Windows looks in the child's cwd before PATH for a bare executable
 * name, and cmd.exe does the same for a shell string, so `spawn('git', …,
 * { cwd: workspace })` runs a git.exe planted in the workspace. Every
 * production git subprocess therefore spawns the absolute path returned here,
 * with an argv array and no shell.
 *
 * Candidates (the VS Code Git extension's path, PATH entries, well-known
 * install locations) pass static checks first (phase S: nothing is executed),
 * then a `--version` probe from a fresh temp folder (phase P). A candidate
 * inside a workspace folder, the call's cwd or the process cwd (unless that is
 * a filesystem root or the home folder) is never executed. The realpath is
 * returned, so a symlink cannot be retargeted between check and spawn.
 *
 * Since v6.0.8 (B211) the engine lives in src/shared/exec/trustedExecutable.ts;
 * this module is the git spec plus the Git extension's hint on top of it.
 *
 * Pure Node: no `vscode` import. `configureTrustedGitFromVscode`
 * (src/extension/trustedGitActivation.ts) supplies the workspace folders and
 * the hint at activation.
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import {
  classifyProbe, configureExecutable, invalidateTrustedExecutable, isTrustedAbsolute, trustedExecutablePath,
  TrustedExecutableUnavailable, workspaceDirsFor,
  type ExecutableSpec, type ProbeResult, type Rejection, type TrustedExecConfig,
} from '../exec/trustedExecutable';

export { classifyProbe, isTrustedAbsolute, workspaceDirsFor };
export type { ProbeResult, Rejection };

export type TrustedGitConfig = TrustedExecConfig;

export class TrustedGitUnavailable extends Error {
  readonly code = 'TRUSTED_GIT_UNAVAILABLE';
  constructor(readonly rejected: ReadonlyArray<Rejection>) {
    const shown = rejected.slice(0, 5).map((r) => `${r.candidate || '(empty)'} (${r.reason})`).join('; ');
    super(`no trusted git executable${shown ? `; rejected: ${shown}` : ' was found'}`);
    this.name = 'TrustedGitUnavailable';
  }
}

const PROBE_TIMEOUT_MS = 5000;
const GIT_VERSION_RE = /^git version \d+\.\d+/;

function probeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.toUpperCase().startsWith('GIT_')) env[k] = v;
  }
  return env;
}

export function defaultGitProbe(realPath: string, cwd: string): ProbeResult {
  return classifyProbe(spawnSync(realPath, ['--version'], { cwd, shell: false, windowsHide: true, timeout: PROBE_TIMEOUT_MS, encoding: 'utf8', env: probeEnv() })); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- probes only a candidate that passed every static check (absolute, outside every root, regular .exe/X_OK file)
}

function defaultKnownLocations(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    const out: string[] = [];
    const add = (base: string | undefined, tail: string): void => { if (base) out.push(path.win32.join(base, tail)); };
    add(process.env.ProgramFiles, 'Git\\cmd\\git.exe');
    add(process.env.ProgramW6432, 'Git\\cmd\\git.exe');
    add(process.env['ProgramFiles(x86)'], 'Git\\cmd\\git.exe');
    add(process.env.LOCALAPPDATA, 'Programs\\Git\\cmd\\git.exe');
    return [...new Set(out)];
  }
  if (platform === 'darwin') return ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];
  return ['/usr/bin/git', '/usr/local/bin/git'];
}

const GIT: ExecutableSpec = {
  id: 'git',
  fileName: (platform) => (platform === 'win32' ? 'git.exe' : 'git'),
  searchPath: true,
  knownLocations: defaultKnownLocations,
  probe: { args: ['--version'], accept: GIT_VERSION_RE },
  defaultProbe: defaultGitProbe,
};

/** Replace the configuration; clears the positive and probe-failure caches, never the timeout set. */
export function configureTrustedGit(cfg: TrustedGitConfig): void {
  configureExecutable(GIT, cfg);
}

/** Forget the resolved path and the probe failures (after an install, or a vanished binary). */
export function invalidateTrustedGit(): void {
  invalidateTrustedExecutable(GIT);
}

/**
 * Absolute path of a trusted git for a spawn whose cwd is `callCwd` (omit it
 * when the child inherits the process cwd). Throws TrustedGitUnavailable.
 */
export function trustedGitPath(callCwd?: string): string {
  try {
    return trustedExecutablePath(GIT, callCwd);
  } catch (e) {
    if (e instanceof TrustedExecutableUnavailable) throw new TrustedGitUnavailable(e.rejected);
    throw e;
  }
}
