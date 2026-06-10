// Per-feature tests for the historical genome reconstruction (#454 appendix).
// Pure MetaLedgerEntry[] -> GenomeGraph; every node 'reconstructed' + back-cited.

import { strict as assert } from 'assert';
import { reconstructGenomeFromLedger } from '../../qorlogic/genome-reconstruction';
import type { MetaLedgerEntry } from '../../qorlogic/meta-ledger-model';

const E = (over: Partial<MetaLedgerEntry> & { n: number; phase: string }): MetaLedgerEntry =>
  ({ title: `T${over.n}`, ...over } as MetaLedgerEntry);

suite('reconstructGenomeFromLedger (#454)', () => {
  test('GATE Verdict=VETO → failure + its gate governance + applies_to edge', () => {
    const g = reconstructGenomeFromLedger([E({ n: 5, phase: 'GATE', verdict: 'VETO', riskGrade: 'L2', title: 'Spec drift' })]);
    const types = g.nodes.map((n) => n.type).sort();
    assert.deepEqual(types, ['failure', 'governance']);
    const fail = g.nodes.find((n) => n.type === 'failure')!;
    assert.equal(fail.id, 'lg-5-fail');
    assert.equal(fail.provenance, 'reconstructed');
    assert.equal(fail.metadata?.ledgerEntry, 5);
    assert.equal(fail.metadata?.riskGrade, 'L2');
    assert.deepEqual(g.edges.map((e) => [e.source, e.target, e.type]), [['lg-5-gate', 'lg-5-fail', 'applies_to']]);
  });

  test('GATE Verdict=PASS / GOVERNANCE / SECURE → a governance node', () => {
    const g = reconstructGenomeFromLedger([
      E({ n: 1, phase: 'GATE', verdict: 'PASS' }),
      E({ n: 2, phase: 'GOVERNANCE' }),
      E({ n: 3, phase: 'SECURE' }),
    ]);
    assert.deepEqual(g.nodes.map((n) => [n.id, n.type]), [['lg-1-gov', 'governance'], ['lg-2-gov', 'governance'], ['lg-3-gov', 'governance']]);
    assert.ok(g.nodes.every((n) => n.provenance === 'reconstructed'));
  });

  test('SUBSTANTIATE/DELIVER → checkpoint; IMPLEMENT → state; REMEDIATE/DEBUG → governance', () => {
    const g = reconstructGenomeFromLedger([
      E({ n: 10, phase: 'SUBSTANTIATE' }), E({ n: 11, phase: 'DELIVER' }),
      E({ n: 12, phase: 'IMPLEMENT' }), E({ n: 13, phase: 'REMEDIATE' }), E({ n: 14, phase: 'DEBUG' }),
    ]);
    assert.deepEqual(g.nodes.map((n) => [n.id, n.type]), [
      ['lg-10-cp', 'checkpoint'], ['lg-11-cp', 'checkpoint'],
      ['lg-12-state', 'state'], ['lg-13-rem', 'governance'], ['lg-14-rem', 'governance'],
    ]);
  });

  test('planning phases (RESEARCH/PLAN/ORGANIZE/BOOTSTRAP) produce no nodes', () => {
    const g = reconstructGenomeFromLedger([
      E({ n: 20, phase: 'RESEARCH' }), E({ n: 21, phase: 'PLAN' }),
      E({ n: 22, phase: 'ORGANIZE' }), E({ n: 23, phase: 'BOOTSTRAP' }),
    ]);
    assert.deepEqual(g.nodes, []);
    assert.deepEqual(g.edges, []);
  });

  test('degrade-safe: [] → empty graph', () => {
    assert.deepEqual(reconstructGenomeFromLedger([]), { nodes: [], edges: [] });
  });
});
