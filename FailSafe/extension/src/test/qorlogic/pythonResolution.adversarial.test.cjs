/**
 * Planted-Python adversarial suite (v6.0.8 lane A, LD12 and LD13, plan T13).
 *
 * win32: node.exe copied as python.exe, python3.exe, py.exe, pip.exe and
 * pip3.exe. A planted node answers `--version` with the Node version and
 * records every other argv through NODE_OPTIONS=--require <marker>. POSIX: sh
 * plants that answer `--version` with "Python 3.12.0" and record anything
 * else, on two absolute PATH entries: plant/bin first, a folder every user can
 * write (mode 0o777), refused as writable by other users (LD23); then ws/bin,
 * inside the workspace, refused by the workspace exclusion.
 *
 * Every precondition proves the attack is real on this host; a precondition
 * that does not fire FAILS. One row per interpreter source.
 *
 * Runs standalone after `npm run compile`: node --test src/test/qorlogic/pythonResolution.adversarial.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const EXT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(EXT, 'out');
const req = (...p) => require(path.join(OUT, ...p));
const { PythonInterpreterResolver, defaultRun } = req('qorlogic', 'PythonInterpreterResolver.js');
const { defaultInstallerRun, QorLogicPackageInstaller } = req('qorlogic', 'QorLogicPackageInstaller.js');
const { QorLogicSkillIngestor } = req('qorlogic', 'QorLogicSkillIngestor.js');
const { QorScriptInvoker } = req('qorlogic', 'substrate', 'QorScriptInvoker.js');
const { AdapterService } = req('roadmap', 'services', 'AdapterService.js');
const { EventBus } = req('shared', 'EventBus.js');
let te = {};
try { te = req('shared', 'exec', 'trustedExecutable.js'); } catch { /* b66a32d8 */ }
const configure = te.configureTrustedExecutables || (() => {});

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const saved = { noDefault: process.env.NoDefaultCurrentDirectoryInExePath, path: process.env.PATH, cwd: process.cwd() };
delete process.env.NoDefaultCurrentDirectoryInExePath;

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fspyadv-')));
const ws = path.join(base, 'ws');
const plantDir = path.join(base, 'plant');
// Both are junctions (POSIX: symlinks) to the real Python install folder.
const pyhome = path.join(ws, 'pyhome');
const kVenv = path.join(base, 'k-repo', '.venv');
const findDirs = [];

/** Remove a link as a link; anything that is not a link is refused, never deleted through. */
function unlinkJunction(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return; }
  if (!st.isSymbolicLink()) throw new Error(`${p} is not a link; the temp folders are left in place`);
  fs.unlinkSync(p);
}

after(() => {
  process.chdir(saved.cwd);
  if (saved.noDefault !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved.noDefault;
  process.env.PATH = saved.path;
  delete process.env.NODE_OPTIONS;
  delete process.env.FSG_MARKER;
  // LD20: unlink the junctions first, so the recursive delete below never walks into the host Python.
  unlinkJunction(pyhome);
  unlinkJunction(kVenv);
  for (const d of [base, ...findDirs]) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5 });
});
for (const d of [ws, plantDir]) fs.mkdirSync(d, { recursive: true });
const MARK = path.join(base, 'marker.log');
const markerJs = path.join(base, 'marker.cjs');
fs.writeFileSync(markerJs, "require('fs').appendFileSync(process.env.FSG_MARKER, JSON.stringify(process.argv.slice(1)) + '\\n'); process.exit(1);\n");
process.env.FSG_MARKER = MARK;
const marks = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const clearMarks = () => { try { fs.unlinkSync(MARK); } catch { /* none */ } };
const NAMES = WIN ? ['python', 'python3', 'py', 'pip', 'pip3'] : ['python', 'python3', 'pip', 'pip3'];
function plantAll(dir) {
  if (WIN) { for (const n of NAMES) fs.copyFileSync(process.execPath, path.join(dir, `${n}.exe`)); return; }
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const n of NAMES) {
    const ver = n.startsWith('pip') ? 'pip 99.0 from /planted (python 3.12)' : 'Python 3.12.0';
    fs.writeFileSync(path.join(bin, n), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${ver}"; exit 0; fi\necho "$*" >> "$FSG_MARKER"\nexit 1\n`);
    fs.chmodSync(path.join(bin, n), 0o755);
  }
  process.env.PATH = `${bin}${DELIM}${process.env.PATH}`;
}
plantAll(ws);
plantAll(plantDir);
const plantBin = path.join(plantDir, 'bin');
// LD23: plant/bin is the attacker's folder, writable by every user.
if (!WIN) fs.chmodSync(plantBin, 0o777);
if (WIN) process.env.NODE_OPTIONS = `--require ${markerJs.replace(/\\/g, '/')}`;

/** The base interpreter (not a venv shim), found from a clean temp folder. */
function baseInterpreter() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fspyfind-'));
  findDirs.push(cwd);
  const prevPath = process.env.PATH;
  process.env.PATH = saved.path;
  try {
    for (const [cmd, pre] of [['py', ['-3']], ['python3', []], ['python', []]]) {
      const r = spawnSync(cmd, [...pre, '-c', 'import sys;print(getattr(sys, "_base_executable", sys.executable))'], { cwd, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
      const exe = (r.stdout || '').trim();
      if (r.status === 0 && path.isAbsolute(exe)) return exe;
    }
  } finally { process.env.PATH = prevPath; }
  throw new Error('a real Python is required');
}
const BASE_PY = baseInterpreter();
fs.symlinkSync(path.dirname(BASE_PY), pyhome, WIN ? 'junction' : 'dir');
const insideWs = path.join(pyhome, path.basename(BASE_PY));
const lc = (p) => (WIN ? p.toLowerCase() : p);
const isInside = (p, d) => lc(path.resolve(p)).startsWith(lc(path.resolve(d)) + path.sep);

const output = { appendLine() {} };
const emptyConfig = { get: () => undefined, inspect: () => undefined };
const recorded = [];
/** Records every start and its result, so a planted node's answer is visible even when it writes no marker. */
const recRun = async (cmd, args, opts) => {
  const entry = { cmd, args: [...args], cwd: opts && opts.cwd };
  recorded.push(entry);
  entry.result = await defaultInstallerRun(cmd, args, opts);
  return entry.result;
};
/** A planted node prints its version, writes the marker, or refuses an option-first argv (-m, -3, -P) as a bad option. */
const nodeAnswered = (r) => /bad option/.test(String(r && r.stderr)) || String(r && r.stdout).trim() === process.version;
const noPlant = () => {
  assert.deepEqual(marks(), [], 'the marker is empty');
  for (const r of recorded) assert.ok(!nodeAnswered(r.result), `a planted node answered ${r.cmd}: ${JSON.stringify(r.result)}`);
};
const reset = () => { clearMarks(); recorded.length = 0; configure({ workspaceDirs: [ws] }); };

test('T13 preconditions: bare python and py with the workspace as cwd run the plant; bare pip3 answers as the plant', () => {
  clearMarks();
  const p = spawnSync('python', ['-m', 'qor.cli'], { cwd: ws, windowsHide: true, encoding: 'utf8' });
  assert.ok(marks().length >= 1 || nodeAnswered(p), `the planted python ran: ${p.stderr}`);
  if (WIN) {
    clearMarks();
    const q = spawnSync('py', ['-3', '-m', 'qor.cli'], { cwd: ws, windowsHide: true, encoding: 'utf8' });
    assert.ok(nodeAnswered(q), `the planted py ran: ${q.stderr}`);
  }
  const v = spawnSync('pip3', ['--version'], { cwd: plantDir, encoding: 'utf8', windowsHide: true });
  assert.ok(WIN ? (v.stdout || '').trim() === process.version : /planted/.test(v.stdout || ''), `the planted pip3 answered: ${v.stdout}`);
});

test('T13 POSIX positive control', { skip: WIN && 'POSIX PATH plant' }, async () => {
  // PATH is plant/bin, then ws/bin. plant/bin is refused as writable by other users;
  // ws/bin only by the workspace exclusion, which this row switches off and on.
  assert.equal(process.cwd(), saved.cwd, 'runs with the original cwd');
  try {
    clearMarks();
    spawnSync('python', ['-m', 'qor.cli'], { cwd: saved.cwd, encoding: 'utf8' });
    assert.deepEqual(marks(), ['-m qor.cli'], 'precondition: a bare python runs a plant');
    clearMarks();
    configure({ workspaceDirs: [] });
    const r = await new PythonInterpreterResolver(emptyConfig, null, defaultRun).resolve();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.source, 'probe');
    assert.ok(isInside(r.command, path.join(ws, 'bin')), `with no workspace configured, plant/bin is refused and the ws/bin plant is taken: ${r.command}`);
    configure({ workspaceDirs: [ws] });
    // A new resolver: each instance caches its first result.
    const r2 = await new PythonInterpreterResolver(emptyConfig, null, defaultRun).resolve();
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(r2.source, 'probe');
    assert.ok(!isInside(r2.command, ws), `with the workspace excluded, the ws/bin plant is refused: ${r2.command}`);
    assert.ok(!isInside(r2.command, plantBin), `plant/bin stays refused as writable by other users: ${r2.command}`);
  } finally {
    configure({ workspaceDirs: [ws] });
    clearMarks();
  }
});

test('T13 POSIX attacker-writable PATH folder', { skip: WIN && 'POSIX modes' }, async () => {
  assert.equal(process.cwd(), saved.cwd, 'runs with the original cwd');
  const planted = path.join(plantBin, 'python3');
  try {
    clearMarks();
    configure({ workspaceDirs: [ws] });
    const r = await new PythonInterpreterResolver(emptyConfig, null, defaultRun).resolve();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.source, 'probe');
    assert.ok(!isInside(r.command, plantBin) && !isInside(r.command, ws), `neither plant: ${r.command}`);
    assert.deepEqual(marks(), [], 'no plant ran');
    assert.throws(() => te.checkTrustedPath(te.PYTHON3, planted), (e) => /writable by other users/.test(e.message), 'refused for the right reason');
    // Positive control: a folder only this user can write is the user's own PATH.
    fs.chmodSync(plantBin, 0o755);
    configure({ workspaceDirs: [ws] }); // drop the cached result
    const own = await new PythonInterpreterResolver(emptyConfig, null, defaultRun).resolve();
    assert.equal(own.ok, true, JSON.stringify(own));
    assert.equal(own.command, planted, 'taken once only the user can write plant/bin');
  } finally {
    fs.chmodSync(plantBin, 0o777);
    configure({ workspaceDirs: [ws] });
    clearMarks();
  }
});

test('T13 (a): PATH source through the skill ingestor never runs a planted interpreter', async () => {
  reset();
  const resolver = new PythonInterpreterResolver(emptyConfig, null, defaultRun);
  const ing = new QorLogicSkillIngestor({}, resolver, ws, recRun, async () => {}, output);
  await ing.installHost('claude', 'repo');
  noPlant();
  assert.ok(recorded.length >= 1);
  for (const r of recorded) assert.ok(path.isAbsolute(r.cmd) && !isInside(r.cmd, ws), `absolute and outside ws: ${r.cmd}`);
});

test('T13 (b): PATH source through QorScriptInvoker never runs a planted interpreter', async () => {
  reset();
  const inv = new QorScriptInvoker(new PythonInterpreterResolver(emptyConfig, null, defaultRun));
  inv.run = recRun;
  await inv.invoke({ module: 'hijack_probe', args: [], cwd: ws });
  noPlant();
  assert.equal(recorded.length, 1);
  assert.ok(path.isAbsolute(recorded[0].cmd) && !isInside(recorded[0].cmd, ws), recorded[0].cmd);
});

test('T13 (c): the py launcher resolves to the trusted py.exe, never the plant', { skip: !WIN && 'win32 launcher' }, async () => {
  reset();
  const resolver = { resolve: async () => ({ ok: true, command: 'py', args: ['-3'], version: '3.x', source: 'probe' }), invalidate() {} };
  const ing = new QorLogicSkillIngestor({}, resolver, ws, recRun, async () => {}, output);
  await ing.installHost('claude', 'repo');
  noPlant();
  assert.equal(recorded.length, 1);
  if (te.trustedExecutablePath) assert.ok(!isInside(te.trustedExecutablePath(te.PY, ws), ws));
});

test('T13 (d): a user-level pythonPath inside the workspace is rejected as user-path-invalid', async () => {
  reset();
  const cfg = { get: () => insideWs, inspect: () => ({ globalValue: insideWs }) };
  const handed = [];
  const run = (cmd, args) => { handed.push(cmd); return defaultRun(cmd, args); };
  const r = await new PythonInterpreterResolver(cfg, null, run).resolve();
  assert.deepEqual(handed.filter((c) => isInside(c, ws)), [], 'the workspace interpreter was never handed to a runner');
  assert.equal(r.ok, false, `rejected: ${JSON.stringify(r)}`);
  assert.equal(r.reason, 'user-path-invalid');
  assert.match(String(r.detail), /inside an excluded folder/);
});

test('T13 (d2): a workspace-level pythonPath is ignored; the PATH source is used', async () => {
  reset();
  const cfg = { get: () => insideWs, inspect: () => ({ workspaceValue: insideWs }) };
  const r = await new PythonInterpreterResolver(cfg, null, defaultRun).resolve();
  assert.equal(r.ok, true);
  assert.equal(r.source, 'probe');
  assert.ok(!isInside(r.command, ws), `outside ws: ${r.command}`);
});

test('T13 (e): a Python-extension interpreter inside the workspace falls through to the PATH source', async () => {
  reset();
  const vscode = { extensions: { getExtension: () => ({ isActive: true, activate: async () => {}, exports: { settings: { getExecutionDetails: () => ({ execCommand: [insideWs] }) } } }) } };
  const handed = [];
  const run = (cmd, args) => { handed.push(cmd); return defaultRun(cmd, args); };
  const r = await new PythonInterpreterResolver(emptyConfig, vscode, run).resolve();
  assert.equal(r.ok, true);
  assert.equal(r.source, 'probe');
  assert.ok(!isInside(r.command, ws), `outside ws: ${r.command}`);
  assert.deepEqual(handed.filter((c) => isInside(c, ws)), [], 'the workspace interpreter was never handed to a runner');
});

test('T13 (f): a planted process cwd does not stop resolution, and pip runs from a trusted interpreter', async () => {
  reset();
  process.chdir(plantDir);
  try {
    const resolver = new PythonInterpreterResolver(emptyConfig, null, defaultRun);
    const py = await resolver.resolve();
    assert.equal(py.ok, true, `resolved despite the plants: ${JSON.stringify(py)}`);
    await new QorLogicPackageInstaller(resolver, output, recRun).isInstalled();
  } finally { process.chdir(saved.cwd); }
  noPlant();
  assert.equal(recorded.length, 1);
  assert.ok(path.isAbsolute(recorded[0].cmd) && !isInside(recorded[0].cmd, plantDir), recorded[0].cmd);
  assert.deepEqual(recorded[0].args.slice(-5), ['-P', '-m', 'pip', 'show', 'qor-logic']);
});

test('T13 (g): AdapterService.checkState never reports the planted interpreter', async () => {
  reset();
  process.chdir(plantDir);
  let state;
  try { state = await new AdapterService(new EventBus()).checkState(); } finally { process.chdir(saved.cwd); }
  assert.notEqual(state.pythonVersion, process.version, 'not the Node version of the plant');
  assert.match(String(state.pythonVersion), /^3\.\d+/);
  assert.equal(state.pipAvailable, true);
  assert.deepEqual(marks(), []);
});

test('T13 (h): the Store-alias rule admits an alias and then the Python probe rejects a non-Python alias (win32, winget stand-in)', { skip: !WIN && 'win32 alias' }, () => {
  assert.ok(te.trustedExecutablePath, 'the resolver exists');
  const alias = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe');
  const spec = { ...te.PYTHON, id: 't13-alias', fileName: () => 'winget.exe', searchPath: false, knownLocations: () => [alias] };
  configure({ workspaceDirs: [ws] });
  assert.throws(() => te.trustedExecutablePath(spec, ws), (e) => /probe output "v1\./.test(e.message), 'admitted by the alias rule, rejected by the probe');
  assert.throws(() => te.trustedExecutablePath(spec, ws), (e) => /probe failed earlier/.test(e.message), 'the rejection is cached');
});

test('T13 (i): with no trusted interpreter anywhere the result is the existing no-python-found', async () => {
  reset();
  configure({ workspaceDirs: [ws], pathEnv: '', knownLocations: [] });
  try {
    const resolver = new PythonInterpreterResolver(emptyConfig, null, defaultRun);
    const r = await resolver.resolve();
    assert.deepEqual(r, { ok: false, reason: 'no-python-found' });
    const ing = new QorLogicSkillIngestor({}, resolver, ws, recRun, async () => {}, output);
    const h = await ing.installHost('claude', 'repo');
    assert.equal(h.error, 'no-python-found');
    assert.equal(recorded.length, 0, 'nothing was started');
  } finally { configure({ workspaceDirs: [ws] }); }
});

test('T13 (j): the adapter import check never imports agent_failsafe from the process cwd (LD13)', async () => {
  reset();
  const plant = path.join(base, 'adapter-plant');
  fs.mkdirSync(plant);
  fs.writeFileSync(path.join(plant, 'agent_failsafe.py'), "import os\nopen(os.environ['FSG_MARKER'], 'a').write('agent_failsafe\\n')\nprint('OK')\n");
  // This host has no python3: give it one outside every root (a venv with python.exe copied as python3.exe).
  const prevPath = process.env.PATH;
  let py3 = 'python3';
  if (WIN) {
    const venv = path.join(base, 'py3venv');
    const mk = spawnSync(BASE_PY, ['-m', 'venv', '--without-pip', venv], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
    assert.equal(mk.status, 0, mk.stderr);
    fs.copyFileSync(path.join(venv, 'Scripts', 'python.exe'), path.join(venv, 'Scripts', 'python3.exe'));
    py3 = path.join(venv, 'Scripts', 'python3.exe');
    process.env.PATH = `${path.join(venv, 'Scripts')}${DELIM}${saved.path}`;
  } else {
    process.env.PATH = saved.path;
  }
  try {
    clearMarks();
    spawnSync(py3, ['-c', 'import agent_failsafe'], { cwd: plant, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
    assert.deepEqual(marks(), ['agent_failsafe'], 'precondition: -c from the plant folder imports the planted module');
    clearMarks();
    configure({ workspaceDirs: [ws] });
    process.chdir(plant);
    let health;
    try { health = await new AdapterService(new EventBus()).healthCheck(); } finally { process.chdir(saved.cwd); }
    assert.deepEqual(marks(), [], 'the planted agent_failsafe.py was never imported');
    assert.ok(health.details.some((d) => /not importable/.test(d)), JSON.stringify(health.details));
  } finally { process.env.PATH = prevPath; }
});

test('T13 (k): a Python-extension interpreter in the repository that contains the workspace folder is refused', async () => {
  const repo = path.join(base, 'k-repo');
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(sub, { recursive: true });
  fs.symlinkSync(path.dirname(BASE_PY), kVenv, WIN ? 'junction' : 'dir');
  const venvPy = path.join(kVenv, path.basename(BASE_PY));
  const roots = te.repoRootsFor ? te.repoRootsFor([sub], os.homedir()) : [];
  configure({ workspaceDirs: [sub, ...roots] });
  const vscode = { extensions: { getExtension: () => ({ isActive: true, activate: async () => {}, exports: { settings: { getExecutionDetails: () => ({ execCommand: [venvPy] }) } } }) } };
  const handed = [];
  const run = (cmd, args) => { handed.push(cmd); return defaultRun(cmd, args); };
  const r = await new PythonInterpreterResolver(emptyConfig, vscode, run).resolve();
  assert.equal(r.ok, true);
  assert.equal(r.source, 'probe', `the extension interpreter is not used: ${JSON.stringify(r)}`);
  assert.deepEqual(handed.filter((c) => isInside(c, repo)), [], 'the repository interpreter was never handed to a runner');
  configure({ workspaceDirs: [ws] });
});

test('T13 (l): a synchronous spawn failure in the adapter runner settles with code 1 and leaves no temp folder', async () => {
  configure({ workspaceDirs: [ws] });
  const list = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('failsafe-adapter-'));
  const before = new Set(list());
  const svc = new AdapterService(new EventBus());
  const r = await Promise.race([
    svc.runner('python', ['-c', 'pass\0x'], undefined, 5000).then((v) => ({ settled: true, v }), (e) => ({ settled: true, rejected: e })),
    new Promise((res) => setTimeout(() => res({ settled: false }), 2000)),
  ]);
  assert.equal(r.settled, true, 'settled within 2 s');
  assert.equal(r.rejected, undefined, `resolved, not rejected: ${r.rejected}`);
  assert.equal(r.v.code, 1);
  assert.deepEqual(list().filter((n) => !before.has(n)), [], 'no failsafe-adapter- folder left behind');
});
