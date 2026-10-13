import { strict as assert } from 'assert';
import { handleInstallCompletion } from '../../roadmap/routes/marketplaceInstallRoutes';

function fixture(result: 'clean' | 'quarantined' | 'crash') {
  const events: Array<{ type: string }> = [];
  const statuses: string[] = [];
  const ledger: Array<{ payload: { success: boolean } }> = [];
  const deps = {
    broadcast: (event: { type: string }) => { events.push(event); },
    marketplaceCatalog: { updateItemStatus: (_id: string, update: { status: string }) => { statuses.push(update.status); } },
    securityScanner: {
      runFullScan: async () => {
        if (result === 'crash') throw new Error('scanner process failed');
        return { passed: result === 'clean', findings: [], scanner: 'garak' };
      },
    },
    ledgerManager: { appendEntry: async (entry: { payload: { success: boolean } }) => {
      ledger.push(entry);
    } },
  };
  return { deps: deps as any, statuses, events, ledger };
}

suite('Marketplace installation completion outcomes (FailSafe #469)', () => {
  const item = { id: 'tool-1', name: 'Example' };
  const opts = { sandboxEnabled: false, runSecurityScan: true };

  test('failed scan quarantines without success event or success ledger receipt', async () => {
    const { deps, statuses, events, ledger } = fixture('quarantined');
    await handleInstallCompletion(deps, item, { success: true, installPath: '/tmp/tool' }, opts);
    assert.equal(statuses.at(-1), 'quarantined');
    assert.ok(events.some(e => e.type === 'marketplace.quarantined'));
    assert.ok(!events.some(e => e.type === 'marketplace.installed'));
    assert.equal(ledger[0]?.payload.success, false);
  });

  test('scanner crash quarantines and never promotes to installed', async () => {
    const { deps, statuses, events, ledger } = fixture('crash');
    await handleInstallCompletion(deps, item, { success: true, installPath: '/tmp/tool' }, opts);
    assert.equal(statuses.at(-1), 'quarantined');
    assert.ok(events.some(e => e.type === 'marketplace.scan.failed'));
    assert.ok(events.some(e => e.type === 'marketplace.quarantined'));
    assert.ok(!events.some(e => e.type === 'marketplace.installed'));
    assert.equal(ledger[0]?.payload.success, false);
  });

  test('no installation path cannot bypass required scan', async () => {
    const { deps, statuses, events, ledger } = fixture('clean');
    await handleInstallCompletion(deps, item, { success: true }, opts);
    assert.equal(statuses.at(-1), 'quarantined');
    assert.ok(events.some(e => e.type === 'marketplace.quarantined'));
    assert.ok(!events.some(e => e.type === 'marketplace.installed'));
    assert.equal(ledger[0]?.payload.success, false);
  });

  test('real positive scan reports exactly one installed success', async () => {
    const { deps, statuses, events, ledger } = fixture('clean');
    await handleInstallCompletion(deps, item, { success: true, installPath: '/tmp/tool' }, opts);
    assert.equal(statuses.at(-1), 'installed');
    assert.equal(events.filter(e => e.type === 'marketplace.installed').length, 1);
    assert.equal(events.filter(e => e.type === 'marketplace.quarantined').length, 0);
    assert.equal(ledger[0]?.payload.success, true);
  });

  test('failed installation does not run scan or claim installed', async () => {
    const { deps, statuses, events, ledger } = fixture('clean');
    await handleInstallCompletion(deps, item, { success: false, error: 'clone failed' }, opts);
    assert.equal(statuses.at(-1), 'failed');
    assert.ok(events.some(e => e.type === 'marketplace.failed'));
    assert.ok(!events.some(e => e.type === 'marketplace.installed'));
    assert.equal(ledger.length, 0);
  });
});
