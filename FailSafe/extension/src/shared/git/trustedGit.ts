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
 * Pure Node: no `vscode` import. `configureTrustedGitFromVscode`
 * (src/extension/trustedGitActivation.ts) supplies the workspace folders and
 * the hint at activation.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';

export interface ProbeResult { completed: boolean; timedOut: boolean; stdout: string }

export interface TrustedGitConfig {
  /** Workspace folders; nothing inside them is ever executed. */
  workspaceDirs?: string[];
  /** The VS Code Git extension's resolved path, validated like any candidate. */
  hint?: string;
  // Test seams.
  pathEnv?: string;
  knownLocations?: string[];
  platform?: NodeJS.Platform;
  homeDir?: string;
  probe?: (realPath: string, cwd: string) => ProbeResult;
  /** Monotonic milliseconds (default performance.now()). */
  now?: () => number;
}

export interface Rejection { candidate: string; reason: string }

export class TrustedGitUnavailable extends Error {
  readonly code = 'TRUSTED_GIT_UNAVAILABLE';
  constructor(readonly rejected: ReadonlyArray<Rejection>) {
    const shown = rejected.slice(0, 5).map((r) => `${r.candidate || '(empty)'} (${r.reason})`).join('; ');
    super(`no trusted git executable${shown ? `; rejected: ${shown}` : ' was found'}`);
    this.name = 'TrustedGitUnavailable';
  }
}

const PROBE_TIMEOUT_MS = 5000;
const TIMEOUT_SKIP_MS = 60_000;
const GIT_VERSION_RE = /^git version \d+\.\d+/;

type Fold = (s: string) => string;
const foldFor = (platform: NodeJS.Platform): Fold =>
  platform === 'win32' || platform === 'darwin' ? (s) => s.toLowerCase() : (s) => s;

interface Root { lex: string; real: string }
interface Survivor { real: string; idKey: string }

let config: TrustedGitConfig = {};
let cache: { key: string; real: string; idKey: string } | undefined;
/** Identities whose completed probe printed something other than git. */
const probeFailures = new Set<string>();
/** Identity → time of its last probe timeout; survives invalidate and configure. */
const probeTimeouts = new Map<string, number>();

/** Replace the configuration; clears the positive and probe-failure caches, never the timeout set. */
export function configureTrustedGit(cfg: TrustedGitConfig): void {
  config = { ...cfg };
  invalidateTrustedGit();
}

/** Forget the resolved path and the probe failures (after an install, or a vanished binary). */
export function invalidateTrustedGit(): void {
  cache = undefined;
  probeFailures.clear();
}

/** Union of the activation root and the current folders, de-duplicated (case-insensitive on win32/darwin). */
export function workspaceDirsFor(
  activationRoot: string | undefined,
  currentFolders: string[],
  platform: NodeJS.Platform = process.platform,
): string[] {
  const fold = foldFor(platform);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of [activationRoot, ...currentFolders]) {
    if (!dir) continue;
    const k = fold(dir);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(dir);
  }
  return out;
}

/** S1, the only syntactic filter: drive-absolute without '%' on win32, '/'-rooted on POSIX. */
export function isTrustedAbsolute(p: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform === 'win32') {
    if (p.includes('%')) return false;
    return /^[A-Za-z]:[\\/]/.test(p);
  }
  return p.startsWith('/');
}

export function classifyProbe(r: {
  error?: NodeJS.ErrnoException; status: number | null; signal: NodeJS.Signals | null; stdout: string;
}): ProbeResult {
  return {
    completed: !r.error && r.status !== null && r.signal === null,
    timedOut: r.error?.code === 'ETIMEDOUT' || r.signal !== null,
    stdout: typeof r.stdout === 'string' ? r.stdout : '',
  };
}

function probeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.toUpperCase().startsWith('GIT_')) env[k] = v;
  }
  return env;
}

export function defaultGitProbe(realPath: string, cwd: string): ProbeResult {
  return classifyProbe(spawnSync(realPath, ['--version'], { cwd, shell: false, windowsHide: true, timeout: PROBE_TIMEOUT_MS, encoding: 'utf8', env: probeEnv() }));
}

const within = (p: string, dir: string): boolean =>
  p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

const insideAny = (p: string, roots: Root[]): boolean =>
  roots.some((r) => within(p, r.lex) || within(p, r.real));

function realOr(p: string): string {
  try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
}

function rootOf(dir: string, fold: Fold): Root {
  return { lex: fold(path.resolve(dir)), real: fold(realOr(dir)) };
}

/** W, C (only when a callCwd is given) and P (unless the process cwd is a filesystem root or home). */
function excludedRoots(callCwd: string | undefined, platform: NodeJS.Platform): Root[] {
  const fold = foldFor(platform);
  const roots = (config.workspaceDirs ?? []).map((d) => rootOf(d, fold));
  if (callCwd !== undefined) {
    let real: string;
    try { real = fs.realpathSync.native(callCwd); } catch {
      throw new TrustedGitUnavailable([{ candidate: callCwd, reason: 'call cwd does not resolve' }]);
    }
    roots.push({ lex: fold(path.resolve(callCwd)), real: fold(real) });
  }
  const cwdReal = realOr(process.cwd());
  const exempt = fold(cwdReal) === fold(path.parse(cwdReal).root)
    || fold(cwdReal) === fold(realOr(config.homeDir ?? os.homedir()));
  if (!exempt) roots.push({ lex: fold(path.resolve(process.cwd())), real: fold(cwdReal) });
  return roots;
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

/** Each candidate: the text S1 checks (the PATH entry, or the file itself) and the file. */
function candidates(platform: NodeJS.Platform): Array<{ source: string; file: string }> {
  const name = platform === 'win32' ? 'git.exe' : 'git';
  const out: Array<{ source: string; file: string }> = [];
  if (config.hint) out.push({ source: config.hint, file: config.hint });
  const pathEnv = config.pathEnv ?? process.env.PATH ?? '';
  for (const raw of pathEnv.split(platform === 'win32' ? ';' : ':')) {
    const entry = raw.trim().replace(/^"(.*)"$/, '$1');
    out.push({ source: entry, file: path.join(entry, name) });
  }
  for (const loc of config.knownLocations ?? defaultKnownLocations(platform)) out.push({ source: loc, file: loc });
  return out;
}

const identityKey = (real: string, st: fs.Stats): string =>
  [real, st.dev, st.ino, st.size, st.mtimeMs, st.ctimeMs].join('|');

const now = (): number => (config.now ?? (() => performance.now()))();

/** S7: not a known non-git binary, and not inside the 60 s window after its last timeout. */
function admitted(idKey: string): boolean {
  if (probeFailures.has(idKey)) return false;
  const t = probeTimeouts.get(idKey);
  return t === undefined || now() - t >= TIMEOUT_SKIP_MS;
}

/** Phase S for one candidate: a survivor, or the reason it was rejected. Nothing is executed. */
function staticCheck(c: { source: string; file: string }, roots: Root[], platform: NodeJS.Platform): Survivor | string {
  const fold = foldFor(platform);
  if (!isTrustedAbsolute(c.source, platform)) return 'not an absolute path';
  if (insideAny(fold(path.resolve(path.dirname(c.file))), roots)) return 'inside an excluded folder';
  let real: string;
  try { real = fs.realpathSync.native(c.file); } catch { return 'not found'; }
  if (insideAny(fold(real), roots)) return 'resolves inside an excluded folder';
  let st: fs.Stats;
  try { st = fs.statSync(real); } catch { return 'not found'; }
  if (!st.isFile()) return 'not a regular file';
  if (platform === 'win32') {
    if (path.extname(real).toLowerCase() !== '.exe') return 'not .exe';
  } else {
    try { fs.accessSync(real, fs.constants.X_OK); } catch { return 'not executable'; }
  }
  const idKey = identityKey(real, st);
  if (!admitted(idKey)) return 'probe failed earlier';
  return { real, idKey };
}

function resolve(roots: Root[], platform: NodeJS.Platform): Survivor {
  const rejected: Rejection[] = [];
  const survivors: Survivor[] = [];
  for (const c of candidates(platform)) {
    const r = staticCheck(c, roots, platform);
    if (typeof r === 'string') rejected.push({ candidate: c.file, reason: r });
    else survivors.push(r);
  }
  const probe = config.probe ?? defaultGitProbe;
  for (const s of survivors) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-gitprobe-'));
    let r: ProbeResult;
    try { r = probe(s.real, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    if (r.completed && GIT_VERSION_RE.test(r.stdout)) return s;
    if (r.timedOut) probeTimeouts.set(s.idKey, now());
    else if (r.completed) probeFailures.add(s.idKey);
    rejected.push({ candidate: s.real, reason: r.timedOut ? 'probe timed out' : `probe output ${JSON.stringify(r.stdout.trim().slice(0, 40))}` });
  }
  throw new TrustedGitUnavailable(rejected);
}

/**
 * Absolute path of a trusted git for a spawn whose cwd is `callCwd` (omit it
 * when the child inherits the process cwd). Throws TrustedGitUnavailable.
 */
export function trustedGitPath(callCwd?: string): string {
  const platform = config.platform ?? process.platform;
  const roots = excludedRoots(callCwd, platform);
  const key = JSON.stringify([
    config.pathEnv ?? process.env.PATH ?? '', config.hint ?? '',
    [...(config.workspaceDirs ?? [])].sort(), foldFor(platform)(realOr(process.cwd())), platform,
  ]);
  if (cache && cache.key === key) {
    if (insideAny(foldFor(platform)(cache.real), roots)) {
      throw new TrustedGitUnavailable([{ candidate: cache.real, reason: 'inside an excluded folder' }]);
    }
    let same = false;
    try {
      const st = fs.statSync(cache.real);
      same = st.isFile() && identityKey(cache.real, st) === cache.idKey;
    } catch { /* vanished: re-resolve */ }
    if (same) return cache.real;
    invalidateTrustedGit();
  }
  const found = resolve(roots, platform);
  cache = { key, real: found.real, idKey: found.idKey };
  return found.real;
}
