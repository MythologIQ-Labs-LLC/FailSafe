// FX894 — client/server edge-key cross-consistency (#234 LD4). The identity
// formula is defined twice (browser ESM module + extension-host TS) because no
// shared-module bundling path exists; this suite pins them to byte-identical
// output over a collision matrix.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { edgeKey } from '../../../src/roadmap/ui/modules/brainstorm-edge-identity.js';
import { brainstormEdgeKey, BrainstormEdge } from '../../roadmap/services/BrainstormService';

suite('FX894 edge identity cross-consistency', () => {
  const matrix: BrainstormEdge[] = [
    { source: 'n1', target: 'n2', label: 'requires' },
    { source: 'n1', target: 'n2', label: '' },
    { source: 'ノードA', target: '節点B', label: '依存→する' },
    { source: 'a b', target: 'c', label: 'x' },
    { source: 'a', target: 'b c', label: 'x' },
    { source: 'a|b', target: 'c', label: 'rel' },
    { source: 'a', target: 'b|c', label: 'rel' },
    { source: 'a","b', target: 'c', label: 'quoted' },
  ];

  test('client edgeKey === server brainstormEdgeKey over the matrix', () => {
    for (const e of matrix) {
      assert.equal(edgeKey(e), brainstormEdgeKey(e), `key mismatch for ${JSON.stringify(e)}`);
    }
  });

  test('delimiter-bearing ids produce distinct keys', () => {
    const shifted = brainstormEdgeKey({ source: 'a b', target: 'c', label: 'x' });
    const original = brainstormEdgeKey({ source: 'a', target: 'b c', label: 'x' });
    assert.notEqual(shifted, original, 'delimiter shift must not collide');
  });

  test('missing label normalizes to empty string on both sides', () => {
    const e = { source: 'n1', target: 'n2' } as unknown as BrainstormEdge;
    assert.equal(edgeKey(e), brainstormEdgeKey(e));
    assert.equal(brainstormEdgeKey(e), JSON.stringify(['n1', 'n2', '']));
  });
});
