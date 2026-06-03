import { strict as assert } from 'assert';
import {
  computePct, lintTrackerModel, lintPasses,
  TrackerModel, EvidenceRef,
} from '../../../roadmap/tracker/tracker-core';

/** A minimal fully-cited, lint-clean model for mutation tests. */
function validModel(): TrackerModel {
  const ev: EvidenceRef[] = [{ kind: 'feature', id: 'FX1', status: 'verified' }];
  return {
    title: 'T', date: '2026-06-02', scope: 's',
    basis: { text: 'b', evidence: ev },
    summary: { posture: 'p', nextGate: 'g', mainConstraint: 'c' },
    verticals: [{
      key: 'k', name: 'V', accent: 'var(--kernel)', pct: 50,
      provenance: { source: 'FEATURE_INDEX', formula: 'round(100·1/2)' },
      scoredOn: { text: '1 verified', evidence: ev },
      nextGate: 'next', inPlace: [{ text: 'FX1', evidence: ev }],
      whyItMatters: 'm', openWork: [],
    }],
    shipped: [{ date: '2026-06-02', channel: 'merged', text: 'x', evidence: ev }],
    manifest: [{ area: 'a', evidence: ev }],
    sequence: [],
    decisions: [{ decision: 'd', drivenBy: 'a binding requirement', evidence: ev }],
    risks: [{ risk: 'r', whyItMatters: 'w', mitigation: 'fix', evidence: ev }],
    convergence: [],
    pending: [],
    footer: 'f', generatedAt: '2026-06-02T00:00:00Z', generatedFrom: ev,
  };
}
const RESOLVE_ALL = () => true;

suite('tracker-core (dev-tracker-v1)', () => {
  test('computePct: empty set → 0 + "not adopted" formula', () => {
    const r = computePct({ verified: 0, unverified: 0, open: 0 });
    assert.equal(r.pct, 0);
    assert.match(r.formula, /not adopted/);
  });

  test('computePct: rounds verified/total, excludes nothing here', () => {
    assert.equal(computePct({ verified: 1, unverified: 1, open: 0 }).pct, 50);
    assert.equal(computePct({ verified: 2, unverified: 0, open: 1 }).pct, 67);
  });

  test('lint: a fully-cited model with resolving evidence passes', () => {
    const findings = lintTrackerModel(validModel(), RESOLVE_ALL);
    assert.equal(findings.filter((f) => f.severity === 'abort').length, 0);
    assert.equal(lintPasses(findings), true);
  });

  test('lint: uncited basis → ABORT uncited-claim', () => {
    const m = validModel(); m.basis.evidence = [];
    const f = lintTrackerModel(m, RESOLVE_ALL);
    assert.ok(f.some((x) => x.rule === 'uncited-claim' && x.severity === 'abort'));
    assert.equal(lintPasses(f), false);
  });

  test('lint: decision driven by preference → ABORT decision-without-requirement', () => {
    const m = validModel(); m.decisions[0].drivenBy = 'preference';
    const f = lintTrackerModel(m, RESOLVE_ALL);
    assert.ok(f.some((x) => x.rule === 'decision-without-requirement'));
    assert.equal(lintPasses(f), false);
  });

  test('lint: vertical without provenance.formula → ABORT pct-not-computed', () => {
    const m = validModel(); m.verticals[0].provenance = { source: 's', formula: '' };
    const f = lintTrackerModel(m, RESOLVE_ALL);
    assert.ok(f.some((x) => x.rule === 'pct-not-computed'));
  });

  test('lint: dangling evidence (unresolved feature) → ABORT dangling-evidence', () => {
    const m = validModel();
    const f = lintTrackerModel(m, (ref) => !(ref.kind === 'feature' && ref.id === 'FX1'));
    assert.ok(f.some((x) => x.rule === 'dangling-evidence'));
    assert.equal(lintPasses(f), false);
  });

  test('lint: empty narrative arrays (decisions/risks) are allowed', () => {
    const m = validModel(); m.decisions = []; m.risks = [];
    const f = lintTrackerModel(m, RESOLVE_ALL);
    assert.equal(lintPasses(f), true);
  });
});
