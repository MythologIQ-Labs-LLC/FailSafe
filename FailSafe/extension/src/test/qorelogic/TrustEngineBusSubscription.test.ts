// FX502 — TrustEngine WorkspaceMutationBus subscription tests.
// Plan: docs/plan-qor-stale-cache-remediation.md Phase 4.
// Sibling to trust-persistence.test.ts; isolated to the bus wiring slice.

import { strict as assert } from 'assert';
import { TrustEngine } from '../../qorelogic/trust/TrustEngine';

suite('FX502 TrustEngine — WorkspaceMutationBus subscription', () => {

  test('construction without mutationBus does not throw (back-compat)', () => {
    const ledgerManager = {
      isAvailable: () => false,
      getDatabase: () => { throw new Error('no-db'); },
      getLedgerPath: () => '/tmp/no-db.sqlite',
    } as any;
    assert.doesNotThrow(() => new TrustEngine(ledgerManager));
  });

  test('initialize with mutationBus registers a watcher on ledgerManager.getLedgerPath()', async () => {
    const registeredPaths: string[] = [];
    const fakeBus = {
      registerWatcher: (absPath: string, _onMutation: () => void): { dispose: () => void } => {
        registeredPaths.push(absPath);
        return { dispose: () => {} };
      },
    };
    const fakeDb = {
      prepare: () => ({ all: () => [] }),
    };
    const ledgerManager = {
      isAvailable: () => true,
      getDatabase: () => fakeDb,
      getLedgerPath: () => '/tmp/test-trust.sqlite',
    } as any;
    const eventBus = { on: () => {} } as any;

    const trust = new TrustEngine(ledgerManager, eventBus, fakeBus as any);
    try {
      await trust.initialize();
      assert.strictEqual(registeredPaths.length, 1, 'one watcher registered post-initialize');
      assert.strictEqual(registeredPaths[0], '/tmp/test-trust.sqlite', 'watch target = ledger path');
    } finally {
      trust.dispose();
    }
  });

  test('dispose() releases the mutation-bus subscription', async () => {
    let disposeCount = 0;
    const fakeBus = {
      registerWatcher: () => ({ dispose: () => { disposeCount += 1; } }),
    };
    const fakeDb = { prepare: () => ({ all: () => [] }) };
    const ledgerManager = {
      isAvailable: () => true,
      getDatabase: () => fakeDb,
      getLedgerPath: () => '/tmp/dispose-test.sqlite',
    } as any;
    const eventBus = { on: () => {} } as any;

    const trust = new TrustEngine(ledgerManager, eventBus, fakeBus as any);
    await trust.initialize();
    trust.dispose();
    assert.strictEqual(disposeCount, 1, 'subscription disposed exactly once');
  });
});
