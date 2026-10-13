import { strict as assert } from 'assert';
import { summarizePolicyTrust } from '../../roadmap/services/TrustCheckpointMetrics';

suite('TrustCheckpointMetrics (FailSafe #470)', () => {
  test('no policy checks is unknown, not a fabricated checkpoint', () => {
    const r = summarizePolicyTrust([]);
    assert.equal(r.status, 'no-evidence');
    assert.equal(r.overall, null);
    assert.equal(r.checkpointCount, 0);
    assert.equal(r.passCount, 0);
  });

  test('startup PASS and other synthetic non-policy checkpoints do not count', () => {
    const r = summarizePolicyTrust([
      { checkpointType: 'snapshot.created', policyVerdict: 'PASS', status: 'validated', evidenceRefs: [] },
      { checkpointType: 'governance.revert', policyVerdict: 'PASS', status: 'sealed', evidenceRefs: ['revert'] },
    ]);
    assert.equal(r.status, 'no-evidence');
    assert.equal(r.overall, null);
  });

  test('no evidence, unknown verdict or pending status cannot imply green trust', () => {
    const r = summarizePolicyTrust([
      { checkpointType: 'policy.checked', policyVerdict: 'PASS', status: 'validated', evidenceRefs: [] },
      { checkpointType: 'policy.checked', policyVerdict: 'UNKNOWN', status: 'validated', evidenceRefs: ['scan/2'] },
      { checkpointType: 'policy.checked', policyVerdict: 'PASS', status: 'proposed', evidenceRefs: ['scan/3'] },
    ]);
    assert.equal(r.status, 'inconclusive');
    assert.equal(r.overall, null);
    assert.equal(r.inconclusiveCount, 3);
  });

  test('fully evidenced PASS and VIOLATION yield a bounded sample score', () => {
    const r = summarizePolicyTrust([
      { checkpointType: 'policy.checked', policyVerdict: 'PASS', status: 'validated', evidenceRefs: ['gate/1'] },
      { checkpointType: 'policy.checked', policyVerdict: 'VIOLATION', status: 'sealed', evidenceRefs: ['gate/2'] },
    ], 50);
    assert.equal(r.status, 'verified');
    assert.equal(r.overall, 50);
    assert.equal(r.passCount, 1);
    assert.equal(r.verifiedCount, 2);
    assert.equal(r.checkpointCount, 2);
    assert.equal(r.sampleLimit, 50);
  });

  test('one inconclusive checkpoint prevents misleading 100 percent', () => {
    const r = summarizePolicyTrust([
      { checkpointType: 'policy.checked', policyVerdict: 'PASS', status: 'validated', evidenceRefs: ['gate/1'] },
      { checkpointType: 'policy.checked', policyVerdict: 'PASS', status: 'validated', evidenceRefs: [null] },
    ]);
    assert.equal(r.status, 'inconclusive');
    assert.equal(r.overall, null);
    assert.equal(r.passCount, 1);
    assert.equal(r.inconclusiveCount, 1);
  });
});
