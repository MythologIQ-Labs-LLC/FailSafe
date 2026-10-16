/**
 * Bicameral launch adversarial suite (v6.0.8 lane A review delta, LD14, plan T14).
 *
 * win32: node.exe copied as bicameral-mcp.exe and pip.exe into the workspace
 * ws, and a bicameral-mcp.cmd that writes a marker in ws2. The MCP SDK's
 * StdioClientTransport starts its command through cross-spawn, which on
 * Windows searches the cwd first and runs a .cmd through cmd.exe (H10).
 * POSIX rows: sh plants on an absolute PATH entry inside ws (CI).
 *
 * Every precondition must fire or the suite fails.
 *
 * Runs standalone after `npm run compile`: node --test src/test/integrations/bicameral/bicameralLaunch.adversarial.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeTempTree } = require('../../shared/removeTempTree.cjs');
const { spawnSync } = require('child_process');

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const EXT = path.resolve(OUT, '..');
const req = (...p) => require(path.join(OUT, ...p));
const { probeInstallState, runBicameralInstall } = req('integrations', 'bicameral', 'index.js');
const { BicameralMcpClient } = req('integrations', 'bicameral', 'BicameralMcpClient.js');
const { StdioClientTransport } = require(require.resolve('@modelcontextprotocol/sdk/client/stdio.js', { paths: [EXT] }));
let te = {};
try { te = req('shared', 'exec', 'trustedExecutable.js'); } catch { /* none */ }
const configure = te.configureTrustedExecutables || (() => {});

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const saved = { noDefault: process.env.NoDefaultCurrentDirectoryInExePath, path: process.env.PATH, cwd: process.cwd() };
delete process.env.NoDefaultCurrentDirectoryInExePath;
after(() => {
  process.chdir(saved.cwd);
  if (saved.noDefault !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved.noDefault;
  process.env.PATH = saved.path;
  configure({});
  removeTempTree(base); // LD20
});

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsbic-')));
const ws = path.join(base, 'ws');
const ws2 = path.join(base, 'ws2');
const L = path.join(base, 'legit');
for (const d of [ws, ws2, L]) fs.mkdirSync(d, { recursive: true });
const MARK = path.join(base, 'cmd-marker.txt');
const exe = (n) => (WIN ? `${n}.exe` : n);
if (WIN) {
  fs.copyFileSync(process.execPath, path.join(ws, 'bicameral-mcp.exe'));
  fs.copyFileSync(process.execPath, path.join(ws, 'pip.exe'));
  fs.writeFileSync(path.join(ws2, 'bicameral-mcp.cmd'), `@echo ran> "${MARK}"\r\n`);
} else {
  const bin = path.join(ws, 'bin');
  fs.mkdirSync(bin);
  for (const n of ['bicameral-mcp', 'pip']) {
    fs.writeFileSync(path.join(bin, n), `#!/bin/sh\necho "planted 9.9.9"\necho ran >> "${MARK}"\n`);
    fs.chmodSync(path.join(bin, n), 0o755);
  }
  process.env.PATH = `${bin}${DELIM}${saved.path}`;
}
const inert = (dir, name) => { const f = path.join(dir, name); fs.writeFileSync(f, ''); if (!WIN) fs.chmodSync(f, 0o755); return f; };
const marked = () => fs.existsSync(MARK);
const waitMarked = async (ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (marked()) return true; await new Promise((r) => setTimeout(r, 100)); } return marked(); };
const isInside = (p, d) => (WIN ? p.toLowerCase() : p).startsWith((WIN ? d.toLowerCase() : d) + path.sep);

test('T14 (p1) precondition: bare bicameral-mcp with the workspace as cwd runs the plant', () => {
  const r = spawnSync('bicameral-mcp', ['--version'], { cwd: ws, encoding: 'utf8', windowsHide: true });
  assert.ok(WIN ? (r.stdout || '').trim() === process.version : /planted/.test(r.stdout || ''), `the plant answered: ${r.stdout}`);
});

test('T14 (p2) precondition: the MCP SDK transport runs a .cmd planted in its cwd', { skip: !WIN && 'win32: cross-spawn .cmd routing' }, async () => {
  try { fs.unlinkSync(MARK); } catch { /* none */ }
  const t = new StdioClientTransport({ command: 'bicameral-mcp', args: [], cwd: ws2 });
  try { await t.start(); } catch { /* the .cmd exits at once */ }
  assert.equal(await waitMarked(5000), true, 'the planted .cmd ran through cmd.exe');
  try { await t.close(); } catch { /* closed */ }
});

test('T14 (a): the status probe never runs a planted bicameral-mcp, from the cwd or from a PATH entry inside the workspace', async () => {
  // This host has a real bicameral-mcp on PATH, so the resolver only searches the
  // ws entry and an empty folder: "not-installed" then means the plant was refused.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fsbic-empty-'));
  configure({ workspaceDirs: [ws], pathEnv: [WIN ? ws : path.join(ws, 'bin'), empty].join(DELIM), knownLocations: [] });
  // The plant is reachable both ways: as the process cwd and through an absolute
  // PATH entry inside ws, so only the resolver (not the probe's temp cwd) stops it.
  const prev = process.env.PATH;
  process.env.PATH = `${WIN ? ws : path.join(ws, 'bin')}${DELIM}${prev}`;
  process.chdir(ws);
  try {
    const t0 = Date.now();
    const r = await probeInstallState({ command: 'bicameral-mcp', workspaceRoot: ws });
    assert.equal(r.state, 'not-installed', `the plant was refused: ${JSON.stringify(r)}`);
    assert.notEqual(r.version, process.version.slice(1), 'the plant never answered');
    assert.ok(Date.now() - t0 < 2500, 'refused before any version probe could time out');
  } finally { process.chdir(saved.cwd); process.env.PATH = prev; configure({ workspaceDirs: [ws] }); removeTempTree(empty); }
});

function recordingSpawn(onCall) {
  const calls = [];
  const fn = (bin, args, opts) => {
    calls.push({ bin, args, cwd: opts && opts.cwd, cwdExisted: !!(opts && opts.cwd && fs.existsSync(opts.cwd)) });
    if (onCall) onCall(calls.length, bin, args, opts);
    const { EventEmitter } = require('events');
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', 0));
    return child;
  };
  fn.calls = calls;
  return fn;
}
const legitConfig = () => ({
  workspaceDirs: [ws], pathEnv: [L, WIN ? ws : path.join(ws, 'bin')].join(DELIM), knownLocations: [],
  probe: () => ({ completed: true, timedOut: false, stdout: 'pip 99.0 from x (python 3.12)' }),
});

test('T14 (b): a normal install starts the trusted pip from a temp folder, then the trusted bicameral-mcp from the workspace', async () => {
  for (const f of fs.readdirSync(L)) fs.unlinkSync(path.join(L, f));
  inert(L, exe('pip'));
  configure(legitConfig());
  const spawn = recordingSpawn((n) => { if (n === 1) inert(L, exe('bicameral-mcp')); });
  const r = await runBicameralInstall({ workspaceRoot: ws, onProgress: () => {}, spawn, verifyState: async () => 'installed-not-configured' }, 'solo');
  assert.equal(spawn.calls.length, 2, `exactly 2 spawns: ${JSON.stringify(spawn.calls)}`);
  const [pip, setup] = spawn.calls;
  assert.equal(pip.bin, fs.realpathSync.native(path.join(L, exe('pip'))));
  assert.equal(pip.cwdExisted, true);
  assert.ok(!isInside(pip.cwd, ws) && path.resolve(pip.cwd) !== path.resolve(ws), `pip cwd outside ws: ${pip.cwd}`);
  assert.equal(fs.existsSync(pip.cwd), false, 'the pip folder is removed');
  assert.equal(setup.bin, fs.realpathSync.native(path.join(L, exe('bicameral-mcp'))));
  assert.equal(path.resolve(setup.cwd), path.resolve(ws));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('T14 (c): a fresh install with no trusted bicameral-mcp afterwards stops after pip', async () => {
  for (const f of fs.readdirSync(L)) fs.unlinkSync(path.join(L, f));
  inert(L, exe('pip'));
  configure(legitConfig());
  const spawn = recordingSpawn();
  const r = await runBicameralInstall({ workspaceRoot: ws, onProgress: () => {}, spawn, verifyState: async () => 'installed-not-configured' }, 'solo');
  assert.equal(spawn.calls.length, 1, `only pip ran: ${JSON.stringify(spawn.calls)}`);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /not found on a trusted path after the install/);
});

test('T14 (d): the MCP client refuses a bare, .cmd, rooted-relative, UNC or missing command and runs nothing', async () => {
  try { fs.unlinkSync(MARK); } catch { /* none */ }
  // Each refusal names its own reason, so a weaker check cannot hide behind a later one.
  const bad = [
    ['bicameral-mcp', /not an absolute path/],
    ['\\x.exe', /not an absolute path/],
    ['\\\\host\\share\\x.exe', /not an absolute path/],
    ...(WIN ? [[path.join(ws2, 'bicameral-mcp.cmd'), /not an \.exe/]] : []),
    [path.join(L, WIN ? 'missing.exe' : 'missing'), /not an existing regular file/],
  ];
  for (const [command, why] of bad) {
    const c = new BicameralMcpClient({ command, cwd: ws2 });
    await assert.rejects(() => c.connect(), (e) => /refus/i.test(e.message) && why.test(e.message), command);
  }
  assert.equal(await waitMarked(2000), false, 'the planted .cmd never ran');
});

test('T14 (e) source: the client is built only from a resolved command, and folder changes re-wire', () => {
  const src = fs.readFileSync(path.join(EXT, 'src', 'extension', 'bootstrapBicameral.ts'), 'utf8');
  const sites = [...src.matchAll(/new BicameralMcpClient\(([\s\S]*?)\)/g)];
  assert.equal(sites.length, 2, 'two construction sites');
  for (const m of sites) {
    assert.match(m[1], /^\s*\{/, 'an object literal, not a passed-through options object');
    const cmd = /\bcommand\s*:\s*([A-Za-z_$][\w$]*)/.exec(m[1]);
    assert.ok(cmd, `an explicit command property: ${m[1]}`);
    assert.match(src, new RegExp(`\\b${cmd[1]}\\s*=\\s*trustedCommandPath\\(`), `${cmd[1]} comes from trustedCommandPath`);
  }
  assert.match(src, /onDidChangeWorkspaceFolders\(/);
});

test('T14 (f): the status probe never throws, even when its temp folder cannot be made', async () => {
  const orig = fs.mkdtempSync;
  fs.mkdtempSync = () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); };
  try {
    const r = await probeInstallState({ command: process.execPath, workspaceRoot: ws, extraRoots: [path.dirname(process.execPath), path.dirname(fs.realpathSync.native(process.execPath))] });
    assert.equal(r.state, 'not-installed');
  } finally { fs.mkdtempSync = orig; }
});
