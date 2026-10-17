/**
 * The replay-nonce store refuses a store folder that is a link or resolves
 * outside the workspace (plan-v608-integration LD11), at construction, on every
 * read and transaction, and before every marker operation, so a repository
 * that commits `.failsafe` or `.failsafe/security` as a link cannot send
 * nonces.json, its lock, temp and queue files or the markers anywhere else.
 * Runs the compiled guard under plain node (no vscode import).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const outDir = path.join(__dirname, '..', '..', '..', 'out');
const { SecurityReplayGuard } = require(path.join(outDir, 'governance', 'SecurityReplayGuard.js'));
const { NonceMarkers, NonceMarkerDirError } = require(path.join(outDir, 'governance', 'nonceMarkers.js'));
const { checkNonceStoreDir } = (() => {
  try { return require(path.join(outDir, 'governance', 'nonceStoreDir.js')); } catch { return {}; }
})();

const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';
const RECOVERY = /Nonce store unavailable: fail-closed persistence state \(.*(\.failsafe|security).* is a link or not a folder\)/;
const made = [];

function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
}

function link(target, at) {
  fs.symlinkSync(target, at, LINK_TYPE);
  assert.ok(fs.lstatSync(at).isSymbolicLink(), `precondition: ${at} is a link`);
}

/** Every file and folder under `dir`, relative, sorted. */
function tree(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(r);
      if (e.isDirectory()) walk(path.join(d, e.name), r);
    }
  };
  walk(dir, '');
  return out.sort();
}

function guard(rootOrDir, options = {}) {
  const g = new SecurityReplayGuard(rootOrDir, { cleanupIntervalMs: 3_600_000, ...options });
  made.push({ dispose: () => g.dispose() });
  return g;
}

/** generate refuses, validate and consume give persistence_error, cleanup touches nothing. */
function assertRefusesEverything(g) {
  assert.throws(() => g.generateNonce(), /Nonce store unavailable/);
  const fake = 'a'.repeat(64);
  assert.equal(g.validateNonce(fake).reason, 'persistence_error');
  assert.equal(g.consumeNonce(fake).reason, 'persistence_error');
  try { g.cleanup?.(); } catch { /* a refusal is fine; the outside check is what counts */ }
}

test.after(() => {
  for (const m of made.reverse()) {
    if (typeof m === 'string') { try { fs.rmSync(m, { recursive: true, force: true }); } catch { /* best effort */ } }
    else m.dispose();
  }
});

test('LD11 (i) a link at .failsafe/security before construction: nothing is written outside', () => {
  const root = tmp('nsd-i-');
  const outside = tmp('nsd-i-out-');
  fs.mkdirSync(path.join(root, '.failsafe'));
  link(outside, path.join(root, '.failsafe', 'security'));
  const g = guard(root);
  assertRefusesEverything(g);
  assert.deepEqual(tree(outside), [], 'the outside folder stays empty');
});

test('LD11 (ii) a link at .failsafe before construction (outside has no security/): nothing is written outside', () => {
  const root = tmp('nsd-ii-');
  const outside = tmp('nsd-ii-out-');
  link(outside, path.join(root, '.failsafe'));
  const g = guard(root);
  assertRefusesEverything(g);
  assert.deepEqual(tree(outside), [], 'the outside folder stays empty (no security/ created there)');
});

test('LD11 (iii) a link swapped in after construction: generate first, nothing reaches the outside folder', () => {
  const root = tmp('nsd-iii-');
  const outside = tmp('nsd-iii-out-');
  fs.mkdirSync(path.join(outside, 'security'));
  const g = guard(root);
  g.generateNonce();
  fs.renameSync(path.join(root, '.failsafe'), path.join(root, '.failsafe.real'));
  link(outside, path.join(root, '.failsafe'));
  assert.throws(() => g.generateNonce(), /Nonce store unavailable|is a link or not a folder/);
  assert.deepEqual(tree(outside), ['security'], 'nothing was written into the outside security folder');
  assert.equal(g.validateNonce('b'.repeat(64)).reason, 'persistence_error');
  assert.equal(g.consumeNonce('b'.repeat(64)).reason, 'persistence_error');
  assert.deepEqual(tree(outside), ['security'], 'still nothing written outside');
});

test('LD11 (iv) explicit security-dir constructor form with a linked .failsafe: nothing is written outside', () => {
  const root = tmp('nsd-iv-');
  const outside = tmp('nsd-iv-out-');
  link(outside, path.join(root, '.failsafe'));
  const g = guard(path.join(root, '.failsafe', 'security'));
  assertRefusesEverything(g);
  assert.deepEqual(tree(outside), [], 'the outside folder stays empty');
});

test('LD11 (v) real folders work as before', () => {
  const root = tmp('nsd-v-');
  const g = guard(root);
  const n = g.generateNonce();
  assert.equal(g.validateNonce(n).valid, true);
  assert.equal(g.consumeNonce(n).valid, true);
  assert.equal(g.consumeNonce(n).reason, 'already_used');
  assert.ok(fs.existsSync(path.join(root, '.failsafe', 'security', 'nonces.json')));
});

test('LD11 (vi) the marker sweep runs the store-folder walk: an outside expired marker survives', () => {
  assert.equal(typeof checkNonceStoreDir, 'function', 'checkNonceStoreDir exists (nonceStoreDir.js)');
  const root = tmp('nsd-vi-');
  const outside = tmp('nsd-vi-out-');
  const outsideMarkers = path.join(outside, 'security', 'nonces.consumed');
  fs.mkdirSync(outsideMarkers, { recursive: true });
  const marker = path.join(outsideMarkers, 'c'.repeat(64));
  fs.writeFileSync(marker, JSON.stringify({ expiresAt: 1 }));
  link(outside, path.join(root, '.failsafe'));
  const storeDir = path.join(root, '.failsafe', 'security');
  const markers = new NonceMarkers(path.join(storeDir, 'nonces.consumed'), {}, (create) => checkNonceStoreDir(storeDir, create));
  assert.throws(() => markers.sweep(Date.now() + 10 * 3_600_000), (e) => e instanceof NonceMarkerDirError);
  assert.ok(fs.existsSync(marker), 'the outside expired marker was not deleted');
});

test('LD11 (vii) a link appearing between cleanup\'s transaction and its sweep disables the guard', () => {
  const root = tmp('nsd-vii-');
  const outside = tmp('nsd-vii-out-');
  fs.mkdirSync(path.join(outside, 'security', 'nonces.consumed'), { recursive: true });
  let calls = 0;
  let counting = false;
  const fsf = path.join(root, '.failsafe');
  const real = path.join(root, '.failsafe.real');
  const clock = () => {
    if (counting && ++calls === 2) {
      // Second clock call of cleanup(): inside its change, after every transaction walk.
      fs.renameSync(fsf, real);
      link(outside, fsf);
    }
    return Date.now();
  };
  const g = guard(root, { seams: { clock } });
  g.generateNonce(); // one live record, so cleanup's change calls expired() once
  counting = true;
  try { g.cleanup(); } catch { /* the sweep's refusal is not rethrown */ }
  counting = false;
  assert.equal(calls, 2, 'precondition: cleanup called the clock exactly twice');
  fs.rmSync(fsf, { force: true, recursive: false });
  try { fs.rmdirSync(fsf); } catch { /* the junction itself */ }
  fs.renameSync(real, fsf);
  assert.ok(!fs.lstatSync(fsf).isSymbolicLink(), 'precondition: the real .failsafe is back');
  assert.throws(() => g.generateNonce(), RECOVERY, 'the guard stays disabled, naming the folder');
});
