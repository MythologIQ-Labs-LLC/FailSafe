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
 * Pattern rows are skipped deliberately. In the original audit, 14 of 68 paths were shapes, not files
 * (`plan-*.md`, `AUDIT_REPORT_<plan>.md`, `entry-<N>-body.md`); an existence check that did not
 * skip them would report 14 false positives on its first run. That was found by measuring
 * before writing the assertion, not by reasoning about it.
 *
 * Runs standalone: node --test src/test/governance/governance-index-publication.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  indexText, isPattern, registeredPaths, declaredPrivatePrefixes, trackedFiles,
} = require('./governanceIndexReaders.cjs');

describe('FX939 GOVERNANCE_INDEX publication status', () => {

  it('registers no path that is neither tracked nor under a declared-private prefix', () => {
    const text = indexText();
    const tracked = trackedFiles();
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
