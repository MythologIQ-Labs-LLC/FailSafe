// Bicameral install-state detector + spawn-boundary input validator.
// Plan: docs/plan-qor-bicameral-mcp-integration.md Phase 1.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BicameralInstallProbe, BicameralInstallState } from './types';

const VERSION_TIMEOUT_MS = 3000;
const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const VERSION_RE = /(\d+\.\d+\.\d+(?:[A-Za-z0-9.-]*)?)/;

/**
 * B-BIC-7: relative sub-paths under %ProgramData% where Windows package
 * managers install CLI shims. Chocolatey -> `chocolatey\bin`, Scoop (global
 * install) -> `scoop\shims`. Exported as relative segments for testability;
 * `defaultExtraRoots()` anchors them to the live %ProgramData% root.
 */
export const DEFAULT_WINDOWS_EXTRA_ROOTS: ReadonlyArray<string> = [
  path.join('chocolatey', 'bin'),
  path.join('scoop', 'shims'),
];

/**
 * B-BIC-7: anchored absolute roots accepted *in addition to* the user's home
 * tree, applied automatically (no caller opt-in). Empty on non-Windows so the
 * POSIX accept-set is unchanged. On Windows, anchors the chocolatey/scoop shim
 * dirs under %ProgramData% (falls back to C:\ProgramData when env var absent).
 */
export function defaultExtraRoots(): string[] {
  if (process.platform !== 'win32') {
    return [];
  }
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  return DEFAULT_WINDOWS_EXTRA_ROOTS.map((sub) => path.join(programData, sub));
}

/** Optional allowlist extension for the command validators. */
export interface SafeCommandOptions {
  /** Extra anchored absolute roots accepted alongside home + default roots. */
  extraRoots?: string[];
}

/**
 * True when `candidate` is contained within `root` (root itself counts).
 * Windows filesystems are case-insensitive: `fs.realpath` may return casing
 * that differs from a computed root, so on win32 both sides are lower-cased
 * before the case-sensitive `path.relative` check. This only prevents false
 * *rejection* of a contained path — it never widens the accept-set.
 */
function isUnderRoot(candidate: string, root: string): boolean {
  let from = root;
  let to = candidate;
  if (process.platform === 'win32') {
    from = root.toLowerCase();
    to = candidate.toLowerCase();
  }
  const rel = path.relative(from, to);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** True when `candidate` is contained within any of `roots`. */
function isUnderAnyRoot(candidate: string, roots: string[]): boolean {
  return roots.some((root) => isUnderRoot(candidate, root));
}

/**
 * Compute the effective anchored-root allowlist: home + default extra roots
 * (applied automatically) + caller-supplied `extraRoots`. Non-absolute entries
 * are filtered out — a relative path cannot anchor containment.
 */
function effectiveRoots(options?: SafeCommandOptions): string[] {
  const home = os.homedir();
  const roots: string[] = [];
  if (home) roots.push(home);
  roots.push(...defaultExtraRoots());
  if (options?.extraRoots) roots.push(...options.extraRoots);
  return roots.filter((r) => typeof r === 'string' && path.isAbsolute(r));
}

/**
 * Operator-supplied command validator for the spawn boundary.
 * Accepts bare executable names OR absolute paths under the user's home tree,
 * the default package-manager roots, or any caller-supplied `extraRoots`.
 * Rejects shell metacharacters, path traversal, and unanchored relative paths.
 * Closes OWASP A03 (injection) for the bicameral-mcp spawn surface.
 *
 * Lexical only: does not resolve symlinks. Use `isSafeBicameralCommandResolved`
 * at every spawn boundary to also re-check containment of the real path.
 */
export function isSafeBicameralCommand(value: string, options?: SafeCommandOptions): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    return false;
  }
  if (SAFE_NAME_RE.test(value)) {
    return true;
  }
  if (!path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.normalize(value);
  if (normalized.split(path.sep).includes('..')) {
    return false;
  }
  const roots = effectiveRoots(options);
  if (roots.length === 0) return false;
  return isUnderAnyRoot(normalized, roots);
}

/**
 * B-BIC-6: spawn-boundary validator that also resolves symlinks. Runs the
 * lexical `isSafeBicameralCommand` first, then — for absolute paths — resolves
 * the real path via `fs.realpath` and re-checks containment against the same
 * root set. A symlink that lives inside an allowed root but resolves outside
 * it is rejected. Fail-closed: any resolution error (e.g. ENOENT) -> false.
 *
 * Residual TOCTOU: `realpath` resolves here, `spawn` happens later; a symlink
 * swapped in the interval is not caught. Accepted under the local-operator
 * threat model. Note the default Windows roots are %ProgramData%-anchored
 * (machine-scoped, not user-scoped) — see plan residual-risk register.
 */
export async function isSafeBicameralCommandResolved(
  value: string,
  options?: SafeCommandOptions,
): Promise<boolean> {
  if (!isSafeBicameralCommand(value, options)) {
    return false;
  }
  if (!path.isAbsolute(value)) {
    // Bare name: PATH-resolved by the OS — no filesystem path to resolve.
    return true;
  }
  const roots = effectiveRoots(options);
  if (roots.length === 0) return false;
  try {
    const real = await fs.promises.realpath(value);
    return isUnderAnyRoot(real, roots);
  } catch {
    return false;
  }
}

function classifyConfigured(workspaceRoot: string): { configured: boolean; configPath: string } {
  const configPath = path.join(workspaceRoot, '.bicameral', 'config.yaml');
  return { configured: fs.existsSync(configPath), configPath };
}

interface ProbeOptions {
  command: string;
  workspaceRoot: string;
  timeoutMs?: number;
  /** B-BIC-7: extra anchored absolute roots accepted for the command path. */
  extraRoots?: string[];
}

/**
 * Probe install state by:
 *   1. Running `<command> --version` (ENOENT -> not-installed; success -> at least installed).
 *   2. Checking `<workspaceRoot>/.bicameral/config.yaml` for configured/running.
 * Never throws. Defaults to `not-installed` on any error per fail-closed posture.
 *
 * B-BIC-6: the command is validated through `isSafeBicameralCommandResolved`,
 * so a symlinked absolute path that escapes the allowed roots is rejected
 * before the `spawn`.
 */
export async function probeInstallState(opts: ProbeOptions): Promise<BicameralInstallProbe> {
  const { command, workspaceRoot } = opts;
  const timeoutMs = opts.timeoutMs ?? VERSION_TIMEOUT_MS;

  if (!(await isSafeBicameralCommandResolved(command, { extraRoots: opts.extraRoots }))) {
    return { state: 'not-installed' };
  }

  const versionInfo = await runVersionProbe(command, timeoutMs);
  if (versionInfo.state === 'not-installed') {
    return { state: 'not-installed' };
  }

  const { configured, configPath } = classifyConfigured(workspaceRoot);
  const state: BicameralInstallState = configured ? 'configured-not-running' : 'installed-not-configured';
  return { state, version: versionInfo.version, configPath };
}

function runVersionProbe(command: string, timeoutMs: number): Promise<{ state: 'installed' | 'not-installed'; version?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: { state: 'installed' | 'not-installed'; version?: string }) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let child;
    try {
      child = spawn(command, ['--version'], { shell: false });
    } catch {
      settle({ state: 'not-installed' });
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', () => settle({ state: 'not-installed' }));
    child.on('close', (code) => {
      if (code !== 0) { settle({ state: 'not-installed' }); return; }
      const m = stdout.match(VERSION_RE);
      settle({ state: 'installed', version: m ? m[1] : undefined });
    });
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      settle({ state: 'not-installed' });
    }, timeoutMs);
  });
}
