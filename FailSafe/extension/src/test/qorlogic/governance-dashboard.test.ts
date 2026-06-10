import { strict as assert } from 'assert';
import { buildGovernanceDashboard } from '../../qorlogic/governance-dashboard';
import type { ShadowGenomeResult } from '../../qorlogic/shadow-genome-client';
import { FIXTURE_GENOME, FIXTURE_GENOME_213 } from './fixtures/genome-graph.fixture';

const AT = '2026-01-01T00:00:00.000Z';

suite('buildGovernanceDashboard', () => {
  test('degraded result (loader off / localOnly) → enabled:false, zeroed, federation unsourced', () => {
    const r = buildGovernanceDashboard({ ok: true, localOnly: true }, { generatedAt: AT });
    assert.equal(r.enabled, false);
    assert.equal(r.degraded, true);
    assert.equal(r.summary.nodeCount, 0);
    assert.equal(r.summary.unresolvedCount, 0);
    assert.equal(r.federation.sourced, false);
    assert.deepEqual(r.trustTransitions, []);
    assert.equal(r.generatedAt, AT); // determinism: injected value verbatim
  });

  test('error result → degraded zeroed payload', () => {
    const r = buildGovernanceDashboard({ ok: false, error: 'boom' }, { generatedAt: AT });
    assert.equal(r.enabled, false);
    assert.equal(r.summary.edgeCount, 0);
  });

  test('enabled fixture → exact governance-subgraph counts', () => {
    const result: ShadowGenomeResult = { ok: true, graph: FIXTURE_GENOME };
    const r = buildGovernanceDashboard(result, { generatedAt: AT });
    assert.equal(r.enabled, true);
    assert.equal(r.degraded, false);
    assert.equal(r.summary.nodeCount, 4);            // g1,p1,f1,f2
    assert.equal(r.summary.edgeCount, 3);            // e3,e4,e5
    assert.equal(r.summary.unresolvedCount, 2);      // f1,f2
    assert.equal(r.summary.recurringPatternCount, 1); // f1 (2 incident edges)
    assert.equal(r.summary.trustTransitionCount, 0);
    assert.deepEqual(r.typeDistribution, { governance: 2, failure: 2 });
  });

  test('recentChains derive only from canonical governance→failure pairs', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.equal(r.recentChains.length, 3);
    // the produced edge c1->s1 (neither governance nor failure) must NOT appear
    assert.ok(r.recentChains.every((c) => c.nodeTypes.includes('governance') && c.nodeTypes.includes('failure')));
    assert.ok(r.recentChains.some((c) => c.rootId === 'p1' && c.failureId === 'f1'));
  });

  test('projectSurfaces: one per governance node with incident failure counts', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.equal(r.projectSurfaces.length, 2);
    const g1 = r.projectSurfaces.find((s) => s.id === 'g1');
    const p1 = r.projectSurfaces.find((s) => s.id === 'p1');
    assert.equal(g1?.failureCount, 2);
    assert.equal(p1?.failureCount, 1);
  });

  test('incidents: one per failure node with recurrence-derived severity + governance roots', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.equal(r.incidents.length, 2);
    const f1 = r.incidents.find((i) => i.id === 'f1');
    const f2 = r.incidents.find((i) => i.id === 'f2');
    // f1: 2 incident edges (g1, p1) → repeated; both governance roots
    assert.equal(f1?.label, 'Spec Drift');
    assert.equal(f1?.recurrence, 2);
    assert.equal(f1?.severity, 'repeated');
    assert.deepEqual(f1?.governanceRoots.map((g) => g.id).sort(), ['g1', 'p1']);
    // f2: 1 incident edge (g1) → emerging
    assert.equal(f2?.recurrence, 1);
    assert.equal(f2?.severity, 'emerging');
    assert.deepEqual(f2?.governanceRoots.map((g) => g.id), ['g1']);
  });

  test('degraded result → incidents empty', () => {
    const r = buildGovernanceDashboard({ ok: true, localOnly: true }, { generatedAt: AT });
    assert.deepEqual(r.incidents, []);
  });

  test('graph: trimmed governance subgraph (id/type/label + edge types, no metadata)', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.equal(r.graph.nodes.length, 4); // g1,p1,f1,f2
    assert.equal(r.graph.edges.length, 3); // e3,e4,e5
    assert.deepEqual(r.graph.nodes.map((n) => n.id).sort(), ['f1', 'f2', 'g1', 'p1']);
    assert.equal(r.graph.nodes.every((n) => (n as { metadata?: unknown }).metadata === undefined), true);
    assert.ok(r.graph.edges.some((e) => e.type === 'applies_to'));
  });

  test('degraded result → empty graph', () => {
    const r = buildGovernanceDashboard({ ok: true, localOnly: true }, { generatedAt: AT });
    assert.deepEqual(r.graph, { nodes: [], edges: [] });
  });

  test('learningMaturity: Observed = failure-node count, deeper stages honest-0', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.equal(r.learningMaturity.length, 6);
    assert.deepEqual(r.learningMaturity[0], { stage: 'Observed', count: 2 }); // f1, f2
    assert.equal(r.learningMaturity.slice(1).every((s) => s.count === 0), true);
  });

  test('federation: peers typed (empty until an adapter sources them)', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.equal(r.federation.sourced, false);
    assert.deepEqual(r.federation.peers, []);
  });
});

suite('buildGovernanceDashboard — #213 producer surfaces wired', () => {
  test('trustTransitions surfaced + counted from the producer', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME_213 }, { generatedAt: AT });
    assert.equal(r.summary.trustTransitionCount, 1);
    assert.equal(r.trustTransitions.length, 1);
    assert.deepEqual(
      { from: r.trustTransitions[0].from, to: r.trustTransitions[0].to, direction: r.trustTransitions[0].direction, governanceNodeId: r.trustTransitions[0].governanceNodeId },
      { from: 'CBT', to: 'KBT', direction: 'promotion', governanceNodeId: 'g1' },
    );
  });

  test('federation: sourced=true with coerced peer states when peers present', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME_213 }, { generatedAt: AT });
    assert.equal(r.federation.sourced, true);
    assert.deepEqual(r.federation.peers.map((p) => [p.id, p.state]), [['peerA', 'synced'], ['peerB', 'stale']]);
  });

  test('learningMaturity: cumulative funnel from failure-node maturity', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME_213 }, { generatedAt: AT });
    // f1 enforced(4) + f2 classified(1) → each counts at every stage up to its own.
    assert.deepEqual(r.learningMaturity.map((s) => s.count), [2, 2, 1, 1, 1, 0]);
    assert.deepEqual(r.learningMaturity.map((s) => s.stage),
      ['Observed', 'Classified', 'Constraint extracted', 'Detectable', 'Enforced', 'Verified']);
  });

  test('degrade-safe: a graph without #213 surfaces falls back to honest-empty', () => {
    const r = buildGovernanceDashboard({ ok: true, graph: FIXTURE_GENOME }, { generatedAt: AT });
    assert.deepEqual(r.trustTransitions, []);
    assert.equal(r.federation.sourced, false);
    assert.equal(r.learningMaturity[0].stage, 'Observed'); // buildMaturity fallback
  });
});
