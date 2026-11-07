// removeTempTree: deletes a test's temp folder without following links. Windows read-only
// files (git objects) must not block the delete (Node 24.21+ rmSync fails with EPERM on them),
// and making them writable must never reach a file outside the tree through a hard link.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeTempTree } = require('./removeTempTree.cjs');

const mk = (prefix) => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

test('a tree holding a read-only file (git object shape) is removed', () => {
  const dir = mk('rtt-ro-');
  fs.mkdirSync(path.join(dir, '.git', 'objects', 'ab'), { recursive: true });
  const obj = path.join(dir, '.git', 'objects', 'ab', 'cdef');
  fs.writeFileSync(obj, 'blob');
  fs.chmodSync(obj, 0o444);
  removeTempTree(dir);
  assert.equal(fs.existsSync(dir), false);
});

test('a hard link in the tree does not make the outside file writable', (t) => {
  const outsideDir = mk('rtt-outside-');
  const outside = path.join(outsideDir, 'victim.txt');
  fs.writeFileSync(outside, 'untouched');
  fs.chmodSync(outside, 0o444);
  const dir = mk('rtt-hl-');
  try {
    fs.linkSync(outside, path.join(dir, 'hl.txt'));
  } catch (e) {
    t.skip(`hard links unavailable here: ${e.code}`);
    fs.chmodSync(outside, 0o666); fs.rmSync(outsideDir, { recursive: true, force: true });
    return;
  }
  try { removeTempTree(dir); } catch { /* a read-only hard link may stay; the outside file is what matters */ }
  assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched');
  if (process.platform === 'win32') {
    assert.equal(fs.statSync(outside).mode & 0o200, 0, 'the outside file is still read-only');
  }
  for (const d of [dir, outsideDir]) {
    for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) fs.chmodSync(path.join(d, f), 0o666);
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a link to an outside folder is removed as a link; the outside folder survives', () => {
  const outside = mk('rtt-target-');
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  const dir = mk('rtt-link-');
  fs.symlinkSync(outside, path.join(dir, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  removeTempTree(dir);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  fs.rmSync(outside, { recursive: true, force: true });
});
