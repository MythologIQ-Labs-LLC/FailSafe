/**
 * FX939 — docs/GOVERNANCE_INDEX.md distinguishes published from private-by-design.
 *
 * Why this suite exists:
 * The index states "Every governance doc MUST be registered here. Drift in this index =
 * governance drift", and gives each tier a drift signal — but it had no vocabulary for
 * *published vs private*. `.gitignore:52-56` makes `docs/` and `.failsafe/` private by
 * default ("Private planning docs, transfer files, and governance records (licensing TBD)"),
 * published by exception via `git add -f`. So a clone reader saw 15 legitimately-private rows
 * and 1 outright broken row as indistinguishable absences.
 *
 * The broken one: `confidentiality.md` was registered as a root Tier 2 artifact while existing
 * nowhere in the repository — it is operator memory. Its contents are NOT imported here; per
 * CLAUDE.md it holds pricing and tier internals.
 *
 * Pattern rows are skipped deliberately. 14 of the 68 registered paths are shapes, not files
 * (`plan-*.md`, `AUDIT_REPORT_<plan>.md`, `entry-<N>-body.md`); an existence check that did not
 * skip them would report 14 false positives on its first run. That was found by measuring
 * before writing the assertion, not by reasoning about it.
 *
 * Runs standalone: node --test src/test/governance/governance-index-publication.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// src/test/governance -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const INDEX = path.join(REPO_ROOT, 'docs', 'GOVERNANCE_INDEX.md');

function indexText() {
  return fs.readFileSync(INDEX, 'utf8');
}

/** A row path naming a shape rather than a file. */
function isPattern(p) {
  return p.includes('*') || p.includes('<');
}

/**
 * Every `.md` path appearing in the first cell of a TIER-table row.
 *
 * Everything from the `## Out-of-tier paths` heading onward is excluded. That
 * section exists, in its own words, "so they are not confused with governance" —
 * treating its rows as registered artifacts is exactly the confusion it was
 * written to prevent, and doing so made `confidentiality.md` look unexplained
 * after it had been correctly relocated there.
 */
function registeredPaths(text) {
  const cut = text.indexOf('## Out-of-tier paths');
  const tiers = cut === -1 ? text : text.slice(0, cut);
  return [...tiers.matchAll(/^\|\s*`([^`]+\.md)`/gm)].map((m) => m[1]);
}

/**
 * Prefixes the index declares private-by-default, read from the
 * `## Publication status` section rather than hardcoded here — a check that
 * carried its own copy of the list could not detect the list going stale.
 */
function declaredPrivatePrefixes(text) {
  const section = /^## Publication status$([\s\S]*?)^## /m.exec(text);
  if (!section) return [];
  return [...section[1].matchAll(/^- private-by-default:\s*`([^`]+)`/gm)].map((m) => m[1]);
}

function trackedFiles() {
  const res = spawnSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (res.status !== 0) return null;         // not a git checkout
  return new Set(res.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
}

describe('FX939 GOVERNANCE_INDEX publication status', () => {
  it('registers no path that is neither tracked nor under a declared-private prefix', () => {
    const text = indexText();
    const tracked = trackedFiles();
    if (tracked === null) return;            // no git: nothing to compare against
    const prefixes = declaredPrivatePrefixes(text);

    const unexplained = registeredPaths(text)
      .filter((p) => !isPattern(p))
      .filter((p) => !tracked.has(p))
      .filter((p) => !prefixes.some((pre) => p.startsWith(pre)));

    assert.deepEqual(
      unexplained,
      [],
      'registered but neither published nor declared private — a reader of a clone sees ' +
        `these as missing with no way to tell why: ${unexplained.join(', ')}`
    );
  });

  it('declares at least one private prefix, and every declared prefix matches a real row', () => {
    const text = indexText();
    const prefixes = declaredPrivatePrefixes(text);
    assert.ok(
      prefixes.length > 0,
      'no private-by-default prefixes declared in ## Publication status; the first ' +
        'assertion would then treat every private row as unexplained'
    );

    const paths = registeredPaths(text);
    const dead = prefixes.filter((pre) => !paths.some((p) => p.startsWith(pre)));
    assert.deepEqual(
      dead,
      [],
      `declared private prefixes matching no registered row — dead declaration: ${dead.join(', ')}`
    );
  });

  it('registers docs/README.md in some tier', () => {
    assert.ok(
      registeredPaths(indexText()).includes('docs/README.md'),
      'docs/README.md exists on disk but is registered in no tier; the index requires ' +
        'every governance doc to be registered'
    );
  });
});
