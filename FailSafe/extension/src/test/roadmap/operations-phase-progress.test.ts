import { strict as assert } from 'assert';
import { normalizePhaseProgress } from '../../../src/roadmap/ui/modules/phase-progress.js';

suite('normalizePhaseProgress: well-formed inputs', () => {
  test('120 planned, 53 completed → 53/120, 44% adherence', () => {
    const result = normalizePhaseProgress({ plansStarted: 120, sessionsCompleted: 53 });
    assert.deepEqual(result, { planned: 120, completed: 53, adherence: 44 });
  });

  test('5 planned, 5 completed → 5/5, 100% adherence', () => {
    const result = normalizePhaseProgress({ plansStarted: 5, sessionsCompleted: 5 });
    assert.deepEqual(result, { planned: 5, completed: 5, adherence: 100 });
  });

  test('0 planned, 0 completed → 0/0, 0% adherence', () => {
    const result = normalizePhaseProgress({ plansStarted: 0, sessionsCompleted: 0 });
    assert.deepEqual(result, { planned: 0, completed: 0, adherence: 0 });
  });
});

suite('normalizePhaseProgress: anomalous inputs', () => {
  test('completed > planned → planned floored to completed (no impossible math)', () => {
    // The bug from #47: ledger has 4 substantiations but 0 gate tribunals.
    // Result must show 4/4 (100% adherence) rather than 4/0.
    const result = normalizePhaseProgress({ plansStarted: 0, sessionsCompleted: 4 });
    assert.deepEqual(result, { planned: 4, completed: 4, adherence: 100 });
  });

  test('completed = planned + 1 → planned floored to completed', () => {
    const result = normalizePhaseProgress({ plansStarted: 9, sessionsCompleted: 10 });
    assert.deepEqual(result, { planned: 10, completed: 10, adherence: 100 });
  });
});

suite('normalizePhaseProgress: defensive coercion', () => {
  test('null summary → all-zero shape', () => {
    assert.deepEqual(normalizePhaseProgress(null), { planned: 0, completed: 0, adherence: 0 });
  });

  test('undefined summary → all-zero shape', () => {
    assert.deepEqual(normalizePhaseProgress(undefined), { planned: 0, completed: 0, adherence: 0 });
  });

  test('string number inputs → coerced cleanly, no NaN propagation', () => {
    const result = normalizePhaseProgress({ plansStarted: '7', sessionsCompleted: '3' });
    assert.deepEqual(result, { planned: 7, completed: 3, adherence: 43 });
  });

  test('non-numeric junk → coerced to 0 (no NaN)', () => {
    const result = normalizePhaseProgress({ plansStarted: 'oops', sessionsCompleted: undefined });
    assert.deepEqual(result, { planned: 0, completed: 0, adherence: 0 });
  });

  test('negative inputs → coerced to 0', () => {
    const result = normalizePhaseProgress({ plansStarted: -5, sessionsCompleted: -2 });
    assert.deepEqual(result, { planned: 0, completed: 0, adherence: 0 });
  });
});
