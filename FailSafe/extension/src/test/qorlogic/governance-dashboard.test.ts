import { strict as assert } from 'assert';
import { buildGovernanceDashboard } from '../../qorlogic/governance-dashboard';
import type { ShadowGenomeResult } from '../../qorlogic/shadow-genome-client';
import { FIXTURE_GENOME } from './fixtures/genome-graph.fixture';

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
});
