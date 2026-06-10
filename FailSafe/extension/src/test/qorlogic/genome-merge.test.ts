// Per-feature tests for genome-merge (#454): ingest both, recorded wins, per-record provenance.

import { strict as assert } from 'assert';
import { mergeGenomes } from '../../qorlogic/genome-merge';
import type { GenomeGraph } from '../../qorlogic/shadow-genome-client';

const real: GenomeGraph = {
  nodes: [{ id: 'n0', type: 'governance', label: 'live gate' }],
  edges: [{ id: 'e0', source: 'n0', target: 'n0', type: 'applies_to' }],
  trustTransitions: [{ id: 't1', fromLevel: 'CBT', toLevel: 'KBT', direction: 'promotion' }],
  federationPeers: [{ id: 'p1', state: 'synced' }],
};
const appendix: GenomeGraph = {
  nodes: [
    { id: 'lg-5-fail', type: 'failure', label: 'derived failure', provenance: 'reconstructed' },
    { id: 'lg-5-gate', type: 'governance', label: 'derived gate', provenance: 'reconstructed' },
  ],
  edges: [{ id: 'lg-5-ev', source: 'lg-5-gate', target: 'lg-5-fail', type: 'applies_to' }],
};

suite('mergeGenomes (#454)', () => {
  test('tags real nodes recorded, keeps appendix reconstructed, unions edges', () => {
    const m = mergeGenomes(real, appendix);
    const prov = Object.fromEntries(m.nodes.map((n) => [n.id, n.provenance]));
    assert.equal(prov['n0'], 'recorded');
    assert.equal(prov['lg-5-fail'], 'reconstructed');
    assert.equal(prov['lg-5-gate'], 'reconstructed');
    assert.deepEqual(m.edges.map((e) => e.id).sort(), ['e0', 'lg-5-ev']);
  });

  test('trust/federation carried from the real genome only (appendix never invents them)', () => {
    const m = mergeGenomes(real, appendix);
    assert.equal(m.trustTransitions?.length, 1);
    assert.equal(m.federationPeers?.length, 1);
  });

  test('recorded wins on an id collision', () => {
    const collide: GenomeGraph = { nodes: [{ id: 'n0', type: 'failure', label: 'derived dup', provenance: 'reconstructed' }], edges: [] };
    const m = mergeGenomes(real, collide);
    const n0 = m.nodes.find((n) => n.id === 'n0')!;
    assert.equal(n0.type, 'governance');     // real kept
    assert.equal(n0.provenance, 'recorded');
  });

  test('degrade-safe: empty real → appendix (no trust/federation invented)', () => {
    const m = mergeGenomes({ nodes: [], edges: [] }, appendix);
    assert.equal(m.nodes.length, 2);
    assert.ok(m.nodes.every((n) => n.provenance === 'reconstructed'));
    assert.equal(m.trustTransitions, undefined);
    assert.equal(m.federationPeers, undefined);
  });
});
