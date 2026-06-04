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

  test('detectCadence prefers semver, then PRs, then empty', () => {
    const rel = [{ id: 'v1.0.0', state: 'prod' as const }];
    const pr = [{ id: 'pr-1', state: 'pr' as const }];
    assert.equal(detectCadence(rel, pr), 'semver');
    assert.equal(detectCadence([], pr), 'pr-incremental');
    assert.equal(detectCadence([], []), 'empty');
    assert.equal(detectCadence(rel, []), 'semver');
  });
});
