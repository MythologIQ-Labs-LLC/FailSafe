/**
 * Trusted git resolver (plan-v607-final-integration Phase 2, T-b / T-p / T-c).
 *
 * Every T-b row puts a plant where exactly one static check is the only thing
 * that can reject it, gives the resolver an accept-all probe that counts its
 * calls, and asserts (i) the control git K, last on PATH and outside every
 * root, is returned and (ii) the plant was never probed. T-p rows use the real
 * probe (or a probe seam for timeouts); T-c rows check that every caller
 * degrades exactly as it does today when git is missing.
 *
 * Runs standalone after `npm run compile`: node --test src/test/shared/git/trustedGit.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const SRC = path.resolve(__dirname, '..', '..', '..');
const tg = require(path.join(OUT, 'shared', 'git', 'trustedGit.js'));
const { configureTrustedGit, trustedGitPath, invalidateTrustedGit, TrustedGitUnavailable } = tg;

const WIN = process.platform === 'win32';
const POSIX = !WIN;
const NAME = WIN ? 'git.exe' : 'git';
const DELIM = WIN ? ';' : ':';
const GIT = { completed: true, timedOut: false, stdout: 'git version 9.9.9' };

const realOr = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
const mkbase = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsgit-')));
const dir = (...p) => { const d = path.join(...p); fs.mkdirSync(d, { recursive: true }); return d; };
function inert(d, name = NAME) {
  dir(d);
  const f = path.join(d, name);
  fs.writeFileSync(f, '');
  if (POSIX) fs.chmodSync(f, 0o755);
  return f;
}
function sh(d, body, name = 'git') {
  dir(d);
  const f = path.join(d, name);
  fs.writeFileSync(f, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(f, 0o755);
  return f;
}
/** A probe seam that counts calls per realpath; `behaviour(real)` decides the result. */
function counter(behaviour = () => GIT) {
  const calls = new Map();
  const fn = (real, cwd) => {
    calls.set(real, (calls.get(real) || 0) + 1);
    fn.cwds.push(cwd);
    return behaviour(real, cwd);
  };
  fn.cwds = [];
  fn.count = (f) => calls.get(realOr(f)) || 0;
  fn.total = () => [...calls.values()].reduce((a, b) => a + b, 0);
  return fn;
}
const clock = { t: 0 };
function fixture() {
  const base = mkbase();
  const K = inert(dir(base, 'K'));
  return { base, E: dir(base, 'E'), W: dir(base, 'W'), H: dir(base, 'H'), K, Kdir: path.dirname(K) };
}
/** The full seam set, re-issued on every configure so the host PATH never leaks in. */
function cfg(fx, over = {}) {
  return {
    pathEnv: '', knownLocations: [], workspaceDirs: [fx.W], homeDir: fx.base,
    platform: process.platform, probe: counter(), now: () => clock.t, ...over,
  };
}
const pathOf = (...entries) => entries.join(DELIM);
function withCwd(d, fn) {
  const before = process.cwd();
  process.chdir(d);
  try { return fn(); } finally { process.chdir(before); }
}
/** Assert the control K wins and the plant was never probed. */
function expectControl(fx, c, plant, callCwd = fx.E) {
  configureTrustedGit(c);
  assert.equal(trustedGitPath(callCwd), realOr(fx.K), 'the control git is returned');
  assert.equal(c.probe.count(plant), 0, 'the plant is never probed (B1)');
}
const link = (target, at) => fs.symlinkSync(target, at, WIN ? 'junction' : 'dir');
function firstOnPath() {
  for (const raw of (process.env.PATH || '').split(DELIM)) {
    const d = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(d)) continue;
    const f = path.join(d, NAME);
    try { if (fs.statSync(f).isFile()) return fs.realpathSync.native(f); } catch { /* next */ }
  }
  return undefined;
}

// ---------------------------------------------------------------- T-b

test('b1: a relative PATH entry is rejected by S1 alone', () => {
  const fx = fixture();
  const plant = inert(path.join(fx.H, 'bin'));
  withCwd(fx.H, () => expectControl(fx, cfg(fx, { homeDir: fx.H, pathEnv: pathOf('bin', fx.Kdir) }), plant));
});

test("b2a: a '.' PATH entry is rejected by S1 alone", () => {
  const fx = fixture();
  const plant = inert(fx.H);
  withCwd(fx.H, () => expectControl(fx, cfg(fx, { homeDir: fx.H, pathEnv: pathOf('.', fx.Kdir) }), plant));
});

test("b2b: an empty PATH entry is rejected by S1 alone", () => {
  const fx = fixture();
  const plant = inert(fx.H);
  withCwd(fx.H, () => expectControl(fx, cfg(fx, { homeDir: fx.H, pathEnv: pathOf('', fx.Kdir) }), plant));
});

test('b3: an absolute PATH entry containing % is rejected by S1 alone (win32)', { skip: !WIN && 'win32 only' }, () => {
  const fx = fixture();
  const plant = inert(path.join(fx.H, '%FSG%', 'bin'));
  withCwd(fx.H, () => expectControl(fx, cfg(fx, { homeDir: fx.H, pathEnv: pathOf(`${fx.H}\\%FSG%\\bin`, fx.Kdir) }), plant));
});

test('b4: a \\\\?\\ PATH entry is rejected by S1 alone; UNC at function level (win32)', { skip: !WIN && 'win32 only' }, () => {
  const fx = fixture();
  const plant = inert(path.join(fx.H, 'x'));
  withCwd(fx.H, () => expectControl(fx, cfg(fx, { homeDir: fx.H, pathEnv: pathOf(`\\\\?\\${fx.H}\\x`, fx.Kdir) }), plant));
  assert.equal(tg.isTrustedAbsolute('\\\\host\\share\\x', 'win32'), false);
});

test('S1 function level: relative and empty paths are never trusted', () => {
  for (const p of ['', '.', 'bin', 'C:bin']) assert.equal(tg.isTrustedAbsolute(p, 'win32'), false, p);
  for (const p of ['', '.', 'bin']) assert.equal(tg.isTrustedAbsolute(p, 'linux'), false, p);
  assert.equal(tg.isTrustedAbsolute('C:\\Program Files\\Git\\cmd', 'win32'), true);
  assert.equal(tg.isTrustedAbsolute('/usr/bin', 'linux'), true);
});

test('b5: a PATH dir lexically inside the workspace, linked outside, is rejected by S2 alone', () => {
  const fx = fixture();
  const O = dir(fx.base, 'O');
  const plant = inert(O);
  link(O, path.join(fx.W, 'lnk'));
  expectControl(fx, cfg(fx, { pathEnv: pathOf(path.join(fx.W, 'lnk'), fx.Kdir) }), plant);
});

test('b6: an outside PATH dir linked into the workspace is rejected by S4 alone', () => {
  const fx = fixture();
  const plant = inert(path.join(fx.W, 'bin'));
  dir(fx.base, 'O2');
  link(path.join(fx.W, 'bin'), path.join(fx.base, 'O2', 'lnk'));
  expectControl(fx, cfg(fx, { pathEnv: pathOf(path.join(fx.base, 'O2', 'lnk'), fx.Kdir) }), plant);
});

test('b7: the b5 fixture with the PATH entry in a different case is rejected by S2 case folding (win32)', { skip: !WIN && 'win32 only (darwin row never runs: no darwin CI)' }, () => {
  const fx = fixture();
  const Ws = dir(fx.base, 'WsCase');
  const O = dir(fx.base, 'O');
  const plant = inert(O);
  link(O, path.join(Ws, 'lnk'));
  expectControl(fx, cfg(fx, { workspaceDirs: [Ws], pathEnv: pathOf(path.join(fx.base, 'wscase', 'lnk'), fx.Kdir) }), plant);
});

for (const ext of ['cmd', 'bat', 'com', 'ps1']) {
  test(`b8: a hinted git.${ext} is rejected by S6 alone (win32)`, { skip: !WIN && 'win32 only' }, () => {
    const fx = fixture();
    const plant = inert(dir(fx.base, 'O'), `git.${ext}`);
    expectControl(fx, cfg(fx, { hint: plant, pathEnv: pathOf(fx.Kdir) }), plant);
  });
}

test('b9: a hinted git without the execute bit is rejected by S6 alone (POSIX)', { skip: !POSIX && 'POSIX only' }, () => {
  const fx = fixture();
  const plant = inert(dir(fx.base, 'O'));
  fs.chmodSync(plant, 0o644);
  expectControl(fx, cfg(fx, { hint: plant, pathEnv: pathOf(fx.Kdir) }), plant);
});

test('b10: a hinted directory named git is rejected by S5 alone', () => {
  const fx = fixture();
  const plant = dir(fx.base, 'O', NAME);
  expectControl(fx, cfg(fx, { hint: plant, pathEnv: pathOf(fx.Kdir) }), plant);
});

test('b11: on a cache miss the call cwd is an excluded root (B1)', () => {
  const fx = fixture();
  const C = dir(fx.base, 'C');
  const plant = inert(path.join(C, 'bin'));
  expectControl(fx, cfg(fx, { pathEnv: pathOf(path.join(C, 'bin'), fx.Kdir) }), plant, C);
});

test('b12: a cached git inside the call cwd fails closed without a probe', () => {
  const fx = fixture();
  const c = cfg(fx, { pathEnv: pathOf(fx.Kdir) });
  configureTrustedGit(c);
  assert.equal(trustedGitPath(fx.E), realOr(fx.K));
  const before = c.probe.total();
  assert.throws(() => trustedGitPath(fx.Kdir), TrustedGitUnavailable);
  assert.equal(c.probe.total(), before, 'no re-resolution and no probe');
});

test('b13a: configureTrustedGit clears the positive cache', () => {
  const fx = fixture();
  const seams = cfg(fx, { pathEnv: pathOf(fx.Kdir) });
  configureTrustedGit(seams);
  assert.equal(trustedGitPath(fx.E), realOr(fx.K));
  const counter2 = counter();
  configureTrustedGit({ ...seams, probe: counter2 });
  assert.equal(trustedGitPath(fx.E), realOr(fx.K));
  assert.equal(counter2.count(fx.K), 1, 'K re-probed: the positive cache was cleared');
});

test('b13b: configureTrustedGit clears the probe-failure cache', () => {
  const fx = fixture();
  const F = inert(dir(fx.base, 'F'));
  const nonGit = () => ({ completed: true, timedOut: false, stdout: 'v22.0.0' });
  const seams = cfg(fx, { pathEnv: pathOf(path.dirname(F)), probe: counter(nonGit) });
  configureTrustedGit(seams);
  assert.throws(() => trustedGitPath(fx.E), TrustedGitUnavailable);
  const counter2 = counter(nonGit);
  configureTrustedGit({ ...seams, probe: counter2 });
  assert.throws(() => trustedGitPath(fx.E), TrustedGitUnavailable);
  assert.equal(counter2.count(F), 1, 'F re-probed: the failure cache was cleared');
});

test('b13c: invalidateTrustedGit clears the positive cache', () => {
  const fx = fixture();
  const c = cfg(fx, { pathEnv: pathOf(fx.Kdir) });
  configureTrustedGit(c);
  trustedGitPath(fx.E);
  assert.equal(c.probe.count(fx.K), 1);
  invalidateTrustedGit();
  trustedGitPath(fx.E);
  assert.equal(c.probe.count(fx.K), 2, 'K re-probed after invalidate');
});

test('b13d: invalidateTrustedGit clears the probe-failure cache', () => {
  const fx = fixture();
  const F = inert(dir(fx.base, 'F'));
  const c = cfg(fx, { pathEnv: pathOf(path.dirname(F)), probe: counter(() => ({ completed: true, timedOut: false, stdout: 'v22.0.0' })) });
  configureTrustedGit(c);
  assert.throws(() => trustedGitPath(fx.E), TrustedGitUnavailable);
  invalidateTrustedGit();
  assert.throws(() => trustedGitPath(fx.E), TrustedGitUnavailable);
  assert.equal(c.probe.count(F), 2, 'F re-probed after invalidate');
});

test('b14: the process cwd is an excluded root (explicit call cwd elsewhere)', () => {
  const fx = fixture();
  const Q = dir(fx.base, 'Q');
  const plant = inert(path.join(Q, 'bin'));
  withCwd(Q, () => expectControl(fx, cfg(fx, { homeDir: fx.H, pathEnv: pathOf(path.join(Q, 'bin'), fx.Kdir) }), plant));
});

test('b15 (V1): a filesystem-root process cwd still resolves the real git, with and without a call cwd', async () => {
  const expected = firstOnPath();
  assert.ok(expected, 'a git on PATH is required for this row');
  const fsRoot = path.parse(expected).root; // the root that contains the git, so the exemption is load-bearing
  configureTrustedGit({ workspaceDirs: [], platform: process.platform, homeDir: os.homedir() });
  const { ensureGitRepositoryReady } = require(path.join(OUT, 'shared', 'gitBootstrap.js'));
  const repo = mkbase();
  const before = process.cwd();
  process.chdir(fsRoot);
  try {
    const got = trustedGitPath();
    assert.equal(got, expected, 'no-argument call resolves the first git on PATH');
    assert.match(spawnSync(got, ['--version'], { encoding: 'utf8' }).stdout, /^git version \d+\.\d+/);
    assert.throws(() => trustedGitPath(fsRoot), TrustedGitUnavailable, 'an explicit call cwd at the root is not exempt');
    const r = await ensureGitRepositoryReady(repo);
    assert.equal(r.gitAvailable, true, 'G14 checkGitAvailable (no cwd) works under a root cwd');
  } finally {
    process.chdir(before);
  }
});

test('b16: a home process cwd is exempt, so a git under it is accepted (limitation 9)', () => {
  const fx = fixture();
  const plant = inert(path.join(fx.H, 'x', 'bin'));
  withCwd(fx.H, () => {
    const c = cfg(fx, { homeDir: fx.H, pathEnv: pathOf(path.join(fx.H, 'x', 'bin'), fx.Kdir) });
    configureTrustedGit(c);
    assert.equal(trustedGitPath(fx.E), realOr(plant));
  });
});

test('b16s: home is compared realpath to realpath (POSIX symlinked home)', { skip: !POSIX && 'POSIX only' }, () => {
  const fx = fixture();
  const L = path.join(fx.base, 'homelink');
  fs.symlinkSync(fx.H, L, 'dir');
  const plant = inert(path.join(fx.H, 'x', 'bin'));
  withCwd(fx.H, () => {
    configureTrustedGit(cfg(fx, { homeDir: L, pathEnv: pathOf(path.join(fx.H, 'x', 'bin'), fx.Kdir) }));
    assert.equal(trustedGitPath(fx.E), realOr(plant));
  });
});

test('b17: a cache hit re-checks the file: deleted → re-resolve; ctime change → re-resolve', () => {
  const fx = fixture();
  const A = inert(dir(fx.base, 'A'));
  const c = cfg(fx, { pathEnv: pathOf(path.dirname(A), fx.Kdir) });
  configureTrustedGit(c);
  assert.equal(trustedGitPath(fx.E), realOr(A));
  fs.rmSync(A);
  assert.equal(trustedGitPath(fx.E), realOr(fx.K), 'a vanished cached git is re-resolved');

  const fx2 = fixture();
  const A2 = inert(dir(fx2.base, 'A2'));
  const fixed = new Date(1_700_000_000_000);
  fs.utimesSync(A2, fixed, fixed);
  const c2 = cfg(fx2, { pathEnv: pathOf(path.dirname(A2), fx2.Kdir) });
  configureTrustedGit(c2);
  assert.equal(trustedGitPath(fx2.E), realOr(A2));
  const st0 = fs.statSync(A2);
  fs.writeFileSync(A2, '');
  fs.utimesSync(A2, fixed, fixed);
  const st1 = fs.statSync(A2);
  assert.equal(st1.mtimeMs, st0.mtimeMs, 'mtime restored exactly');
  assert.equal(st1.size, st0.size, 'same size');
  assert.notEqual(st1.ctimeMs, st0.ctimeMs, 'ctime moved');
  assert.equal(trustedGitPath(fx2.E), realOr(A2));
  assert.equal(c2.probe.count(A2), 2, 'identity changed through ctime: re-probed');
});

test('b18: a call cwd that does not resolve is unavailable before any candidate is touched', () => {
  const fx = fixture();
  const c = cfg(fx, { pathEnv: pathOf(fx.Kdir) });
  configureTrustedGit(c);
  assert.throws(() => trustedGitPath(path.join(fx.base, 'nope')), TrustedGitUnavailable);
  assert.equal(c.probe.total(), 0);
});

// ---------------------------------------------------------------- T-p

function attackPlant(d) {
  if (WIN) {
    dir(d);
    const f = path.join(d, 'git.exe');
    fs.copyFileSync(process.execPath, f);
    return f;
  }
  return sh(d, 'echo v22.0.0');
}

test('p1: a non-git binary first on PATH is skipped by the real probe; the real git wins', () => {
  const fx = fixture();
  const plant = attackPlant(dir(fx.base, 'A'));
  const real = firstOnPath();
  const probe = counter((r, cwd) => tg.defaultGitProbe(r, cwd));
  configureTrustedGit(cfg(fx, { pathEnv: pathOf(path.dirname(plant), path.dirname(real)), probe }));
  assert.equal(trustedGitPath(fx.E), real);
  assert.equal(probe.count(plant), 1, 'the plant was probed and rejected');
});

test('p2: probe failures, timeouts (60 s window) and spawn errors are cached as specified', () => {
  const fx = fixture();
  const F = inert(dir(fx.base, 'F'));
  const D = (n) => dir(fx.base, `D${n}`);
  const probe = counter((r) => (r === realOr(F) ? { completed: true, timedOut: false, stdout: 'v22.0.0' } : GIT));
  const seams = cfg(fx, { homeDir: fx.H, pathEnv: pathOf(path.dirname(F), fx.Kdir), probe });
  withCwd(D(1), () => { configureTrustedGit(seams); assert.equal(trustedGitPath(fx.E), realOr(fx.K)); });
  assert.deepEqual([probe.count(F), probe.count(fx.K)], [1, 1]);
  withCwd(D(2), () => assert.equal(trustedGitPath(fx.E), realOr(fx.K)));
  assert.deepEqual([probe.count(F), probe.count(fx.K)], [1, 2], 'a key miss re-resolves but skips the known failure');
  fs.writeFileSync(F, 'changed');
  withCwd(D(3), () => trustedGitPath(fx.E));
  assert.equal(probe.count(F), 2, 'a changed file is probed again');

  // Timeouts: skipped for 60 s after the last timeout; not cleared by invalidate.
  const T = inert(dir(fx.base, 'T'));
  const tprobe = counter((r) => (r === realOr(T) ? { completed: false, timedOut: true, stdout: '' } : GIT));
  const tseams = cfg(fx, { homeDir: fx.H, pathEnv: pathOf(path.dirname(T), fx.Kdir), probe: tprobe });
  clock.t = 1_000_000;
  withCwd(D(4), () => { configureTrustedGit(tseams); trustedGitPath(fx.E); });
  assert.equal(tprobe.count(T), 1);
  withCwd(D(5), () => trustedGitPath(fx.E));
  assert.equal(tprobe.count(T), 1, 'skipped after a key miss');
  clock.t = 1_059_000;
  invalidateTrustedGit();
  trustedGitPath(fx.E);
  assert.equal(tprobe.count(T), 1, 'skipped after invalidate at t+59 s');
  clock.t = 1_060_000;
  invalidateTrustedGit();
  trustedGitPath(fx.E);
  assert.equal(tprobe.count(T), 2, 'probed again at t+60 s (and times out again)');
  clock.t = 1_119_000;
  invalidateTrustedGit();
  trustedGitPath(fx.E);
  assert.equal(tprobe.count(T), 2, 'skipped at t+119 s: the window runs from the last timeout');
  clock.t = 1_120_000;
  invalidateTrustedGit();
  trustedGitPath(fx.E);
  assert.equal(tprobe.count(T), 3, 'probed at t+120 s');

  // An identity change re-admits a timed-out file at once.
  const T2 = inert(dir(fx.base, 'T2'));
  const t2probe = counter((r) => (r === realOr(T2) ? { completed: false, timedOut: true, stdout: '' } : GIT));
  clock.t = 2_000_000;
  withCwd(D(6), () => { configureTrustedGit(cfg(fx, { homeDir: fx.H, pathEnv: pathOf(path.dirname(T2), fx.Kdir), probe: t2probe })); trustedGitPath(fx.E); });
  assert.equal(t2probe.count(T2), 1);
  clock.t = 2_001_000;
  fs.writeFileSync(T2, 'new content');
  withCwd(D(7), () => trustedGitPath(fx.E));
  assert.equal(t2probe.count(T2), 2, 'a changed identity is probed again at once');

  // A spawn error is not cached.
  const S = inert(dir(fx.base, 'S'));
  const sprobe = counter((r) => (r === realOr(S) ? { completed: false, timedOut: false, stdout: '' } : GIT));
  withCwd(D(8), () => { configureTrustedGit(cfg(fx, { homeDir: fx.H, pathEnv: pathOf(path.dirname(S), fx.Kdir), probe: sprobe })); trustedGitPath(fx.E); });
  withCwd(D(9), () => trustedGitPath(fx.E));
  assert.equal(sprobe.count(S), 2, 'a spawn error is retried on the next miss');
});

test('p3: every probe runs in a fresh folder that is removed afterwards', () => {
  const fx = fixture();
  const c = cfg(fx, { pathEnv: pathOf(fx.Kdir) });
  configureTrustedGit(c);
  trustedGitPath(fx.E);
  assert.equal(c.probe.cwds.length, 1);
  const cwd = c.probe.cwds[0];
  assert.notEqual(path.resolve(cwd), path.resolve(os.tmpdir()));
  assert.equal(path.resolve(path.dirname(cwd)), path.resolve(os.tmpdir()));
  assert.match(path.basename(cwd), /^failsafe-gitprobe-/);
  assert.equal(fs.existsSync(cwd), false, 'removed after the probe');
});

test('p4: a PATH entry with spaces resolves and the returned path runs', () => {
  const fx = fixture();
  let entry;
  if (WIN) {
    const realGit = firstOnPath();
    const install = path.dirname(path.dirname(realGit)); // <install>\cmd\git.exe
    const spaced = dir(fx.base, 'Program Files x');
    link(install, path.join(spaced, 'Git'));
    entry = path.join(spaced, 'Git', path.basename(path.dirname(realGit)));
  } else {
    entry = path.dirname(sh(path.join(fx.base, 'dir with space', 'bin'), 'echo "git version 9.9.9"'));
  }
  configureTrustedGit(cfg(fx, { pathEnv: pathOf(entry), probe: tg.defaultGitProbe }));
  const got = trustedGitPath(fx.E);
  assert.match(spawnSync(got, ['--version'], { encoding: 'utf8' }).stdout, /^git version \d+\.\d+/);
});

test('p5: classifyProbe on real spawnSync results; defaultGitProbe is one classifyProbe(spawnSync(...)) statement', () => {
  const timeout = spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 500, encoding: 'utf8' });
  assert.deepEqual(
    (({ completed, timedOut }) => ({ completed, timedOut }))(tg.classifyProbe(timeout)),
    { completed: false, timedOut: true }, 'a real timeout');
  const missing = spawnSync(path.join(mkbase(), WIN ? 'nope.exe' : 'nope'), [], { encoding: 'utf8' });
  assert.deepEqual(
    (({ completed, timedOut }) => ({ completed, timedOut }))(tg.classifyProbe(missing)),
    { completed: false, timedOut: false }, 'a real spawn error');
  const ok = spawnSync(firstOnPath(), ['--version'], { encoding: 'utf8' });
  const okc = tg.classifyProbe(ok);
  assert.equal(okc.completed, true);
  assert.equal(okc.timedOut, false);
  assert.match(okc.stdout, /^git version/);

  const src = fs.readFileSync(path.join(SRC, 'shared', 'git', 'trustedGit.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const m = /export function defaultGitProbe\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m, 'defaultGitProbe found');
  const body = m[1].trim();
  assert.ok(body.startsWith('return classifyProbe(spawnSync('), body);
  assert.equal((body.match(/;/g) || []).length, 1, 'a single statement');
});

test('p5 (POSIX): a sleeping plant times out through the full defaultGitProbe', { skip: !POSIX && 'POSIX only' }, () => {
  const plant = sh(dir(mkbase(), 'slow'), 'sleep 10');
  const started = Date.now();
  const r = tg.defaultGitProbe(plant, os.tmpdir());
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - started < 8000, 'returns within about 6 s');
});

// ---------------------------------------------------------------- T-c

test('T-c: no git at all → TrustedGitUnavailable with reasons', () => {
  const fx = fixture();
  configureTrustedGit(cfg(fx, { pathEnv: pathOf('', 'relative') }));
  assert.throws(() => trustedGitPath(fx.E), (e) => e instanceof TrustedGitUnavailable
    && e.code === 'TRUSTED_GIT_UNAVAILABLE' && e.rejected.length === 2 && /not an absolute path/.test(e.message));
});

test('T-c: every caller degrades as it does today when git is missing', async () => {
  const fx = fixture();
  configureTrustedGit(cfg(fx));
  const ws = dir(fx.base, 'ws');
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  const req = (...p) => require(path.join(OUT, ...p));

  assert.deepEqual(req('governance', 'gitDirs.js').resolveGitDirs(ws), { gitDir: path.join(ws, '.git'), commonDir: path.join(ws, '.git') }, 'G3');
  assert.equal(req('roadmap', 'tracker', 'manifest-sources.js').resolveRepoSlug(ws), '', 'G11');
  assert.equal((await req('extension', 'governedCommit.js').defaultGitRunner(['status'], ws)).code, 1, 'G2');
  await assert.rejects(new (req('governance', 'revert', 'GitResetService.js').GitResetService)().getStatus(ws), /no trusted git/, 'G4');
  const safety = req('integrations', 'agent-cli', 'git-safety.js');
  assert.equal(safety.buildCarriedConfig(ws), '[core]\n', 'G5');
  const git = safety.createSafeGit(ws);
  try {
    assert.equal((await git.tryRun(ws, ['status'])).code, 127, 'G6 tryRun');
    await assert.rejects(git.run(ws, ['status']), safety.GitCommandError, 'G6 run');
  } finally { git.dispose(); }
  assert.equal((await req('shared', 'gitBootstrap.js').ensureGitRepositoryReady(ws)).gitAvailable, false, 'G14');
  const { DriftDetector } = req('qorelogic', 'checkpoint', 'DriftDetector.js');
  const { ManifoldCalculator } = req('qorelogic', 'checkpoint', 'ManifoldCalculator.js');
  assert.deepEqual(await new DriftDetector(ws, new ManifoldCalculator(ws)).getGitChanges('a'.repeat(40), 'b'.repeat(40)), { filesChanged: [], gitCommits: 0 }, 'G8');
  const { SecurityScanner } = req('roadmap', 'services', 'SecurityScanner.js');
  assert.deepEqual(await new SecurityScanner({}).runStaticAnalysis(ws, () => {}), [], 'G13');
  const { DependencyAdmissionLintModule } = req('qorlogic', 'substrate', 'DependencyAdmissionLintModule.js');
  const g9 = await new DependencyAdmissionLintModule(ws, { io: { fetchPublishTime: async () => null, now: () => new Date() } }).run();
  assert.equal(g9.summary.note, 'no base ref; nothing compared', 'G9 null base ref');
  const { TrackerRoute } = req('roadmap', 'routes', 'TrackerRoute.js');
  const captured = { status: 200, body: null };
  const res = { status(c) { captured.status = c; return this; }, json(b) { captured.body = b; return this; }, send() { return this; }, type() { return this; } };
  TrackerRoute.api({}, res, { workspaceRoot: ws, uiDir: '' });
  assert.equal(captured.status, 200, 'G10');
  assert.notEqual(captured.body.cadence, 'pr-incremental', 'G10 no git log');
});

test('T-c: after an install the re-check resolves again (negative results are not cached)', async () => {
  const fx = fixture();
  const knownDir = path.join(fx.base, 'Installed', 'Git', 'cmd');
  configureTrustedGit(cfg(fx, { knownLocations: [path.join(knownDir, NAME)] }));
  const runner = async (command) => {
    if (command === 'git') {
      try { trustedGitPath(); return { code: 0, stdout: '', stderr: '' }; } catch { return { code: 1, stdout: '', stderr: '' }; }
    }
    inert(knownDir);
    return { code: 0, stdout: '', stderr: '' };
  };
  const r = await require(path.join(OUT, 'shared', 'gitBootstrap.js')).ensureGitRepositoryReady(dir(fx.base, 'ws'), { autoInstallGit: true, runner });
  assert.equal(r.installedGit, true);
  assert.equal(r.gitAvailable, true, 'the fresh install at a known location is found');
});

// T-p6 (plan-v607-final-integration LD10): duplicates matter only when the probe does not
// accept, so the shared file times out (and, separately, answers with non-git output).
for (const [label, result] of [
  ['times out', { completed: false, timedOut: true, stdout: '' }],
  ['is not git', { completed: true, timedOut: false, stdout: 'v22.22.3' }],
]) {
  test(`T-p6: one git named by the hint, PATH and a known location is probed once when it ${label}`, () => {
    const fx = fixture();
    clock.t += 120000;
    const g = inert(dir(fx.base, 'Shared', 'cmd'));
    const probe = counter((real) => (real === realOr(g) ? result : GIT));
    const spellings = [path.dirname(g)];
    if (WIN) spellings.push(path.dirname(g).toUpperCase());
    configureTrustedGit(cfg(fx, { hint: g, pathEnv: pathOf(...spellings, fx.Kdir), knownLocations: [g], probe }));
    assert.equal(trustedGitPath(fx.E), realOr(fx.K), 'the next candidate wins');
    assert.equal(probe.count(g), 1, 'the shared file is probed once per resolution');
    assert.equal(probe.count(fx.K), 1);
  });
}
