// Install completion truth (v6.0.8 lane A, #469, plan T2): an item is reported
// installed only when it is. The routes are gated off (MARKETPLACE_INSTALLS_ENABLED),
// so these rows drive the exported completion pieces the routes call.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as routes from '../../roadmap/routes/marketplaceInstallRoutes';
import * as scanRoutes from '../../roadmap/routes/marketplaceScanRoutes';
import { handleInstallCompletion, startInstall, startRescan } from '../../roadmap/routes/marketplaceInstallRoutes';
import { SecurityScanner } from '../../roadmap/services/SecurityScanner';
import { EventBus } from '../../shared/EventBus';
import type { CommandRunnerResult, SecurityScanResult } from '../../roadmap/services/MarketplaceTypes';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

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
    ledgerManager: { isAvailable: () => true, appendEntry: async (e: any) => { ledger.push(e); return { id: ledger.length, entryHash: `h${ledger.length}` }; } },
  };
  return { deps, statuses, events, ledger, last: () => statuses[statuses.length - 1] };
}

const ITEM = { id: 'it', name: 'Item', repoUrl: 'https://example.invalid/item.git', repoRef: 'main', version: '1.2.3' };
const verdict = (passed: boolean): SecurityScanResult => ({
  passed, scanner: 'garak', timestamp: new Date().toISOString(), findings: [],
  riskGrade: passed ? 'L1' : 'L3', recommendedAction: passed ? 'approve' : 'review',
  scanStatus: passed ? 'completed' : 'inconclusive',
} as SecurityScanResult);
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
    const run = startRescan(f.deps, { ...ITEM, status: 'installed', installPath: '/x' } as any);
    assert.notEqual(run, false, 'an installed item is re-scanned');
    await run;
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
    const run = startRescan(f.deps, { ...ITEM, status: 'installed', installPath: '/x' } as any);
    assert.notEqual(run, false, 'an installed item is re-scanned');
    await run;
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
    const handler = scan.slice(scan.indexOf('"/api/marketplace/scan/:id"'), scan.indexOf('"/api/marketplace/uninstall/:id"'));
    assert.ok(handler.indexOf('MARKETPLACE_INSTALLS_ENABLED)') >= 0, 'the scan handler checks the gate');
    assert.ok(handler.indexOf('MARKETPLACE_INSTALLS_ENABLED)') < handler.indexOf('requestRescan('), 'gate before requestRescan');
  });
});

// #538 lane C (plan LD4, LD5, LD8, LD12): an install is reported installed
// only after its receipt is durably written; the receipt carries the verdict,
// scanner and source; an item with no receipt cannot be re-scanned into
// installed. New surface is reached through `any` so these rows compile
// against the code before the change.
suite('#538 install receipts', () => {
  const made: string[] = [];
  suiteTeardown(() => { for (const d of made.splice(0)) removeTempTree(d); });
  const tmp = (prefix: string): string => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); made.push(d); return d; };
  const NO_SCAN = { sandboxEnabled: false, runSecurityScan: false };
  const SCAN = { sandboxEnabled: false, runSecurityScan: true };
  const SHA = 'a'.repeat(40);

  /** A catalog fake that mutates the item in place, as MarketplaceCatalog does. */
  function live(initial: Record<string, unknown> = {}) {
    const item: any = { ...ITEM, status: 'installing', ...initial };
    const updates: Status[] = [];
    const events: Array<{ type: string; payload: any }> = [];
    const scans: string[] = [];
    let scanResult: () => Promise<SecurityScanResult> = async () => verdict(true);
    const deps: any = {
      rejectIfRemote: () => false,
      broadcast: (e: any) => events.push(e),
      marketplaceCatalog: {
        getItem: (id: string) => (id === item.id ? item : undefined),
        updateItemStatus: (_id: string, s: Status) => { updates.push({ ...s }); Object.assign(item, s); },
      },
      marketplaceInstaller: { install: async () => ({ success: true, installPath: '/x' }) },
      securityScanner: { runFullScan: async (p: string) => { scans.push(p); return scanResult(); } },
    };
    const count = (type: string) => events.filter((e) => e.type === type).length;
    const installedUpdates = () => updates.filter((u) => u.status === 'installed').length;
    return { item, updates, events, scans, deps, count, installedUpdates, setScan: (f: () => Promise<SecurityScanResult>) => { scanResult = f; } };
  }
  function recording() {
    const calls: any[] = [];
    return { calls, ledger: { isAvailable: () => true, appendEntry: async (e: any) => { calls.push(e); return { id: calls.length, entryHash: `h${calls.length}` }; } } };
  }
  function rejecting() {
    const calls: any[] = [];
    return { calls, ledger: { isAvailable: () => true, appendEntry: async (e: any) => { calls.push(e); throw new Error('disk full'); } } };
  }
  async function settle(): Promise<void> {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  }
  async function unhandledDuring(fn: () => Promise<unknown>): Promise<number> {
    const seen: unknown[] = [];
    const on = (reason: unknown) => { seen.push(reason); };
    process.on('unhandledRejection', on);
    try { await fn(); await settle(); } finally { process.removeListener('unhandledRejection', on); }
    return seen.length;
  }
  function expectUnrecorded(f: ReturnType<typeof live>, unhandled: number) {
    assert.equal(f.count('marketplace.installed'), 0, 'no marketplace.installed');
    assert.equal(f.installedUpdates(), 0, 'never set installed');
    assert.equal(f.count('marketplace.failed'), 1, 'exactly one marketplace.failed');
    const failed = f.events.find((e) => e.type === 'marketplace.failed');
    assert.equal(failed?.payload.reason, 'ledger-unrecorded');
    assert.equal(f.item.status, 'failed');
    assert.equal(f.item.trustTier, 'quarantined');
    assert.equal(f.item.installPath, undefined, 'installPath cleared');
    assert.equal(unhandled, 0, 'no unhandled rejection');
  }
  function installRepo(head: string, files: Record<string, string> = {}): string {
    const dir = tmp('fs-rcpt-');
    fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), head);
    for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, '.git', rel), body);
    return dir;
  }
  const completeWith = (f: ReturnType<typeof live>, installPath: string | undefined, opts: typeof SCAN) =>
    handleInstallCompletion(f.deps, f.item, { success: true, installPath }, opts);

  test('R1 a rejecting ledger: one append, never installed, failed ledger-unrecorded, no unhandled rejection', async () => {
    const f = live();
    const l = rejecting();
    f.deps.ledgerManager = l.ledger;
    const unhandled = await unhandledDuring(() => completeWith(f, '/x', NO_SCAN));
    assert.equal(l.calls.length, 1, 'exactly one appendEntry call');
    expectUnrecorded(f, unhandled);
  });
  test('R2 an unavailable ledger: no append, failed ledger-unrecorded with the disabled reason', async () => {
    const f = live();
    const calls: any[] = [];
    f.deps.ledgerManager = { isAvailable: () => false, getDisabledReason: () => 'native sqlite missing', appendEntry: async (e: any) => { calls.push(e); return { id: 1, entryHash: 'h' }; } };
    const unhandled = await unhandledDuring(() => completeWith(f, '/x', NO_SCAN));
    assert.equal(calls.length, 0, 'appendEntry not called');
    expectUnrecorded(f, unhandled);
    assert.match(String(f.events.find((e) => e.type === 'marketplace.failed')?.payload.error), /native sqlite missing/);
  });
  test('R3 a ledger that returns the disabled stub entry is not a receipt', async () => {
    const f = live();
    const calls: any[] = [];
    f.deps.ledgerManager = { isAvailable: () => true, appendEntry: async (e: any) => { calls.push(e); return { id: 0, entryHash: 'STUB_DISABLED' }; } };
    const unhandled = await unhandledDuring(() => completeWith(f, '/x', NO_SCAN));
    assert.equal(calls.length, 1);
    expectUnrecorded(f, unhandled);
  });
  test('R4 no ledger wired: failed ledger-unrecorded', async () => {
    const f = live();
    const unhandled = await unhandledDuring(() => completeWith(f, '/x', NO_SCAN));
    expectUnrecorded(f, unhandled);
  });
  test('R4b a ledger with no isAvailable is not durable: no append', async () => {
    const f = live();
    const calls: any[] = [];
    f.deps.ledgerManager = { appendEntry: async (e: any) => { calls.push(e); return { id: 1, entryHash: 'h' }; } };
    const unhandled = await unhandledDuring(() => completeWith(f, '/x', NO_SCAN));
    assert.equal(calls.length, 0);
    expectUnrecorded(f, unhandled);
  });
  for (const [name, opts] of [['a passing scan', SCAN], ['no scan', NO_SCAN]] as const) {
    test(`R5 ordering (${name}): nothing reads installed until the receipt write resolves`, async () => {
      const f = live();
      let release: (v: unknown) => void = () => {};
      const calls: any[] = [];
      f.deps.ledgerManager = { isAvailable: () => true, appendEntry: (e: any) => { calls.push(e); return new Promise((r) => { release = r; }); } };
      const done = completeWith(f, '/x', opts);
      for (let i = 0; i < 5; i++) await settle();
      assert.equal(calls.length, 1, 'the receipt write has started');
      assert.equal(f.count('marketplace.installed'), 0, 'no installed broadcast before the write resolves');
      assert.equal(f.installedUpdates(), 0, 'no installed status before the write resolves');
      release({ id: 7, entryHash: 'h7' });
      await done;
      assert.equal(f.count('marketplace.installed'), 1);
      assert.equal(f.installedUpdates(), 1);
      assert.equal(f.events.find((e) => e.type === 'marketplace.installed')?.payload.ledgerEntryId, 7);
    });
  }
  test('R6 the receipt carries the verdict, scanner, and source with the cloned commit (loose ref, packed-refs, detached)', async () => {
    const pass = { ...verdict(true), scanStatus: 'completed', scannerVersions: { garak: 'garak v1' } } as SecurityScanResult;
    const cases: Array<[string, string]> = [
      [installRepo('ref: refs/heads/main\n', { 'refs/heads/main': `${SHA}\n` }), SHA],
      [installRepo('ref: refs/heads/main\n', { 'packed-refs': `# pack-refs with: peeled fully-peeled sorted\n${'b'.repeat(40)} refs/heads/main\n` }), 'b'.repeat(40)],
      [installRepo(`${'c'.repeat(64)}\n`), 'c'.repeat(64)],
    ];
    for (const [dir, commit] of cases) {
      const f = live();
      const l = recording();
      f.deps.ledgerManager = l.ledger;
      f.setScan(async () => pass);
      await completeWith(f, dir, SCAN);
      assert.equal(l.calls.length, 1);
      const entry = l.calls[0];
      assert.equal(entry.eventType, 'MARKETPLACE_INSTALL');
      assert.equal(entry.riskGrade, 'L1', 'the riskGrade column carries the verdict grade');
      const p = entry.payload;
      assert.equal(p.success, true);
      assert.equal(p.outcome, 'installed');
      assert.deepEqual(p.source, { repoUrl: ITEM.repoUrl, repoRef: 'main', version: '1.2.3', commit, commitSource: 'clone-head' });
      assert.equal(p.verdict.passed, true);
      assert.equal(p.verdict.scanStatus, 'completed');
      assert.equal(p.verdict.riskGrade, 'L1');
      assert.equal(p.verdict.recommendedAction, 'approve');
      assert.equal(p.verdict.findingCount, 0);
      assert.deepEqual(p.scanner, { name: 'garak', versions: { garak: 'garak v1' } });
      assert.equal(f.item.status, 'installed');
    }
  });
  test('R7 the commit is unresolved for no .git, a .git file, a linked .git, a malformed HEAD and a .. ref', async () => {
    const noGit = tmp('fs-rcpt-');
    const gitFile = tmp('fs-rcpt-');
    fs.writeFileSync(path.join(gitFile, '.git'), 'gitdir: ../elsewhere\n');
    const real = installRepo('ref: refs/heads/main\n', { 'refs/heads/main': `${SHA}\n` });
    const linked = tmp('fs-rcpt-');
    fs.symlinkSync(path.join(real, '.git'), path.join(linked, '.git'), 'junction');
    const malformed = installRepo('not a ref\n');
    const dotdot = installRepo('ref: refs/heads/../../HEAD\n');
    for (const dir of [noGit, gitFile, linked, malformed, dotdot]) {
      const f = live();
      const l = recording();
      f.deps.ledgerManager = l.ledger;
      await completeWith(f, dir, NO_SCAN);
      assert.equal(l.calls[0].payload.source.commit, null, `no commit for ${dir}`);
      assert.equal(l.calls[0].payload.source.commitSource, 'unresolved');
      assert.equal(l.calls[0].payload.verdict, null, 'no verdict without a scan');
      assert.equal(l.calls[0].payload.scanner, null);
    }
  });
  test('R8 a quarantine emits marketplace.quarantined; with a rejecting ledger it stays quarantined, recorded false, installPath cleared', async () => {
    const ok = live();
    ok.deps.ledgerManager = recording().ledger;
    ok.setScan(async () => verdict(false));
    await completeWith(ok, '/x', SCAN);
    const q = ok.events.find((e) => e.type === 'marketplace.quarantined');
    assert.ok(q, 'marketplace.quarantined broadcast');
    assert.equal(q!.payload.scanStatus, 'inconclusive');
    assert.equal(q!.payload.recorded, true);
    assert.equal(q!.payload.ledgerEntryId, 1);
    assert.equal(ok.item.installPath, '/x', 'a recorded quarantine keeps its path');

    const bad = live();
    bad.deps.ledgerManager = rejecting().ledger;
    bad.setScan(async () => verdict(false));
    const unhandled = await unhandledDuring(() => completeWith(bad, '/x', SCAN));
    assert.equal(bad.item.status, 'quarantined');
    const bq = bad.events.find((e) => e.type === 'marketplace.quarantined');
    assert.equal(bq?.payload.recorded, false);
    assert.match(String(bq?.payload.ledgerError), /disk full/);
    assert.equal(bad.item.installPath, undefined, 'an unrecorded quarantine has no installPath');
    assert.equal(bad.count('marketplace.installed'), 0);
    assert.equal(unhandled, 0);
  });
  const realScanner = (scan: () => Promise<CommandRunnerResult>) => new (SecurityScanner as any)(new EventBus(),
    async (_c: string, args: string[]) => (args[0] === '--version' ? { code: 0, stdout: 'v1', stderr: '' } : scan()), { scanTimeoutMs: 50 });
  const scanCases: Array<[string, () => Promise<CommandRunnerResult>, string]> = [
    ['never exits', () => new Promise<CommandRunnerResult>(() => { /* never */ }), 'timeout'],
    ['throws', async () => { throw new Error('scanner crashed'); }, 'scanner-error'],
  ];
  for (const [name, scan, expected] of scanCases) {
    test(`R9/R10 end to end with a real SecurityScanner whose scan ${name}: quarantined, receipt scanStatus ${expected}`, async () => {
      const s = realScanner(scan);
      await s.checkAvailability();
      const f = live();
      const l = recording();
      f.deps.ledgerManager = l.ledger;
      f.deps.securityScanner = s;
      await completeWith(f, tmp('fs-rcpt-scan-'), SCAN);
      assert.equal(f.item.status, 'quarantined');
      assert.equal(f.installedUpdates(), 0);
      assert.equal(f.count('marketplace.installed'), 0);
      assert.equal(l.calls[0].payload.verdict.scanStatus, expected);
      assert.equal(l.calls[0].payload.verdict.passed, false);
    });
  }
  test('R11 the receipt keeps at most 20 findings of at most 300 characters and the full count', async () => {
    const many = { ...verdict(false), findings: Array.from({ length: 500 }, (_, i) => ({ severity: 'medium', category: 'c', description: `${i}:${'x'.repeat(10000)}` })) } as SecurityScanResult;
    const f = live();
    const l = recording();
    f.deps.ledgerManager = l.ledger;
    f.setScan(async () => many);
    await completeWith(f, '/x', SCAN);
    const v = l.calls[0].payload.verdict;
    assert.equal(v.findings.length, 20);
    assert.ok(v.findings.every((x: any) => x.description.length <= 300));
    assert.equal(v.findingCount, 500);
    assert.equal(v.findingsTruncated, true);
  });
  test('R12 startInstall with a rejecting ledger settles: one append, no installed, one failed, no unhandled rejection', async () => {
    const f = live();
    const l = rejecting();
    f.deps.ledgerManager = l.ledger;
    const unhandled = await unhandledDuring(() => startInstall(f.deps, f.item, NO_SCAN));
    assert.equal(l.calls.length, 1);
    expectUnrecorded(f, unhandled);
  });
  test('R13 a payload or commit read that throws is an unrecorded receipt, not a rejection', async () => {
    const f = live();
    const l = recording();
    f.deps.ledgerManager = l.ledger;
    Object.defineProperty(f.item, 'repoUrl', { get() { throw new Error('bad item'); }, configurable: true });
    const unhandled = await unhandledDuring(() => completeWith(f, '/x', NO_SCAN));
    assert.equal(l.calls.length, 0, 'nothing appended');
    expectUnrecorded(f, unhandled);
    assert.match(String(f.events.find((e) => e.type === 'marketplace.failed')?.payload.error), /bad item/);
  });
  test('RS1 a ledger-unrecorded item cannot be re-scanned into installed', async () => {
    const f = live();
    f.deps.ledgerManager = rejecting().ledger;
    await completeWith(f, '/x', NO_SCAN);
    const before = f.updates.length;
    f.setScan(async () => verdict(true));
    const run = startRescan(f.deps, f.item);
    if (run) await run;
    assert.equal(run, false, 'startRescan refuses');
    assert.equal(f.scans.length, 0, 'no scan');
    assert.equal(f.installedUpdates(), 0);
    assert.equal(f.updates.length, before, 'no status write');
    assert.equal(f.item.status, 'failed');
    const allowed = (routes as any).rescanAllowed as (i: unknown) => boolean;
    for (const status of ['failed', 'not-installed', 'installing', 'scanning']) assert.equal(allowed({ status, installPath: '/x' }), false, status);
    assert.equal(allowed({ status: 'installed' }), false, 'installed without a path');
    assert.equal(allowed({ status: 'installed', installPath: '/x' }), true);
    assert.equal(allowed({ status: 'quarantined', installPath: '/x' }), true);
  });
  test('RS1 source: the scan handler writes no status and checks no installPath itself; the 400 tests the startRescan result', () => {
    const scan = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'roadmap', 'routes', 'marketplaceScanRoutes.ts'), 'utf8');
    const handler = scan.slice(scan.indexOf('"/api/marketplace/scan/:id"'), scan.indexOf('"/api/marketplace/uninstall/:id"'));
    assert.ok(handler.length > 0);
    assert.equal(handler.includes('updateItemStatus'), false, 'no status write in the scan handler');
    assert.equal(handler.includes('installPath'), false, 'no installPath check in the scan handler');
    const at = scan.indexOf('export function requestRescan(');
    assert.ok(at >= 0, 'requestRescan is defined');
    const fn = scan.slice(at);
    assert.ok(/startRescan\(/.test(fn) && /=== false/.test(fn) && /status: 400/.test(fn), 'requestRescan answers 400 on a false startRescan');
  });
  test('RS2 an unrecorded quarantine cannot be re-scanned into installed', async () => {
    const f = live();
    f.deps.ledgerManager = rejecting().ledger;
    f.setScan(async () => verdict(false));
    await completeWith(f, '/x', SCAN);
    assert.equal(f.item.status, 'quarantined');
    const scansBefore = f.scans.length;
    f.setScan(async () => verdict(true));
    const run = startRescan(f.deps, f.item);
    if (run) await run;
    assert.equal(run, false);
    assert.equal(f.scans.length, scansBefore, 'no scan');
    assert.equal(f.installedUpdates(), 0);
    assert.equal(f.item.status, 'quarantined');
  });
  for (const pass of [false, true]) {
    test(`RS3 a legitimate re-scan through the route body is never left scanning (${pass ? 'passing' : 'failing'} verdict)`, async () => {
      const requestRescan = (scanRoutes as any).requestRescan as (deps: unknown, id: string) => { status: number; done?: Promise<void> };
      assert.equal(typeof requestRescan, 'function', 'requestRescan is exported');
      const f = live({ status: 'installed', installPath: '/x' });
      f.setScan(async () => verdict(pass));
      const r = requestRescan(f.deps, ITEM.id);
      assert.equal(r.status, 200);
      assert.equal(f.item.status, 'scanning', 'scanning is set before requestRescan returns');
      await r.done;
      assert.equal(f.scans.length, 1, 'exactly one scan');
      assert.equal(f.updates.filter((u) => u.status === 'scanning').length, 1, 'scanning written once');
      assert.equal(f.item.status, pass ? 'installed' : 'quarantined', 'terminal status');
      assert.equal(requestRescan(f.deps, 'missing').status, 404);
    });
  }
});
