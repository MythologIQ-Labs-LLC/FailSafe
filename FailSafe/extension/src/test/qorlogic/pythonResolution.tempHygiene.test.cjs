/**
 * Temp hygiene of the planted-Python suite (v6.0.8 integration LD20).
 *
 * pythonResolution.adversarial.test.cjs creates about 0.8 GB under the temp
 * folder on every run, including two junctions into the real Python install.
 * This row runs that suite in a child whose TEMP, TMP and TMPDIR point at a
 * fresh empty folder, requires all 15 tests to run, and then requires the
 * folder to be empty again.
 *
 * Runs after `npm run compile`: node --test src/test/qorlogic/pythonResolution.tempHygiene.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WIN = process.platform === 'win32';
const SUITE = path.join(__dirname, 'pythonResolution.adversarial.test.cjs');
const EXT = path.resolve(__dirname, '..', '..', '..');

/** The real Python install folder, found from a clean temp folder that is removed again. */
function baseInterpreter() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fspyhyg-find-'));
  try {
    for (const [cmd, pre] of [['py', ['-3']], ['python3', []], ['python', []]]) {
      const r = spawnSync(cmd, [...pre, '-c', 'import sys;print(getattr(sys, "_base_executable", sys.executable))'], { cwd, encoding: 'utf8' });
      const exe = (r.stdout || '').trim();
      if (r.status === 0 && path.isAbsolute(exe)) return exe;
    }
  } finally { fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 5 }); }
  throw new Error('a real Python is required');
}

/** Unlink every link under dir without following it, so the delete after it never walks into a link target. */
function unlinkLinks(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) fs.unlinkSync(p);
    else if (st.isDirectory()) unlinkLinks(p);
  }
}

test('LD20: the planted-Python suite runs all 15 tests and leaves its temp folder empty', () => {
  const basePy = baseInterpreter();
  const fresh = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fspyhyg-')));
  try {
    const env = { ...process.env, TEMP: fresh, TMP: fresh, TMPDIR: fresh };
    delete env.NODE_TEST_CONTEXT; // the child reports its own counts, not through this runner
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', SUITE], { cwd: EXT, env, encoding: 'utf8', timeout: 600_000 });
    const out = `${r.stdout}\n${r.stderr}`;
    const count = (k) => Number((new RegExp(`^# ${k} (\\d+)$`, 'm').exec(out) || [])[1]);
    assert.equal(r.status, 0, `the suite passed: ${out.slice(-2000)}`);
    assert.equal(count('tests'), 15, 'all 15 tests ran');
    assert.equal(count('fail'), 0);
    // LD22: exact counts per platform; the POSIX positive control must really run on POSIX.
    const control = (/^ok \d+ - T13 POSIX positive control(.*)$/m.exec(out) || [])[1];
    assert.notEqual(control, undefined, 'the positive-control row reported ok');
    if (WIN) {
      assert.equal(count('pass'), 14, '14 passed on win32');
      assert.equal(count('skipped'), 1, 'only the POSIX positive control skipped on win32');
      assert.match(control, /# SKIP/, 'skipped on win32');
    } else {
      assert.equal(count('pass'), 13, '13 passed on POSIX');
      assert.equal(count('skipped'), 2, 'only (c) and (h) skipped on POSIX');
      assert.doesNotMatch(control, /# SKIP/, 'the positive control ran on POSIX');
    }
    assert.deepEqual(fs.readdirSync(fresh), [], 'the suite left nothing in its temp folder');
  } finally {
    // If the child died before its after(), unlink any junction it left before deleting the folder.
    try { unlinkLinks(fresh); } finally { fs.rmSync(fresh, { recursive: true, force: true, maxRetries: 5 }); }
    // Safety net only: the real Python install is untouched.
    assert.ok(fs.existsSync(path.dirname(basePy)), 'the Python install folder still exists');
    assert.ok(fs.existsSync(basePy), 'the Python interpreter still exists');
  }
});
