/**
 * `python -m` / `python -c` never import from the working folder (v6.0.8
 * lane A, LD11, plan T11).
 *
 * Python puts the working folder first on its import path for -m and -c, so a
 * workspace holding qor/cli.py, qor/scripts/<m>.py or pip/__main__.py runs its
 * own code instead of the installed package. Every FailSafe python -m / -c site
 * passes -P (Python 3.11+), which drops that entry.
 *
 * Needs a real Python 3.11+ (FAILSAFE_TEST_PYTHON, or py -3 / python3 / python);
 * without one the suite FAILS rather than skips.
 *
 * Runs standalone after `npm run compile`: node --test src/test/qorlogic/pythonSafePath.test.cjs
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
const { defaultInstallerRun, QorLogicPackageInstaller } = req('qorlogic', 'QorLogicPackageInstaller.js');
const { defaultRun } = req('qorlogic', 'PythonInterpreterResolver.js');
const { QorLogicSkillIngestor } = req('qorlogic', 'QorLogicSkillIngestor.js');
const { QorScriptInvoker } = req('qorlogic', 'substrate', 'QorScriptInvoker.js');
const { loadShadowGenome } = req('qorlogic', 'shadow-genome-client.js');
let runQorlogicCli;
try { ({ runQorlogicCli } = req('qorlogic', 'qorCliRun.js')); } catch { /* b66a32d8: the closure body is reproduced below */ }
let configure = () => {};
try { configure = req('shared', 'exec', 'trustedExecutable.js').configureTrustedExecutables; } catch { /* b66a32d8 */ }

function findPython() {
  const probes = process.env.FAILSAFE_TEST_PYTHON ? [[process.env.FAILSAFE_TEST_PYTHON, []]] : [['py', ['-3']], ['python3', []], ['python', []]];
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fspyfind-'));
  for (const [cmd, pre] of probes) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys;print(sys.executable);print(sys.version_info[0]*100+sys.version_info[1])'], { cwd, encoding: 'utf8' });
    const [exe, ver] = (r.stdout || '').trim().split(/\r?\n/);
    if (r.status === 0 && path.isAbsolute(exe || '') && Number(ver) >= 311) return exe;
  }
  return undefined;
}
const PY = findPython();
const saved = { cwd: process.cwd(), marker: process.env.FSG_MARKER };
after(() => { process.chdir(saved.cwd); if (saved.marker === undefined) delete process.env.FSG_MARKER; else process.env.FSG_MARKER = saved.marker; });

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fspysafe-')));
const ws = path.join(base, 'ws');
const MARK = path.join(base, 'marker.log');
process.env.FSG_MARKER = MARK;
const plantPy = (rel, name) => {
  const f = path.join(ws, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, name ? `import os\nopen(os.environ['FSG_MARKER'], 'a').write('${name}\\n')\n` : '');
};
plantPy(path.join('qor', '__init__.py'));
plantPy(path.join('qor', 'cli.py'), 'qor.cli');
plantPy(path.join('qor', 'scripts', '__init__.py'));
plantPy(path.join('qor', 'scripts', 'hijack_probe.py'), 'qor.scripts.hijack_probe');
plantPy(path.join('qor', 'scripts', 'shadow_genome_graph.py'), 'qor.scripts.shadow_genome_graph');
plantPy(path.join('pip', '__init__.py'));
plantPy(path.join('pip', '__main__.py'), 'pip');
const marks = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const clearMarks = () => { try { fs.unlinkSync(MARK); } catch { /* none */ } };

const resolver = { resolve: async () => ({ ok: true, command: PY, args: [], version: '3.x', source: 'probe' }), invalidate() {} };
const output = { appendLine() {} };
const recorded = [];
const recordingInstallerRun = (cmd, args, opts) => { recorded.push([...args]); return defaultInstallerRun(cmd, args, opts); };
const recordingRun = (cmd, args) => { recorded.push([...args]); return defaultRun(cmd, args); };
const guarded = (args) => {
  const i = args.findIndex((a) => a === '-m' || a === '-c');
  return i > 0 && args[i - 1] === '-P';
};
configure({ workspaceDirs: [] });

test('T11 precondition: a real Python 3.11+ is available and -m from the workspace runs the plant', () => {
  assert.ok(PY, 'a real Python 3.11+ was found (set FAILSAFE_TEST_PYTHON otherwise)');
  clearMarks();
  spawnSync(PY, ['-m', 'qor.cli', '--version'], { cwd: ws, encoding: 'utf8' });
  assert.deepEqual(marks(), ['qor.cli'], 'the planted qor/cli.py ran');
});

test('T11: QorLogicSkillIngestor.installHost never imports from the workspace', async () => {
  clearMarks();
  recorded.length = 0;
  const ing = new QorLogicSkillIngestor({}, resolver, ws, recordingInstallerRun, async () => {}, output);
  await ing.installHost('claude', 'repo');
  assert.deepEqual(marks(), []);
  assert.ok(recorded.length >= 1 && recorded.every(guarded), `-P before -m: ${JSON.stringify(recorded)}`);
});

test('T11: QorScriptInvoker.invoke never imports from the workspace', async () => {
  clearMarks();
  recorded.length = 0;
  const inv = new QorScriptInvoker(resolver);
  inv.run = recordingInstallerRun;
  await inv.invoke({ module: 'hijack_probe', args: [], cwd: ws });
  assert.deepEqual(marks(), []);
  assert.ok(recorded.length === 1 && guarded(recorded[0]), JSON.stringify(recorded));
});

test('T11: QorLogicPackageInstaller.isInstalled (-m pip show) never imports from the process cwd', async () => {
  clearMarks();
  recorded.length = 0;
  process.chdir(ws);
  try {
    await new QorLogicPackageInstaller(resolver, output, recordingInstallerRun).isInstalled();
  } finally { process.chdir(saved.cwd); }
  assert.deepEqual(marks(), []);
  assert.ok(recorded.length === 1 && guarded(recorded[0]), JSON.stringify(recorded));
});

test('T11: the Console skill-enumeration runner never imports from the workspace', async () => {
  clearMarks();
  recorded.length = 0;
  const run = runQorlogicCli
    ? (extra) => runQorlogicCli(resolver, ws, extra, recordingInstallerRun)
    // b66a32d8 closure body (bootstrapServers.ts line 302), reproduced for the red run.
    : async (extra) => { const py = await resolver.resolve(); return recordingInstallerRun(py.command, [...py.args, '-m', 'qor.cli', ...extra], { timeoutMs: 180000, cwd: ws, env: { QORLOGIC_PROJECT_DIR: ws } }); };
  await run(['--version']);
  assert.deepEqual(marks(), []);
  assert.ok(recorded.length === 1 && guarded(recorded[0]), JSON.stringify(recorded));
});

test('T11: the shadow-genome export (-c) never imports from the process cwd', async () => {
  clearMarks();
  recorded.length = 0;
  process.chdir(ws);
  try {
    await loadShadowGenome({ enabled: true, python: PY, run: recordingRun });
  } finally { process.chdir(saved.cwd); }
  assert.deepEqual(marks(), []);
  assert.ok(recorded.length === 1 && guarded(recorded[0]), JSON.stringify(recorded));
});

test('T11 source: bootstrapServers runCli calls runQorlogicCli', () => {
  const src = fs.readFileSync(path.join(EXT, 'src', 'extension', 'bootstrapServers.ts'), 'utf8');
  const at = src.indexOf('const runCli =');
  assert.ok(at > 0, 'runCli found');
  assert.match(src.slice(at, at + 300), /runQorlogicCli\(/);
});
