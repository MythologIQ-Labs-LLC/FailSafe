// Functional tests for QoreLogicManager (FX333) — façade delegation contract.

import { strict as assert } from 'assert';
import { QoreLogicManager } from '../../qorelogic/QoreLogicManager';
import { EventBus } from '../../shared/EventBus';

interface CapturedCalls {
  ledger: any[];
  trustRegister: any[];
  shadowArchive: any[];
  shadowDispose: number;
}

function makeStubs(opts: {
  decision?: string;
  trustScore?: number;
  shadowArchiveThrows?: boolean;
} = {}): { mgr: QoreLogicManager; calls: CapturedCalls; stubs: any } {
  const calls: CapturedCalls = {
    ledger: [], trustRegister: [], shadowArchive: [], shadowDispose: 0,
  };
  const stateStore: any = {
    get: <T>(_k: string, def: T) => def,
    update: async () => {},
  };
  const config: any = { getConfig: () => ({ qorelogic: { l3SLA: 3600 } }) };
  const ledger: any = {
    appendEntry: async (e: any) => { calls.ledger.push(e); return { id: calls.ledger.length }; },
  };
  const trust: any = {
    registerAgent: async (persona: string, pk: string) => {
      const ident = { did: `did:t:${persona}`, persona, publicKey: pk, trustScore: opts.trustScore ?? 0.5 };
      calls.trustRegister.push(ident);
      return ident;
    },
    updateTrust: async () => {},
    quarantineAgent: async () => {},
    getTrustScore: () => ({ score: 0.5 }),
  };
  const policy: any = {};
  const shadow: any = {
    archiveFailure: async (e: any) => {
      if (opts.shadowArchiveThrows) throw new Error('archive boom');
      calls.shadowArchive.push(e);
      return { id: calls.shadowArchive.length, failureMode: 'LOGIC_ERROR' };
    },
    getNegativeConstraintsForAgent: async (_did: string) => ['avoid:foo', 'avoid:bar'],
    analyzeFailurePatterns: async () => [{ failureMode: 'LOGIC_ERROR', count: 3, agentDids: [], recentCauses: [] }],
    getEntriesByAgent: async (_did: string, _limit: number) => [{ id: 1 }],
    close: () => { calls.shadowDispose++; },
  };
  const bus = new EventBus();
  const mgr = new QoreLogicManager(stateStore, config, ledger, trust, policy, shadow, bus);
  return { mgr, calls, stubs: { stateStore, config, ledger, trust, policy, shadow, bus } };
}

suite('QoreLogicManager (FX333)', () => {
  test('FX333 initialize — loads L3 queue without throwing', async () => {
    const { mgr } = makeStubs();
    await assert.doesNotReject(mgr.initialize());
  });

  test('FX333 getLedgerManager / getTrustEngine / getPolicyEngine / getShadowGenomeManager — return injected instances', () => {
    const { mgr, stubs } = makeStubs();
    assert.equal(mgr.getLedgerManager(), stubs.ledger);
    assert.equal(mgr.getTrustEngine(), stubs.trust);
    assert.equal(mgr.getPolicyEngine(), stubs.policy);
    assert.equal(mgr.getShadowGenomeManager(), stubs.shadow);
  });

  test('FX333 queueL3Approval — delegates to L3ApprovalService and appends L3_QUEUED ledger entry', async () => {
    const { mgr, calls } = makeStubs();
    const id = await mgr.queueL3Approval({
      agentDid: 'did:t:a', agentTrust: 0.8, filePath: 'src/x.ts',
      riskGrade: 'L3', sentinelSummary: 'check', flags: [],
    });
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.ok(calls.ledger.some(c => c.eventType === 'L3_QUEUED'));
  });

  test('FX333 getL3Queue — returns array of queued requests', async () => {
    const { mgr } = makeStubs();
    await mgr.queueL3Approval({
      agentDid: 'did:t:a', agentTrust: 0.8, filePath: 'src/x.ts',
      riskGrade: 'L3', sentinelSummary: '', flags: [],
    });
    const q = mgr.getL3Queue();
    assert.equal(q.length, 1);
  });

  test('FX333 processL3Decision — APPROVED → L3_APPROVED ledger + queue cleared', async () => {
    const { mgr, calls } = makeStubs();
    const id = await mgr.queueL3Approval({
      agentDid: 'did:t:a', agentTrust: 0.8, filePath: 'src/x.ts',
      riskGrade: 'L3', sentinelSummary: '', flags: [],
    });
    await mgr.processL3Decision(id, 'APPROVED');
    assert.ok(calls.ledger.some(c => c.eventType === 'L3_APPROVED'));
    assert.equal(mgr.getL3Queue().length, 0);
  });

  test('FX333 registerAgent — calls trust.registerAgent + appends AGENT_REGISTERED ledger', async () => {
    const { mgr, calls } = makeStubs({ trustScore: 0.7 });
    const ident = await mgr.registerAgent('governor', 'pk-base64');
    assert.equal(ident.persona, 'governor');
    assert.equal(ident.trustScore, 0.7);
    assert.equal(calls.trustRegister.length, 1);
    const ledgerEntry = calls.ledger.find(c => c.payload?.action === 'AGENT_REGISTERED');
    assert.ok(ledgerEntry);
    assert.equal(ledgerEntry.payload.persona, 'governor');
  });

  test('FX333 archiveFailedVerdict — PASS verdict skipped, returns null', async () => {
    const { mgr, calls } = makeStubs();
    const r = await mgr.archiveFailedVerdict({ decision: 'PASS' } as never, 'src/x.ts');
    assert.equal(r, null);
    assert.equal(calls.shadowArchive.length, 0);
  });

  test('FX333 archiveFailedVerdict — non-PASS verdict archived to Shadow Genome', async () => {
    const { mgr, calls } = makeStubs();
    const r = await mgr.archiveFailedVerdict({
      decision: 'BLOCK', summary: 's', details: 'd',
      agentDid: 'did:t:a', riskGrade: 'L3',
    } as never, 'src/x.ts');
    assert.ok(r);
    assert.equal(calls.shadowArchive.length, 1);
  });

  test('FX333 archiveFailedVerdict — shadow throw returns null (swallowed)', async () => {
    const { mgr } = makeStubs({ shadowArchiveThrows: true });
    const r = await mgr.archiveFailedVerdict({
      decision: 'BLOCK', summary: '', details: '', agentDid: '', riskGrade: 'L3',
    } as never, 'src/x.ts');
    assert.equal(r, null);
  });

  test('FX333 getAgentNegativeConstraints — delegates to ShadowGenomeManager', async () => {
    const { mgr } = makeStubs();
    const constraints = await mgr.getAgentNegativeConstraints('did:t:a');
    assert.deepEqual(constraints, ['avoid:foo', 'avoid:bar']);
  });

  test('FX333 getFailurePatterns — delegates to ShadowGenomeManager', async () => {
    const { mgr } = makeStubs();
    const patterns = await mgr.getFailurePatterns();
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].failureMode, 'LOGIC_ERROR');
  });

  test('FX333 getAgentFailureHistory — delegates to ShadowGenomeManager.getEntriesByAgent', async () => {
    const { mgr } = makeStubs();
    const history = await mgr.getAgentFailureHistory('did:t:a', 50);
    assert.equal(history.length, 1);
  });

  test('FX333 dispose — closes ShadowGenomeManager', () => {
    const { mgr, calls } = makeStubs();
    mgr.dispose();
    assert.equal(calls.shadowDispose, 1);
  });
});
