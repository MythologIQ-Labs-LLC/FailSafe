import { strict as assert } from 'assert';
import {
  buildPhasesFromLedger,
  MAX_PHASE_RENDER,
} from '../../roadmap/ConsoleServer';
import type { LedgerSummary } from '../../roadmap/services/MetaLedgerReader';

function summaryWith(inFlight: number, completed: number): LedgerSummary {
  return {
    totalEntries: inFlight + completed,
    byKind: {
      GENESIS: 0, "GATE TRIBUNAL": inFlight + completed, IMPLEMENTATION: 0,
      SUBSTANTIATION: completed, "SESSION SEAL": 0, PLAN: 0,
      "RESEARCH BRIEF": 0, REMEDIATION: 0, DELIVER: 0,
      WORKSPACE_ORGANIZATION: 0, OTHER: 0,
    },
    sessionsCompleted: completed,
    plansStarted: inFlight + completed,
    sessionsInFlight: inFlight,
    latestEntry: null,
  };
}

suite('buildPhasesFromLedger: render cap', () => {
  test('emits at most MAX_PHASE_RENDER + 1 records (cap + summary row)', () => {
    const phases = buildPhasesFromLedger(summaryWith(67, 53));
    // Expect MAX_PHASE_RENDER content rows + 1 summary row when truncated.
    assert.equal(phases.length, MAX_PHASE_RENDER + 1);
  });

  test('all primary phases when total fits under cap', () => {
    const phases = buildPhasesFromLedger(summaryWith(2, 3));
    // 5 total, no summary row needed.
    assert.equal(phases.length, 5);
    assert.ok(!phases.some((p) => p.status === 'summary'));
  });

  test('in-flight comes first, completed second (priority ordering)', () => {
    const phases = buildPhasesFromLedger(summaryWith(2, 3));
    assert.equal(phases[0].status, 'in-progress');
    assert.equal(phases[1].status, 'in-progress');
    assert.equal(phases[2].status, 'complete');
  });

  test('caps in-flight first when in-flight alone exceeds cap', () => {
    const phases = buildPhasesFromLedger(summaryWith(20, 5));
    // 20 in-flight > cap; cap reached on in-flight alone, no completed shown.
    const inFlight = phases.filter((p) => p.status === 'in-progress').length;
    const completed = phases.filter((p) => p.status === 'complete').length;
    assert.equal(inFlight, MAX_PHASE_RENDER);
    assert.equal(completed, 0);
  });

  test('summary row reports truncated counts when capped', () => {
    const phases = buildPhasesFromLedger(summaryWith(67, 53));
    const summary = phases.find((p) => p.status === 'summary');
    assert.ok(summary, 'expected summary row when capped');
    assert.match(summary!.name, /more/);
    assert.match(summary!.name, /53 sealed/);
    assert.match(summary!.name, /67 in flight/);
  });

  test('empty summary yields no phases', () => {
    const phases = buildPhasesFromLedger(summaryWith(0, 0));
    assert.deepEqual(phases, []);
  });

  test('all records carry source=meta-ledger', () => {
    const phases = buildPhasesFromLedger(summaryWith(3, 2));
    for (const p of phases) {
      assert.equal(p.source, 'meta-ledger');
    }
  });
});
