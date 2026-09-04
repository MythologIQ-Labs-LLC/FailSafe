/**
 * FX940 — FEATURE_INDEX allocates each FX id exactly once.
 *
 * Why this suite exists:
 * On 2026-09-04, `FX935` was found allocated twice — by PR #445 (2026-08-24, Shadow Genome
 * node severity) and on `main` (2026-09-03, `.qorlogic/config.json`). Neither cycle erred:
 * each computed the next id as `max(FX) + 1` against its own view of the index, and the views
 * had diverged. That is structurally the Entry #597 ledger fork, one artifact over.
 *
 * `FX934` was double-allocated the same way, and the older of those two claims is the plan for
 * `check-governance-structure.cjs` — a detector scoped, in its own words, to catch "a
 * FEATURE_INDEX with two FX930 rows". It collided on its own id before it was implemented.
 *
 * The detector is exercised against fixtures rather than only against the live index, because
 * the live index is (and should be) clean: a check that can only be observed passing proves
 * nothing about whether it can fail. `duplicate-id.md` carries the collision; `clean.md` is the
 * control, so a detector that fired indiscriminately would fail there.
 *
 * Runs standalone: node --test src/test/governance/feature-index-id-integrity.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// src/test/governance -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const FEATURE_INDEX = path.join(REPO_ROOT, 'docs', 'FEATURE_INDEX.md');
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'feature-index');

/** Ids in the first cell of a table row, in document order (duplicates preserved). */
function featureIds(text) {
  return [...text.matchAll(/^\|\s*(FX\d+)\s*\|/gm)].map((m) => m[1]);
}

function duplicateIds(text) {
  const seen = new Set();
  const dupes = new Set();
  for (const id of featureIds(text)) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes].sort();
}

describe('FX940 FEATURE_INDEX id integrity', () => {
  it('detects a duplicate id in the malformed fixture', () => {
    const text = fs.readFileSync(path.join(FIXTURES, 'duplicate-id.md'), 'utf8');
    assert.deepEqual(
      duplicateIds(text),
      ['FX930'],
      'the detector did not fire on a fixture built to collide — it cannot be trusted ' +
        'when it reports the live index clean'
    );
  });

  it('reports the clean fixture as clean', () => {
    const text = fs.readFileSync(path.join(FIXTURES, 'clean.md'), 'utf8');
    assert.deepEqual(
      duplicateIds(text),
      [],
      'the detector fires on a well-formed index — it would flag every real index too'
    );
  });

  it('allocates every id in the live FEATURE_INDEX exactly once', () => {
    const dupes = duplicateIds(fs.readFileSync(FEATURE_INDEX, 'utf8'));
    assert.deepEqual(
      dupes,
      [],
      `FEATURE_INDEX allocates these ids more than once: ${dupes.join(', ')}. Two cycles ` +
        'computing max(FX)+1 against divergent views produce this; renumber the newer claim.'
    );
  });

  it('does not reuse an id this session renumbered away from', () => {
    // FX935 belongs to PR #445 (older claim, 2026-08-24). `main` released it on
    // 2026-09-04 by renumbering .qorlogic/config.json to FX940. Re-taking it here
    // would recreate the collision the renumber existed to resolve.
    const text = fs.readFileSync(FEATURE_INDEX, 'utf8');
    const row = /^\|\s*FX935\s*\|([^|]*)\|/m.exec(text);
    if (row === null) return;                    // not yet merged from #445 — fine
    assert.ok(
      /shadow genome/i.test(row[1]),
      `FX935 is reserved for PR #445 (Shadow Genome node severity) but reads: ${row[1].trim()}`
    );
  });
});
