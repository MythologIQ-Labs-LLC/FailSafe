// Functional tests for CheckpointUtils (FX320).

import { strict as assert } from 'assert';
import { stableStringify, hash, mapCheckpointRow, inferPhaseKeyFromPlan } from '../../roadmap/services/CheckpointUtils';

suite('CheckpointUtils (FX320)', () => {
  test('FX320 stableStringify — sorts object keys alphabetically', () => {
    const obj1 = { c: 1, a: 2, b: 3 };
    const obj2 = { b: 3, c: 1, a: 2 };
    assert.equal(stableStringify(obj1), stableStringify(obj2));
    assert.equal(stableStringify(obj1), '{"a":2,"b":3,"c":1}');
  });

  test('FX320 stableStringify — recurses into nested objects', () => {
    const obj = { x: { z: 1, y: 2 }, w: 3 };
    assert.equal(stableStringify(obj), '{"w":3,"x":{"y":2,"z":1}}');
  });

  test('FX320 stableStringify — preserves array order, normalizes element objects', () => {
    const obj = { arr: [{ b: 1, a: 2 }, { d: 3, c: 4 }] };
    assert.equal(stableStringify(obj), '{"arr":[{"a":2,"b":1},{"c":4,"d":3}]}');
  });

  test('FX320 stableStringify — primitives pass through unchanged', () => {
    assert.equal(stableStringify('hello'), '"hello"');
    assert.equal(stableStringify(42), '42');
    assert.equal(stableStringify(null), 'null');
    assert.equal(stableStringify(true), 'true');
  });

  test('FX320 hash — produces 64-char hex sha256', () => {
    const h = hash('test-input');
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  test('FX320 hash — deterministic for same input', () => {
    assert.equal(hash('a'), hash('a'));
    assert.notEqual(hash('a'), hash('b'));
  });

  test('FX320 mapCheckpointRow — maps DB row fields to CheckpointRecord', () => {
    const row = {
      checkpoint_id: 'cp-1', run_id: 'run-1', checkpoint_type: 'audit',
      phase: 'plan', status: 'validated', timestamp: '2026-05-07T00:00:00Z',
      parent_id: 'cp-0', git_hash: 'abc123', policy_verdict: 'PASS',
      evidence_refs: '["ref1","ref2"]', actor: 'test-actor',
      payload_json: '{"x":1}', payload_hash: 'hash-payload',
      entry_hash: 'hash-entry', prev_hash: 'hash-prev',
    };
    const r = mapCheckpointRow(row);
    assert.equal(r.checkpointId, 'cp-1');
    assert.equal(r.runId, 'run-1');
    assert.equal(r.phase, 'plan');
    assert.equal(r.status, 'validated');
    assert.deepEqual(r.evidenceRefs, ['ref1', 'ref2']);
    assert.equal(r.parentId, 'cp-0');
  });

  test('FX320 mapCheckpointRow — applies defaults for missing fields', () => {
    const r = mapCheckpointRow({});
    assert.equal(r.gitHash, 'unknown');
    assert.equal(r.policyVerdict, 'UNKNOWN');
    assert.equal(r.actor, 'system');
    assert.equal(r.prevHash, 'GENESIS_CHECKPOINT');
    assert.equal(r.status, 'validated');
    assert.equal(r.parentId, null);
    assert.deepEqual(r.evidenceRefs, []);
  });

  test('FX320 mapCheckpointRow — invalid JSON in evidence_refs → empty array', () => {
    const r = mapCheckpointRow({ evidence_refs: '{not-json' });
    assert.deepEqual(r.evidenceRefs, []);
  });

  test('FX320 inferPhaseKeyFromPlan — substantiate keywords → "substantiate"', () => {
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Substantiate' }] }), 'substantiate');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Release v5' }] }), 'substantiate');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Ship the thing' }] }), 'substantiate');
  });

  test('FX320 inferPhaseKeyFromPlan — debug/fix/stabilize → "debug"', () => {
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Debug session' }] }), 'debug');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Fix bug' }] }), 'debug');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Stabilization pass' }] }), 'debug');
  });

  test('FX320 inferPhaseKeyFromPlan — implement/build/develop → "implement"', () => {
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Implementation' }] }), 'implement');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Build feature' }] }), 'implement');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Develop feature' }] }), 'implement');
  });

  test('FX320 inferPhaseKeyFromPlan — audit/review/verify → "audit"', () => {
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Audit pass' }] }), 'audit');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Review code' }] }), 'audit');
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Verify changes' }] }), 'audit');
  });

  test('FX320 inferPhaseKeyFromPlan — unknown title → "plan" (default)', () => {
    assert.equal(inferPhaseKeyFromPlan({ phases: [{ status: 'active', title: 'Random thing' }] }), 'plan');
  });

  test('FX320 inferPhaseKeyFromPlan — null/empty plan → "plan"', () => {
    assert.equal(inferPhaseKeyFromPlan(null), 'plan');
    assert.equal(inferPhaseKeyFromPlan({}), 'plan');
    assert.equal(inferPhaseKeyFromPlan({ phases: [] }), 'plan');
  });

  test('FX320 inferPhaseKeyFromPlan — picks phase by currentPhaseId when set', () => {
    const plan = {
      currentPhaseId: 'p2',
      phases: [
        { id: 'p1', status: 'active', title: 'Implementation' },
        { id: 'p2', status: 'pending', title: 'Audit' },
      ],
    };
    // currentPhaseId p2 wins despite p1 being 'active'
    assert.equal(inferPhaseKeyFromPlan(plan), 'audit');
  });
});
