/**
 * FX938 — docs/SYSTEM_STATE.md satisfies its own Tier 1 freshness contract.
 *
 * Why this suite exists:
 * `docs/GOVERNANCE_INDEX.md` puts SYSTEM_STATE in Tier 1 — "MUST be current at every cycle
 * close", drift signal "wrong version, wrong state". It nonetheless claimed
 * `Current Release: v5.9.0` while the repo shipped v6.0.4: five releases of Tier 1 drift.
 *
 * Nothing caught it. `/qor-substantiate` Step 6.5 runs `check_documentation_currency`, which
 * asks whether THIS cycle's `files_touched` implies a doc update — it never reads the
 * document. On the 2026-09-03 seal it returned 0 warnings against a five-release-stale Tier 1
 * doc: a check passing without inspecting the thing it is named for. This suite is the
 * missing assertion.
 *
 * Every assertion below was run against the pre-fix state first and observed to fail. The
 * third one had to be inverted after that check: it was originally written as "Last Updated
 * is not older than the newest section", which is TRUE of a header edited without a body
 * append — it passed on exactly the state it existed to catch.
 *
 * Runs standalone: node --test src/test/governance/system-state-currency.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// src/test/governance -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SYSTEM_STATE = path.join(REPO_ROOT, 'docs', 'SYSTEM_STATE.md');
const EXT_PKG = path.join(REPO_ROOT, 'FailSafe', 'extension', 'package.json');

function systemState() {
  return fs.readFileSync(SYSTEM_STATE, 'utf8');
}

function currentReleaseMarker(text) {
  const m = /\*\*Current Release:?\*\*:?\s*v?(\d+\.\d+\.\d+)/.exec(text);
  assert.ok(m, 'SYSTEM_STATE.md declares no **Current Release:** marker');
  return m[1];
}

function lastUpdated(text) {
  const m = /\*\*Last Updated:?\*\*:?\s*(\d{4}-\d{2}-\d{2})/.exec(text);
  assert.ok(m, 'SYSTEM_STATE.md declares no **Last Updated:** date');
  return m[1];
}

/** Dates of every `## YYYY-MM-DD ...` body section. */
function sectionDates(text) {
  return new Set(
    [...text.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1])
  );
}

function tags() {
  const res = spawnSync('git', ['tag', '--sort=-v:refname'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (res.status !== 0) return [];
  return res.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

describe('FX938 SYSTEM_STATE Tier 1 currency', () => {
  it('declares a Current Release matching the extension package.json version', () => {
    const declared = currentReleaseMarker(systemState());
    const pkg = JSON.parse(fs.readFileSync(EXT_PKG, 'utf8')).version;
    assert.equal(
      declared,
      pkg,
      `SYSTEM_STATE says Current Release v${declared} but package.json is ${pkg} — ` +
        'the Tier 1 drift signal is literally "wrong version"'
    );
  });

  it('declares a Current Release matching the newest version tag', () => {
    const all = tags();
    if (all.length === 0) return;            // shallow clone: no tags to compare against
    const newest = all.find((t) => /^v\d+\.\d+\.\d+$/.test(t));
    if (!newest) return;
    const declared = currentReleaseMarker(systemState());
    assert.equal(
      `v${declared}`,
      newest,
      `SYSTEM_STATE says v${declared} but the newest tag is ${newest}. This is the ` +
        'inverse of the package.json check: a version bumped and merged but never tagged ' +
        'is still not released ("merging is not delivering")'
    );
  });

  it('records a body section for the date it claims it was last updated', () => {
    // Inverted after empirical check. The obvious form — "Last Updated is not older than
    // the newest section" — is satisfied by a header edited while the body is abandoned
    // (2026-08-20 >= 2026-05-28), which is the exact defect. Requiring a section FOR the
    // claimed date is what actually fails on it.
    const text = systemState();
    const lu = lastUpdated(text);
    const dates = sectionDates(text);
    assert.ok(
      dates.has(lu),
      `SYSTEM_STATE claims Last Updated ${lu} but has no "## ${lu}" body section. ` +
        'A header refresh with no recorded event means the snapshot was restamped, ' +
        'not resynced.'
    );
  });

  it('records a body section for every shipped 6.x release', () => {
    const text = systemState();
    const sixDotX = tags().filter((t) => /^v6\.\d+\.\d+$/.test(t));
    if (sixDotX.length === 0) return;        // shallow clone
    const missing = sixDotX.filter((t) => {
      const v = t.slice(1);
      return !new RegExp(`^## .*${v.replace(/\./g, '\\.')}`, 'm').test(text);
    });
    assert.deepEqual(
      missing,
      [],
      `shipped releases with no SYSTEM_STATE section: ${missing.join(', ')} — ` +
        'the living snapshot does not record what the repository actually shipped'
    );
  });
});
