// Functional tests for PolicyEvaluator (FX295).

import { strict as assert } from 'assert';
import { PolicyEvaluator } from '../../governance/PolicyEvaluator';
import { Logger } from '../../shared/Logger';

interface StubReq { artifactPath?: string; action: string; intentId?: string; payload?: Record<string, unknown>; agentDid?: string; }

function makeEngine(opts: {
  riskGrade?: string;
  autoApprove?: boolean;
  approvalAuthority?: string;
  verification?: string;
  classifyThrows?: boolean;
} = {}): any {
  return {
    classifyRisk: (_p: string, _c?: string) => {
      if (opts.classifyThrows) throw new Error('classify boom');
      return opts.riskGrade ?? 'L1';
    },
    getVerificationRequirements: (_grade: string) => ({
      autoApprove: opts.autoApprove ?? true,
      approvalAuthority: opts.approvalAuthority ?? 'sentinel',
      verification: opts.verification ?? 'sampling_10_percent',
    }),
  };
}

const REQ_NO_INTENT: StubReq = { action: 'audit', artifactPath: 'src/foo.ts' };
const REQ_WITH_INTENT: StubReq = { action: 'audit', artifactPath: 'src/foo.ts', intentId: 'intent-1' };

suite('PolicyEvaluator (FX295)', () => {
  test('FX295 evaluate — no intent + autoApprove=true → allowed=true', async () => {
    const e = new PolicyEvaluator(makeEngine({ autoApprove: true }), new Logger('test'));
    const r = await e.evaluate(REQ_NO_INTENT as never);
    assert.equal(r.allowed, true);
    assert.equal(r.riskGrade, 'L1');
    assert.equal(r.reason, undefined);
  });

  test('FX295 evaluate — no intent + autoApprove=false → allowed=false with reason', async () => {
    const e = new PolicyEvaluator(makeEngine({ autoApprove: false, approvalAuthority: 'L3' }), new Logger('test'));
    const r = await e.evaluate(REQ_NO_INTENT as never);
    assert.equal(r.allowed, false);
    assert.match(String(r.reason), /audit.*requires active intent.*L1/i);
  });

  test('FX295 evaluate — with intent + autoApprove=false → allowed=true (intent satisfies)', async () => {
    const e = new PolicyEvaluator(makeEngine({ autoApprove: false, approvalAuthority: 'L3' }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.equal(r.allowed, true);
    assert.equal(r.reason, undefined);
  });

  test('FX295 evaluate — autoApprove=false adds approval-authority condition', async () => {
    const e = new PolicyEvaluator(makeEngine({ autoApprove: false, approvalAuthority: 'L3' }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.deepEqual(r.conditions, ['Requires L3 approval']);
  });

  test('FX295 evaluate — non-default verification adds verification condition', async () => {
    const e = new PolicyEvaluator(makeEngine({ autoApprove: true, verification: 'all_actions' }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.deepEqual(r.conditions, ['Verification: all_actions']);
  });

  test('FX295 evaluate — both conditions combined when both apply', async () => {
    const e = new PolicyEvaluator(makeEngine({
      autoApprove: false, approvalAuthority: 'L3', verification: 'all_actions',
    }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.deepEqual(r.conditions, ['Requires L3 approval', 'Verification: all_actions']);
  });

  test('FX295 evaluate — default verification + autoApprove=true → conditions undefined', async () => {
    const e = new PolicyEvaluator(makeEngine({ autoApprove: true, verification: 'sampling_10_percent' }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.equal(r.conditions, undefined);
  });

  test('FX295 evaluate — riskGrade is forwarded from policyEngine', async () => {
    const e = new PolicyEvaluator(makeEngine({ riskGrade: 'L3' }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.equal(r.riskGrade, 'L3');
  });

  test('FX295 evaluate — classifyRisk throws → returns L3 deny + error reason', async () => {
    const e = new PolicyEvaluator(makeEngine({ classifyThrows: true }), new Logger('test'));
    const r = await e.evaluate(REQ_WITH_INTENT as never);
    assert.equal(r.allowed, false);
    assert.equal(r.riskGrade, 'L3');
    assert.equal(r.reason, 'Policy evaluation failed');
  });

  test('FX295 evaluate — empty artifactPath does not crash classification', async () => {
    const e = new PolicyEvaluator(makeEngine(), new Logger('test'));
    const r = await e.evaluate({ action: 'audit' } as never);
    assert.equal(r.allowed, true); // no intent + autoApprove default true
  });
});
