// FX503 — ConsoleLifecycleService watchMetaLedger migration tests.
// Plan: docs/plan-qor-stale-cache-remediation.md Phase 4.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ConsoleLifecycleService, type ConsoleLifecycleDeps } from '../../roadmap/services/ConsoleLifecycleService';

function mkWorkspaceWithLedger(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-lifecycle-test-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'META_LEDGER.md'), 'initial', 'utf8');
  return dir;
}

function makeFakeDeps(workspaceRoot: string, mutationBus?: any): ConsoleLifecycleDeps {
  return {
    app: { use: () => {}, listen: () => ({ close: () => {} }) } as any,
    port: 0,
    host: '127.0.0.1',
    workspaceRoot,
    wsManager: { setup: () => {}, broadcast: () => {}, close: () => {} } as any,
    hub: {
      buildHubSnapshot: async () => ({}),
      recordCheckpoint: () => {},
      inferPhaseKeyFromPlan: () => 'plan',
    } as any,
    planManager: { getActivePlan: () => null } as any,
    broadcast: () => {},
    mutationBus,
  };
}

suite('FX503 ConsoleLifecycleService — watchMetaLedger bus migration', () => {

  test('watchMetaLedger routes through WorkspaceMutationBus when provided (debounce=1500)', () => {
    const workspaceRoot = mkWorkspaceWithLedger();
    try {
      const registered: { absPath: string; debounceMs: number | undefined }[] = [];
      const fakeBus = {
        registerWatcher: (absPath: string, _onMutation: () => void, debounceMs?: number): { dispose: () => void } => {
          registered.push({ absPath, debounceMs });
          return { dispose: () => {} };
        },
      };
      const deps = makeFakeDeps(workspaceRoot, fakeBus);
      const svc = new ConsoleLifecycleService(deps);
      // The migration is internal to watchMetaLedger; expose by accessing via cast.
      (svc as unknown as { watchMetaLedger: () => void }).watchMetaLedger();

      const expectedLedger = path.join(workspaceRoot, 'docs', 'META_LEDGER.md');
      const found = registered.find((r) => r.absPath === expectedLedger);
      assert.ok(found, `expected /docs/META_LEDGER.md watcher; got ${JSON.stringify(registered)}`);
      assert.strictEqual(found!.debounceMs, 1500, 'historical 1500ms debounce preserved');
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('watchMetaLedger broadcasts hub.refresh on bus-emitted mutation', () => {
    const workspaceRoot = mkWorkspaceWithLedger();
    try {
      let captured: (() => void) | null = null;
      const fakeBus = {
        registerWatcher: (_absPath: string, onMutation: () => void): { dispose: () => void } => {
          captured = onMutation;
          return { dispose: () => {} };
        },
      };
      const broadcasts: Array<Record<string, unknown>> = [];
      const deps = makeFakeDeps(workspaceRoot, fakeBus);
      deps.broadcast = (d) => broadcasts.push(d);

      const svc = new ConsoleLifecycleService(deps);
      (svc as unknown as { watchMetaLedger: () => void }).watchMetaLedger();

      const mutationCallback = captured as (() => void) | null;
      assert.ok(mutationCallback, 'bus registered a mutation callback');
      mutationCallback!();
      assert.deepStrictEqual(
        broadcasts,
        [{ type: 'hub.refresh' }],
        'mutation event triggered hub.refresh broadcast',
      );
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('watchMetaLedger falls back to raw fs.watch when no bus provided (back-compat)', () => {
    const workspaceRoot = mkWorkspaceWithLedger();
    try {
      const deps = makeFakeDeps(workspaceRoot, undefined); // no bus
      const svc = new ConsoleLifecycleService(deps);
      assert.doesNotThrow(() => (svc as unknown as { watchMetaLedger: () => void }).watchMetaLedger());
      // Smoke check: the no-bus path created a fs.FSWatcher; test asserts no
      // throw and that stop() tears it down cleanly.
      assert.doesNotThrow(() => svc.stop());
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
