/**
 * Planted-git adversarial suite (plan-v607-final-integration Phase 2, T-a1/T-a2).
 *
 * win32: a copy of node.exe planted as git.exe (plus a git.cmd) in the
 * workspace. A planted node records its argv through NODE_OPTIONS=--require
 * <marker>, except for --version, which it answers with the Node version.
 * POSIX: a probe-passing sh script on PATH (an absolute <ws>/bin entry).
 *
 * T-a1 proves the attack is real on this host: the old bare forms run the
 * plant. A precondition that does not fire FAILS; it never skips (on a host
 * with NoDefaultCurrentDirectoryInExePath set the attack is silently off, so
 * the variable is deleted in-process first). T-a2 runs each migrated caller
 * through its real code path with the plant in place and asserts the plant
 * never ran and the result is one only real git can produce.
 *
 * Runs standalone after `npm run compile`: node --test src/test/shared/git/trustedGit.adversarial.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync, execSync } = require('child_process');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const req = (...p) => require(path.join(OUT, ...p));
const { configureTrustedGit } = req('shared', 'git', 'trustedGit.js');

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const NAME = WIN ? 'git.exe' : 'git';

const saved = {
  noDefault: process.env.NoDefaultCurrentDirectoryInExePath,
  path: process.env.PATH,
  ceiling: process.env.GIT_CEILING_DIRECTORIES,
};
// F1: with this set, Windows does not search the child's cwd and the attack is silently off.
delete process.env.NoDefaultCurrentDirectoryInExePath;
after(() => {
  if (saved.noDefault !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved.noDefault;
  process.env.PATH = saved.path;
  if (saved.ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = saved.ceiling;
  delete process.env.NODE_OPTIONS;
  delete process.env.FSG_MARKER;
});

function firstOnPath() {
  for (const raw of (saved.path || '').split(DELIM)) {
    const d = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(d)) continue;
    const f = path.join(d, NAME);
    try { if (fs.statSync(f).isFile()) return fs.realpathSync.native(f); } catch { /* next */ }
  }
  throw new Error('a real git on PATH is required');
}
const REAL_GIT = firstOnPath();

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsgit-adv-')));
// F2: on this host C:\ is itself a repository; keep git discovery inside the fixtures.
process.env.GIT_CEILING_DIRECTORIES = path.dirname(base);
const ws = path.join(base, 'ws');
const ws2 = path.join(base, 'ws2');
const fresh = path.join(base, 'fresh');
for (const d of [ws, ws2, fresh]) fs.mkdirSync(d, { recursive: true });
const MARK = path.join(base, 'marker.log');
const CMD_MARK = path.join(ws2, 'cmd-ran.txt');

const realGit = (cwd, ...args) => execFileSync(REAL_GIT, ['-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

// One fixture repository for every caller row.
realGit(ws, 'init', '-q');
realGit(ws, 'config', 'core.autocrlf', 'input');
realGit(ws, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');
fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'w', version: '1.0.0', dependencies: { a: '1.0.0' } }, null, 2));
fs.writeFileSync(path.join(ws, 'cfg.py'), 'api_key = "x"\n');
fs.writeFileSync(path.join(ws, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- wip\n');
realGit(ws, 'add', '-A');
realGit(ws, 'commit', '-q', '-m', 'feat: thing one (#1)');
const sha0 = realGit(ws, 'rev-parse', 'HEAD');
realGit(ws, 'update-ref', 'refs/remotes/origin/main', sha0);
fs.writeFileSync(path.join(ws, 'b.txt'), 'b\n');
realGit(ws, 'add', 'b.txt');
realGit(ws, 'commit', '-q', '-m', 'Merge pull request #2 from acme/feat-two');
realGit(ws, 'commit', '-q', '--allow-empty', '-m', 'feat: thing three (#3)');
const sha2 = realGit(ws, 'rev-parse', 'HEAD');
fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'w', version: '1.0.0', dependencies: { a: '1.0.1' } }, null, 2));

// Plants (after the fixture is built, so real git never sees them as content worth committing).
const markerJs = path.join(base, 'marker.cjs');
fs.writeFileSync(markerJs, "require('fs').appendFileSync(process.env.FSG_MARKER, JSON.stringify(process.argv.slice(1)) + '\\n'); process.exit(1);\n");
if (WIN) {
  for (const d of [ws, fresh]) fs.copyFileSync(process.execPath, path.join(d, 'git.exe'));
  fs.writeFileSync(path.join(ws2, 'git.cmd'), '@echo cmd> "%~dp0cmd-ran.txt"\r\n');
} else {
  const bin = path.join(ws, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 9.9.9"; exit 0; fi\necho "$*" >> "$FSG_MARKER"\nexit 1\n');
  fs.chmodSync(path.join(bin, 'git'), 0o755);
}
process.env.FSG_MARKER = MARK;
process.env.NODE_OPTIONS = `--require "${markerJs.split(path.sep).join('/')}"`;
if (!WIN) process.env.PATH = [path.join(ws, 'bin'), saved.path].join(DELIM);

const markerLines = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').split('\n').filter(Boolean) : []);
const clearMarker = () => fs.rmSync(MARK, { force: true });
const bare = (args, cwd) => { try { execFileSync('git', args, { cwd, stdio: 'pipe' }); } catch { /* a plant exits 1 */ } };

test('T-a1 (win32): the old bare forms run the planted file on this host', { skip: !WIN && 'win32 only (POSIX preconditions run per T-a2 row)' }, () => {
  clearMarker();
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ws, encoding: 'utf8' });
  const spawnLines = markerLines().length;
  const version = spawnSync('git', ['--version'], { cwd: ws, encoding: 'utf8' }).stdout.trim();
  clearMarker();
  bare(['tag'], ws);
  const execFileLines = markerLines().length;
  fs.rmSync(CMD_MARK, { force: true });
  try { execSync('git rev-parse HEAD', { cwd: ws2, stdio: 'pipe' }); } catch { /* the cmd plant ends non-zero */ }
  const cmdRan = fs.existsSync(CMD_MARK);
  console.log(`[T-a1] spawn marker lines=${spawnLines} --version stdout=${JSON.stringify(version)} execFile marker lines=${execFileLines} cmd marker=${cmdRan}`);
  assert.equal(spawnLines, 1, 'bare spawnSync ran the planted git.exe');
  assert.equal(version, process.version, 'bare --version answered with the planted node version');
  assert.equal(execFileLines, 1, 'bare execFileSync ran the planted git.exe');
  assert.equal(cmdRan, true, 'shell exec ran the planted git.cmd');
  clearMarker();
});

configureTrustedGit({ workspaceDirs: [ws] });

/** One caller row: the bare form of its argv runs the plant; the caller itself never does. */
async function row(name, bareArgs, bareCwd, call, positive) {
  clearMarker();
  bare(bareArgs, bareCwd);
  const pre = markerLines().length;
  clearMarker();
  const result = await call();
  const lines = markerLines();
  console.log(`[T-a2 ${name}] precondition marker lines=${pre} caller marker lines=${lines.length}${lines.length ? ` ${lines.join(' | ')}` : ''}`);
  assert.ok(pre >= 1, `${name}: precondition, the bare form ran the plant`);
  assert.deepEqual(lines, [], `${name}: the caller never ran the plant`);
  positive(result);
}

test('T-a2 G2 defaultGitRunner', () => row('G2', ['rev-parse', 'HEAD'], ws,
  () => req('extension', 'governedCommit.js').defaultGitRunner(['rev-parse', 'HEAD'], ws),
  (r) => assert.equal(r.stdout.trim(), sha2)));

test('T-a2 G3 resolveGitDirs', () => row('G3', ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], ws,
  () => req('governance', 'gitDirs.js').resolveGitDirs(ws),
  (r) => assert.equal(path.resolve(r.gitDir), path.join(ws, '.git'))));

test('T-a2 G4 GitResetService', () => row('G4', ['rev-parse', 'HEAD'], ws,
  () => new (req('governance', 'revert', 'GitResetService.js').GitResetService)().getStatus(ws),
  (r) => assert.equal(r.currentHash, sha2)));

test('T-a2 G5 buildCarriedConfig', () => row('G5', ['config', '--get', 'core.autocrlf'], ws,
  () => req('integrations', 'agent-cli', 'git-safety.js').buildCarriedConfig(ws),
  (r) => assert.match(r, /autocrlf = "input"/)));

test('T-a2 G6 createSafeGit', () => row('G6', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], ws,
  async () => {
    const git = req('integrations', 'agent-cli', 'git-safety.js').createSafeGit(ws);
    try { return (await git.run(ws, ['rev-parse', 'HEAD'])).toString('utf8').trim(); } finally { git.dispose(); }
  },
  (r) => assert.equal(r, sha2)));

test('T-a2 G8 DriftDetector', () => row('G8', ['diff', '--name-only', sha0, 'HEAD'], ws,
  () => {
    const { DriftDetector } = req('qorelogic', 'checkpoint', 'DriftDetector.js');
    const { ManifoldCalculator } = req('qorelogic', 'checkpoint', 'ManifoldCalculator.js');
    return new DriftDetector(ws, new ManifoldCalculator(ws)).getGitChanges(sha0, sha2);
  },
  (r) => assert.deepEqual(r, { filesChanged: ['b.txt'], gitCommits: 2 })));

test('T-a2 G9 DependencyAdmissionLintModule', () => row('G9', ['merge-base', 'origin/main', 'HEAD'], ws,
  () => new (req('qorlogic', 'substrate', 'DependencyAdmissionLintModule.js').DependencyAdmissionLintModule)(ws, {
    io: { fetchPublishTime: async () => new Date(), now: () => new Date() },
  }).run(),
  (r) => {
    const warns = r.findings.filter((f) => f.severity === 'warn');
    assert.equal(warns.length, 1, 'one warn finding');
    assert.match(warns[0].message, /a@1\.0\.1/);
  }));

test('T-a2 G10 TrackerRoute', () => row('G10', ['tag'], ws,
  () => {
    const captured = { status: 200, body: null };
    const res = { status(c) { captured.status = c; return this; }, json(b) { captured.body = b; return this; }, send() { return this; }, type() { return this; } };
    req('roadmap', 'routes', 'TrackerRoute.js').TrackerRoute.api({}, res, { workspaceRoot: ws, uiDir: '' });
    return captured;
  },
  (c) => {
    assert.equal(c.status, 200);
    assert.equal(c.body.cadence, 'pr-incremental');
    const ids = c.body.rcs.map((r) => r.id);
    assert.ok(ids.indexOf('pr-1') >= 0 && ids.indexOf('pr-1') < ids.indexOf('pr-3'), `pr-1 before pr-3 in ${ids}`);
  }));

test('T-a2 G11 resolveRepoSlug', () => row('G11', ['remote', 'get-url', 'origin'], ws,
  () => req('roadmap', 'tracker', 'manifest-sources.js').resolveRepoSlug(ws),
  (r) => assert.equal(r, 'acme/widget')));

test('T-a2 G13 SecurityScanner', () => row('G13', ['grep', '-n', '-E', 'api'], ws,
  () => new (req('roadmap', 'services', 'SecurityScanner.js').SecurityScanner)({}).runStaticAnalysis(ws, () => {}),
  (r) => assert.ok(r.some((f) => f.category === 'secrets' && f.severity === 'high' && f.file === 'cfg.py'), JSON.stringify(r))));

test('T-a2 G14 ensureGitRepositoryReady (no-cwd --version, then init)', async () => {
  const before = process.cwd();
  process.chdir(ws); // plantDir: the child cwd of the no-cwd --version
  try {
    await row('G14', ['init'], fresh,
      () => req('shared', 'gitBootstrap.js').ensureGitRepositoryReady(fresh, { confirmInit: async () => true }),
      (r) => {
        assert.equal(r.initializedRepo, true);
        assert.ok(fs.existsSync(path.join(fresh, '.git', 'HEAD')), '<fresh>/.git/HEAD exists');
      });
  } finally {
    process.chdir(before);
  }
});
