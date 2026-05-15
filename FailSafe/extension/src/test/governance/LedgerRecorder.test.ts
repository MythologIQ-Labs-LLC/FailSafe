// Functional tests for LedgerRecorder (FX303).

import { strict as assert } from 'assert';
import { LedgerRecorder } from '../../governance/adapters/LedgerRecorder';

interface CapturedAppend {
  eventType: string;
  agentDid: string;
  agentTrustAtAction: number;
  artifactPath?: string;
  artifactHash?: string;
  riskGrade?: string;
  payload: Record<string, unknown>;
}

function makeStubs(opts: {
  appendId?: string | number;
  trustScore?: number | null;
  policyHash?: string;
  appendThrows?: boolean;
} = {}): { ledger: any; policyEngine: any; trustEngine: any; appended: CapturedAppend[] } {
  const appended: CapturedAppend[] = [];
  const ledger = {
    async appendEntry(entry: CapturedAppend) {
      if (opts.appendThrows) throw new Error('ledger boom');
      appended.push(entry);
      return { id: opts.appendId ?? 42 };
    },
  };
  const policyEngine: any = {};
  if (opts.policyHash !== undefined) policyEngine.getPolicyHash = () => opts.policyHash;
  const trustEngine = {
    getTrustScore: (_did: string) =>
      opts.trustScore === null ? null : { score: opts.trustScore ?? 0.85 },
  };
  return { ledger, policyEngine, trustEngine, appended };
}

const REQ = {
  agentDid: 'did:test:agent1',
  action: 'audit',
  intentId: 'intent-1',
  artifactPath: 'src/foo.ts',
  artifactHash: 'sha256:abc',
};

const POLICY_PASS = {
  allowed: true,
  riskGrade: 'L1',
  conditions: ['cond-a'],
  reason: 'all clear',
};

const POLICY_DENY = {
  allowed: false,
  riskGrade: 'L3',
  conditions: ['blocked-by-rule-x'],
  reason: 'denied',
};

suite('LedgerRecorder (FX303)', () => {
  test('FX303 record — disabled config returns undefined and never appends', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs();
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: false });
    const id = await r.record(REQ as never, POLICY_PASS as never, 'nonce-1');
    assert.equal(id, undefined);
    assert.equal(appended.length, 0);
  });

  test('FX303 record — allowed policy emits GOVERNANCE_RESUMED', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs({ appendId: 7 });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    const id = await r.record(REQ as never, POLICY_PASS as never, 'nonce-1');
    assert.equal(id, '7');
    assert.equal(appended.length, 1);
    assert.equal(appended[0].eventType, 'GOVERNANCE_RESUMED');
  });

  test('FX303 record — denied policy emits GOVERNANCE_PAUSED', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs({ appendId: 8 });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    const id = await r.record(REQ as never, POLICY_DENY as never, 'nonce-2');
    assert.equal(id, '8');
    assert.equal(appended[0].eventType, 'GOVERNANCE_PAUSED');
  });

  test('FX303 record — forwards request fields (agent did, artifact, risk)', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs();
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    await r.record(REQ as never, POLICY_PASS as never, 'nonce-3');
    const e = appended[0];
    assert.equal(e.agentDid, REQ.agentDid);
    assert.equal(e.artifactPath, REQ.artifactPath);
    assert.equal(e.artifactHash, REQ.artifactHash);
    assert.equal(e.riskGrade, 'L1');
  });

  test('FX303 record — payload carries action, intentId, nonce, conditions, reason, policyHash', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs({ policyHash: 'phash-xyz' });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    await r.record(REQ as never, POLICY_DENY as never, 'nonce-4');
    const p = appended[0].payload;
    assert.equal(p.action, REQ.action);
    assert.equal(p.intentId, REQ.intentId);
    assert.equal(p.nonce, 'nonce-4');
    assert.deepEqual(p.conditions, POLICY_DENY.conditions);
    assert.equal(p.reason, POLICY_DENY.reason);
    assert.equal(p.policyHash, 'phash-xyz');
  });

  test('FX303 record — uses trustEngine score on the entry', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs({ trustScore: 0.42 });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    await r.record(REQ as never, POLICY_PASS as never, 'nonce-5');
    assert.equal(appended[0].agentTrustAtAction, 0.42);
  });

  test('FX303 record — null trustScore falls back to 0.0', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs({ trustScore: null });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    await r.record(REQ as never, POLICY_PASS as never, 'nonce-6');
    assert.equal(appended[0].agentTrustAtAction, 0.0);
  });

  test('FX303 record — missing getPolicyHash leaves payload.policyHash undefined', async () => {
    const { ledger, policyEngine, trustEngine, appended } = makeStubs(); // no policyHash setter
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    await r.record(REQ as never, POLICY_PASS as never, 'nonce-7');
    assert.equal(appended[0].payload.policyHash, undefined);
  });

  test('FX303 record — ledger throws → returns undefined and swallows error', async () => {
    const { ledger, policyEngine, trustEngine } = makeStubs({ appendThrows: true });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    const id = await r.record(REQ as never, POLICY_PASS as never, 'nonce-8');
    assert.equal(id, undefined);
  });

  test('FX303 record — coerces numeric ID to string', async () => {
    const { ledger, policyEngine, trustEngine } = makeStubs({ appendId: 999 });
    const r = new LedgerRecorder(ledger, policyEngine, trustEngine, { enableLedger: true });
    const id = await r.record(REQ as never, POLICY_PASS as never, 'nonce-9');
    assert.equal(id, '999');
    assert.equal(typeof id, 'string');
  });
});
