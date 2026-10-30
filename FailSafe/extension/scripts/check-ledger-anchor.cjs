#!/usr/bin/env node
/**
 * FX946 — enforce the DECLARED ledger anchor (#233 Scope D).
 *
 * Upstream `ledger_hash.verify_post_anchor()` auto-detects its tolerance
 * boundary as `max(ok_entries)` — the newest entry that verifies. Since every
 * seal appends a valid entry, that entry becomes the boundary, and the whole
 * preceding history is absorbed into the tolerated region. Measured on the live
 * ledger: corrupting entry #500's chain hash returns rc=0 with ZERO failures,
 * while corrupting the newest entry is caught. The protected surface was one
 * entry deep, under output that reads as a whole-chain attestation.
 *
 * A Merkle ledger that tolerates silent retroactive edits is not providing the
 * property it exists for. This passes a DECLARED boundary instead, so every
 * entry above it is re-verified on every run.
 *
 * Chain arithmetic stays upstream — `verify_post_anchor` already takes
 * `boundary_entry`. This supplies the declaration, validates it, and propagates
 * the exit code unchanged.
 *
 * Usage: node scripts/check-ledger-anchor.cjs [--repo-root <dir>]
 */

'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PY = process.env.QOR_LOGIC_PYTHON || 'python';

/**
 * The declared anchor. Until 2026-10-29 it was 340, the lowest value at which
 * the live ledger then verified clean (236 -> 94 failures, 331 -> 2, 340 -> 0).
 * Native qor-logic 0.176.1 later reported #341 (no canonical hash markup) and
 * #382 (previous-hash link break) above 340; neither can be repaired without
 * rewriting history. By operator decision (#467, ledger entry #914 EPOCH) the
 * anchor moved to 382: every entry above it is chain-verified, and the band at
 * or below it is held byte-exact by reviewed constants (EPOCH, verifyEpoch).
 *
 * Pinned rather than range-checked on purpose. A threshold on the protected
 * COUNT decays as the ledger grows — at head #1000 an anchor of #800 leaves
 * exactly 200 protected and would pass a `>= 200` rule while dropping 460
 * entries out of verification. A guard against a ratchet must not itself be
 * ratchetable, so moving this is a deliberate edit that fails the suite until
 * the declaration and its measurements are updated together.
 */
const PINNED_ANCHOR = 382;

/**
 * #467 epoch controls, held as reviewed constants. They live in code, not in the
 * ledger, because nothing natively recomputes an entry's content hash from its
 * body: a pin stored only in ledger text could be edited together with the band
 * it protects. Changing any of these is a deliberate, reviewed edit.
 */
const EPOCH = Object.freeze({
  entry: 914,
  // sha256 of the LF-normalized ledger bytes before the first entry heading
  // numbered above PINNED_ANCHOR (the #383 heading), and their length.
  prefixSha256: '5b2e18e2c27d14097dfeae0eafd3a122fbe73cc7f2ea08dbefcfb15f89f7cc40',
  prefixBytes: 1051993,
  // #914's self-bound content hash (sha256 of its LF-normalized Decision body).
  contentSha256: '7274699b42615378c2191cac2ab038d743933b5642e3ffab53ffbcc3ee9cb1b1',
  // #914's chain hash. Pinning it anchors #383-#913 to reviewed code as well: a
  // consistent rewrite of the chain from a deleted entry up to #914 changes it.
  // Entries after #914 remain protected only by the native chain (no witness, #467 G4).
  chainSha256: '96500e67bd9bf323d223f11de6097455b658457a40611ddef57ee32772a56f10',
  // #467 G3: the only RECONCILIATION-attested entries the ledger may carry.
  reconciled: Object.freeze([397, 401]),
});

class AnchorError extends Error {}

/**
 * The declared anchor from `.qorlogic/config.json`.
 *
 * Throws rather than defaulting. A fall-back to `boundary_entry=null` would
 * silently restore auto-detect — this fix un-shipping itself while every gate
 * still reported clean.
 *
 * The integer check is also the injection mitigation: this value is file-sourced
 * and reaches a Python invocation, so it is validated here and passed as argv,
 * never interpolated into the `-c` source (SG-Phase47-A).
 */
function readDeclaredAnchor(repoRoot) {
  const configPath = path.join(repoRoot, '.qorlogic', 'config.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new AnchorError(`cannot read ${configPath}: ${err.message}`);
  }
  const declared = cfg && cfg.ledger_anchor;
  if (!declared || typeof declared !== 'object') {
    throw new AnchorError(
      `${configPath} declares no ledger_anchor. Refusing to auto-detect: the ` +
      'auto-detected boundary is the newest verifying entry, which tolerates the ' +
      'entire history.',
    );
  }
  if (!Number.isInteger(declared.entry)) {
    throw new AnchorError(
      `ledger_anchor.entry must be an integer, got ${JSON.stringify(declared.entry)}`,
    );
  }
  // #467: frozen native qor-logic reads ledger.post_anchor_boundary, not this
  // consumer key. If the two disagree, native governance-health and this gate
  // verify different surfaces while both report clean, so a mismatch is fatal.
  const native = cfg.ledger && cfg.ledger.post_anchor_boundary;
  if (native !== declared.entry) {
    throw new AnchorError(
      `ledger.post_anchor_boundary (${JSON.stringify(native)}) must equal ` +
      `ledger_anchor.entry (${declared.entry}); native and consumer gates would verify different surfaces`,
    );
  }
  const reason = typeof declared.reason === 'string' ? declared.reason : '';
  return { entry: declared.entry, reason };
}

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Entry headings in file order: [{ num, index, ascii }]. Native ENTRY_RE is a
 * Python str pattern, so its `\d` matches ANY Unicode decimal digit and
 * int('٢٠٠') == 200. Enumerate with \p{Nd} to see every heading native sees;
 * `ascii` is false for a number written with non-ASCII digits, which
 * verifyEpoch refuses outright rather than trying to interpret.
 */
function headings(text) {
  const out = [];
  const re = /^### Entry #(\p{Nd}+):/gmu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const ascii = /^[0-9]+$/.test(m[1]);
    out.push({ num: ascii ? Number(m[1]) : NaN, raw: m[1], index: m.index, ascii });
  }
  return out;
}

/**
 * #467 epoch checks (the native verifier tolerates everything numbered at or
 * below the boundary, by NUMBER, wherever it sits in the file). All four fail
 * closed; `ok` is true only when every one holds.
 *  1. The bytes before the first heading numbered above the anchor match the
 *     pinned sha256 and length: any edit, deletion or insertion in the band fails.
 *  2. No heading numbered at or below the anchor appears after that point, so a
 *     decoy low-numbered entry cannot stand in for a deleted entry above it.
 *  3. The epoch entry appears exactly once; its content hash recomputed from its
 *     Decision body equals both its recorded value and the pinned value, and its
 *     chain hash equals sha256(content|previous) with previous = the preceding
 *     entry's chain hash.
 *  4. The RECONCILIATION-attested set is exactly EPOCH.reconciled (#467 G3).
 */
function verifyEpoch(ledgerPath, anchor) {
  const text = fs.readFileSync(ledgerPath, 'utf8').replace(/\r\n/g, '\n');
  const fail = (message) => ({ ok: false, message });
  const hs = headings(text);

  // A heading native reads as a number but whose digits are not ASCII is a
  // decoy native tolerates (by number) and a reader cannot see: refuse it.
  const nonAscii = hs.filter((h) => !h.ascii);
  if (nonAscii.length > 0) {
    return fail(`entry heading(s) with non-ASCII digits: ${nonAscii.map((h) => JSON.stringify(h.raw)).join(', ')}`);
  }

  const first = hs.findIndex((h) => h.num > anchor);
  if (first < 0) return fail(`no entry above #${anchor}`);
  const prefix = Buffer.from(text.slice(0, hs[first].index), 'utf8');
  const prefixHash = crypto.createHash('sha256').update(prefix).digest('hex');
  if (prefixHash !== EPOCH.prefixSha256 || prefix.length !== EPOCH.prefixBytes) {
    return fail(`prefix pin mismatch for entries at or below #${anchor}: expected sha256 ${EPOCH.prefixSha256} ` +
      `over ${EPOCH.prefixBytes} bytes, found ${prefixHash} over ${prefix.length} bytes`);
  }

  const late = hs.slice(first).filter((h) => h.num <= anchor);
  if (late.length > 0) {
    return fail(`entry heading(s) numbered at or below #${anchor} after the pinned band: ` +
      late.map((h) => `#${h.num}`).join(', '));
  }

  const at = hs.map((h, i) => ({ ...h, i })).filter((h) => h.num === EPOCH.entry);
  if (at.length !== 1) return fail(`expected exactly one Entry #${EPOCH.entry}, found ${at.length}`);
  const idx = at[0].i;
  if (idx === 0) return fail(`Entry #${EPOCH.entry} has no preceding entry`);
  const span = (k) => text.slice(hs[k].index, k + 1 < hs.length ? hs[k + 1].index : text.length);
  const field = (body, name) => {
    const m = new RegExp(`\\*\\*${name}[^*]*\\*\\*:\\s*\`([0-9a-f]{64})\``).exec(body);
    return m ? m[1] : null;
  };
  const epochBody = span(idx);
  const decision = /\*\*Decision\*\*: ([\s\S]*?)\n\n---\n/.exec(epochBody);
  if (!decision) return fail(`Entry #${EPOCH.entry} has no Decision body`);
  // Nothing but whitespace may follow the entry's closing rule: text placed after
  // it would sit outside the hashed body yet read as part of the entry.
  if (epochBody.slice(decision.index + decision[0].length).trim() !== '') {
    return fail(`Entry #${EPOCH.entry} has text after its closing rule`);
  }
  const content = sha256(decision[1]);
  const recContent = field(epochBody, 'Content Hash');
  const recPrevious = field(epochBody, 'Previous Hash');
  const recChain = field(epochBody, 'Chain Hash');
  const priorChain = field(span(idx - 1), 'Chain Hash');
  if (content !== EPOCH.contentSha256 || recContent !== EPOCH.contentSha256) {
    return fail(`Entry #${EPOCH.entry} content changed: recomputed ${content}, recorded ${recContent}, pinned ${EPOCH.contentSha256}`);
  }
  if (recChain !== EPOCH.chainSha256) {
    return fail(`Entry #${EPOCH.entry} chain hash ${recChain} is not the pinned ${EPOCH.chainSha256}; ` +
      'the chain up to the epoch was rewritten');
  }
  if (!priorChain || recPrevious !== priorChain || recChain !== sha256(`${recContent}|${recPrevious}`)) {
    return fail(`Entry #${EPOCH.entry} chain does not verify against its predecessor`);
  }

  const reconciled = new Set();
  for (const m of text.matchAll(/\*\*Reconciled Entries\*\*:\s*([#0-9,\s]+)/g)) {
    for (const t of m[1].matchAll(/#(\d+)/g)) reconciled.add(Number(t[1]));
  }
  const got = [...reconciled].sort((a, b) => a - b);
  if (got.join(',') !== EPOCH.reconciled.join(',')) {
    return fail(`reconciled-entry set must be exactly ${EPOCH.reconciled.map((n) => `#${n}`).join(', ')}, found ` +
      (got.length ? got.map((n) => `#${n}`).join(', ') : 'none'));
  }

  return {
    ok: true,
    message: `epoch #${EPOCH.entry} holds: band at or below #${anchor} pinned (sha256 ${prefixHash.slice(0, 16)}), ` +
      'no low-numbered entries after it, epoch entry intact, reconciled set exact',
  };
}

/**
 * Upstream's verifier at an explicit boundary. `boundaryEntry === null` means
 * auto-detect, used ONLY by the test suite to demonstrate what this guard fixes.
 */
function runPostAnchor(ledgerPath, boundaryEntry) {
  const payload = JSON.stringify({
    ledger: path.resolve(ledgerPath),
    boundary: boundaryEntry === null ? null : boundaryEntry,
  });
  const script = [
    'import json, sys',
    'from pathlib import Path',
    'from qor.scripts import ledger_hash',
    'o = json.loads(sys.argv[1])',
    'sys.exit(ledger_hash.verify_post_anchor(Path(o["ledger"]), boundary_entry=o["boundary"]))',
  ].join('\n');
  const res = spawnSync(PY, ['-c', script, payload], { encoding: 'utf8', shell: false });
  if (res.error && res.error.code === 'ENOENT') {
    throw new AnchorError(`python not found on PATH (set QOR_LOGIC_PYTHON): ${PY}`);
  }
  return { code: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
}

/** Entries numbered above the anchor — the surface actively re-verified. */
function countProtected(ledgerPath, anchor) {
  const text = fs.readFileSync(ledgerPath, 'utf8');
  let n = 0;
  const re = /^### Entry #(\d+):/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (Number(m[1]) > anchor) n += 1;
  }
  return n;
}

module.exports = {
  readDeclaredAnchor, runPostAnchor, countProtected, verifyEpoch, EPOCH, PINNED_ANCHOR, AnchorError,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--repo-root');
  const repoRoot = i >= 0 ? argv[i + 1] : path.resolve(__dirname, '..', '..', '..');
  try {
    const declared = readDeclaredAnchor(repoRoot);
    const ledger = path.join(repoRoot, 'docs', 'META_LEDGER.md');
    const guarded = countProtected(ledger, declared.entry);
    process.stdout.write(
      `check-ledger-anchor: declared anchor #${declared.entry}; ` +
      `${guarded} entries above it are actively verified\n`,
    );
    const pin = verifyEpoch(ledger, declared.entry);
    process.stdout.write(`check-ledger-anchor: ${pin.message}\n`);
    if (!pin.ok) process.exit(1);
    const res = runPostAnchor(ledger, declared.entry);
    process.stdout.write(res.output);
    // Fail-closed above the anchor: upstream's exit code, unsoftened.
    process.exit(res.code === null ? 1 : res.code);
  } catch (err) {
    process.stderr.write(`check-ledger-anchor: ${err.message}\n`);
    process.exit(1);
  }
}
