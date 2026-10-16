/**
 * Planted-scanner adversarial suite (v6.0.8 lane A, #468, plan T4b).
 *
 * win32: node.exe copied as garak.exe, npx.exe and promptfoo.exe into the
 * process cwd and into the item's install folder. A planted node answers
 * `--version` with the Node version and records every other argv through
 * NODE_OPTIONS=--require <marker>. POSIX: sh plants on an absolute PATH entry
 * inside the install folder (under the marketplace root).
 *
 * The precondition proves the attack is real on this host (the bare names run
 * the plant); a precondition that does not fire FAILS. The rows run the real
 * SecurityScanner default runner from out/.
 *
 * Runs standalone after `npm run compile`: node --test src/test/roadmap/SecurityScanner.adversarial.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const OUT = path.resolve(__dirname, '..', '..', '..', 'out');
const { SecurityScanner } = require(path.join(OUT, 'roadmap', 'services', 'SecurityScanner.js'));
const { EventBus } = require(path.join(OUT, 'shared', 'EventBus.js'));
// Optional so the red run against b66a32d8 (which has no resolver) still exercises the old runner.
let configureTrustedExecutables = () => {};
try { ({ configureTrustedExecutables } = require(path.join(OUT, 'shared', 'exec', 'trustedExecutable.js'))); } catch { /* b66a32d8 */ }

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const saved = { noDefault: process.env.NoDefaultCurrentDirectoryInExePath, path: process.env.PATH, home: process.env.HOME, user: process.env.USERPROFILE, cwd: process.cwd() };
delete process.env.NoDefaultCurrentDirectoryInExePath;
after(() => {
  process.chdir(saved.cwd);
  if (saved.noDefault !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved.noDefault;
  process.env.PATH = saved.path;
  if (saved.home === undefined) delete process.env.HOME; else process.env.HOME = saved.home;
  if (saved.user === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = saved.user;
  delete process.env.NODE_OPTIONS;
  delete process.env.FSG_MARKER;
});

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsscan-adv-')));
const home = path.join(base, 'home');
const install = path.join(home, '.failsafe', 'marketplace', 'evil-item');
const cwdFolder = path.join(base, 'cwd');
for (const d of [install, cwdFolder]) fs.mkdirSync(d, { recursive: true });
process.env.HOME = home;
process.env.USERPROFILE = home;
const MARK = path.join(base, 'marker.log');
const markerJs = path.join(base, 'marker.cjs');
fs.writeFileSync(markerJs, "require('fs').appendFileSync(process.env.FSG_MARKER, JSON.stringify(process.argv.slice(1)) + '\\n'); process.exit(1);\n");
const marks = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const clearMarks = () => { try { fs.unlinkSync(MARK); } catch { /* none */ } };
const NAMES = ['garak', 'npx', 'promptfoo'];
if (WIN) {
  for (const d of [install, cwdFolder]) for (const n of NAMES) fs.copyFileSync(process.execPath, path.join(d, `${n}.exe`));
  process.env.NODE_OPTIONS = `--require ${markerJs.replace(/\\/g, '/')}`;
} else {
  const bin = path.join(install, 'bin');
  fs.mkdirSync(bin);
  for (const n of NAMES) {
    fs.writeFileSync(path.join(bin, n), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${n === 'garak' ? 'garak v9' : '9.9.9'}"; exit 0; fi\necho "$*" >> "$FSG_MARKER"\nexit 1\n`);
    fs.chmodSync(path.join(bin, n), 0o755);
  }
  process.env.PATH = `${bin}${DELIM}${saved.path}`;
}
process.env.FSG_MARKER = MARK;
configureTrustedExecutables({ workspaceDirs: [] });

test('T4b precondition: the bare scanner names run the plant on this host', () => {
  clearMarks();
  const opts = { cwd: WIN ? install : base, encoding: 'utf8', env: process.env, windowsHide: true };
  const v = spawnSync('garak', ['--version'], opts);
  if (WIN) assert.equal((v.stdout || '').trim(), process.version, 'bare garak --version answered with the Node version (the plant ran)');
  else assert.match(v.stdout || '', /garak v9/);
  spawnSync('npx', ['promptfoo', 'redteam', 'run'], opts);
  assert.ok(marks().length >= 1, `bare npx ran the plant (marker lines: ${marks().length})`);
});

test('T4b: checkAvailability and both scans never run a planted scanner', async () => {
  clearMarks();
  process.chdir(cwdFolder);
  try {
    const s = new SecurityScanner(new EventBus());
    const avail = await s.checkAvailability();
    assert.equal(avail.garak, false, 'no trusted garak on this host');
    assert.equal(avail.promptfoo, false, 'no trusted promptfoo on this host');
    const g = await s.scanWithGarak(install, () => {});
    const p = await s.scanWithPromptfoo(install, () => {});
    assert.equal(g.passed, false);
    assert.equal(p.passed, false);
    assert.deepEqual(marks(), [], 'the marker is empty');
  } finally { process.chdir(saved.cwd); }
});

test('T4b: a scanner under the marketplace root on an absolute PATH entry is rejected as inside an excluded folder', async () => {
  const bin = path.join(home, '.failsafe', 'marketplace', 'other-item', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const name = WIN ? 'garak.exe' : 'garak';
  if (WIN) fs.copyFileSync(process.execPath, path.join(bin, name));
  else { fs.writeFileSync(path.join(bin, name), '#!/bin/sh\necho garak v9\n'); fs.chmodSync(path.join(bin, name), 0o755); }
  const prev = process.env.PATH;
  process.env.PATH = `${bin}${DELIM}${prev}`;
  try {
    configureTrustedExecutables({ workspaceDirs: [] });
    const s = new SecurityScanner(new EventBus());
    const r = await s.runner('garak', ['--version'], fs.mkdtempSync(path.join(os.tmpdir(), 'fsscan-cwd-')), 5000);
    assert.equal(r.code, 127, 'not started');
    const needle = `${path.join(bin, name)} (inside an excluded folder)`;
    assert.ok(r.stderr.includes(needle), `the reason names the marketplace root: ${r.stderr}`);
  } finally { process.env.PATH = prev; }
});

test('T4b: a scanner child still holding its temp folder does not break the scan (EBUSY tolerated)', { skip: !WIN && 'win32: a running cwd blocks removal only on Windows' }, async () => {
  let holder;
  let held;
  const runner = async (command, args, cwd) => {
    if (args[0] === '--version') return { code: 0, stdout: 'ok', stderr: '' };
    held = cwd;
    // A surviving descendant: a live process whose cwd is the scan folder.
    holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { cwd, stdio: 'ignore', env: { ...process.env, NODE_OPTIONS: '' } });
    await new Promise((r) => setTimeout(r, 500));
    return { code: 0, stdout: '{"results":{"p1":{"name":"x","fail_rate":0}}}', stderr: '' };
  };
  try {
    // Precondition: removing a folder that is a live process's cwd fails on this host.
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsscan-hold-'));
    const p = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { cwd: probeDir, stdio: 'ignore', env: { ...process.env, NODE_OPTIONS: '' } });
    await new Promise((r) => setTimeout(r, 500));
    assert.throws(() => fs.rmSync(probeDir, { recursive: true, force: true, maxRetries: 3 }), 'precondition: a live cwd blocks removal');
    p.kill();
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithGarak(install, () => {});
    assert.equal(r.scanner, 'garak', 'the scan returned a result');
  } finally {
    if (holder) holder.kill();
    await new Promise((r) => setTimeout(r, 300));
    if (held) fs.rmSync(held, { recursive: true, force: true, maxRetries: 5 });
  }
});
