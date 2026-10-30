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
  readDeclaredAnchor, runPostAnchor, countProtected, verifyEpoch, EPOCH, PINNED_ANCHOR, AnchorError,
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
    // THE FINDING. Entry #500 is above the declared anchor (382). Under
    // upstream's auto-detected boundary this same mutation returns rc=0 with
    // zero failures — the ledger's tamper-evidence, absent. If this ever
    // passes again, the ratchet is back.
    const tampered = ledgerCopy(500);
    const declared = runPostAnchor(tampered, PINNED_ANCHOR);
    assert.notEqual(declared.code, 0, 'a tampered post-anchor entry must fail');
    assert.match(declared.output, /FAIL Entry #500/,
      'the failure must name the entry that was altered');

    // The contrast. When this suite was written, upstream auto-detect was silent
    // on this fixture (rc=0, the one-entry-deep ratchet). Reread on 2026-10-29
    // against the pinned qor-logic 0.176.1 (#467): upstream now refuses to pick a
    // boundary at all on a ledger that is not clean ("no boundary declared"), even
    // untampered, so auto-detect is no longer a silent pass but no gate either.
    // Either way the declared boundary is what makes the check usable.
    const auto = runPostAnchor(tampered, null);
    assert.notEqual(auto.code, 0, 'auto-detect must not report this ledger clean');
    assert.match(auto.output, /no boundary declared/,
      'upstream behaviour changed again; reread this suite rather than adjusting it');
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

  // #467 epoch. The controls are code constants (EPOCH) because nothing natively
  // recomputes an entry's content hash from its body; each attack below was shown
  // by the independent audit to pass native verification on its own.
  function variant(mutate) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-anchor-epoch-'));
    const p = path.join(dir, 'META_LEDGER.md');
    fs.writeFileSync(p, mutate(fs.readFileSync(LEDGER, 'utf8').replace(/\r\n/g, '\n')), 'utf8');
    return p;
  }
  const entrySpan = (text, num) => {
    const start = text.indexOf(`### Entry #${num}:`);
    assert.ok(start >= 0, `entry #${num} exists`);
    const next = text.indexOf('### Entry #', start + 1);
    return [start, next < 0 ? text.length : next];
  };

  it('#467: the epoch holds on the live ledger', () => {
    const res = verifyEpoch(LEDGER, PINNED_ANCHOR);
    assert.equal(res.ok, true, res.message);
    assert.equal(EPOCH.entry, 914);
  });

  it('#467: FAILS an edit inside the disclosed band, which native verification alone tolerates', (t) => {
    const p = variant((s) => s.replace('### Entry #339:', '### Entry #339: (edited)'));
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /prefix pin mismatch/);
    if (needToolkit(t)) return;
    assert.equal(runPostAnchor(p, PINNED_ANCHOR).code, 0, 'contrast: native verification does not see this edit');
  });

  it('#467: FAILS an edit in the band even when the Prefix Pin text in #914 is rewritten to match (audit e1)', () => {
    const p = variant((s) => {
      const edited = s.replace('### Entry #350:', '### Entry #350: (edited)');
      const end = edited.indexOf('### Entry #383:');
      const prefix = Buffer.from(edited.slice(0, end), 'utf8');
      const sum = require('crypto').createHash('sha256').update(prefix).digest('hex');
      return edited.replace(/(\*\*Prefix Pin\*\*: sha256 `)[0-9a-f]{64}(` over the first )\d+/, `$1${sum}$2${prefix.length}`);
    });
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false, 'the pin lives in reviewed code, not in ledger text');
    assert.match(res.message, /prefix pin mismatch/);
  });

  it('#467: FAILS when the body of #914 is rewritten (audit e3)', () => {
    const p = variant((s) => s.replace('History is kept byte-for-byte.', 'History is kept.'));
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /content changed/);
  });

  it('#467: FAILS a deletion above the anchor masked by a low-numbered decoy entry (audit e2)', () => {
    const p = variant((s) => {
      const [a, b] = entrySpan(s, 600);
      return s.slice(0, a) + '### Entry #200: note\n\nplaceholder\n\n---\n\n' + s.slice(b);
    });
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /numbered at or below #382 after the pinned band: #200/);
  });

  it('#467: FAILS a low-numbered entry appended at the end of the ledger', () => {
    const p = variant((s) => `${s}\n### Entry #100: appended\n\nnote\n`);
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /#100/);
  });

  it('#467: FAILS a deletion above the anchor masked by a decoy written in non-ASCII digits (re-audit N1)', () => {
    // Native ENTRY_RE (Python) reads U+0662 U+0660 U+0660 and U+FF12 U+FF10 U+FF10 as 200.
    for (const digits of ['٢٠٠', '２００']) {
      const p = variant((s) => {
        const [a, b] = entrySpan(s, 600);
        return s.slice(0, a) + `### Entry #${digits}: note\n\nplaceholder\n\n---\n\n` + s.slice(b);
      });
      const res = verifyEpoch(p, PINNED_ANCHOR);
      assert.equal(res.ok, false, `decoy ${JSON.stringify(digits)} must be refused`);
      assert.match(res.message, /non-ASCII digits/);
    }
  });

  it('#467: FAILS a consistent chain rewrite up to the epoch entry (re-audit Q4)', () => {
    // Stand-in for "delete an entry above #382 and recompute every later hash":
    // #913's chain hash changes and #914 is re-linked consistently, so the link
    // arithmetic still holds. Only the pinned #914 chain hash can catch it.
    const p = variant((s) => {
      const crypto = require('crypto');
      const h = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
      const forgedPrev = h('rewritten history');
      const [a913, b913] = entrySpan(s, 913);
      const e913 = s.slice(a913, b913).replace(/(\*\*Chain Hash \(Merkle seal\)\*\*: `)[0-9a-f]{64}/, `$1${forgedPrev}`);
      const s2 = s.slice(0, a913) + e913 + s.slice(b913);
      const [a914, b914] = entrySpan(s2, 914);
      const e914 = s2.slice(a914, b914)
        .replace(/(\*\*Previous Hash\*\*: `)[0-9a-f]{64}/, `$1${forgedPrev}`)
        .replace(/(\*\*Chain Hash \(Merkle seal\)\*\*: `)[0-9a-f]{64}/, `$1${h(`${EPOCH.contentSha256}|${forgedPrev}`)}`);
      return s2.slice(0, a914) + e914 + s2.slice(b914);
    });
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /not the pinned/);
  });

  it('#467: FAILS text appended after the epoch entry closing rule (re-audit N8)', () => {
    const p = variant((s) => {
      const [, b] = entrySpan(s, 914);
      return s.slice(0, b) + '**Decision**: forged addendum\n' + s.slice(b);
    });
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /text after its closing rule/);
  });

  it('#467: FAILS when the epoch entry is missing or duplicated', () => {
    const missing = variant((s) => s.replace('### Entry #914:', '### Entry #9140:'));
    assert.match(verifyEpoch(missing, PINNED_ANCHOR).message, /exactly one Entry #914, found 0/);
    const dup = variant((s) => { const [a, b] = entrySpan(s, 914); return s + '\n' + s.slice(a, b); });
    assert.match(verifyEpoch(dup, PINNED_ANCHOR).message, /exactly one Entry #914, found 2/);
  });

  it('#467 G3: FAILS when the reconciled-entry set is anything but #397, #401', () => {
    const p = variant((s) => s.replace('**Reconciled Entries**: #397, #401', '**Reconciled Entries**: #397, #401, #600'));
    const res = verifyEpoch(p, PINNED_ANCHOR);
    assert.equal(res.ok, false);
    assert.match(res.message, /reconciled-entry set must be exactly #397, #401, found #397, #401, #600/);
  });

  it('#467: FAILS when a disclosed entry is deleted', () => {
    const p = variant((s) => { const [a, b] = entrySpan(s, 360); return s.slice(0, a) + s.slice(b); });
    assert.equal(verifyEpoch(p, PINNED_ANCHOR).ok, false);
  });

  it('#467: refuses a native boundary that disagrees with the consumer anchor', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-anchor-cfg-'));
    fs.mkdirSync(path.join(dir, '.qorlogic'));
    const write = (cfg) => fs.writeFileSync(path.join(dir, '.qorlogic', 'config.json'), JSON.stringify(cfg), 'utf8');
    const anchor = { entry: PINNED_ANCHOR, reason: 'x'.repeat(60) };
    write({ ledger_anchor: anchor });
    assert.throws(() => readDeclaredAnchor(dir), /post_anchor_boundary/, 'a missing native boundary is refused');
    write({ ledger_anchor: anchor, ledger: { post_anchor_boundary: 340 } });
    assert.throws(() => readDeclaredAnchor(dir), /must equal/, 'a mismatched native boundary is refused');
    write({ ledger_anchor: anchor, ledger: { post_anchor_boundary: PINNED_ANCHOR } });
    assert.equal(readDeclaredAnchor(dir).entry, PINNED_ANCHOR);
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
