/**
 * Workspace-folder set for the trusted git resolver (plan-v607-final-integration
 * Phase 2, T-o2). On a folder change the excluded set is the union of the
 * activation-time root and the current folders, never a replacement: FailSafe
 * stays bound to the activation root until reload.
 *
 * Runs standalone after `npm run compile`: node --test src/test/shared/git/workspaceDirs.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.resolve(__dirname, '..', '..', '..', '..', 'out');
const { workspaceDirsFor, configureTrustedGit, trustedGitPath } = require(path.join(OUT, 'shared', 'git', 'trustedGit.js'));

const WIN = process.platform === 'win32';
const NAME = WIN ? 'git.exe' : 'git';

test('T-o2: union of the activation root and the current folders', () => {
  assert.deepEqual(workspaceDirsFor('/r', ['/a']), ['/r', '/a']);
  assert.deepEqual(workspaceDirsFor('/r', []), ['/r'], 'an empty folder list keeps the activation root');
  assert.deepEqual(workspaceDirsFor(undefined, ['/a']), ['/a']);
  assert.deepEqual(workspaceDirsFor('/r', ['/r', '/a', '/a']), ['/r', '/a'], 'duplicates appear once');
});

for (const platform of ['win32', 'darwin']) {
  test(`T-o2: case-only duplicates appear once on ${platform}`, () => {
    assert.deepEqual(workspaceDirsFor('/Work/R', ['/work/r', '/A'], platform), ['/Work/R', '/A']);
  });
}

test('T-o2: case-distinct folders stay distinct on linux', () => {
  assert.deepEqual(workspaceDirsFor('/Work/R', ['/work/r'], 'linux'), ['/Work/R', '/work/r']);
});

test('T-o2: through the resolver, a plant in the activation root stays excluded after a folder change', () => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsgit-o2-')));
  const R = path.join(base, 'R');
  const A = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fsgit-o2a-'))); // disjoint from R
  const elsewhere = path.join(base, 'elsewhere');
  for (const d of [path.join(R, 'bin'), path.join(base, 'K'), elsewhere]) fs.mkdirSync(d, { recursive: true });
  const plant = path.join(R, 'bin', NAME);
  const K = path.join(base, 'K', NAME);
  for (const f of [plant, K]) { fs.writeFileSync(f, ''); if (!WIN) fs.chmodSync(f, 0o755); }
  const calls = new Map();
  const probe = (real) => { calls.set(real, (calls.get(real) || 0) + 1); return { completed: true, timedOut: false, stdout: 'git version 9.9.9' }; };
  const before = process.cwd();
  process.chdir(elsewhere);
  try {
    configureTrustedGit({
      workspaceDirs: workspaceDirsFor(R, [A]), pathEnv: [path.join(R, 'bin'), path.dirname(K)].join(WIN ? ';' : ':'),
      knownLocations: [], homeDir: base, platform: process.platform, probe,
    });
    assert.equal(trustedGitPath(), fs.realpathSync.native(K), 'the control git wins');
    assert.equal(calls.get(fs.realpathSync.native(plant)) || 0, 0, 'the plant in the activation root is never probed');
  } finally {
    process.chdir(before);
  }
});
