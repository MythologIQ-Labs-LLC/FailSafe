/**
 * Planted-executable adversarial suite for gh, PowerShell and the Git
 * installers (v6.0.8 lane A, B211/B214, plan T7, T8, T10c).
 *
 * win32: node.exe copied as gh.exe / powershell.exe / winget.exe / choco.exe
 * into the workspace or the process cwd. A planted node answers `--version`
 * with the Node version and records every other argv through
 * NODE_OPTIONS=--require <marker>. POSIX: sh plants on an absolute PATH entry
 * inside the workspace.
 *
 * Every precondition proves the attack is real on this host (the bare name
 * runs the plant); a precondition that does not fire FAILS, it never skips.
 *
 * Runs standalone after `npm run compile`: node --test src/test/shared/exec/trustedExecutable.adversarial.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeTempTree } = require('../removeTempTree.cjs');
const { spawnSync, execFileSync } = require('child_process');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const req = (...p) => require(path.join(OUT, ...p));
let te = {};
try { te = req('shared', 'exec', 'trustedExecutable.js'); } catch { /* red run at b66a32d8: no resolver */ }
const configure = te.configureTrustedExecutables || (() => {});

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const saved = {
  noDefault: process.env.NoDefaultCurrentDirectoryInExePath, path: process.env.PATH, cwd: process.cwd(),
  ceiling: process.env.GIT_CEILING_DIRECTORIES, ghc: process.env.GH_CONFIG_DIR, ght: process.env.GH_TOKEN, gtt: process.env.GITHUB_TOKEN,
};
delete process.env.NoDefaultCurrentDirectoryInExePath;
after(() => {
  process.chdir(saved.cwd);
  for (const [k, v] of [['NoDefaultCurrentDirectoryInExePath', saved.noDefault], ['GIT_CEILING_DIRECTORIES', saved.ceiling], ['GH_CONFIG_DIR', saved.ghc], ['GH_TOKEN', saved.ght], ['GITHUB_TOKEN', saved.gtt]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  process.env.PATH = saved.path;
  delete process.env.NODE_OPTIONS;
  delete process.env.FSG_MARKER;
  removeTempTree(base); // LD20
  removeTempTree(ghConfigDir);
});

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsexec-adv-')));
process.env.GIT_CEILING_DIRECTORIES = path.dirname(base);
const ws = path.join(base, 'ws');
const plantDir = path.join(base, 'plant');
for (const d of [ws, plantDir]) fs.mkdirSync(d, { recursive: true });
const MARK = path.join(base, 'marker.log');
const markerJs = path.join(base, 'marker.cjs');
fs.writeFileSync(markerJs, "require('fs').appendFileSync(process.env.FSG_MARKER, JSON.stringify(process.argv.slice(1)) + '\\n'); process.exit(1);\n");
const marks = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const clearMarks = () => { try { fs.unlinkSync(MARK); } catch { /* none */ } };
process.env.FSG_MARKER = MARK;
const ghConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsexec-ghcfg-'));
process.env.GH_CONFIG_DIR = ghConfigDir;
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;

const realGit = WIN ? 'C:\\Program Files\\Git\\cmd\\git.exe' : 'git';
execFileSync(realGit, ['init', '-q'], { cwd: ws });

function plant(dir, name, versionLine) {
  if (WIN) {
    fs.copyFileSync(process.execPath, path.join(dir, `${name}.exe`));
  } else {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const f = path.join(bin, name);
    fs.writeFileSync(f, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${versionLine}"; exit 0; fi\necho "$*" >> "$FSG_MARKER"\nexit 1\n`);
    fs.chmodSync(f, 0o755);
    if (!process.env.PATH.startsWith(bin)) process.env.PATH = `${bin}${DELIM}${process.env.PATH}`;
  }
}
/** A planted node prints its version, writes the marker, or refuses an option-first argv as a bad option. */
const plantRan = (r) => marks().length >= 1 || /bad option/.test(String(r && r.stderr)) || String(r && r.stdout).trim() === process.version;
const childEnv = () => (WIN ? { ...process.env, NODE_OPTIONS: `--require ${markerJs.replace(/\\/g, '/')}` } : { ...process.env });

// ------------------------------------------------------------------ T7: gh

test('T7 precondition: a bare gh with the workspace as cwd runs the plant', () => {
  plant(ws, 'gh', 'gh version 9.9.9');
  clearMarks();
  spawnSync('gh', ['pr', 'view', '--json', 'number'], { cwd: ws, env: childEnv(), windowsHide: true });
  assert.ok(marks().length >= 1, 'the planted gh recorded its argv');
});

test('T7: resolvePrNumber(ws) never runs the planted gh', () => {
  configure({ workspaceDirs: [ws] });
  process.env.NODE_OPTIONS = childEnv().NODE_OPTIONS || '';
  clearMarks();
  try {
    const { resolvePrNumber } = req('extension', 'github-checks-command.js');
    assert.equal(typeof resolvePrNumber, 'function', 'resolvePrNumber is exported');
    assert.equal(resolvePrNumber(ws), undefined);
    assert.deepEqual(marks(), [], 'the marker is empty');
    if (te.trustedExecutablePath) {
      const real = te.trustedExecutablePath(te.GH, ws);
      assert.ok(path.isAbsolute(real) && !real.toLowerCase().startsWith(ws.toLowerCase()), `the real gh: ${real}`);
    }
  } finally { delete process.env.NODE_OPTIONS; }
});

test('T7: fetchMergedPrs with the workspace as process cwd never runs the planted gh', () => {
  configure({ workspaceDirs: [ws] });
  process.env.NODE_OPTIONS = childEnv().NODE_OPTIONS || '';
  clearMarks();
  process.chdir(ws);
  try {
    const { fetchMergedPrs } = req('roadmap', 'tracker', 'manifest-sources.js');
    assert.deepEqual(fetchMergedPrs('acme/widget'), []);
    assert.deepEqual(marks(), [], 'the marker is empty');
  } finally { process.chdir(saved.cwd); delete process.env.NODE_OPTIONS; }
});

// ------------------------------------------------------------------ T8: PowerShell

const psName = WIN ? 'powershell' : 'pwsh';
const script = path.join(ws, 'tools', 'reliability', 'admit-skill.ps1');
fs.mkdirSync(path.dirname(script), { recursive: true });
fs.writeFileSync(script, "param($SkillPath, $Source, $Owner, $VersionPin, $RegistryPath)\nSet-Content -Path (Join-Path $PSScriptRoot 'admitted.txt') -Value 'admitted'\nexit 0\n");

test('T8 precondition: a bare PowerShell with the workspace as cwd runs the plant', () => {
  plant(ws, psName, '5.1.0');
  clearMarks();
  const r = spawnSync(WIN ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-File', script], { cwd: ws, env: childEnv(), windowsHide: true, encoding: 'utf8' });
  // A planted node refuses -NoProfile as a bad option before any preload runs; the sh plant records its argv.
  assert.ok(plantRan(r), `the planted PowerShell ran: ${r.stderr}`);
});

/**
 * Diagnostics for a failed T8 (LD23e): every rejection (the error message shows
 * only the first 5) and, on POSIX, the owner and mode of /usr/bin/pwsh's
 * realpath and each folder above it.
 */
function powerShellDiagnostics() {
  const lines = [];
  try {
    lines.push(`resolves now: ${te.trustedExecutablePath(te.powershellFor(process.platform), ws)}`);
  } catch (e) {
    if (Array.isArray(e && e.rejected)) for (const x of e.rejected) lines.push(`${x.candidate} (${x.reason})`);
    else lines.push(String(e));
  }
  if (!WIN && fs.existsSync('/usr/bin/pwsh')) {
    lines.push(`process uid ${typeof process.getuid === 'function' ? process.getuid() : 'n/a'}`);
    let p;
    try { p = fs.realpathSync.native('/usr/bin/pwsh'); } catch (e) { lines.push(`/usr/bin/pwsh realpath: ${e.code}`); }
    while (p) {
      try { const s = fs.statSync(p); lines.push(`${p} uid ${s.uid} mode ${(s.mode & 0o7777).toString(8)}`); } catch (e) { lines.push(`${p} stat: ${e.code}`); }
      const up = path.dirname(p);
      p = up === p ? undefined : up;
    }
  }
  return `\n  every rejection, then the /usr/bin/pwsh chain:\n  ${lines.join('\n  ')}`;
}

const within = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

/** LD23f: remove group and other write from every file and folder under dir; links are left as they are and returned. */
function closeToOthers(dir) {
  const links = [];
  const walk = (p) => {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) { links.push(p); return; }
    fs.chmodSync(p, st.mode & 0o7777 & ~0o022);
    if (st.isDirectory()) for (const n of fs.readdirSync(p)) walk(path.join(p, n));
  };
  walk(dir);
  return links;
}

/** True when another user can write `p` or a folder above it, by LD23's rule. */
function writableByOthers(p) {
  const entries = [];
  for (let q = p; ; q = path.dirname(q)) {
    const st = fs.statSync(q);
    entries.push({ uid: st.uid, mode: st.mode, isDirectory: st.isDirectory() });
    if (path.dirname(q) === q) break;
  }
  return te.ownershipRefusal(entries, process.getuid()) === 'writable by other users';
}

/**
 * LD23f, POSIX: GitHub-hosted runners install PowerShell world-writable
 * (/opt/microsoft/powershell/7 is 0o777), which LD23 correctly refuses. The
 * row copies the real install folder into a private folder only this user can
 * write. Undefined when no PowerShell is installed, so the row fails loudly.
 */
function privatePowerShell() {
  const known = te.PWSH.knownLocations(process.platform).find((f) => fs.existsSync(f));
  if (!known) return undefined;
  const real = fs.realpathSync.native(known);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsexec-pwsh-')));
  const dir = path.join(root, 'pwsh');
  fs.cpSync(path.dirname(real), dir, { recursive: true, verbatimSymlinks: true });
  for (const link of closeToOthers(dir)) {
    const target = path.resolve(path.dirname(link), fs.readlinkSync(link));
    if (within(target, dir) || !fs.existsSync(target)) continue;
    assert.equal(writableByOthers(fs.realpathSync.native(target)), false, `${link} leads out of the copy to ${target}, which other users can write`);
  }
  return { root, dir };
}

test('T8 closeToOthers removes group and other write and leaves links alone', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsexec-close-')));
  try {
    const sub = path.join(root, 'sub');
    fs.mkdirSync(sub);
    const file = path.join(sub, 'tool');
    fs.writeFileSync(file, '');
    let link;
    if (!WIN) {
      for (const f of [root, sub, file]) fs.chmodSync(f, 0o777);
      link = path.join(root, 'link');
      fs.symlinkSync(file, link);
    }
    const links = closeToOthers(root);
    assert.deepEqual(links, WIN ? [] : [link]);
    if (!WIN) {
      for (const f of [root, sub, file]) assert.equal(fs.statSync(f).mode & 0o777, 0o755, `${f} is 0o755`);
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the link is left as a link');
    }
  } finally { removeTempTree(root); }
});

test('T8: admitSkill runs the real PowerShell, never the plant', () => {
  const prevPath = process.env.PATH;
  let priv;
  if (!WIN) {
    priv = privatePowerShell();
    if (priv) {
      // ws's plant stays first, refused as inside the workspace; the private copy is the first trusted candidate.
      const wsBin = path.join(ws, 'bin');
      process.env.PATH = prevPath.startsWith(wsBin + DELIM)
        ? `${wsBin}${DELIM}${priv.dir}${DELIM}${prevPath.slice(wsBin.length + 1)}`
        : `${priv.dir}${DELIM}${prevPath}`;
    }
  }
  configure({ workspaceDirs: [ws] });
  process.env.NODE_OPTIONS = childEnv().NODE_OPTIONS || '';
  clearMarks();
  try {
    if (priv) assert.ok(within(te.trustedExecutablePath(te.PWSH, ws), priv.dir), 'the private copy is the PowerShell trusted');
    const { admitSkill } = req('roadmap', 'services', 'SkillRegistry.js');
    const skill = path.join(base, 'SKILL.md');
    fs.writeFileSync(skill, '# skill\n');
    const r = admitSkill(skill, 'test', ws);
    assert.deepEqual(marks(), [], 'the marker is empty');
    assert.doesNotMatch(String(r.error), /bad option/, 'the planted node did not answer');
    assert.equal(r.ok, true, `admitted: ${r.error}${r.ok ? '' : powerShellDiagnostics()}`);
    assert.ok(fs.existsSync(path.join(path.dirname(script), 'admitted.txt')), 'only a real PowerShell running the script writes admitted.txt');
  } finally {
    delete process.env.NODE_OPTIONS;
    process.env.PATH = prevPath;
    configure({ workspaceDirs: [ws] });
    if (priv) removeTempTree(priv.root);
  }
});

test('T8: the Windows process sampler starts the real PowerShell from a planted process cwd', { skip: !WIN && 'win32 sampler' }, async () => {
  configure({ workspaceDirs: [ws] });
  process.env.NODE_OPTIONS = childEnv().NODE_OPTIONS;
  clearMarks();
  process.chdir(ws);
  try {
    const { startTreeTracker } = req('integrations', 'agent-cli', 'process-tree.js');
    const tracker = await startTreeTracker(Date.now(), 'win32', { marker: 't8' });
    tracker.dispose();
    assert.deepEqual(marks(), [], 'the marker is empty');
  } finally { process.chdir(saved.cwd); delete process.env.NODE_OPTIONS; }
});

// ------------------------------------------------------------------ T10c: installers

test('T10c precondition: a bare installer from a planted process cwd runs the plant', () => {
  if (WIN) {
    plant(plantDir, 'winget');
    plant(plantDir, 'choco');
    const v = spawnSync('winget', ['--version'], { cwd: plantDir, encoding: 'utf8', windowsHide: true });
    assert.equal((v.stdout || '').trim(), process.version, 'bare winget answered with the Node version (the plant ran)');
  } else {
    plant(plantDir, 'apt-get', 'PLANTED apt-get');
    const v = spawnSync('apt-get', ['--version'], { encoding: 'utf8' });
    assert.match(v.stdout || '', /PLANTED/);
  }
});

test('T10c: the bootstrap runner starts the installers from their known locations only', async () => {
  configure({ workspaceDirs: [ws] });
  const gb = req('shared', 'gitBootstrap.js');
  const run = gb.defaultBootstrapRunner;
  assert.equal(typeof run, 'function', 'defaultBootstrapRunner is exported');
  process.chdir(plantDir);
  try {
    if (WIN) {
      const w = await run('winget', ['--version']);
      assert.match(w.stdout.trim(), /^v1\.\d+/, `the real winget answered: ${w.stdout}`);
      assert.notEqual(w.stdout.trim(), process.version);
      // Chocolatey is optional. An absent trusted installer must fail closed,
      // never fall back to the planted choco.exe in the current directory.
      const chocoPath = path.win32.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin', 'choco.exe');
      clearMarks();
      if (fs.existsSync(chocoPath)) {
        const c = await run('choco', ['--version']);
        assert.match(c.stdout.trim(), /^\d+\.\d+\.\d+/, `the real choco answered: ${c.stdout}`);
        assert.notEqual(c.stdout.trim(), process.version);
      } else {
        await assert.rejects(run('choco', ['--version']),
          'without trusted Chocolatey, installer resolution must reject instead of running a plant');
      }
      assert.deepEqual(marks(), [], 'the cwd-planted choco.exe was never executed');
    } else {
      const a = await run('apt-get', ['--version']);
      assert.match(a.stdout, /^apt /, `the real apt-get answered: ${a.stdout}`);
    }
  } finally { process.chdir(saved.cwd); }
});
