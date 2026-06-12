// FX889 — Mind Map repository seed projection (research-brief Phase 4). Pure
// transform: governance/genome graph → brainstorm seed nodes/edges.

import { strict as assert } from 'assert';
import { seedGraphFromGenome } from '../../roadmap/services/brainstorm-seed';

suite('FX889 brainstorm-seed (genome → mindmap seed)', () => {
  test('maps genome node types to brainstorm types, prefixes ids, tags source:codebase', () => {
    const graph = {
      nodes: [
        { id: 'g1', type: 'governance', label: 'Plan #196' },
        { id: 'f1', type: 'failure', label: 'SG-Drift' },
        { id: 's1', type: 'state', label: '' },        // blank label → falls back to type
        { id: 'c1', type: 'checkpoint', label: 'seal' },
        { id: 't1', type: 'trust', label: 'peer-a' },
        { id: 'u1', type: 'mystery', label: 'x' },      // unknown type → Question
      ],
      edges: [],
    };
    const seed = seedGraphFromGenome(graph);
    const byId = Object.fromEntries(seed.nodes.map((n) => [n.id, n]));
    assert.equal(byId['cb-g1'].type, 'Architecture');
    assert.equal(byId['cb-f1'].type, 'Risk');
    assert.equal(byId['cb-s1'].type, 'Feature');
    assert.equal(byId['cb-s1'].label, 'state', 'blank label falls back to the genome type');
    assert.equal(byId['cb-c1'].type, 'Feature');
    assert.equal(byId['cb-t1'].type, 'Integration');
    assert.equal(byId['cb-u1'].type, 'Question', 'unknown genome type → Question');
    assert.ok(seed.nodes.every((n) => n.source === 'codebase'), 'every seed node tagged source:codebase');
    assert.ok(seed.nodes.every((n) => n.id.startsWith('cb-')), 'every seed id prefixed');
  });

  test('re-points edges to prefixed ids + synthesizes label from edge type; drops dangling edges', () => {
    const graph = {
      nodes: [{ id: 'a', type: 'governance', label: 'A' }, { id: 'b', type: 'failure', label: 'B' }],
      edges: [
        { id: 'e1', source: 'a', target: 'b', type: 'applies_to' }, // both endpoints kept
        { id: 'e2', source: 'a', target: 'ghost', type: 'x' },       // missing endpoint → dropped
      ],
    };
    const seed = seedGraphFromGenome(graph);
    assert.equal(seed.edges.length, 1, 'edge to a missing node is dropped');
    assert.deepEqual(seed.edges[0], { source: 'cb-a', target: 'cb-b', label: 'applies_to' });
  });

  test('empty / absent graph → empty seed (degrade-safe)', () => {
    assert.deepEqual(seedGraphFromGenome({ nodes: [], edges: [] }), { nodes: [], edges: [] });
    assert.deepEqual(seedGraphFromGenome({}), { nodes: [], edges: [] });
  });
});
