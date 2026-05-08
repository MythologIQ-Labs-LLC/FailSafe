// Functional tests for EvaluationRouter (FX294).

import { strict as assert } from 'assert';
import { EvaluationRouter, type CortexEvent } from '../../governance/EvaluationRouter';

function evt(overrides: Partial<CortexEvent> = {}): CortexEvent {
  return {
    id: overrides.id ?? 'evt-1',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    category: overrides.category ?? 'user',
    payload: overrides.payload,
  };
}

suite('EvaluationRouter (FX294)', () => {
  test('FX294 computeRisk — no targetPath → R1', () => {
    const r = new EvaluationRouter();
    assert.equal(r.computeRisk(evt()), 'R1');
  });

  test('FX294 computeRisk — auth/password/crypto/secret in path → R3', () => {
    const r = new EvaluationRouter();
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'src/Authenticator.ts' } })), 'R3');
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'lib/password-utils.js' } })), 'R3');
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'src/crypto/sign.ts' } })), 'R3');
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'config/secret.json' } })), 'R3');
  });

  test('FX294 computeRisk — api/service/controller in path → R2', () => {
    const r = new EvaluationRouter();
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'src/api/users.ts' } })), 'R2');
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'src/services/foo.ts' } })), 'R2');
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'src/UserController.ts' } })), 'R2');
  });

  test('FX294 computeRisk — generic path → R1', () => {
    const r = new EvaluationRouter();
    assert.equal(r.computeRisk(evt({ payload: { targetPath: 'src/utils/helpers.ts' } })), 'R1');
  });

  test('FX294 computeConfidence — sentinel/system → high', () => {
    const r = new EvaluationRouter();
    assert.equal(r.computeConfidence(evt({ category: 'sentinel' })), 'high');
    assert.equal(r.computeConfidence(evt({ category: 'system' })), 'high');
  });

  test('FX294 computeConfidence — qorelogic/genesis/user → medium (default)', () => {
    const r = new EvaluationRouter();
    assert.equal(r.computeConfidence(evt({ category: 'qorelogic' })), 'medium');
    assert.equal(r.computeConfidence(evt({ category: 'genesis' })), 'medium');
    assert.equal(r.computeConfidence(evt({ category: 'user' })), 'medium');
  });

  test('FX294 determineTier — R3 risk → tier 3', () => {
    const r = new EvaluationRouter();
    assert.equal(r.determineTier('R3', 'low', 'high'), 3);
  });

  test('FX294 determineTier — R2 risk + low novelty + high conf → tier 2', () => {
    const r = new EvaluationRouter();
    assert.equal(r.determineTier('R2', 'low', 'high'), 2);
  });

  test('FX294 determineTier — R0 → tier 0 (when nothing else triggers tier2/3)', () => {
    const r = new EvaluationRouter();
    assert.equal(r.determineTier('R0', 'low', 'high'), 0);
  });

  test('FX294 determineTier — R1 + low novelty + high conf → tier 1', () => {
    const r = new EvaluationRouter();
    assert.equal(r.determineTier('R1', 'low', 'high'), 1);
  });

  test('FX294 determineTier — high novelty alone → tier 3 (matches default tier3NoveltyThreshold "medium")', () => {
    const r = new EvaluationRouter();
    // default tier3NoveltyThreshold = "medium", so high (rank 2) >= medium (rank 1) triggers tier 3
    assert.equal(r.determineTier('R0', 'high', 'high'), 3);
  });

  test('FX294 determineTier — medium novelty triggers tier 3 at default threshold', () => {
    const r = new EvaluationRouter();
    // default tier3NoveltyThreshold = "medium", so medium (rank 1) >= medium (rank 1) triggers tier 3
    assert.equal(r.determineTier('R0', 'medium', 'high'), 3);
  });

  test('FX294 route — orchestrates triage + tier; returns RoutingDecision', async () => {
    const r = new EvaluationRouter();
    const decision = await r.route(evt({
      category: 'sentinel',
      payload: { targetPath: 'src/auth/login.ts' },
    }));
    assert.equal(decision.tier, 3); // R3 from auth in path
    assert.equal(decision.triage.risk, 'R3');
    assert.equal(decision.triage.confidence, 'high');
    assert.equal(decision.invokeQoreLogic, true); // tier >=2
    assert.equal(decision.writeLedger, true); // tier3 enabled by default
    assert.equal(decision.enforceSentinel, true);
    assert.deepEqual(decision.requiredActions, []);
  });

  test('FX294 route — tier <2 sets invokeQoreLogic=false', async () => {
    const r = new EvaluationRouter();
    const decision = await r.route(evt({
      category: 'sentinel',
      payload: { targetPath: 'src/utils/format.ts' },
    }));
    // R1 + low novelty (sentinel + high conf fast-path) + high conf → tier 1
    assert.equal(decision.tier, 1);
    assert.equal(decision.invokeQoreLogic, false);
    assert.equal(decision.writeLedger, false); // default tier1_enabled=false
  });

  test('FX294 route — ledger config controls writeLedger per tier', async () => {
    const r = new EvaluationRouter(undefined, {
      tier0_enabled: true, tier1_enabled: true, tier2_enabled: true, tier3_enabled: false,
    });
    const decision = await r.route(evt({
      category: 'sentinel',
      payload: { targetPath: 'src/auth/login.ts' },
    }));
    // R3 → tier 3, but tier3_enabled=false → writeLedger should be false
    assert.equal(decision.tier, 3);
    assert.equal(decision.writeLedger, false);
  });
});
