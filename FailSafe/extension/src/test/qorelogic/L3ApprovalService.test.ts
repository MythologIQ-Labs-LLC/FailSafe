// Functional tests for L3ApprovalService (FX249).

import { strict as assert } from 'assert';
import { L3ApprovalService } from '../../qorelogic/L3ApprovalService';
import { EventBus } from '../../shared/EventBus';

interface Stubs {
  state: any;
  stateStore: any;
  config: any;
  ledger: any;
  trust: any;
  bus: EventBus;
  ledgerCalls: any[];
  trustUpdates: any[];
}

function makeStubs(opts: { l3SLA?: number; queue?: any[]; ledgerThrows?: boolean } = {}): Stubs {
  const ledgerCalls: any[] = [];
  const trustUpdates: any[] = [];
  const state: any = { l3Queue: opts.queue ?? [] };
  const stateStore = {
    get: <T>(k: string, def: T) => (state[k] ?? def) as T,
    update: async (k: string, v: any) => { state[k] = v; },
  };
  const config = { getConfig: () => ({ qorelogic: { l3SLA: opts.l3SLA ?? 3600 } }) };
  const ledger = {
    appendEntry: async (e: any) => {
      if (opts.ledgerThrows) throw new Error('ledger boom');
      ledgerCalls.push(e);
      return { id: ledgerCalls.length };
    },
  };
  const trust = { updateTrust: async (did: string, outcome: string) => trustUpdates.push({ did, outcome }) };
  return { state, stateStore, config, ledger, trust, bus: new EventBus(), ledgerCalls, trustUpdates };
}

const REQ = {
  agentDid: 'did:t:agent-1',
  agentTrust: 0.8,
  filePath: 'src/foo.ts',
  riskGrade: 'L3' as const,
  sentinelSummary: 'critical issue',
  flags: ['F1'],
};

suite('L3ApprovalService (FX249)', () => {
  test('FX249 loadQueue — pulls existing queue from state store', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const s = makeStubs({ queue: [{ id: 'r1', filePath: 'x', slaDeadline: future }] });
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    svc.loadQueue();
    const q = svc.getQueue();
    assert.equal(q.length, 1);
    assert.equal(q[0].id, 'r1');
  });

  test('FX249 queueL3Approval — adds request with UUID + QUEUED state + SLA deadline', async () => {
    const s = makeStubs({ l3SLA: 3600 });
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval(REQ);
    assert.match(id, /^[0-9a-f-]{36}$/);
    const q = svc.getQueue();
    assert.equal(q.length, 1);
    assert.equal(q[0].state, 'QUEUED');
    assert.match(q[0].queuedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(q[0].slaDeadline, /^\d{4}-\d{2}-\d{2}T/);
    // SLA deadline should be ~3600 seconds after queuedAt
    const delta = new Date(q[0].slaDeadline).getTime() - new Date(q[0].queuedAt).getTime();
    assert.ok(delta >= 3590 * 1000 && delta <= 3610 * 1000);
  });

  test('FX249 queueL3Approval — appends L3_QUEUED to ledger + emits qorelogic.l3Queued event', async () => {
    const s = makeStubs();
    const queuedEvents: any[] = [];
    s.bus.on('qorelogic.l3Queued' as never, (w: any) => queuedEvents.push(w));
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await svc.queueL3Approval(REQ);
    assert.equal(s.ledgerCalls.length, 1);
    assert.equal(s.ledgerCalls[0].eventType, 'L3_QUEUED');
    assert.equal(s.ledgerCalls[0].agentDid, REQ.agentDid);
    assert.equal(s.ledgerCalls[0].riskGrade, 'L3');
    assert.equal(queuedEvents.length, 1);
  });

  test('FX249 processL3Decision — APPROVED removes from queue + appends L3_APPROVED ledger entry', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval(REQ);
    await svc.processL3Decision(id, 'APPROVED');
    assert.equal(svc.getQueue().length, 0);
    const approval = s.ledgerCalls.find(c => c.eventType === 'L3_APPROVED');
    assert.ok(approval);
    assert.equal(approval.overseerDecision, 'APPROVED');
  });

  test('FX249 processL3Decision — REJECTED appends L3_REJECTED ledger entry', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval(REQ);
    await svc.processL3Decision(id, 'REJECTED');
    const reject = s.ledgerCalls.find(c => c.eventType === 'L3_REJECTED');
    assert.ok(reject);
  });

  test('FX249 processL3Decision — APPROVED with conditions sets state APPROVED_WITH_CONDITIONS', async () => {
    const s = makeStubs();
    const decisions: any[] = [];
    s.bus.on('qorelogic.l3Decided' as never, (w: any) => decisions.push(w.payload));
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval(REQ);
    await svc.processL3Decision(id, 'APPROVED', ['must-add-tests', 'must-update-docs']);
    assert.equal(decisions[0].request.state, 'APPROVED_WITH_CONDITIONS');
    assert.deepEqual(decisions[0].request.conditions, ['must-add-tests', 'must-update-docs']);
  });

  test('FX249 processL3Decision — APPROVED updates trust as success; REJECTED as failure', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id1 = await svc.queueL3Approval(REQ);
    const id2 = await svc.queueL3Approval(REQ);
    await svc.processL3Decision(id1, 'APPROVED');
    await svc.processL3Decision(id2, 'REJECTED');
    assert.equal(s.trustUpdates[0].outcome, 'success');
    assert.equal(s.trustUpdates[1].outcome, 'failure');
  });

  test('FX249 processL3Decision — unknown id throws', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await assert.rejects(svc.processL3Decision('does-not-exist', 'APPROVED'), /not found/);
  });

  test('FX249 mapRiskToLegacy — R0/R1→L1, R2→L2, R3→L3', () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    assert.equal(svc.mapRiskToLegacy('R0' as never), 'L1');
    assert.equal(svc.mapRiskToLegacy('R1' as never), 'L1');
    assert.equal(svc.mapRiskToLegacy('R2' as never), 'L2');
    assert.equal(svc.mapRiskToLegacy('R3' as never), 'L3');
  });

  test('FX249 processEvaluationDecision — tier 3 queues L3 approval', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await svc.processEvaluationDecision(
      { tier: 3, triage: { risk: 'R3', novelty: 'high', confidence: 'low' }, writeLedger: true } as never,
      { id: 'evt-1', timestamp: '2026-05-07T00:00:00Z', category: 'sentinel', payload: { targetPath: 'src/x.ts', intentId: 'intent-1' } } as never,
    );
    assert.equal(svc.getQueue().length, 1);
    assert.equal(svc.getQueue()[0].riskGrade, 'L3');
  });

  test('FX249 processEvaluationDecision — tier <3 does NOT queue L3', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await svc.processEvaluationDecision(
      { tier: 2, triage: { risk: 'R2', novelty: 'low', confidence: 'high' }, writeLedger: false } as never,
      { id: 'evt-2', timestamp: '2026-05-07T00:00:00Z', category: 'sentinel', payload: { targetPath: 'src/x.ts' } } as never,
    );
    assert.equal(svc.getQueue().length, 0);
  });

  test('FX249 processEvaluationDecision — writeLedger=true → EVALUATION_ROUTED logged', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await svc.processEvaluationDecision(
      { tier: 1, triage: { risk: 'R1', novelty: 'low', confidence: 'high' }, writeLedger: true } as never,
      { id: 'evt-3', timestamp: '2026-05-07T00:00:00Z', category: 'sentinel', payload: { targetPath: 'src/x.ts' } } as never,
    );
    const routed = s.ledgerCalls.find(c => c.eventType === 'EVALUATION_ROUTED');
    assert.ok(routed);
  });

  test('FX249 refreshFromWorkspace — re-reads externally mutated state store (B192)', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const s = makeStubs({
      queue: [{ id: 'r1', filePath: 'a.ts', slaDeadline: future }],
    });
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    svc.loadQueue();
    assert.equal(svc.getQueue().length, 1, 'pre-mutation cache should hold 1 item');

    // External mutation: replace persisted state-store contents directly,
    // bypassing the service (simulating an out-of-process writer).
    s.state.l3Queue = [
      { id: 'r1', filePath: 'a.ts', slaDeadline: future },
      { id: 'r2', filePath: 'b.ts', slaDeadline: future },
    ];

    // Without refresh, stale in-memory cache would still report 1.
    svc.refreshFromWorkspace();

    const refreshed = svc.getQueue();
    assert.equal(refreshed.length, 2, 'refreshFromWorkspace must reload cache from store');
    assert.equal(refreshed[1].id, 'r2');
  });

  test('FX249 getQueue — auto-prunes expired items + emits l3Decided EXPIRED', async () => {
    const s = makeStubs({ l3SLA: 0 }); // immediate expiration
    const decisions: any[] = [];
    s.bus.on('qorelogic.l3Decided' as never, (w: any) => decisions.push(w.payload));
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await svc.queueL3Approval(REQ);
    await new Promise(r => setTimeout(r, 10));
    // Force lastPruneAt reset by accessing twice (5s throttle)
    (svc as any).lastPruneAt = 0;
    const q = svc.getQueue();
    assert.equal(q.length, 0);
    assert.equal(decisions[0].decision, 'EXPIRED');
  });
});
