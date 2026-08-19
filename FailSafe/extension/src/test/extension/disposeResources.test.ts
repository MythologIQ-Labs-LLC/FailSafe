// #240: crash-during-activation / deactivate() teardown must not let one
// broken resource abort or hide the rest of cleanup. Runs directly under
// mocha — no `vscode` import, so it is unaffected by this sandbox's
// documented vscode-test/xvfb unavailability.

import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { disposeResources } from '../../extension/disposeResources';

describe('disposeResources', () => {
  it('disposes every resource when none throw', async () => {
    const order: string[] = [];
    const failed = await disposeResources([
      { name: 'a', dispose: () => { order.push('a'); } },
      { name: 'b', dispose: async () => { order.push('b'); } },
      { name: 'c', dispose: () => { order.push('c'); } },
    ]);

    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.deepEqual(failed, []);
  });

  it('a resource throwing does not prevent the remaining resources from disposing', async () => {
    const order: string[] = [];
    const failed = await disposeResources([
      { name: 'a', dispose: () => { order.push('a'); } },
      { name: 'broken-sync', dispose: () => { throw new Error('boom-sync'); } },
      { name: 'b', dispose: () => { order.push('b'); } },
      { name: 'broken-async', dispose: async () => { throw new Error('boom-async'); } },
      { name: 'c', dispose: () => { order.push('c'); } },
    ]);

    assert.deepEqual(order, ['a', 'b', 'c'], 'every non-throwing resource still disposed');
    assert.deepEqual(failed, ['broken-sync', 'broken-async'], 'both failures reported, not just the first');
  });

  it('reports a disposal failure to the logger instead of swallowing it silently', async () => {
    const warnings: Array<{ message: string; data?: unknown }> = [];
    const logger = { warn: (message: string, data?: unknown) => { warnings.push({ message, data }); } };

    await disposeResources(
      [{ name: 'ledgerManager', dispose: () => { throw new Error('db locked'); } }],
      logger,
    );

    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /ledgerManager/);
    assert.equal((warnings[0].data as { error: string }).error, 'db locked');
  });

  it('does not require a logger', async () => {
    const failed = await disposeResources([
      { name: 'x', dispose: () => { throw new Error('no logger provided'); } },
    ]);
    assert.deepEqual(failed, ['x']);
  });
});
