// Functional tests for EventSubscriptionManager (FX448).

import { strict as assert } from 'assert';
import { EventSubscriptionManager } from '../../roadmap/services/EventSubscriptionManager';
import { EventBus } from '../../shared/EventBus';

interface CapturedDeps {
  checkpoints: any[];
  broadcasts: any[];
  transparencyEvents: any[];
  observedFileMutations: any[];
  sealedSubstantiateCompletions: Set<string>;
}

function makeDeps(captured: CapturedDeps, opts: { plan?: any; phaseKey?: string } = {}): any {
  return {
    eventBus: new EventBus(),
    recordCheckpoint: (r: any) => captured.checkpoints.push(r),
    broadcast: (d: any) => captured.broadcasts.push(d),
    logTransparencyEvent: (e: any) => captured.transparencyEvents.push(e),
    inferPhaseKey: () => opts.phaseKey ?? 'plan',
    recordObservedFileMutation: (p: any) => captured.observedFileMutations.push(p),
    getPlan: (planId: string) => opts.plan ?? { phases: [] },
    sealedSubstantiateCompletions: captured.sealedSubstantiateCompletions,
  };
}

function captured(): CapturedDeps {
  return {
    checkpoints: [], broadcasts: [], transparencyEvents: [], observedFileMutations: [],
    sealedSubstantiateCompletions: new Set(),
  };
}

suite('EventSubscriptionManager (FX448)', () => {
  test('FX448 subscribe — registers handlers without throwing', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    const m = new EventSubscriptionManager(deps);
    assert.doesNotThrow(() => m.subscribe());
  });

  test('FX448 sentinel.verdict — records policy.checked checkpoint + broadcasts verdict + transparency', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    const m = new EventSubscriptionManager(deps);
    m.subscribe();
    deps.eventBus.emit('sentinel.verdict' as never, {
      decision: 'BLOCK', riskGrade: 'L3', filePath: 'src/x.ts', agentDid: 'did:t:a', summary: 'risky',
    });
    const checkpoint = cap.checkpoints.find(c => c.checkpointType === 'policy.checked');
    assert.ok(checkpoint);
    assert.equal(checkpoint.policyVerdict, 'BLOCK');
    assert.ok(cap.broadcasts.some(b => b.type === 'verdict'));
    assert.ok(cap.broadcasts.some(b => b.type === 'transparency'));
  });

  test('FX448 sentinel.verdict — PASS decision additionally records attempt.committed checkpoint', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('sentinel.verdict' as never, {
      decision: 'PASS', riskGrade: 'L1', agentDid: 'did:t:a', summary: 'ok',
    });
    const committed = cap.checkpoints.find(c => c.checkpointType === 'attempt.committed');
    assert.ok(committed);
    assert.equal(committed.status, 'sealed');
  });

  test('FX448 sentinel.verdict — non-PASS does NOT record attempt.committed', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('sentinel.verdict' as never, { decision: 'BLOCK', riskGrade: 'L3', agentDid: 'did:t:a' });
    assert.equal(cap.checkpoints.find(c => c.checkpointType === 'attempt.committed'), undefined);
  });

  test('FX448 genesis.streamEvent — broadcasts event + records event.stream checkpoint', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('genesis.streamEvent' as never, { foo: 'bar' });
    assert.ok(cap.broadcasts.some(b => b.type === 'event'));
    assert.ok(cap.checkpoints.some(c => c.checkpointType === 'event.stream'));
  });

  test('FX448 sentinel.activityObserved — forwards payload to recordObservedFileMutation', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('sentinel.activityObserved' as never, { file: 'src/foo.ts' });
    assert.equal(cap.observedFileMutations.length, 1);
    assert.deepEqual(cap.observedFileMutations[0], { file: 'src/foo.ts' });
  });

  test('FX448 transparency.prompt — logs event + broadcasts transparency', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('transparency.prompt' as never, { type: 'prompt.dispatched', id: 'p1' });
    assert.equal(cap.transparencyEvents.length, 1);
    assert.ok(cap.broadcasts.some(b => b.type === 'transparency'));
  });

  test('FX448 qorelogic.l3Queued — records override.requested + broadcasts hub.refresh + transparency', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('qorelogic.l3Queued' as never, { id: 'q1', riskGrade: 'L3', filePath: 'src/x.ts' });
    const checkpoint = cap.checkpoints.find(c => c.checkpointType === 'override.requested');
    assert.ok(checkpoint);
    assert.equal(checkpoint.policyVerdict, 'ESCALATE');
    assert.ok(cap.broadcasts.some(b => b.type === 'hub.refresh'));
  });

  test('FX448 qorelogic.l3Decided — records override.approved + transparency', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('qorelogic.l3Decided' as never, { id: 'q1', decision: 'APPROVED' });
    const checkpoint = cap.checkpoints.find(c => c.checkpointType === 'override.approved');
    assert.ok(checkpoint);
    assert.equal(checkpoint.status, 'sealed');
  });

  test('FX448 qorelogic.trustUpdate — broadcasts hub.refresh only', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('qorelogic.trustUpdate' as never, { agentDid: 'did:t:a' });
    assert.ok(cap.broadcasts.some(b => b.type === 'hub.refresh'));
  });

  test('FX448 agentRun.started/completed/stepRecorded — broadcasts with action label', () => {
    const cap = captured();
    const deps = makeDeps(cap);
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('agentRun.started' as never, { runId: 'r1' });
    deps.eventBus.emit('agentRun.completed' as never, { runId: 'r1' });
    deps.eventBus.emit('agentRun.stepRecorded' as never, { runId: 'r1', stepId: 's1' });
    const runs = cap.broadcasts.filter(b => b.type === 'agentRun');
    assert.equal(runs.length, 3);
    assert.deepEqual(runs.map(r => r.payload.action), ['started', 'completed', 'step']);
  });

  test('FX448 phase.completed for substantiate — records phase.exited checkpoint with dedup', () => {
    const cap = captured();
    const deps = makeDeps(cap, {
      plan: { phases: [{ id: 'p1', title: 'Substantiate session' }] },
    });
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('genesis.streamEvent' as never, {
      planEvent: { type: 'phase.completed', planId: 'plan-1', payload: { phaseId: 'p1' } },
    });
    const exited = cap.checkpoints.find(c => c.checkpointType === 'phase.exited');
    assert.ok(exited);
    assert.equal(exited.status, 'sealed');
    // Repeat — should be deduped
    deps.eventBus.emit('genesis.streamEvent' as never, {
      planEvent: { type: 'phase.completed', planId: 'plan-1', payload: { phaseId: 'p1' } },
    });
    const exitedCount = cap.checkpoints.filter(c => c.checkpointType === 'phase.exited').length;
    assert.equal(exitedCount, 1, 'dedup blocks second emission');
  });

  test('FX448 phase.completed for non-substantiate phase — no phase.exited checkpoint', () => {
    const cap = captured();
    const deps = makeDeps(cap, {
      plan: { phases: [{ id: 'p1', title: 'Plan phase' }] },
    });
    new EventSubscriptionManager(deps).subscribe();
    deps.eventBus.emit('genesis.streamEvent' as never, {
      planEvent: { type: 'phase.completed', planId: 'plan-1', payload: { phaseId: 'p1' } },
    });
    assert.equal(cap.checkpoints.find(c => c.checkpointType === 'phase.exited'), undefined);
  });
});
