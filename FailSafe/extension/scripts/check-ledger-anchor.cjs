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
const fs = require('fs');
const path = require('path');

const PY = process.env.QOR_LOGIC_PYTHON || 'python';

/**
 * The measured anchor. 340 is the LOWEST value at which the live ledger
 * verifies clean (236 -> 94 failures, 331 -> 2, 340 -> 0), so it maximises the
 * protected surface without shipping a red gate.
 *
 * Pinned rather than range-checked on purpose. A threshold on the protected
 * COUNT decays as the ledger grows — at head #1000 an anchor of #800 leaves
 * exactly 200 protected and would pass a `>= 200` rule while dropping 460
 * entries out of verification. A guard against a ratchet must not itself be
 * ratchetable, so moving this is a deliberate edit that fails the suite until
 * the declaration and its measurements are updated together.
 */
const PINNED_ANCHOR = 340;

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
  const reason = typeof declared.reason === 'string' ? declared.reason : '';
  return { entry: declared.entry, reason };
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
  readDeclaredAnchor, runPostAnchor, countProtected, PINNED_ANCHOR, AnchorError,
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
    const res = runPostAnchor(ledger, declared.entry);
    process.stdout.write(res.output);
    // Fail-closed above the anchor: upstream's exit code, unsoftened.
    process.exit(res.code === null ? 1 : res.code);
  } catch (err) {
    process.stderr.write(`check-ledger-anchor: ${err.message}\n`);
    process.exit(1);
  }
}
