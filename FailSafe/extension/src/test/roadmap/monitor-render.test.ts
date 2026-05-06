import { strict as assert } from "assert";
// @ts-expect-error JS module import in TS test context
import { getPhaseInfo, getFeatureSummary, renderPhase } from "../../../src/roadmap/ui/modules/monitor-render.js";

function makeEls(): any {
  return {
    phaseTitle: { textContent: '' },
    phaseTrack: { innerHTML: '' },
  };
}

suite("monitor-render — getPhaseInfo", () => {
  test("IMPLEMENT governancePhase → {title:'IMPLEMENT', index:2}", () => {
    const r = getPhaseInfo({ governancePhase: { current: 'IMPLEMENT' } });
    assert.equal(r.title, 'IMPLEMENT');
    assert.equal(r.index, 2);
  });

  test("SEALED governancePhase → index 4", () => {
    const r = getPhaseInfo({ governancePhase: { current: 'SEALED' } });
    assert.equal(r.title, 'SEALED');
    assert.equal(r.index, 4);
  });

  test("IDLE + Debug runState → fallback to runState", () => {
    const r = getPhaseInfo({
      governancePhase: { current: 'IDLE' },
      runState: { currentPhase: 'Debugging session' },
    });
    assert.equal(r.title, 'Debugging session');
    assert.equal(r.index, 3);
  });

  test("IDLE + recentCompletions populated → Plan reset", () => {
    const r = getPhaseInfo({
      governancePhase: { current: 'IDLE', recentCompletions: [{ entry: 1 }] },
    });
    assert.equal(r.title, 'Plan');
    assert.equal(r.index, 0);
  });

  test("no governance, no runState, fall back to plan phases", () => {
    const r = getPhaseInfo({
      activePlan: {
        currentPhaseId: 'audit',
        phases: [
          { id: 'plan', title: 'Plan', status: 'completed' },
          { id: 'audit', title: 'Audit Review', status: 'active' },
        ],
      },
    });
    assert.equal(r.title, 'Audit Review');
    assert.equal(r.index, 1);
  });
});

suite("monitor-render — getFeatureSummary", () => {
  test("governance recentCompletions → joined line", () => {
    const r = getFeatureSummary([], [], [], [], {
      recentCompletions: [
        { phase: 'IMPLEMENT', plan: 'voice-substrate' },
        { phase: 'GATE', entry: 42 },
      ],
    }, []);
    assert.match(r.line, /IMPLEMENT: voice-substrate/);
    assert.match(r.line, /GATE: Entry #42/);
  });

  test("VETO/BLOCK alerts counted in critical", () => {
    const r = getFeatureSummary(
      [{ severity: 'hard' }],
      [],
      [{ severity: 'hard' }],
      [{ level: 'danger' }],
      {
        recentCompletions: [{ phase: 'PLAN' }],
        activeAlerts: [{ type: 'VETO' }, { type: 'BLOCK' }, { type: 'WARNING' }],
      },
      [],
    );
    // hard blockers (1) + danger risks (1) + VETO+BLOCK alerts (2) = 4
    assert.equal(r.critical, 4);
  });

  test("no governance → fallback to milestones / phases / completions", () => {
    const r = getFeatureSummary([], [], [], [], null, [
      { type: 'IMPLEMENT', phase: 'B190' },
    ]);
    assert.match(r.line, /IMPLEMENT: B190/);
  });

  test("zero data anywhere → 'None yet'", () => {
    const r = getFeatureSummary([], [], [], [], null, []);
    assert.equal(r.line, 'None yet');
  });
});

suite("monitor-render — renderPhase", () => {
  test("GATE phase → Plan done, Audit active, Implement+Substantiate pending", () => {
    const els = makeEls();
    renderPhase({ title: 'GATE', index: 1 }, els);
    assert.equal(els.phaseTitle.textContent, 'GATE');
    assert.match(els.phaseTrack.innerHTML, /class="step done">Plan/);
    assert.match(els.phaseTrack.innerHTML, /class="step active">Audit/);
    assert.match(els.phaseTrack.innerHTML, /class="step pending">Implement/);
    assert.match(els.phaseTrack.innerHTML, /class="step pending">Substantiate/);
  });

  test("IMPLEMENT (index 2) → Plan/Audit done, Implement active", () => {
    const els = makeEls();
    renderPhase({ title: 'IMPLEMENT', index: 2 }, els);
    assert.match(els.phaseTrack.innerHTML, /class="step done">Plan/);
    assert.match(els.phaseTrack.innerHTML, /class="step done">Audit/);
    assert.match(els.phaseTrack.innerHTML, /class="step active">Implement/);
  });

  test("Debug index 3 → Debugging row active", () => {
    const els = makeEls();
    renderPhase({ title: 'Debug', index: 3 }, els);
    assert.match(els.phaseTrack.innerHTML, /class="step debugging">Debugging\.\.\./);
  });

  test("missing phaseTrack element → no throw", () => {
    assert.doesNotThrow(() => renderPhase({ title: 'PLAN', index: 0 }, { phaseTitle: { textContent: '' } } as any));
  });
});
