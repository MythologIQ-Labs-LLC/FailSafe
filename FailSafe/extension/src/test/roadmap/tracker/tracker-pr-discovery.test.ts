// Functional tests for the PR-incremental fallback discovery (GH #174). Pure —
// the parser takes `git log` text; no git/fs.

import { strict as assert } from 'assert';
import { discoverMergedPrs, detectCadence } from '../../../roadmap/tracker/tracker-pr-discovery';

suite('roadmap/tracker tracker-pr-discovery', () => {
  test('parses squash-merge subjects ending in (#N)', () => {
    const log = [
      '2026-06-01\tfeat(x): add thing (#12)',
      '2026-06-02\tfix(y): patch (#15)',
    ].join('\n');
    const prs = discoverMergedPrs(log);
    assert.deepEqual(prs.map((p) => p.id), ['pr-12', 'pr-15']);
    assert.equal(prs[0].state, 'pr');
    assert.equal(prs[0].summary, 'feat(x): add thing'); // (#12) stripped
    assert.equal(prs[0].note, '2026-06-01');
    assert.equal(prs[0].progressEligible, false);
  });

  test('parses GitHub merge-commit subjects (Merge pull request #N from ...)', () => {
    const prs = discoverMergedPrs('2026-05-30\tMerge pull request #7 from acme/feature-x');
    assert.equal(prs.length, 1);
    assert.equal(prs[0].id, 'pr-7');
  });

  test('merge-commit title comes from the FOLLOWING feature commit; else the humanized branch', () => {
    const log = [
      '2026-06-05\tMerge pull request #39 from BicameralAI/feat/live-emission',
      '2026-06-05\tfeat(runtime): make GatewaySink real',         // the merged tip → real title
      '2026-06-04\tMerge pull request #38 from acme/feat/readme-upcycle', // last line → branch fallback
    ].join('\n');
    const prs = discoverMergedPrs(log);
    const p39 = prs.find((p) => p.id === 'pr-39')!;
    assert.equal(p39.summary, 'feat(runtime): make GatewaySink real', 'uses the merged feature commit, not "Merge #39"');
    const p38 = prs.find((p) => p.id === 'pr-38')!;
    assert.equal(p38.summary, 'readme upcycle', 'humanized branch (owner + feat/ stripped) when no feature commit follows');
    // the bare feature commit must NOT create its own spurious anchor
    assert.equal(prs.length, 2);
  });

  test('orders anchors oldest-first by date', () => {
    const log = [
      '2026-06-10\tc (#3)',
      '2026-06-01\ta (#1)',
      '2026-06-05\tb (#2)',
    ].join('\n');
    assert.deepEqual(discoverMergedPrs(log).map((p) => p.id), ['pr-1', 'pr-2', 'pr-3']);
  });

  test('dedupes by PR number, keeping the earliest date', () => {
    // newest-first input; the same PR appears as squash then (older) merge commit
    const log = [
      '2026-06-10\tfeat: squashed (#9)',
      '2026-06-09\tMerge pull request #9 from acme/x',
    ].join('\n');
    const prs = discoverMergedPrs(log);
    assert.equal(prs.length, 1);
    assert.equal(prs[0].id, 'pr-9');
    assert.equal(prs[0].note, '2026-06-09', 'earliest date kept');
    assert.equal(prs[0].summary, 'feat: squashed', 'newest title kept');
  });

  test('ignores commits with no PR number, and tolerates missing dates', () => {
    const log = [
      'chore: no pr here',
      'refactor: also none',
      'feat: tabless (#21)',
    ].join('\n');
    const prs = discoverMergedPrs(log);
    assert.deepEqual(prs.map((p) => p.id), ['pr-21']);
    assert.equal(prs[0].note, undefined);
  });

  test('empty / whitespace input → no anchors', () => {
    assert.deepEqual(discoverMergedPrs(''), []);
    assert.deepEqual(discoverMergedPrs('\n\n  \n'), []);
  });

  // FailSafe#393 (FailSafe#244 large-repo audit): maxAnchors lets a bounded
  // caller (TrackerRoute) fetch one extra trailing commit purely so the last
  // in-window merge commit's titleFor lookahead has a real `next` — without
  // that extra commit becoming an anchor itself.
  suite('maxAnchors (bounded-window lookahead)', () => {
    test('a commit beyond maxAnchors is lookahead-only, never its own anchor', () => {
      const log = [
        '2026-06-03\tMerge pull request #2 from acme/two', // index 0 — in window
        '2026-06-02\tfeat: two tip',                        // index 1 — lookahead for #2, excluded from anchors
        '2026-06-01\tMerge pull request #1 from acme/one',  // index 2 — beyond maxAnchors, must NOT anchor
      ].join('\n');
      const prs = discoverMergedPrs(log, 2);
      assert.deepEqual(prs.map((p) => p.id), ['pr-2'], 'pr-1 (beyond the 2-commit window) is excluded');
      assert.equal(prs[0].summary, 'feat: two tip', 'the in-window merge still resolves its real next-commit title');
    });

    test('omitting maxAnchors keeps the unbounded default (every commit is anchor-eligible)', () => {
      const log = [
        'Merge pull request #2 from acme/two',
        'feat: two tip',
        'Merge pull request #1 from acme/one',
      ].join('\n');
      assert.deepEqual(discoverMergedPrs(log).map((p) => p.id), ['pr-1', 'pr-2']);
    });
  });

  test('detectCadence prefers semver, then PRs, then empty', () => {
    const rel = [{ id: 'v1.0.0', state: 'prod' as const }];
    const pr = [{ id: 'pr-1', state: 'pr' as const }];
    assert.equal(detectCadence(rel, pr), 'semver');
    assert.equal(detectCadence([], pr), 'pr-incremental');
    assert.equal(detectCadence([], []), 'empty');
    assert.equal(detectCadence(rel, []), 'semver');
  });
});
