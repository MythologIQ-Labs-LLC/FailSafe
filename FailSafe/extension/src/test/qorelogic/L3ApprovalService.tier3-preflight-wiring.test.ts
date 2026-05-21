// FX555 — Phase 2 of plan-qor-b-int-2-preflight-l3 (B-INT-2).
// processEvaluationDecision fires the preflight mediator for tier-3 decisions
// only, non-blocking, and tolerates an absent mediator.

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
}

function makeStubs(): Stubs {
  const state: any = { l3Queue: [] };
  const stateStore = {
    get: <T>(k: string, def: T) => (state[k] ?? def) as T,
    update: async (k: string, v: any) => { state[k] = v; },
  };
  const config = { getConfig: () => ({ qorelogic: { l3SLA: 3600 } }) };
  const ledger = { appendEntry: async () => ({ id: 1 }) };
  const trust = { updateTrust: async () => undefined };
  return { state, stateStore, config, ledger, trust, bus: new EventBus() };
}

function tier3Event() {
  return {
    decision: {
      tier: 3,
      triage: { risk: 'R3', novelty: 'high', confidence: 'low' },
      writeLedger: false,
      requiredActions: [],
    },
    event: {
      id: 'evt-1', timestamp: '2026-05-20T00:00:00Z', category: 'sentinel',
      payload: { targetPath: 'src/x.ts', intentId: 'intent-1' },
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

suite('L3ApprovalService tier3 → preflight wiring (FX555)', () => {
  test('tier-3 decision invokes onTier3Queued once with queued id + targetPath', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const calls: Array<{ id: string; path: string }> = [];
    svc.setPreflightMediator({
      onTier3Queued: async (id: string, path: string) => { calls.push({ id, path }); },
    });
    const { decision, event } = tier3Event();
    await svc.processEvaluationDecision(decision as never, event as never);
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, 'src/x.ts');
    assert.equal(calls[0].id, svc.getQueue()[0].id);
  });

  test('tier-1/tier-2 decision does NOT invoke onTier3Queued', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const calls: string[] = [];
    svc.setPreflightMediator({
      onTier3Queued: async (id: string) => { calls.push(id); },
    });
    await svc.processEvaluationDecision(
      { tier: 2, triage: { risk: 'R2', novelty: 'low', confidence: 'high' }, writeLedger: false } as never,
      { id: 'evt-2', timestamp: '2026-05-20T00:00:00Z', category: 'sentinel', payload: { targetPath: 'src/x.ts' } } as never,
    );
    await flush();
    assert.equal(calls.length, 0);
  });

  test('tier-3 with no mediator registered → queueL3Approval succeeds, no throw', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const { decision, event } = tier3Event();
    await svc.processEvaluationDecision(decision as never, event as never);
    assert.equal(svc.getQueue().length, 1);
    assert.equal(svc.getQueue()[0].riskGrade, 'L3');
  });
});
