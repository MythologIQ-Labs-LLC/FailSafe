// FX498 — WorkspaceMutationBus substrate tests.
// Plan: docs/plan-qor-stale-cache-remediation.md Phase 1.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { WorkspaceMutationBus } from '../../shared/WorkspaceMutationBus';

function mkTempFile(prefix: string, content = 'initial'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const p = path.join(dir, 'watched.txt');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

suite('WorkspaceMutationBus — registerWatcher', () => {
  let bus: WorkspaceMutationBus;

  setup(() => { bus = new WorkspaceMutationBus(); });

  test('returns a Disposable object with a dispose function', () => {
    const target = mkTempFile('failsafe-bus-disposable-');
    try {
      const sub = bus.registerWatcher(target, () => {}, 20);
      assert.strictEqual(typeof sub.dispose, 'function', 'sub.dispose is callable');
      sub.dispose();
    } finally {
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });

  test('onMutation fires after debounce window when watched file is mutated', async () => {
    const target = mkTempFile('failsafe-bus-fires-');
    let callCount = 0;
    const sub = bus.registerWatcher(target, () => { callCount += 1; }, 30);
    try {
      fs.writeFileSync(target, 'mutated-content', 'utf8');
      await sleep(120); // > debounce + fs.watch latency
      assert.ok(callCount >= 1, `expected onMutation to fire; got callCount=${callCount}`);
    } finally {
      sub.dispose();
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });

  test('rapid successive mutations within debounce window coalesce to a single call', async () => {
    const target = mkTempFile('failsafe-bus-debounce-');
    let callCount = 0;
    const sub = bus.registerWatcher(target, () => { callCount += 1; }, 80);
    try {
      // 3 rapid writes within the 80ms debounce window
      fs.writeFileSync(target, 'a', 'utf8');
      fs.writeFileSync(target, 'b', 'utf8');
      fs.writeFileSync(target, 'c', 'utf8');
      await sleep(200);
      assert.strictEqual(callCount, 1, `expected coalesced single call; got ${callCount}`);
    } finally {
      sub.dispose();
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });

  test('dispose() stops onMutation from firing on subsequent mutations', async () => {
    const target = mkTempFile('failsafe-bus-dispose-');
    let callCount = 0;
    const sub = bus.registerWatcher(target, () => { callCount += 1; }, 30);
    try {
      fs.writeFileSync(target, 'first', 'utf8');
      await sleep(100);
      const afterFirst = callCount;
      sub.dispose();
      fs.writeFileSync(target, 'second-after-dispose', 'utf8');
      await sleep(100);
      assert.strictEqual(
        callCount, afterFirst,
        `dispose should prevent further calls; got ${callCount} (was ${afterFirst})`,
      );
    } finally {
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });

  test('ENOENT path returns a no-op Disposable without throwing', () => {
    const bogus = path.join(os.tmpdir(), '__failsafe_bus_does_not_exist__', 'phantom.txt');
    let sub: { dispose: () => void } | undefined;
    assert.doesNotThrow(() => {
      sub = bus.registerWatcher(bogus, () => { /* should never fire */ }, 30);
    });
    assert.ok(sub, 'registerWatcher returned a Disposable');
    assert.strictEqual(typeof sub!.dispose, 'function');
    // dispose on the no-op Disposable should also not throw
    assert.doesNotThrow(() => sub!.dispose());
  });
});
