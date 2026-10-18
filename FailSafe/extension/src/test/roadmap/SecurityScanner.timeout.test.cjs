/**
 * Scanner timeout kills the whole process tree (#538 lane C, plan LD3, row S7).
 *
 * The child is a real git whose shell alias starts sh, which starts sleep, so
 * the tree is git -> sh -> sleep. sleep never reads stdin, so closing the pipes
 * cannot end it: only killing the tree can. The row finds the leaf (sleep) and
 * checks that it is gone after the run settles timed out.
 *  - POSIX: the alias prints the shell's pid and execs sleep into it.
 *  - win32: MSYS pids are not Windows pids, so the leaf is found by its unique
 *    sleep duration in the process list (CIM, through absolute System32
 *    PowerShell). A foreground MSYS sleep is a Windows child of sh, so taskkill
 *    /T reaches it; a plain kill of git leaves sh and sleep running.
 *
 * Runs standalone after `npm run compile`: node --test src/test/roadmap/SecurityScanner.timeout.test.cjs
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { removeTempTree } = require('../shared/removeTempTree.cjs');

const OUT = path.resolve(__dirname, '..', '..', '..', 'out');
const scanner = require(path.join(OUT, 'roadmap', 'services', 'SecurityScanner.js'));
const { configureTrustedGit } = require(path.join(OUT, 'shared', 'git', 'trustedGit.js'));

const WIN = process.platform === 'win32';
const made = [];
after(() => { for (const d of made.splice(0)) removeTempTree(d); });
configureTrustedGit({ workspaceDirs: [] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}
function powershell() {
  const root = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}
/** win32: Windows pids of the sleep processes whose command line carries `marker`. */
function sleepPids(marker) {
  const cmd = `Get-CimInstance Win32_Process -Filter "Name='sleep.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' } | ForEach-Object { $_.ProcessId }`;
  return new Promise((resolve) => {
    execFile(powershell(), ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      resolve(err ? [] : String(stdout).split(/\r?\n/).map((l) => parseInt(l.trim(), 10)).filter(Number.isInteger));
    });
  });
}
async function goneWithin(pids, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (pids.every((p) => !alive(p))) return true;
    await sleep(100);
  }
  return pids.every((p) => !alive(p));
}

test('S7: a timed-out scanner run settles at once, and the whole process tree is gone', async () => {
  assert.equal(typeof scanner.runScannerCommand, 'function', 'runScannerCommand is exported');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fsscan-s7-'));
  made.push(cwd);
  const marker = `31.${String(process.pid).slice(-4)}${Date.now() % 100000}`;
  const alias = WIN ? `!sleep ${marker}` : `!echo $$; exec sleep ${marker}`;
  const timeoutMs = WIN ? 4000 : 1500;
  const started = Date.now();
  const run = scanner.runScannerCommand('git', ['-c', `alias.fshang=${alias}`, 'fshang'], cwd, timeoutMs);
  let leaves = [];
  if (WIN) {
    await sleep(1500);
    leaves = await sleepPids(marker);
    assert.ok(leaves.length >= 1, `precondition: the sleep leaf is running before the timeout (found ${leaves.length})`);
  }
  const r = await run;
  assert.equal(r.timedOut, true, 'settled as timed out');
  assert.ok(Date.now() - started < timeoutMs + 5000, 'settled without waiting for the tree');
  assert.equal(typeof r.pid, 'number', 'the child pid is reported');
  if (!WIN) {
    const leaf = parseInt(String(r.stdout).trim().split(/\r?\n/)[0], 10);
    assert.ok(Number.isInteger(leaf) && leaf > 0, `the leaf pid was printed (${JSON.stringify(r.stdout)})`);
    leaves = [leaf];
  }
  const gone = await goneWithin(leaves, 5000);
  for (const p of leaves) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  assert.equal(gone, true, `the leaf ${leaves.join(',')} is gone within 5 s of the timeout`);
});

test('S7 (b): a run that exits normally settles with its exit code and is not timed out', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fsscan-s7b-'));
  made.push(cwd);
  const r = await scanner.runScannerCommand('git', ['--version'], cwd, 10000);
  assert.equal(r.code, 0);
  assert.notEqual(r.timedOut, true);
  assert.match(r.stdout, /git version/);
});
