import { strict as assert } from 'assert';
import { parseFeatureIndex, parseBacklog, tally } from '../../../roadmap/tracker/tracker-parsers';

suite('tracker-parsers (dev-tracker-v1)', () => {
  test('parseFeatureIndex: extracts id/status/testPath, skips non-FX + headerless rows', () => {
    const md = [
      '| ID | Feature | Doc | Source | Test | Status | Notes |',
      '|---|---|---|---|---|---|---|',
      '| FX711 | Secret scanner | doc | src/a.ts | src/test/a.test.ts | verified | 5 cases |',
      '| FX999 | Pending thing | doc | src/b.ts | src/test/b.test.ts | unverified | wip |',
      '| FX500 | Not applicable | doc | src/c.ts |  | n/a | excluded |',
      '| C159 | not an FX row | x | y | z | verified | skip |',
      'some prose line',
    ].join('\n');
    const rows = parseFeatureIndex(md);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.id), ['FX711', 'FX999', 'FX500']);
    assert.equal(rows[0].status, 'verified');
    assert.equal(rows[0].testPath, 'src/test/a.test.ts');
    assert.equal(rows[1].status, 'unverified');
    assert.equal(rows[2].status, 'n/a');
  });

  test('parseBacklog: matches [x]/[ ], B### and B-XXX, captures version tag', () => {
    const md = [
      '- [x] [B90] CLI Overseer Lite | v5.4.x+ _(re-tagged)_',
      '- [ ] **[B-INT-8]** Normalize the research packet | v5.3.x+',
      '- [x] **[B-SUBSTRATE-2]** dependency lint | v5.3.x+',
      '## a heading, not an item',
      '- [ ] plain bullet, no id',
    ].join('\n');
    const items = parseBacklog(md);
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((i) => i.id), ['B90', 'B-INT-8', 'B-SUBSTRATE-2']);
    assert.equal(items[0].done, true);
    assert.equal(items[1].done, false);
    assert.equal(items[0].version, 'v5.4.x+');
    assert.equal(items[1].version, 'v5.3.x+');
  });

  test('tally: FX by status (n/a excluded) + backlog by done', () => {
    const features = parseFeatureIndex([
      '| FX1 | a | d | s | t.test.ts | verified | n |',
      '| FX2 | b | d | s | t.test.ts | unverified | n |',
      '| FX3 | c | d | s |  | n/a | n |',
    ].join('\n'));
    const backlog = parseBacklog(['- [x] [B1] done', '- [ ] [B2] open'].join('\n'));
    const t = tally(features, backlog);
    assert.deepEqual(t, { verified: 2 /* FX1 + B1 */, unverified: 1 /* FX2 */, open: 1 /* B2 */ });
  });
});
