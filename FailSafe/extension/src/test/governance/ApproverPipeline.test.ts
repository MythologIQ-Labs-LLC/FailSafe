// Functional tests for ApproverPipeline (FX289).

import { strict as assert } from 'assert';
import { ApproverPipeline } from '../../governance/ApproverPipeline';

suite('ApproverPipeline (FX289)', () => {
  test('FX289 evaluate — empty pipeline returns approved=true with empty chain', async () => {
    const p = new ApproverPipeline(null);
    const result = await p.evaluate();
    assert.equal(result.approved, true);
    assert.deepEqual(result.chain, []);
    assert.equal(result.failedStage, undefined);
  });

  test('FX289 evaluate — single passing stage approves with chain entry', async () => {
    const p = new ApproverPipeline(null);
    p.addStage({ name: 'security-check', check: async () => true });
    const result = await p.evaluate();
    assert.equal(result.approved, true);
    assert.deepEqual(result.chain, ['security-check:PASS']);
  });

  test('FX289 evaluate — single failing stage returns failed + chain entry', async () => {
    const p = new ApproverPipeline(null);
    p.addStage({ name: 'security-check', check: async () => false });
    const result = await p.evaluate();
    assert.equal(result.approved, false);
    assert.equal(result.failedStage, 'security-check');
    assert.deepEqual(result.chain, ['security-check:FAIL']);
  });

  test('FX289 evaluate — first failure short-circuits subsequent stages', async () => {
    const p = new ApproverPipeline(null);
    let secondCalled = 0;
    p.addStage({ name: 'first', check: async () => false });
    p.addStage({ name: 'second', check: async () => { secondCalled += 1; return true; } });
    const result = await p.evaluate();
    assert.equal(result.approved, false);
    assert.equal(result.failedStage, 'first');
    assert.deepEqual(result.chain, ['first:FAIL']);
    assert.equal(secondCalled, 0, 'subsequent stage should not be called after first failure');
  });

  test('FX289 evaluate — multiple passing stages all run in order', async () => {
    const p = new ApproverPipeline(null);
    const callOrder: string[] = [];
    p.addStage({ name: 'a', check: async () => { callOrder.push('a'); return true; } });
    p.addStage({ name: 'b', check: async () => { callOrder.push('b'); return true; } });
    p.addStage({ name: 'c', check: async () => { callOrder.push('c'); return true; } });
    const result = await p.evaluate();
    assert.equal(result.approved, true);
    assert.deepEqual(callOrder, ['a', 'b', 'c']);
    assert.deepEqual(result.chain, ['a:PASS', 'b:PASS', 'c:PASS']);
  });

  test('FX289 evaluate — failure mid-pipeline records prior PASS chain entries', async () => {
    const p = new ApproverPipeline(null);
    p.addStage({ name: 'first', check: async () => true });
    p.addStage({ name: 'second', check: async () => true });
    p.addStage({ name: 'third', check: async () => false });
    p.addStage({ name: 'fourth', check: async () => true });
    const result = await p.evaluate();
    assert.equal(result.approved, false);
    assert.equal(result.failedStage, 'third');
    assert.deepEqual(result.chain, ['first:PASS', 'second:PASS', 'third:FAIL']);
  });

  test('FX289 setLedgerManager — replaces null ledger reference safely', () => {
    const p = new ApproverPipeline(null);
    const fakeLedger = {} as never;
    assert.doesNotThrow(() => p.setLedgerManager(fakeLedger));
  });

  test('FX289 evaluate — async stages with delay are awaited in order', async () => {
    const p = new ApproverPipeline(null);
    const order: string[] = [];
    p.addStage({
      name: 'slow',
      check: async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push('slow-done');
        return true;
      },
    });
    p.addStage({
      name: 'fast',
      check: async () => {
        order.push('fast-done');
        return true;
      },
    });
    const result = await p.evaluate();
    assert.equal(result.approved, true);
    // The slow stage must complete BEFORE fast runs (sequential, not parallel)
    assert.deepEqual(order, ['slow-done', 'fast-done']);
  });
});
