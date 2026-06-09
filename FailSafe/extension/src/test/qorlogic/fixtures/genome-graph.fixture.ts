import type { GenomeGraph } from '../../../qorlogic/shadow-genome-client';

/**
 * Deterministic genome graph for Phase-1 dashboard tests. Fixed ids/types, no
 * timestamps. `governanceSubgraph` keeps {g1,p1,f1,f2} (+ the 3 incident edges):
 *   - 2 governance nodes (g1, p1) -> 2 project surfaces
 *   - 2 failure nodes (f1, f2); f1 has 2 incident edges -> 1 recurring pattern
 *   - 3 governance->failure chains (g1->f1, g1->f2, p1->f1)
 * The c1->s1 produced edge and the f1->c1 occurred_during edge fall outside the
 * governance subgraph, so they must NOT appear in the dashboard projection.
 */
export const FIXTURE_GENOME: GenomeGraph = {
  nodes: [
    { id: 'g1', type: 'governance', label: 'Governance: plan gate' },
    { id: 'p1', type: 'governance', label: 'Governance: deploy gate' },
    { id: 'f1', type: 'failure', label: 'Spec Drift' },
    { id: 'f2', type: 'failure', label: 'Authority Leak' },
    { id: 'c1', type: 'checkpoint', label: 'Plan #100' },
    { id: 's1', type: 'state', label: 'post-plan' },
  ],
  edges: [
    { id: 'e1', source: 'c1', target: 's1', type: 'produced' },
    { id: 'e2', source: 'f1', target: 'c1', type: 'occurred_during' },
    { id: 'e3', source: 'g1', target: 'f1', type: 'applies_to' },
    { id: 'e4', source: 'g1', target: 'f2', type: 'triggered_by' },
    { id: 'e5', source: 'p1', target: 'f1', type: 'applies_to' },
  ],
};
