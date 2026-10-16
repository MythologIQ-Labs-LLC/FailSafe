/**
 * The ACP proxy starts its agent from a trusted path (v6.0.8 lane A review
 * delta, LD16, plan T16).
 *
 * win32: node.exe copied as fsagent.exe into a plant folder used as the
 * process cwd. POSIX: a sh plant on an absolute PATH entry inside the plant
 * folder (CI). The precondition must fire or the suite fails.
 *
 * Runs standalone after `npm run compile`: node --test src/test/integrations/acp/acpAgentResolution.adversarial.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const EXT = path.resolve(OUT, '..');
const main = require(path.join(OUT, 'integrations', 'acp', 'proxy', 'AcpProxyMain.js'));
let te = {};
try { te = require(path.join(OUT, 'shared', 'exec', 'trustedExecutable.js')); } catch { /* none */ }
const configure = te.configureTrustedExecutables || (() => {});

const WIN = process.platform === 'win32';
const DELIM = WIN ? ';' : ':';
const saved = { noDefault: process.env.NoDefaultCurrentDirectoryInExePath, path: process.env.PATH, cwd: process.cwd() };
delete process.env.NoDefaultCurrentDirectoryInExePath;
after(() => {
  process.chdir(saved.cwd);
  if (saved.noDefault !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved.noDefault;
  process.env.PATH = saved.path;
  delete process.env.NODE_OPTIONS;
  configure({});
});

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsacp-')));
const plant = path.join(base, 'plant');
fs.mkdirSync(plant);
const MARK = path.join(base, 'marker.log');
const markerJs = path.join(base, 'marker.cjs');
fs.writeFileSync(markerJs, "require('fs').appendFileSync(process.env.FSG_MARKER, 'ran\\n'); process.exit(1);\n");
process.env.FSG_MARKER = MARK;
if (WIN) {
  fs.copyFileSync(process.execPath, path.join(plant, 'fsagent.exe'));
} else {
  const bin = path.join(plant, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'fsagent'), `#!/bin/sh\necho ran >> "${MARK}"\n`);
  fs.chmodSync(path.join(bin, 'fsagent'), 0o755);
  process.env.PATH = `${bin}${DELIM}${saved.path}`;
}
const ran = () => fs.existsSync(MARK);
const clear = () => { try { fs.unlinkSync(MARK); } catch { /* none */ } };

test('T16 precondition: a bare agent name from the planted process cwd runs the plant', () => {
  clear();
  process.chdir(plant);
  try {
    spawnSync('fsagent', ['x'], { windowsHide: true, env: WIN ? { ...process.env, NODE_OPTIONS: `--require ${markerJs.replace(/\\/g, '/')}` } : process.env });
  } finally { process.chdir(saved.cwd); }
  assert.equal(ran(), true, 'the planted agent ran');
});

test('T16: resolveAgentCommand refuses the planted agent and accepts a trusted absolute one', () => {
  assert.equal(typeof main.resolveAgentCommand, 'function', 'resolveAgentCommand is exported');
  configure({ workspaceDirs: WIN ? [] : [plant] });
  clear();
  process.chdir(plant);
  try {
    assert.throws(() => main.resolveAgentCommand('fsagent'), (e) => e.code === 'TRUSTED_EXECUTABLE_UNAVAILABLE');
    assert.equal(main.resolveAgentCommand(process.execPath), fs.realpathSync.native(process.execPath));
  } finally { process.chdir(saved.cwd); }
  assert.equal(ran(), false, 'nothing ran');
});

test('T16: an agent inside the repository that contains the --workspace folder is refused', () => {
  const repo = path.join(base, 'repo');
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
  fs.mkdirSync(sub, { recursive: true });
  const agent = path.join(repo, 'tools', WIN ? 'agent.exe' : 'agent');
  fs.writeFileSync(agent, '');
  if (!WIN) fs.chmodSync(agent, 0o755);
  assert.equal(typeof te.repoRootsFor, 'function', 'repoRootsFor exists');
  configure({ workspaceDirs: [sub, ...te.repoRootsFor([sub], os.homedir())] });
  assert.throws(() => main.resolveAgentCommand(agent), (e) => /inside an excluded folder/.test(e.message));
});

test('T16: runAcpProxy hands spawnFn the resolved path, never the raw name', () => {
  configure({ workspaceDirs: [] });
  const seen = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stdin = new PassThrough(); child.killed = false; child.kill = () => true;
  const incoming = new PassThrough();
  const outgoing = new PassThrough();
  // A linked folder makes the raw path differ from its resolved form.
  const J = path.join(base, 'nodelink');
  if (!fs.existsSync(J)) fs.symlinkSync(path.dirname(process.execPath), J, WIN ? 'junction' : 'dir');
  const viaLink = path.join(J, path.basename(process.execPath));
  try {
    main.runAcpProxy({
      incoming, outgoing, agentCommand: viaLink, agentArgs: [],
      backing: { governanceInterceptor: { evaluate: async () => ({ verdict: 'ALLOW' }) }, effectiveMode: () => ({ mode: 'observe', enforcing: false }) },
      spawnFn: (c) => { seen.push(c); return child; },
      signals: new EventEmitter(),
    });
  } finally { for (const s of [incoming, outgoing, child.stdout, child.stdin]) s.destroy(); }
  assert.deepEqual(seen, [fs.realpathSync.native(process.execPath)]);
});

test('T16 source: main reports an unresolved agent on stderr and returns 1 without spawning', () => {
  const src = fs.readFileSync(path.join(EXT, 'src', 'integrations', 'acp', 'proxy', 'AcpProxyEntry.ts'), 'utf8');
  assert.match(src, /acp-proxy: no trusted agent executable:/);
  assert.match(src, /return 1;/);
  assert.match(src, /configureTrustedExecutables\(/);
  assert.match(src, /repoRootsFor\(/);
});
