/**
 * A timed-out git read kills git (v6.0.8 lane A, B213, plan T9).
 *
 * A marker M of nine digits is carried in the argv of every process in the
 * hanging tree: `git -c alias.fshang="!sleep 30.M" fshang` starts (on win32)
 * the cmd\git.exe launcher, mingw64 git, a shell and `sleep 30.M`. GNU sleep
 * accepts fractional seconds, so the leaf itself carries M. Processes are
 * listed by command line: win32 through Windows PowerShell's Win32_Process,
 * Linux through /proc (macOS has no /proc; its CI only compiles).
 *
 * Runs standalone after `npm run compile`: node --test src/test/integrations/agent-cli/safeGitTimeout.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const gitSafety = require(path.join(OUT, 'integrations', 'agent-cli', 'git-safety.js'));
const { trustedGitPath } = require(path.join(OUT, 'shared', 'git', 'trustedGit.js'));
let killTree;
try { killTree = require(path.join(OUT, 'shared', 'exec', 'killTree.js')); } catch { /* b66a32d8: no kill module */ }

const WIN = process.platform === 'win32';
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const saved = { ceiling: process.env.GIT_CEILING_DIRECTORIES };
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fssafegit-')));
process.env.GIT_CEILING_DIRECTORIES = path.dirname(base);
const repo = path.join(base, 'repo');
fs.mkdirSync(repo);
const GIT = trustedGitPath();
execFileSync(GIT, ['init', '-q'], { cwd: repo });

const markers = [];
const newMarker = () => { const m = String(100000000 + Math.floor(Math.random() * 899999999)); markers.push(m); return m; };

/** Processes (other than this one and the lister) whose command line contains m. */
function carrying(m) {
  if (WIN) {
    const out = execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${m}*' -and $_.Name -ne 'powershell.exe' } | ForEach-Object { '' + $_.ProcessId + ' ' + $_.Name }`],
    { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => Number(l.split(' ')[0]) !== process.pid);
  }
  const out = [];
  for (const pid of fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
    if (Number(pid) === process.pid) continue;
    try { const cl = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); if (cl.includes(m)) out.push(`${pid} ${cl.trim()}`); } catch { /* gone */ }
  }
  return out;
}
function killCarrying(m) {
  for (const l of carrying(m)) { try { process.kill(Number(l.split(' ')[0]), 'SIGKILL'); } catch { /* gone */ } }
}
after(() => {
  for (const m of markers) killCarrying(m);
  if (saved.ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = saved.ceiling;
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms) => Promise.race([p.then((v) => ({ settled: true, v })), sleep(ms).then(() => ({ settled: false }))]);
async function waitFor(fn, ms) { const end = Date.now() + ms; for (;;) { const v = fn(); if (v || Date.now() > end) return v; await sleep(200); } }

test('T9 pre-check: the hanging tree carries M at every level', async () => {
  const M = newMarker();
  const child = spawn(GIT, ['-c', `alias.fshang=!sleep 30.${M}`, 'fshang'], { cwd: repo, windowsHide: true, stdio: 'ignore' });
  try {
    // win32: the cmd\git.exe launcher (when that is the resolved git), git, the shell and sleep.
    const need = WIN ? (path.basename(path.dirname(GIT)).toLowerCase() === 'cmd' ? 4 : 3) : 2;
    const seen = await waitFor(() => { const c = carrying(M); return c.length >= need ? c : undefined; }, 8000);
    assert.ok(seen, `M is in at least ${need} processes: ${JSON.stringify(carrying(M))}`);
    assert.ok(seen.some((l) => /sleep/.test(l)), 'the sleep leaf carries M');
  } finally { killCarrying(M); child.kill(); }
});

test('T9 (c) precondition, win32: killing only the git process leaves part of the tree running (H3)', { skip: !WIN && 'win32 launcher' }, async () => {
  const M = newMarker();
  const child = spawn(GIT, ['-c', `alias.fshang=!sleep 30.${M}`, 'fshang'], { cwd: repo, windowsHide: true, stdio: 'ignore' });
  await waitFor(() => carrying(M).some((l) => /sleep/.test(l)), 8000);
  process.kill(child.pid);
  await sleep(1500);
  const left = carrying(M);
  killCarrying(M);
  assert.ok(left.length >= 1, `processes survived the launcher kill: ${JSON.stringify(left)}`);
});

test('T9 (a): tryRun with timeoutMs settles timed out and leaves nothing carrying M', async () => {
  const M = newMarker();
  const git = gitSafety.createSafeGit(repo);
  try {
    const r = await within(git.tryRun(repo, ['-c', `alias.fshang=!sleep 30.${M}`, 'fshang'], { timeoutMs: 1500 }), 5000);
    assert.equal(r.settled, true, 'tryRun settled within 5 s');
    assert.equal(r.v.timedOut, true);
    assert.equal(r.v.code, null);
    await sleep(2000);
    assert.deepEqual(carrying(M), [], 'no process carries M');
  } finally { killCarrying(M); git.dispose(); }
});

test('T9 (b): a timed-out evidence-source read kills its git tree', async () => {
  const M = newMarker();
  const orig = gitSafety.createSafeGit;
  gitSafety.createSafeGit = (root) => {
    const g = orig(root);
    return { ...g, tryRun: (cwd, args, opts) => g.tryRun(cwd, args.includes('version') ? ['-c', `alias.fshang=!sleep 30.${M}`, 'fshang'] : args, opts), run: g.run, dispose: g.dispose };
  };
  try {
    const { createWorkspaceEvidenceSource } = require(path.join(OUT, 'integrations', 'shield-receipts', 'workspace-evidence-source.js'));
    const src = createWorkspaceEvidenceSource(repo, { gitTimeoutMs: 1500 });
    const r = await within(src.source.headSha().then(() => 'resolved', (e) => e), 5000);
    assert.equal(r.settled, true, 'the read settled within 5 s');
    assert.match(String(r.v && r.v.message), /git read timed out/);
    await sleep(2000);
    assert.deepEqual(carrying(M), [], 'no process carries M');
    src.dispose();
  } finally { gitSafety.createSafeGit = orig; killCarrying(M); }
});

test('T9 (d) precondition (no timeout): git exits while a background sleep keeps its output open', async () => {
  const M = newMarker();
  let closed = false;
  const child = spawn(GIT, ['-c', `alias.bg=!sleep 30.${M} & exit 0`, 'bg'], { cwd: repo, windowsHide: true });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  child.on('close', () => { closed = true; });
  await sleep(1500);
  try {
    assert.equal(child.exitCode, 0, 'git has exited');
    assert.equal(closed, false, 'close has not arrived, so a timer would fire after exit');
  } finally { killCarrying(M); }
});

test('T9 (d): the live check: an exited git is not killed, and the read still settles timed out', async () => {
  const M = newMarker();
  let calls = 0;
  const orig = killTree && killTree.killProcessTree;
  if (killTree) killTree.killProcessTree = (...a) => { calls++; return orig(...a); };
  const git = gitSafety.createSafeGit(repo);
  try {
    const r = await within(git.tryRun(repo, ['-c', `alias.bg=!sleep 30.${M} & exit 0`, 'bg'], { timeoutMs: 1500 }), 3000);
    assert.equal(r.settled, true, 'tryRun settled within 3 s');
    assert.equal(r.v.timedOut, true);
    assert.equal(r.v.code, null, 'settled by the timeout, not by close');
    assert.equal(calls, 0, 'no kill: git had already exited');
  } finally { if (killTree) killTree.killProcessTree = orig; killCarrying(M); git.dispose(); }
});
