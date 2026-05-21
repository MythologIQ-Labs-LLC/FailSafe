// FX554 — Phase 1 of plan-qor-b-int-2-preflight-l3 (B-INT-2).
// L3ApprovalService.attachPreflightEvidence: merges meta.preflight + dedups
// the flag onto an existing live-queue entry; idempotent; no-op on unknown id;
// preserves pre-existing meta keys.

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

const REQ = {
  agentDid: 'did:t:agent-1',
  agentTrust: 0.8,
  filePath: 'src/foo.ts',
  riskGrade: 'L3' as const,
  sentinelSummary: 'critical issue',
  flags: ['F1'],
};

const PREFLIGHT_META = {
  driftedDecisions: [{ decisionId: 'd1', title: 'Adopt 15-min TTL', status: 'drifted' }],
  checkedAt: '2026-05-20T00:00:00Z',
};

suite('L3ApprovalService.attachPreflightEvidence (FX554)', () => {
  test('attaches meta.preflight + flag onto an existing queued entry', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval(REQ);
    await svc.attachPreflightEvidence(id, PREFLIGHT_META, 'bicameral-preflight-conflict');
    const entry = svc.getQueue().find((e) => e.id === id)!;
    assert.deepEqual(entry.meta?.preflight, PREFLIGHT_META);
    assert.ok(entry.flags.includes('bicameral-preflight-conflict'));
  });

  test('calling twice with the same args does not duplicate the flag', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval(REQ);
    await svc.attachPreflightEvidence(id, PREFLIGHT_META, 'bicameral-preflight-conflict');
    await svc.attachPreflightEvidence(id, PREFLIGHT_META, 'bicameral-preflight-conflict');
    const entry = svc.getQueue().find((e) => e.id === id)!;
    const count = entry.flags.filter((f) => f === 'bicameral-preflight-conflict').length;
    assert.equal(count, 1);
  });

  test('unknown approvalId → no throw, queue unchanged', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    await svc.queueL3Approval(REQ);
    await svc.attachPreflightEvidence('does-not-exist', PREFLIGHT_META, 'flag');
    assert.equal(svc.getQueue().length, 1);
    assert.equal(svc.getQueue()[0].meta?.preflight, undefined);
  });

  test('existing meta keys on the entry are preserved (merge, not replace)', async () => {
    const s = makeStubs();
    const svc = new L3ApprovalService(s.stateStore, s.config, s.ledger, s.trust, s.bus);
    const id = await svc.queueL3Approval({ ...REQ, meta: { decisionId: 'pre-existing' } });
    await svc.attachPreflightEvidence(id, PREFLIGHT_META, 'bicameral-preflight-conflict');
    const entry = svc.getQueue().find((e) => e.id === id)!;
    assert.equal(entry.meta?.decisionId, 'pre-existing');
    assert.deepEqual(entry.meta?.preflight, PREFLIGHT_META);
  });
});
