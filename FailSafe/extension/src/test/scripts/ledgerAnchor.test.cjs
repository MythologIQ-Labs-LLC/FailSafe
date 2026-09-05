/**
 * FX946 — the ledger anchor is DECLARED, so tolerance stops ratcheting
 * (#233 Scope D).
 *
 * Upstream `verify_post_anchor` auto-detects its boundary as `max(ok_entries)`
 * — the newest entry that verifies. Every seal appends a valid entry, that
 * entry becomes the boundary, and the entire preceding history falls into the
 * tolerated region. Measured before this suite was written: corrupting the
 * chain hash of entry #500 returns `rc=0` with ZERO failures, while corrupting
 * the newest entry is caught. The protected surface was one entry deep.
 *
 * Assertion 1 is the whole finding. It fails today against auto-detect and
 * passes only because a declared anchor is being used.
 *
 * No assertion mutates docs/META_LEDGER.md — every one runs on a temp copy.
 *
 * Runs standalone: node --test src/test/scripts/ledgerAnchor.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readDeclaredAnchor, runPostAnchor, countProtected, PINNED_ANCHOR, AnchorError,
} = require('../../../scripts/check-ledger-anchor.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const LEDGER = path.join(REPO_ROOT, 'docs', 'META_LEDGER.md');

/** A temp copy of the live ledger, optionally with one chain hash corrupted. */
function ledgerCopy(corruptChainHashOf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-anchor-'));
  let text = fs.readFileSync(LEDGER, 'utf8');
  if (corruptChainHashOf !== undefined) {
    const hash = chainHashOfEntry(text, corruptChainHashOf);
    assert.ok(hash, `entry #${corruptChainHashOf} has no chain hash to corrupt`);
    const before = text;
    text = text.replace(hash, '0'.repeat(64));
    assert.notEqual(text, before, 'corruption did not apply — the fixture would prove nothing');
  }
  const p = path.join(dir, 'META_LEDGER.md');
  fs.writeFileSync(p, text, 'utf8');
  return p;
}

/** The `**Chain Hash**` value of one entry, read from its own span. */
function chainHashOfEntry(text, num) {
  const start = text.indexOf(`### Entry #${num}:`);
  if (start < 0) return null;
  const next = text.indexOf('### Entry #', start + 1);
  const body = text.slice(start, next < 0 ? text.length : next);
  const m = /\*\*Chain Hash[^*]*\*\*[^`]*`([0-9a-f]{64})`/.exec(body);
  return m ? m[1] : null;
}

const TOOLKIT = (() => {
  const { spawnSync } = require('child_process');
  const py = process.env.QOR_LOGIC_PYTHON || 'python';
  const r = spawnSync(py, ['-c', 'import qor.scripts.ledger_hash'], { shell: false });
  return !r.error && r.status === 0;
})();

function needToolkit(t) {
  if (!TOOLKIT) {
    t.skip('qor.scripts.ledger_hash not importable — install qor-logic to run the anchor guard');
    return true;
  }
  return false;
}

describe('FX946 declared ledger anchor', () => {
  it('FAILS on a tampered entry ABOVE the declared anchor', (t) => {
    if (needToolkit(t)) return;
    // THE FINDING. Entry #500 is above the declared anchor (340). Under
    // upstream's auto-detected boundary this same mutation returns rc=0 with
    // zero failures — the ledger's tamper-evidence, absent. If this ever
    // passes again, the ratchet is back.
    const tampered = ledgerCopy(500);
    const declared = runPostAnchor(tampered, PINNED_ANCHOR);
    assert.notEqual(declared.code, 0, 'a tampered post-anchor entry must fail');
    assert.match(declared.output, /FAIL Entry #500/,
      'the failure must name the entry that was altered');

    // And the contrast that makes the assertion mean something: the SAME
    // fixture under auto-detect is silent. Without this the test could pass
    // for reasons unrelated to the anchor.
    const auto = runPostAnchor(tampered, null);
    assert.equal(auto.code, 0,
      'baseline check: auto-detect is expected to miss this — if it now catches it, ' +
      'upstream changed and this suite needs rereading, not adjusting');
  });

  it('TOLERATES a tampered entry at or below the declared anchor', (t) => {
    if (needToolkit(t)) return;
    // The other direction. Pre-anchor residue is disclosed, dated debt: 94
    // entries already fail at anchor 236. Fail-closing over the whole history
    // would block every seal, which is why verify() was not adopted.
    // #339 rather than an arbitrary low number: most pre-anchor entries are
    // placeholder-hash residue with nothing to corrupt (the fixture guard in
    // ledgerCopy caught exactly that on a first attempt at #300). Only 15
    // pre-anchor entries carry a real 64-hex chain hash.
    const tampered = ledgerCopy(339);
    const res = runPostAnchor(tampered, PINNED_ANCHOR);
    assert.equal(res.code, 0, `a pre-anchor failure must stay tolerated:\n${res.output}`);
  });

  it('ERRORS on an absent declaration instead of falling back to auto-detect', () => {
    // Without this, deleting one config key silently restores the one-entry-deep
    // behaviour while every gate still reports clean — this fix un-shipping
    // itself, invisibly.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-anchor-cfg-'));
    fs.mkdirSync(path.join(dir, '.qorlogic'));
    fs.writeFileSync(path.join(dir, '.qorlogic', 'config.json'), JSON.stringify({}), 'utf8');
    assert.throws(() => readDeclaredAnchor(dir), AnchorError,
      'an absent ledger_anchor must be an error, never boundary_entry=null');

    // A non-integer is equally unusable, and is the injection surface the audit
    // bound: the value reaches a python invocation, so it is validated here.
    fs.writeFileSync(
      path.join(dir, '.qorlogic', 'config.json'),
      JSON.stringify({ ledger_anchor: { entry: '340; import os', reason: 'x'.repeat(60) } }),
      'utf8',
    );
    assert.throws(() => readDeclaredAnchor(dir), AnchorError,
      'a non-integer anchor must be rejected before it reaches python');
  });

  it('pins the declared anchor to its measured value', () => {
    // Anti-ratchet, and it does not decay. A threshold on the protected COUNT
    // would weaken as the ledger grows (at head #1000 an anchor of #800 leaves
    // exactly 200 and would pass while dropping 460 entries). A pinned value
    // makes any bump a deliberate, reviewed edit.
    const declared = readDeclaredAnchor(REPO_ROOT);
    assert.equal(declared.entry, PINNED_ANCHOR,
      'the anchor moved; if that is intended, update PINNED_ANCHOR and the ' +
      'declaration reason together, with fresh measurements');
    assert.ok(declared.reason.length >= 50, 'the declaration must carry a real justification');
  });

  it('leaves a non-empty protected surface, and reports its size', () => {
    // The direct anti-vacuity check. An anchor at or above the head protects
    // nothing — precisely the control this replaces.
    const protectedCount = countProtected(LEDGER, PINNED_ANCHOR);
    assert.ok(protectedCount > 0,
      `the declared anchor protects ${protectedCount} entries — an anchor with ` +
      'nothing above it verifies nothing');
    // Reported rather than implied, so the number stays visible in test output.
    assert.equal(typeof protectedCount, 'number');
    console.log(`      [FX946] protected surface: ${protectedCount} entries above #${PINNED_ANCHOR}`);
  });

  it('does not mutate the live ledger', () => {
    // Cheap, and the suite writes fixtures for a living.
    const before = fs.statSync(LEDGER).size;
    ledgerCopy(500);
    assert.equal(fs.statSync(LEDGER).size, before, 'docs/META_LEDGER.md must be untouched');
  });
});
