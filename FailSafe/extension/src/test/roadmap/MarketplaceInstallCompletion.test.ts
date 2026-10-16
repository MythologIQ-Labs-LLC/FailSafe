// Install completion truth (v6.0.8 lane A, #469, plan T2): an item is reported
// installed only when it is. The routes are gated off (MARKETPLACE_INSTALLS_ENABLED),
// so these rows drive the exported completion pieces the routes call.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { handleInstallCompletion, startInstall, startRescan } from '../../roadmap/routes/marketplaceInstallRoutes';
import type { SecurityScanResult } from '../../roadmap/services/MarketplaceTypes';

type Status = Record<string, unknown>;

function fakeDeps(scan: () => Promise<SecurityScanResult>, install?: () => Promise<{ success: boolean; installPath?: string; error?: string }>) {
  const statuses: Status[] = [];
  const events: Array<{ type: string; payload: any }> = [];
  const ledger: any[] = [];
  const deps: any = {
    rejectIfRemote: () => false,
    broadcast: (e: any) => events.push(e),
    marketplaceCatalog: { updateItemStatus: (_id: string, s: Status) => statuses.push(s) },
    marketplaceInstaller: { install: install ?? (async () => ({ success: true, installPath: '/x' })) },
    securityScanner: { runFullScan: scan },
    ledgerManager: { appendEntry: (e: any) => ledger.push(e) },
  };
  return { deps, statuses, events, ledger, last: () => statuses[statuses.length - 1] };
}

const ITEM = { id: 'it', name: 'Item' };
const verdict = (passed: boolean): SecurityScanResult => ({
  passed, scanner: 'garak', timestamp: new Date().toISOString(), findings: [],
  riskGrade: passed ? 'L1' : 'L3', recommendedAction: passed ? 'approve' : 'review',
});
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

suite('Marketplace install completion (#469, T2)', () => {
  test('T2 (a) a non-PASS scan quarantines and never reports installed', async () => {
    const f = fakeDeps(async () => verdict(false));
    await handleInstallCompletion(f.deps, ITEM, { success: true, installPath: '/x' }, { sandboxEnabled: false, runSecurityScan: true });
    assert.equal(f.last().status, 'quarantined');
    assert.equal(f.last().trustTier, 'quarantined');
    assert.ok(!types(f.events).includes('marketplace.installed'), 'no marketplace.installed');
    const scanned = f.events.find((e) => e.type === 'marketplace.scanned');
    assert.equal(scanned?.payload.result.passed, false);
    assert.equal(f.ledger.length, 1);
    assert.equal(f.ledger[0].payload.success, false);
    assert.equal(f.ledger[0].payload.outcome, 'quarantined');
  });

  test('T2 (b) a scan asked for with no install path quarantines with an inconclusive result naming the missing path', async () => {
    let scanned = 0;
    const f = fakeDeps(async () => { scanned++; return verdict(true); });
    await handleInstallCompletion(f.deps, ITEM, { success: true }, { sandboxEnabled: false, runSecurityScan: true });
    assert.equal(scanned, 0);
    assert.equal(f.last().status, 'quarantined');
    assert.ok(!types(f.events).includes('marketplace.installed'));
    const ev = f.events.find((e) => e.type === 'marketplace.scanned');
    assert.equal(ev?.payload.result.riskGrade, 'L3');
    assert.match(JSON.stringify(ev?.payload.result.findings), /install path/i);
    assert.equal(f.ledger[0].payload.success, false);
  });

  test('T2 (c) a scan that throws quarantines and names the error', async () => {
    const f = fakeDeps(async () => { throw new Error('scanner exploded'); });
    await handleInstallCompletion(f.deps, ITEM, { success: true, installPath: '/x' }, { sandboxEnabled: false, runSecurityScan: true });
    assert.equal(f.last().status, 'quarantined');
    assert.ok(!types(f.events).includes('marketplace.installed'));
    const ev = f.events.find((e) => e.type === 'marketplace.scanned');
    assert.match(JSON.stringify(ev?.payload.result.findings), /scanner exploded/);
    assert.equal(f.ledger[0].payload.outcome, 'quarantined');
  });

  test('T2 (d) a PASS scan installs, trust tier scanned (positive control)', async () => {
    const f = fakeDeps(async () => verdict(true));
    await handleInstallCompletion(f.deps, ITEM, { success: true, installPath: '/x' }, { sandboxEnabled: false, runSecurityScan: true });
    assert.equal(f.last().status, 'installed');
    assert.equal(f.last().trustTier, 'scanned');
    assert.ok(types(f.events).includes('marketplace.installed'));
    assert.equal(f.ledger[0].payload.success, true);
    assert.equal(f.ledger[0].payload.outcome, 'installed');
  });

  test('T2 (e) no scan asked for: installed, trust tier unverified, scanned false', async () => {
    const f = fakeDeps(async () => verdict(true));
    await handleInstallCompletion(f.deps, ITEM, { success: true, installPath: '/x' }, { sandboxEnabled: false, runSecurityScan: false });
    assert.equal(f.last().status, 'installed');
    assert.equal(f.last().trustTier, 'unverified');
    assert.ok(types(f.events).includes('marketplace.installed'));
    assert.equal(f.ledger[0].payload.success, true);
    assert.equal(f.ledger[0].payload.scanned, false);
  });

  test('T2 (f) a failed install is failed, with no ledger entry', async () => {
    const f = fakeDeps(async () => verdict(true));
    await handleInstallCompletion(f.deps, ITEM, { success: false, error: 'clone failed' }, { sandboxEnabled: false, runSecurityScan: true });
    assert.equal(f.last().status, 'failed');
    assert.deepEqual(types(f.events), ['marketplace.failed']);
    assert.equal(f.ledger.length, 0);
  });

  test('T2 (g) startInstall: a rejected install is failed, not stuck installing', async () => {
    const f = fakeDeps(async () => verdict(true), async () => { throw new Error('boom'); });
    await startInstall(f.deps, ITEM as any, { sandboxEnabled: false, runSecurityScan: true });
    assert.equal(f.last().status, 'failed');
    assert.ok(types(f.events).includes('marketplace.failed'));
  });

  test('T2 (h) startRescan: a rejected scan quarantines with an inconclusive verdict', async () => {
    const f = fakeDeps(async () => { throw new Error('rescan exploded'); });
    await startRescan(f.deps, { ...ITEM, installPath: '/x' });
    assert.equal(f.last().status, 'quarantined');
    const ev = f.events.find((e) => e.type === 'marketplace.scanned');
    assert.equal(ev?.payload.result.passed, false);
    assert.equal(ev?.payload.result.riskGrade, 'L3');
  });

  test('T2 (i) startRescan: a failure while applying the verdict is reported, not left unhandled', async () => {
    const f = fakeDeps(async () => verdict(false));
    f.deps.marketplaceCatalog.updateItemStatus = (_id: string, s: Status) => {
      if (s.status === 'quarantined') throw new Error('catalog write failed');
      f.statuses.push(s);
    };
    await startRescan(f.deps, { ...ITEM, installPath: '/x' });
    const failed = f.events.find((e) => e.type === 'marketplace.failed');
    assert.ok(failed, 'marketplace.failed broadcast');
    assert.match(String(failed?.payload.error), /catalog write failed/);
  });

  test('T2 source: the confirm route calls startInstall and the scan route calls startRescan, each after its gate check', () => {
    const dir = path.resolve(__dirname, '..', '..', '..', 'src', 'roadmap', 'routes');
    const install = fs.readFileSync(path.join(dir, 'marketplaceInstallRoutes.ts'), 'utf8');
    const confirmAt = install.indexOf('"/api/marketplace/install/:id/confirm"');
    const confirm = install.slice(confirmAt);
    assert.ok(confirm.indexOf('MARKETPLACE_INSTALLS_ENABLED') >= 0 && confirm.indexOf('MARKETPLACE_INSTALLS_ENABLED') < confirm.indexOf('startInstall('), 'gate before startInstall');
    const scan = fs.readFileSync(path.join(dir, 'marketplaceScanRoutes.ts'), 'utf8');
    assert.ok(scan.indexOf('MARKETPLACE_INSTALLS_ENABLED)') < scan.indexOf('startRescan('), 'gate before startRescan');
    assert.ok(scan.indexOf('startRescan(') > 0);
  });
});
