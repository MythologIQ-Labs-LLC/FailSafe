'use strict';
// Unit test for src/test/testHomeGuard.cjs (#591 follow-up): a non-isolated home is
// redirected to a fresh disposable folder and flagged; an isolated one is left alone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { guardTestHome, isIsolatedHome, FIRED_ENV } = require('../testHomeGuard.cjs');
const { removeTempTree } = require('./removeTempTree.cjs');

function withHome(home, fn) {
  const saved = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = home; process.env.HOME = home;
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('a real-looking profile home is redirected to a disposable folder and flagged', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'not-isolated-profile-'));
  try {
    const env = {};
    const r = withHome(fake, () => guardTestHome(env));
    assert.equal(r.fired, true);
    assert.equal(env[FIRED_ENV], '1');
    assert.equal(env.USERPROFILE, env.HOME);
    assert.match(path.basename(env.USERPROFILE), /^failsafe-vscode-test-home-guard-/);
    assert.ok(isIsolatedHome(env.USERPROFILE, os.tmpdir()));
    assert.equal(fs.readdirSync(fake).length, 0, 'nothing written into the original home');
    removeTempTree(env.USERPROFILE);
  } finally { removeTempTree(fake); }
});

test('an isolated failsafe-vscode-test home is left unchanged and not flagged', () => {
  const iso = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-vscode-test-home-')));
  try {
    const env = {};
    const r = withHome(iso, () => guardTestHome(env));
    assert.equal(r.fired, false);
    assert.deepEqual(env, {});
  } finally { removeTempTree(iso); }
});

test('a lookalike name outside the OS temp folder is not treated as isolated', () => {
  assert.equal(isIsolatedHome(path.resolve('/failsafe-vscode-test-home-x'), os.tmpdir()), false);
});
