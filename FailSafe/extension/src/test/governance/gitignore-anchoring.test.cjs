/**
 * FX936 — `.gitignore` rules anchor to paths that actually exist in this tree.
 *
 * Why this suite exists (GAP-HYG-01, RESEARCH_BRIEF_qor169-alignment-2026-09-03.md):
 * `.gitignore` carried `extension/test-results/`. A pattern containing a slash anchors to
 * the gitignore's own directory, so that rule matched `<repo>/extension/test-results/` — a
 * path that does not exist. The real tree is `FailSafe/extension/`. The rule never fired,
 * and two Playwright artifacts reached the index as a result.
 *
 * Both directions are asserted. Ignoring the target is not enough: a rule broadened to
 * `test-results` at any depth, or one that swallowed the whole subtree, would satisfy a
 * one-sided test while breaking the repo. The second assertion is the inverse-coverage half.
 *
 * Runs standalone: node --test src/test/governance/gitignore-anchoring.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

// src/test/governance -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

/**
 * Ask git whether a path is ignored, without consulting the index.
 * `--no-index` matters: git check-ignore silently reports a TRACKED path as
 * not-ignored, which is what masked this defect during the original audit.
 */
function isIgnored(relPath) {
  const res = spawnSync('git', ['check-ignore', '--no-index', '-v', '--', relPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { ignored: res.status === 0, rule: (res.stdout || '').trim() };
}

describe('FX936 .gitignore anchoring', () => {
  it('ignores generated Playwright output under FailSafe/extension/test-results/', () => {
    const probe = 'FailSafe/extension/test-results/probe-generated.png';
    const { ignored, rule } = isIgnored(probe);
    assert.ok(
      ignored,
      `${probe} is not ignored; the anchored rule is not firing. git said: ${rule || '(no match)'}`
    );
  });

  it('does NOT ignore the extension source tree (inverse coverage)', () => {
    const probe = 'FailSafe/extension/src/extension/main.ts';
    const { ignored, rule } = isIgnored(probe);
    assert.equal(
      ignored,
      false,
      `${probe} is ignored — a .gitignore rule has been broadened too far. git said: ${rule}`
    );
  });

  it('does NOT ignore this test file, which lives beside the ignored sibling', () => {
    const probe = 'FailSafe/extension/src/test/governance/gitignore-anchoring.test.cjs';
    const { ignored, rule } = isIgnored(probe);
    assert.equal(ignored, false, `${probe} is ignored. git said: ${rule}`);
  });

  it('keeps no rule anchored to the nonexistent <root>/extension/ path', () => {
    const fs = require('fs');
    const lines = fs
      .readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    const stale = lines.filter((l) => l.startsWith('extension/'));
    assert.deepEqual(
      stale,
      [],
      `these rules anchor to <root>/extension/, which does not exist: ${stale.join(', ')}`
    );
  });
});
