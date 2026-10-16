/**
 * trustedExecutable — the one place FailSafe decides which file to run for a
 * named executable (v6.0.8 lane A, B211; generalized from the v6.0.7 git
 * resolver, plan-v607-final-integration LD3).
 *
 * Node on Windows looks in the child's cwd before PATH for a bare executable
 * name, so `spawn('gh', …, { cwd: workspace })` runs a gh.exe planted in the
 * workspace. Every production spawn of a spec'd executable therefore uses the
 * absolute path returned here, with an argv array and no shell.
 *
 * Candidates (a hint, PATH entries when the spec allows a PATH search, the
 * spec's known locations) pass static checks first (phase S: nothing is
 * executed), then, for specs with a probe, one probe from a fresh temp folder
 * (phase P). A candidate inside a workspace folder, the call's cwd, the process
 * cwd (unless that is a filesystem root or the home folder) or a caller's extra
 * root is never executed. The realpath is returned, so a symlink cannot be
 * retargeted between check and spawn. One exception: a Windows App Execution
 * Alias (winget, the Store Python) cannot be realpath'd; for specs flagged for
 * it, the alias is admitted at a known location only, as its lexical path.
 *
 * Pure Node: no `vscode` import. `configureTrustedGitFromVscode`
 * (src/extension/trustedGitActivation.ts) supplies the workspace folders.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';

export interface ProbeResult { completed: boolean; timedOut: boolean; stdout: string }

export interface ExecutableSpec {
  /** Stable id: cache key and message label. */
  readonly id: string;
  /** The file name searched for on this platform; undefined when unsupported. */
  readonly fileName: (platform: NodeJS.Platform) => string | undefined;
  readonly searchPath: boolean;
  readonly knownLocations: (platform: NodeJS.Platform) => string[];
  /** Absent: static checks only, the first survivor wins. */
  readonly probe?: { readonly args: ReadonlyArray<string>; readonly accept: RegExp };
  /** Probe used when the configuration supplies none (git keeps its own). */
  readonly defaultProbe?: (realPath: string, cwd: string) => ProbeResult;
  /** win32: admit an App Execution Alias found at a known location. */
  readonly appExecutionAlias?: boolean;
}

export interface TrustedExecConfig {
  /** Workspace folders; nothing inside them is ever executed. */
  workspaceDirs?: string[];
  /** A path suggested by another component, validated like any candidate. */
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

export class TrustedExecutableUnavailable extends Error {
  readonly code = 'TRUSTED_EXECUTABLE_UNAVAILABLE';
  constructor(readonly executable: string, readonly rejected: ReadonlyArray<Rejection>) {
    const shown = rejected.slice(0, 5).map((r) => `${r.candidate || '(empty)'} (${r.reason})`).join('; ');
    super(`no trusted ${executable} executable${shown ? `; rejected: ${shown}` : ' was found'}`);
    this.name = 'TrustedExecutableUnavailable';
  }
}

const PROBE_TIMEOUT_MS = 5000;
const TIMEOUT_SKIP_MS = 60_000;

type Fold = (s: string) => string;
export const foldFor = (platform: NodeJS.Platform): Fold =>
  platform === 'win32' || platform === 'darwin' ? (s) => s.toLowerCase() : (s) => s;

interface Root { lex: string; real: string }
interface Survivor { real: string; idKey: string }
interface Candidate { source: string; file: string; known: boolean }

interface SpecState {
  cache?: { key: string; real: string; idKey: string; alias: boolean };
  /** Identities whose completed probe printed something else. */
  probeFailures: Set<string>;
  /** Identity → time of its last probe timeout; survives invalidate and configure. */
  probeTimeouts: Map<string, number>;
}

/** Per-spec configuration (git) and the shared one for every other spec. */
const specConfigs = new Map<string, TrustedExecConfig>();
let sharedConfig: TrustedExecConfig = {};
const states = new Map<string, SpecState>();

function stateOf(spec: ExecutableSpec): SpecState {
  let st = states.get(spec.id);
  if (!st) { st = { probeFailures: new Set(), probeTimeouts: new Map() }; states.set(spec.id, st); }
  return st;
}
const configOf = (spec: ExecutableSpec): TrustedExecConfig => specConfigs.get(spec.id) ?? sharedConfig;

/** Give one spec its own configuration (used by trustedGit). */
export function configureExecutable(spec: ExecutableSpec, cfg: TrustedExecConfig): void {
  specConfigs.set(spec.id, { ...cfg });
  invalidateTrustedExecutable(spec);
}

/** Workspace folders and seams for every spec without its own configuration. */
export function configureTrustedExecutables(cfg: TrustedExecConfig): void {
  sharedConfig = { ...cfg };
  for (const [id, st] of states) {
    if (!specConfigs.has(id)) { st.cache = undefined; st.probeFailures.clear(); }
  }
}

/** Forget resolved paths and probe failures (one spec, or every shared-config spec). */
export function invalidateTrustedExecutable(spec?: ExecutableSpec): void {
  if (spec) {
    const st = stateOf(spec);
    st.cache = undefined;
    st.probeFailures.clear();
    return;
  }
  for (const [id, st] of states) {
    if (!specConfigs.has(id)) { st.cache = undefined; st.probeFailures.clear(); }
  }
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

function specProbe(spec: ExecutableSpec): (realPath: string, cwd: string) => ProbeResult {
  const args = [...(spec.probe?.args ?? [])];
  return (realPath, cwd) => classifyProbe(spawnSync(realPath, args, { cwd, shell: false, windowsHide: true, timeout: PROBE_TIMEOUT_MS, encoding: 'utf8' })); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- probes only a candidate that passed every static check (absolute, outside every root, regular .exe/X_OK file)
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

/** W, C (only when a callCwd is given), extra roots, and P (unless the process cwd is a filesystem root or home). */
function excludedRoots(
  spec: ExecutableSpec, config: TrustedExecConfig, callCwd: string | undefined,
  extra: ReadonlyArray<string>, platform: NodeJS.Platform,
): Root[] {
  const fold = foldFor(platform);
  const roots = [...(config.workspaceDirs ?? []), ...extra].map((d) => rootOf(d, fold));
  if (callCwd !== undefined) {
    let real: string;
    try { real = fs.realpathSync.native(callCwd); } catch {
      throw new TrustedExecutableUnavailable(spec.id, [{ candidate: callCwd, reason: 'call cwd does not resolve' }]);
    }
    roots.push({ lex: fold(path.resolve(callCwd)), real: fold(real) });
  }
  const cwdReal = realOr(process.cwd());
  const exempt = fold(cwdReal) === fold(path.parse(cwdReal).root)
    || fold(cwdReal) === fold(realOr(config.homeDir ?? os.homedir()));
  if (!exempt) roots.push({ lex: fold(path.resolve(process.cwd())), real: fold(cwdReal) });
  return roots;
}

/** Each candidate: the text S1 checks (the PATH entry, or the file itself) and the file. */
function candidates(spec: ExecutableSpec, config: TrustedExecConfig, platform: NodeJS.Platform, name: string): Candidate[] {
  const out: Candidate[] = [];
  if (config.hint) out.push({ source: config.hint, file: config.hint, known: false });
  if (spec.searchPath) {
    const pathEnv = config.pathEnv ?? process.env.PATH ?? '';
    for (const raw of pathEnv.split(platform === 'win32' ? ';' : ':')) {
      const entry = raw.trim().replace(/^"(.*)"$/, '$1');
      out.push({ source: entry, file: path.join(entry, name), known: false });
    }
  }
  for (const loc of config.knownLocations ?? spec.knownLocations(platform)) out.push({ source: loc, file: loc, known: true });
  return out;
}

const identityKey = (real: string, st: fs.Stats): string =>
  [real, st.dev, st.ino, st.size, st.mtimeMs, st.ctimeMs].join('|');

const nowOf = (config: TrustedExecConfig): number => (config.now ?? (() => performance.now()))();

/** S7: not a known non-match, and not inside the 60 s window after its last timeout. */
function admitted(st: SpecState, config: TrustedExecConfig, idKey: string): boolean {
  if (st.probeFailures.has(idKey)) return false;
  const t = st.probeTimeouts.get(idKey);
  return t === undefined || nowOf(config) - t >= TIMEOUT_SKIP_MS;
}

/** The App Execution Alias case: realpath/stat refuse with EACCES, lstat sees a link. */
function aliasSurvivor(spec: ExecutableSpec, c: Candidate, platform: NodeJS.Platform, err: unknown): Survivor | undefined {
  if (!spec.appExecutionAlias || !c.known || platform !== 'win32') return undefined;
  if ((err as NodeJS.ErrnoException | undefined)?.code !== 'EACCES') return undefined;
  let lst: fs.Stats;
  try { lst = fs.lstatSync(c.file); } catch { return undefined; }
  if (!lst.isSymbolicLink()) return undefined;
  const lex = path.resolve(c.file);
  if (path.extname(lex).toLowerCase() !== '.exe') return undefined;
  return { real: lex, idKey: `alias|${identityKey(lex, lst)}` };
}

/** Phase S for one candidate: a survivor, or the reason it was rejected. Nothing is executed. */
function staticCheck(
  spec: ExecutableSpec, st: SpecState, config: TrustedExecConfig, c: Candidate, roots: Root[], platform: NodeJS.Platform,
): Survivor | string {
  const fold = foldFor(platform);
  if (!isTrustedAbsolute(c.source, platform)) return 'not an absolute path';
  if (insideAny(fold(path.resolve(path.dirname(c.file))), roots)) return 'inside an excluded folder';
  let real: string;
  try { real = fs.realpathSync.native(c.file); } catch (e) {
    const alias = aliasSurvivor(spec, c, platform, e);
    if (!alias) return 'not found';
    return admitted(st, config, alias.idKey) ? alias : 'probe failed earlier';
  }
  if (insideAny(fold(real), roots)) return 'resolves inside an excluded folder';
  let stat: fs.Stats;
  try { stat = fs.statSync(real); } catch { return 'not found'; }
  if (!stat.isFile()) return 'not a regular file';
  if (platform === 'win32') {
    if (path.extname(real).toLowerCase() !== '.exe') return 'not .exe';
  } else {
    try { fs.accessSync(real, fs.constants.X_OK); } catch { return 'not executable'; }
  }
  const idKey = identityKey(real, stat);
  if (!admitted(st, config, idKey)) return 'probe failed earlier';
  return { real, idKey };
}

function resolveUncached(
  spec: ExecutableSpec, st: SpecState, config: TrustedExecConfig, roots: Root[], platform: NodeJS.Platform, name: string,
): Survivor {
  const rejected: Rejection[] = [];
  const survivors: Survivor[] = [];
  for (const c of candidates(spec, config, platform, name)) {
    const r = staticCheck(spec, st, config, c, roots, platform);
    if (typeof r === 'string') rejected.push({ candidate: c.file, reason: r });
    else survivors.push(r);
  }
  const probe = spec.probe ? (config.probe ?? spec.defaultProbe ?? specProbe(spec)) : undefined;
  // One probe per file per resolution: PATH and a known location often name the same file.
  const seen = new Set<string>();
  for (const s of survivors) {
    if (seen.has(s.idKey)) continue;
    seen.add(s.idKey);
    if (!probe || !spec.probe) return s;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `failsafe-${spec.id}probe-`));
    let r: ProbeResult;
    try { r = probe(s.real, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    if (r.completed && spec.probe.accept.test(r.stdout)) return s;
    if (r.timedOut) st.probeTimeouts.set(s.idKey, nowOf(config));
    else if (r.completed) st.probeFailures.add(s.idKey);
    rejected.push({ candidate: s.real, reason: r.timedOut ? 'probe timed out' : `probe output ${JSON.stringify(r.stdout.trim().slice(0, 40))}` });
  }
  throw new TrustedExecutableUnavailable(spec.id, rejected);
}

function stillSame(real: string, idKey: string, alias: boolean): boolean {
  try {
    if (alias) {
      const lst = fs.lstatSync(real);
      return lst.isSymbolicLink() && `alias|${identityKey(real, lst)}` === idKey;
    }
    const s = fs.statSync(real);
    return s.isFile() && identityKey(real, s) === idKey;
  } catch { return false; }
}

/**
 * Absolute path of a trusted `spec` executable for a spawn whose cwd is
 * `callCwd` (omit it when the child inherits the process cwd). `extraExcluded`
 * adds roots no candidate may sit in. Throws TrustedExecutableUnavailable.
 */
export function trustedExecutablePath(
  spec: ExecutableSpec, callCwd?: string, extraExcluded: ReadonlyArray<string> = [],
): string {
  const config = configOf(spec);
  const platform = config.platform ?? process.platform;
  const name = spec.fileName(platform);
  if (!name) throw new TrustedExecutableUnavailable(spec.id, [{ candidate: spec.id, reason: `not supported on ${platform}` }]);
  const st = stateOf(spec);
  const fold = foldFor(platform);
  const roots = excludedRoots(spec, config, callCwd, extraExcluded, platform);
  const key = JSON.stringify([
    config.pathEnv ?? process.env.PATH ?? '', config.hint ?? '',
    [...(config.workspaceDirs ?? [])].sort(), fold(realOr(process.cwd())), platform,
    [...extraExcluded].map((d) => fold(path.resolve(d))).sort(),
  ]);
  if (st.cache && st.cache.key === key) {
    if (insideAny(fold(st.cache.real), roots)) {
      throw new TrustedExecutableUnavailable(spec.id, [{ candidate: st.cache.real, reason: 'inside an excluded folder' }]);
    }
    if (stillSame(st.cache.real, st.cache.idKey, st.cache.alias)) return st.cache.real;
    invalidateTrustedExecutable(spec);
  }
  const found = resolveUncached(spec, st, config, roots, platform, name);
  st.cache = { key, real: found.real, idKey: found.idKey, alias: found.idKey.startsWith('alias|') };
  return found.real;
}

/**
 * Phase S for one given absolute file against the same excluded roots: returns
 * its realpath, or throws. No probe, no alias rule; for re-checking a path a
 * caller already holds before each spawn.
 */
export function checkTrustedPath(
  spec: ExecutableSpec, absPath: string, callCwd?: string, extraExcluded: ReadonlyArray<string> = [],
): string {
  const config = configOf(spec);
  const platform = config.platform ?? process.platform;
  const roots = excludedRoots(spec, config, callCwd, extraExcluded, platform);
  const r = staticCheck(spec, stateOf(spec), config, { source: absPath, file: absPath, known: false }, roots, platform);
  if (typeof r === 'string') throw new TrustedExecutableUnavailable(spec.id, [{ candidate: absPath, reason: r }]);
  return r.real;
}

// ---------------------------------------------------------------- specs

const env = (k: string): string | undefined => process.env[k];
const winJoin = (base: string | undefined, ...tail: string[]): string[] => (base ? [path.win32.join(base, ...tail)] : []);
const winOnly = (file: string) => (p: NodeJS.Platform): string | undefined => (p === 'win32' ? file : undefined);
const posixOnly = (file: string) => (p: NodeJS.Platform): string | undefined => (p === 'win32' ? undefined : file);
const both = (file: string) => (p: NodeJS.Platform): string => (p === 'win32' ? `${file}.exe` : file);
const systemRoot = (): string => env('SystemRoot') || env('SYSTEMROOT') || 'C:\\Windows';
const PS_PROBE = { args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], accept: /^\d+\.\d+\.\d+/ };
const PY_PROBE = { args: ['--version'], accept: /^Python 3\.\d+/ };

export const GH: ExecutableSpec = {
  id: 'gh', fileName: both('gh'), searchPath: true,
  knownLocations: (p) => (p === 'win32' ? winJoin(env('ProgramFiles'), 'GitHub CLI', 'gh.exe')
    : p === 'darwin' ? ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'] : ['/usr/bin/gh', '/usr/local/bin/gh']),
  probe: { args: ['--version'], accept: /^gh version \d+\.\d+/ },
};
export const WINDOWS_POWERSHELL: ExecutableSpec = {
  id: 'powershell', fileName: winOnly('powershell.exe'), searchPath: false,
  knownLocations: () => [path.win32.join(systemRoot(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')],
  probe: PS_PROBE,
};
export const PWSH: ExecutableSpec = {
  id: 'pwsh', fileName: posixOnly('pwsh'), searchPath: true,
  knownLocations: () => ['/usr/bin/pwsh', '/usr/local/bin/pwsh', '/opt/microsoft/powershell/7/pwsh', '/opt/homebrew/bin/pwsh'],
  probe: PS_PROBE,
};
/** PowerShell for this platform: Windows PowerShell on win32, pwsh elsewhere. */
export const powershellFor = (platform: NodeJS.Platform = process.platform): ExecutableSpec =>
  (platform === 'win32' ? WINDOWS_POWERSHELL : PWSH);
export const GARAK: ExecutableSpec = {
  id: 'garak', fileName: both('garak'), searchPath: true, knownLocations: () => [],
  probe: { args: ['--version'], accept: /garak/i },
};
export const PROMPTFOO: ExecutableSpec = {
  id: 'promptfoo', fileName: both('promptfoo'), searchPath: true, knownLocations: () => [],
  probe: { args: ['--version'], accept: /^\d+\.\d+\.\d+/ },
};
export const WINGET: ExecutableSpec = {
  id: 'winget', fileName: winOnly('winget.exe'), searchPath: false, appExecutionAlias: true,
  knownLocations: () => winJoin(env('LOCALAPPDATA'), 'Microsoft', 'WindowsApps', 'winget.exe'),
};
export const CHOCO: ExecutableSpec = {
  id: 'choco', fileName: winOnly('choco.exe'), searchPath: false,
  knownLocations: () => [path.win32.join(env('ChocolateyInstall') || 'C:\\ProgramData\\chocolatey', 'bin', 'choco.exe')],
};
export const BREW: ExecutableSpec = {
  id: 'brew', fileName: (p) => (p === 'darwin' ? 'brew' : undefined), searchPath: false,
  knownLocations: () => ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'],
};
const linuxPm = (name: string): ExecutableSpec => ({
  id: name, fileName: (p) => (p === 'linux' ? name : undefined), searchPath: false,
  knownLocations: () => [`/usr/bin/${name}`],
});
export const APT_GET = linuxPm('apt-get');
export const DNF = linuxPm('dnf');
export const YUM = linuxPm('yum');
export const PACMAN = linuxPm('pacman');
export const PYTHON: ExecutableSpec = {
  id: 'python', fileName: both('python'), searchPath: true, appExecutionAlias: true,
  knownLocations: (p) => (p === 'win32' ? winJoin(env('LOCALAPPDATA'), 'Microsoft', 'WindowsApps', 'python.exe')
    : ['/usr/bin/python', '/usr/local/bin/python']),
  probe: PY_PROBE,
};
export const PYTHON3: ExecutableSpec = {
  id: 'python3', fileName: both('python3'), searchPath: true, appExecutionAlias: true,
  knownLocations: (p) => (p === 'win32' ? winJoin(env('LOCALAPPDATA'), 'Microsoft', 'WindowsApps', 'python3.exe')
    : p === 'darwin' ? ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3']
      : ['/usr/bin/python3', '/usr/local/bin/python3']),
  probe: PY_PROBE,
};
export const PY: ExecutableSpec = {
  id: 'py', fileName: winOnly('py.exe'), searchPath: true,
  knownLocations: () => [path.win32.join(systemRoot(), 'py.exe'),
    ...winJoin(env('LOCALAPPDATA'), 'Programs', 'Python', 'Launcher', 'py.exe')],
  probe: PY_PROBE,
};
export const PIP: ExecutableSpec = {
  id: 'pip', fileName: both('pip'), searchPath: true, knownLocations: () => [],
  probe: { args: ['--version'], accept: /^pip \d+(\.\d+)* from / },
};
export const PIP3: ExecutableSpec = {
  id: 'pip3', fileName: both('pip3'), searchPath: true, knownLocations: () => [],
  probe: { args: ['--version'], accept: /^pip \d+(\.\d+)* from / },
};

/** The spec for a bare Python-family name, or undefined. */
export function pythonFamilySpec(name: string): ExecutableSpec | undefined {
  return ({ python: PYTHON, python3: PYTHON3, py: PY, pip: PIP, pip3: PIP3 } as Record<string, ExecutableSpec>)[name];
}
