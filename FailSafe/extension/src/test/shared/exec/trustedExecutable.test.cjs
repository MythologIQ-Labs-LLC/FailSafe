/**
 * Trusted executable engine (v6.0.8 lane A, B211, plan T6).
 *
 * Each row puts a plant where exactly one check is the only thing that can
 * reject it and asserts the control K is returned instead. The probe is a
 * counting seam unless a row says otherwise.
 *
 * Runs standalone after `npm run compile`: node --test src/test/shared/exec/trustedExecutable.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const te = require(path.join(OUT, 'shared', 'exec', 'trustedExecutable.js'));
const {
  configureTrustedExecutables, trustedExecutablePath, invalidateTrustedExecutable, checkTrustedPath,
  TrustedExecutableUnavailable, GH, CHOCO, WINGET, PYTHON, powershellFor,
} = te;
const { trustedCommandPath, repoRootsFor } = te;

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const exe = (n) => (WIN ? `${n}.exe` : n);
const realOr = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
const mkbase = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsexec-')));
const dir = (...p) => { const d = path.join(...p); fs.mkdirSync(d, { recursive: true }); return d; };
function inert(d, name) {
  dir(d);
  const f = path.join(d, name);
  fs.writeFileSync(f, '');
  if (!WIN) fs.chmodSync(f, 0o755);
  return f;
}
function counter(stdout) {
  const calls = new Map();
  const fn = (real) => {
    calls.set(real, (calls.get(real) || 0) + 1);
    return { completed: true, timedOut: false, stdout: typeof stdout === 'function' ? stdout(real) : stdout };
  };
  fn.count = (f) => calls.get(realOr(f)) || 0;
  fn.total = () => [...calls.values()].reduce((a, b) => a + b, 0);
  return fn;
}
function fixture(name) {
  const base = mkbase();
  const K = inert(dir(base, 'K'), name);
  return { base, E: dir(base, 'E'), W: dir(base, 'W'), K, Kdir: path.dirname(K) };
}
function cfg(fx, over = {}) {
  return { pathEnv: '', knownLocations: [], workspaceDirs: [fx.W], homeDir: fx.base, platform: process.platform, probe: counter('gh version 9.9.9'), now: () => 0, ...over };
}
const pathOf = (...e) => e.join(DELIM);

test('T6 (a): a gh plant in a workspace folder on an absolute PATH entry is rejected unprobed', () => {
  const fx = fixture(exe('gh'));
  const plant = inert(dir(fx.W, 'bin'), exe('gh'));
  const c = cfg(fx, { pathEnv: pathOf(path.dirname(plant), fx.Kdir) });
  configureTrustedExecutables(c);
  assert.equal(trustedExecutablePath(GH, fx.E), realOr(fx.K));
  assert.equal(c.probe.count(plant), 0);
});

test('T6 (b): a relative PATH entry is rejected (not absolute)', () => {
  const fx = fixture(exe('gh'));
  const plant = inert(dir(fx.base, 'rel'), exe('gh'));
  const before = process.cwd();
  process.chdir(fx.base);
  try {
    const c = cfg(fx, { pathEnv: pathOf('rel', fx.Kdir), homeDir: fx.base });
    configureTrustedExecutables(c);
    assert.equal(trustedExecutablePath(GH, fx.E), realOr(fx.K));
    assert.equal(c.probe.count(plant), 0);
  } finally { process.chdir(before); }
});

test('T6 (c): a gh.cmd file is rejected as not .exe (win32)', { skip: !WIN && 'win32 row' }, () => {
  const fx = fixture('gh.exe');
  const plant = inert(dir(fx.base, 'O'), 'gh.cmd');
  const c = cfg(fx, { knownLocations: [plant, fx.K] });
  configureTrustedExecutables(c);
  assert.equal(trustedExecutablePath(GH, fx.E), realOr(fx.K));
  assert.equal(c.probe.count(plant), 0);
});

test('T6 (d): an extra excluded root passed by the caller contains the plant', () => {
  const fx = fixture(exe('gh'));
  const X = dir(fx.base, 'X');
  const plant = inert(dir(X, 'bin'), exe('gh'));
  const c = cfg(fx, { pathEnv: pathOf(path.dirname(plant), fx.Kdir) });
  configureTrustedExecutables(c);
  assert.equal(trustedExecutablePath(GH, fx.E, [X]), realOr(fx.K));
  assert.equal(c.probe.count(plant), 0);
});

test('T6 (e): a probe mismatch is rejected and not probed again on the next resolution', () => {
  const fx = fixture(exe('gh'));
  const F = inert(dir(fx.base, 'F'), exe('gh'));
  const probe = counter((real) => (real === realOr(F) ? 'v22.22.3' : 'gh version 9.9.9'));
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(path.dirname(F), fx.Kdir), probe }));
  assert.equal(trustedExecutablePath(GH, fx.E), realOr(fx.K));
  assert.equal(probe.count(F), 1);
  // Force a cache miss without clearing anything: the process cwd is part of the key.
  const before = process.cwd();
  process.chdir(dir(fx.base, 'D2'));
  try {
    assert.equal(trustedExecutablePath(GH, fx.E), realOr(fx.K));
    assert.equal(probe.count(fx.K), 2, 'the miss re-resolved');
    assert.equal(probe.count(F), 1, 'F is skipped after its probe failure');
  } finally { process.chdir(before); }
});

test('T6 (f): a known-location-only spec (choco) ignores a matching file on PATH', { skip: !WIN && 'choco is win32 only' }, () => {
  const fx = fixture('choco.exe');
  const onPath = inert(dir(fx.base, 'P'), 'choco.exe');
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(path.dirname(onPath)), knownLocations: [fx.K] }));
  assert.equal(trustedExecutablePath(CHOCO, fx.E), realOr(fx.K));
});

test('T6 (g): a spec without a probe never calls the probe', { skip: !WIN && 'choco is win32 only' }, () => {
  const fx = fixture('choco.exe');
  const c = cfg(fx, { knownLocations: [fx.K] });
  configureTrustedExecutables(c);
  assert.equal(trustedExecutablePath(CHOCO, fx.E), realOr(fx.K));
  assert.equal(c.probe.total(), 0);
});

test('T6 (h): the App Execution Alias rule needs both the flag and a known location (win32, real winget alias)', { skip: !WIN && 'win32 row' }, () => {
  const alias = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe');
  assert.ok(fs.lstatSync(alias).isSymbolicLink(), 'precondition: the host has the winget alias (H1)');
  assert.throws(() => fs.realpathSync.native(alias), (e) => e.code === 'EACCES', 'precondition: realpath refuses it');
  const fx = fixture('winget.exe');
  configureTrustedExecutables({ workspaceDirs: [fx.W], homeDir: fx.base, pathEnv: '' });
  assert.equal(trustedExecutablePath(WINGET, fx.E), alias, 'the winget spec admits its alias');
  const noFlag = { ...WINGET, id: 't6-noflag', appExecutionAlias: false };
  assert.throws(() => trustedExecutablePath(noFlag, fx.E), (e) => e instanceof TrustedExecutableUnavailable && /not found/.test(e.message));
  const viaPath = { ...WINGET, id: 't6-viapath', searchPath: true, knownLocations: () => [] };
  configureTrustedExecutables({ workspaceDirs: [fx.W], homeDir: fx.base, pathEnv: path.dirname(alias) });
  assert.throws(() => trustedExecutablePath(viaPath, fx.E), (e) => e instanceof TrustedExecutableUnavailable && /not found/.test(e.message));
});

test('T6 (i): caches are per spec', () => {
  const ps = powershellFor(process.platform);
  const fx = fixture(exe(WIN ? 'powershell' : 'pwsh'));
  const ghK = inert(dir(fx.base, 'GK'), exe('gh'));
  const probe = counter((real) => (real === realOr(ghK) ? 'gh version 9.9.9' : '5.1.0'));
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(path.dirname(ghK)), knownLocations: [fx.K], probe }));
  assert.equal(trustedExecutablePath(ps, fx.E), realOr(fx.K));
  assert.equal(probe.count(fx.K), 1);
  assert.equal(trustedExecutablePath(GH, fx.E), realOr(ghK), 'gh does not get the PowerShell answer');
  invalidateTrustedExecutable(GH);
  assert.equal(trustedExecutablePath(ps, fx.E), realOr(fx.K));
  assert.equal(probe.count(fx.K), 1, 'invalidating gh left the PowerShell cache in place');
});

test('T6 (j): a spec with no file on the configured platform throws with its id', () => {
  const fx = fixture('winget.exe');
  configureTrustedExecutables(cfg(fx, { platform: 'linux' }));
  assert.throws(() => trustedExecutablePath(WINGET, fx.E), (e) => e instanceof TrustedExecutableUnavailable && e.executable === 'winget' && e.code === 'TRUSTED_EXECUTABLE_UNAVAILABLE');
});

test('T6 checkTrustedPath: an absolute path inside a workspace folder is rejected, one outside passes', () => {
  const fx = fixture(exe('python'));
  const inside = inert(dir(fx.W, 'venv'), exe('python'));
  configureTrustedExecutables(cfg(fx));
  assert.throws(() => checkTrustedPath(GH, inside), (e) => e instanceof TrustedExecutableUnavailable && /inside an excluded folder/.test(e.message));
  assert.equal(checkTrustedPath(GH, fx.K), realOr(fx.K));
});

// ---------------------------------------------------------------- review delta (LD14, LD18-LD20)

test('T6 trustedCommandPath: a safe bare name resolves on PATH outside every root', () => {
  assert.equal(typeof trustedCommandPath, 'function', 'trustedCommandPath exists');
  const fx = fixture(exe('fstool'));
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(fx.Kdir) }));
  assert.equal(trustedCommandPath('fstool', fx.E), realOr(fx.K));
});

test('T6 trustedCommandPath: a bare name whose only match is inside a workspace folder is refused', () => {
  assert.equal(typeof trustedCommandPath, 'function', 'trustedCommandPath exists');
  const fx = fixture(exe('fstool2'));
  const plant = inert(dir(fx.W, 'bin'), exe('fstool2'));
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(path.dirname(plant)) }));
  assert.throws(() => trustedCommandPath('fstool2', fx.E), (e) => e instanceof TrustedExecutableUnavailable);
});

test('T6 trustedCommandPath: unsafe names are refused; an absolute path goes through the static checks', () => {
  assert.equal(typeof trustedCommandPath, 'function', 'trustedCommandPath exists');
  const fx = fixture(exe('fstool3'));
  const inside = inert(dir(fx.W, 'x'), exe('fstool3'));
  configureTrustedExecutables(cfg(fx));
  for (const bad of ['a;b', '../x', '-x', '', 'a b']) assert.throws(() => trustedCommandPath(bad, fx.E), (e) => e instanceof TrustedExecutableUnavailable, bad);
  assert.throws(() => trustedCommandPath(inside, fx.E), (e) => /inside an excluded folder/.test(e.message));
  assert.equal(trustedCommandPath(fx.K, fx.E), realOr(fx.K));
});

test('T17 (a): checkTrustedPath admits an alias inside WindowsApps for alias-capable specs only (win32, real winget alias)', { skip: !WIN && 'win32 alias' }, () => {
  const alias = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe');
  const fx = fixture('winget.exe');
  configureTrustedExecutables({ workspaceDirs: [fx.W], homeDir: fx.base, pathEnv: '' });
  assert.equal(checkTrustedPath({ ...WINGET, id: 't17-alias' }, alias, fx.E), alias);
  assert.equal(checkTrustedPath(PYTHON, alias, fx.E), alias, 'the Python spec is alias-capable');
  assert.throws(() => checkTrustedPath({ ...WINGET, id: 't17-noalias', appExecutionAlias: false }, alias, fx.E), (e) => /not found/.test(e.message));
});

test('T17 (b) win32: a Python spawn path is its folder realpath plus the file name, and a link into a workspace is refused on miss and hit', { skip: !WIN && 'win32 junction rows' }, () => {
  const fx = fixture('python.exe');
  const R = dir(fx.base, 'R');
  inert(R, 'python.exe');
  const J = path.join(fx.base, 'J');
  fs.symlinkSync(R, J, 'junction');
  const py = counter('Python 3.12.0');
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(J), probe: py }));
  const got = trustedExecutablePath(PYTHON, fx.E);
  assert.equal(got, path.join(fs.realpathSync.native(R), 'python.exe'), 'never a path through J');
  assert.throws(() => trustedExecutablePath(PYTHON, R), (e) => e instanceof TrustedExecutableUnavailable, 'hit: the cached folder is checked against the call cwd');
  const Wpy = dir(fx.W, 'py');
  inert(Wpy, 'python.exe');
  const J2 = path.join(fx.base, 'J2');
  fs.symlinkSync(Wpy, J2, 'junction');
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(J2), probe: py }));
  assert.throws(() => trustedExecutablePath(PYTHON, fx.E), (e) => e instanceof TrustedExecutableUnavailable, 'miss: a link into the workspace is refused');
});

test('T17 (b) POSIX: a venv-style python link keeps its venv folder; a retargeted link is refused on the next call', { skip: WIN && 'POSIX CI row' }, () => {
  const fx = fixture('python');
  const realPy = inert(dir(fx.base, 'base-python'), 'python3.12');
  const vbin = dir(fx.base, 'venv', 'bin');
  fs.symlinkSync(realPy, path.join(vbin, 'python'));
  const py = counter('Python 3.12.0');
  configureTrustedExecutables(cfg(fx, { pathEnv: pathOf(vbin), probe: py }));
  assert.equal(trustedExecutablePath(PYTHON, fx.E), path.join(fs.realpathSync.native(vbin), 'python'));
  const wsPy = inert(dir(fx.W, 'evil'), 'python3.12');
  fs.unlinkSync(path.join(vbin, 'python'));
  fs.symlinkSync(wsPy, path.join(vbin, 'python'));
  assert.throws(() => trustedExecutablePath(PYTHON, fx.E), (e) => e instanceof TrustedExecutableUnavailable, 'hit: the file now resolves inside the workspace');
});

test('T17 (c): repoRootsFor returns every .git ancestor below home, and nothing at or above home', () => {
  assert.equal(typeof repoRootsFor, 'function', 'repoRootsFor exists');
  const base = mkbase();
  const home = dir(base, 'home');
  const sup = dir(base, 'super');
  fs.mkdirSync(path.join(sup, '.git'));
  const sub = dir(sup, 'sub');
  fs.writeFileSync(path.join(sub, '.git'), 'gitdir: ../.git/modules/sub\n');
  const inner = dir(sub, 'inner');
  const got = repoRootsFor([inner], home).map((p) => p.toLowerCase()).sort();
  assert.deepEqual(got, [sup, sub].map((p) => p.toLowerCase()).sort());
  fs.mkdirSync(path.join(home, '.git'));
  fs.mkdirSync(path.join(base, '.git'));
  const proj = dir(home, 'proj');
  assert.deepEqual(repoRootsFor([proj], home), [], 'home and its ancestors are never returned');
  assert.deepEqual(repoRootsFor([path.parse(base).root], home), [], 'a filesystem root is never returned');
});
