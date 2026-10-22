// #532 B344 (reviewB344b, written after the implementation): the bookkeeping matcher, pinned by
// table. Matching is exact and case-sensitive on the path git prints; package-lock.json matches at
// the root and in any folder (a nested lock file is regenerated the same way), never as a suffix of
// another name.

import { strict as assert } from 'assert';
import { isBookkeepingPath, REWORK_BOOKKEEPING_PATHS } from '../../../governance/delivery/reworkBookkeeping';

suite('#532 B344 rework bookkeeping paths', () => {
  test('the fixed list matches exactly, case-sensitively; package-lock.json matches in any folder and nowhere else', () => {
    const table: Array<[string, boolean]> = [
      ...REWORK_BOOKKEEPING_PATHS.map((p) => [p, true] as [string, boolean]),
      ['package-lock.json', true],
      ['a/package-lock.json', true],
      ['FailSafe/extension/package-lock.json', true],
      ['src/CHANGELOG.md', false],
      ['CHANGELOG.md.bak', false],
      ['changelog.md', false],
      ['docs/backlog.md', false],
      ['Docs/BACKLOG.md', false],
      ['docs/BACKLOG.md/x', false],
      ['x/package-lock.json.ts', false],
      ['xpackage-lock.json', false],
      ['a/xpackage-lock.json', false],
      ['Package-lock.json', false],
      ['a.ts', false],
    ];
    for (const [path, want] of table) assert.equal(isBookkeepingPath(path), want, path);
  });

  test('the list is the owner ruling\'s, frozen', () => {
    assert.deepEqual([...REWORK_BOOKKEEPING_PATHS], [
      'CHANGELOG.md', 'FailSafe/extension/CHANGELOG.md', 'docs/BACKLOG.md', 'docs/FEATURE_INDEX.md',
      'docs/META_LEDGER.md', 'docs/GOVERNANCE_INDEX.md', 'docs/SYSTEM_STATE.md',
    ]);
    assert.ok(Object.isFrozen(REWORK_BOOKKEEPING_PATHS));
  });
});
