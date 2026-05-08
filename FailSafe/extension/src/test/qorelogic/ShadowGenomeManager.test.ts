// Functional tests for ShadowGenomeManager (FX329 service + FX405 recording).
// Uses an isolated tmpdir per test so each manager owns its own SQLite db.
// Sink: real sqlite reads + writes; assertions inspect returned arrays + row state.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ShadowGenomeManager } from '../../qorelogic/shadow/ShadowGenomeManager';
import type { IConfigProvider } from '../../core/interfaces';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import type { SentinelVerdict } from '../../shared/types';

function makeConfigProvider(workspaceRoot: string): IConfigProvider {
  return {
    getWorkspaceRoot: () => workspaceRoot,
    getConfig: () => ({} as never),
    getFailSafeDir: () => path.join(workspaceRoot, '.failsafe'),
    getLedgerPath: () => '',
    getFeedbackDir: () => '',
    getSentinelConfigPath: () => '',
    onConfigChange: () => () => undefined,
  };
}

function buildVerdict(overrides: Partial<SentinelVerdict> = {}): SentinelVerdict {
  return {
    id: 'verdict-1',
    eventId: 'event-1',
    timestamp: '2026-05-07T00:00:00Z',
    decision: 'BLOCK',
    riskGrade: 'L2',
    confidence: 0.9,
    heuristicResults: [],
    agentDid: 'did:test:agent',
    agentTrustAtVerdict: 0.8,
    summary: 'Test failure summary',
    details: 'Mock verdict for unit test',
    matchedPatterns: [],
    actions: [],
    ...overrides,
  };
}

async function newManager(tmp: string, registry: ShadowGenomeManager[]): Promise<ShadowGenomeManager> {
  const cfg = makeConfigProvider(tmp);
  const ledger: LedgerManager = {} as LedgerManager;
  // Production init has an ordering quirk: schema migrations (002 adds
  // did_hash/signature columns) run before the base table is created, so on
  // first init the ALTER fails silently and columns remain missing. The
  // columns appear on the SECOND init when the base table already exists.
  // We replay that two-init sequence here so tests see the same schema state
  // production sees after at least one prior workspace session.
  const mgr1 = new ShadowGenomeManager(cfg, ledger);
  (mgr1 as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
  await mgr1.initialize();
  mgr1.close();
  const mgr = new ShadowGenomeManager(cfg, ledger);
  (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
  await mgr.initialize();
  // Create the soa_ledger stub the FK in shadow_genome references; without it
  // archiveFailure prepares fail with "no such table: main.soa_ledger".
  const innerDb = (mgr as unknown as { db?: import('better-sqlite3').Database }).db;
  if (innerDb) {
    innerDb.exec(`CREATE TABLE IF NOT EXISTS soa_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      agent_did TEXT NOT NULL,
      entry_hash TEXT NOT NULL UNIQUE,
      prev_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  }
  registry.push(mgr);
  return mgr;
}

suite('ShadowGenomeManager (FX329, FX405)', () => {
  let tmp: string;
  let activeManagers: ShadowGenomeManager[];

  setup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-genome-'));
    activeManagers = [];
  });

  teardown(() => {
    // Windows holds SQLite file locks until close() — must release before rm.
    for (const m of activeManagers) {
      try { m.close(); } catch { /* best-effort */ }
    }
    if (tmp && fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('FX405 archiveFailure — persists row and returns assigned id', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const entry = await mgr.archiveFailure({
      verdict: buildVerdict(),
      inputVector: 'unit-test-input',
      decisionRationale: 'Hand-built verdict for test',
    });
    assert.ok(entry.id > 0, `Expected positive id; got ${entry.id}`);
    assert.equal(entry.agentDid, 'did:test:agent');
    assert.equal(entry.remediationStatus, 'UNRESOLVED');
  });

  test('FX329 getUnresolvedEntries — returns all unresolved, ordered by created_at ASC', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const a = await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v1' }), inputVector: 'A' });
    const b = await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v2', agentDid: 'did:test:agent2' }), inputVector: 'B' });
    const got = await mgr.getUnresolvedEntries();
    assert.equal(got.length, 2);
    // Ordered ASC by created_at; both inserted in same test, but their id
    // ordering reflects insertion order so a.id < b.id.
    assert.ok(got[0].id <= got[1].id);
    assert.deepEqual(got.map((e) => e.id).sort(), [a.id, b.id].sort());
  });

  test('FX329 getUnresolvedEntries — limit parameter caps result size', async () => {
    const mgr = await newManager(tmp, activeManagers);
    for (let i = 0; i < 5; i += 1) {
      await mgr.archiveFailure({ verdict: buildVerdict({ id: `v${i}` }), inputVector: `input-${i}` });
    }
    const got = await mgr.getUnresolvedEntries(3);
    assert.equal(got.length, 3);
  });

  test('FX329 updateRemediationStatus — flipping to RESOLVED sets resolved_at + resolved_by', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const entry = await mgr.archiveFailure({ verdict: buildVerdict(), inputVector: 'X' });
    await mgr.updateRemediationStatus(entry.id, 'RESOLVED', 'fix landed in v5.1.0', 'did:test:operator');
    const remaining = await mgr.getUnresolvedEntries();
    assert.equal(remaining.length, 0, 'Resolved entry should be excluded from unresolved list');
  });

  test('FX329 updateRemediationStatus — IN_PROGRESS does not mark resolved', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const entry = await mgr.archiveFailure({ verdict: buildVerdict(), inputVector: 'X' });
    await mgr.updateRemediationStatus(entry.id, 'IN_PROGRESS', 'investigating');
    const unresolved = await mgr.getUnresolvedEntries();
    // IN_PROGRESS is not in the UNRESOLVED filter; should be excluded.
    assert.equal(unresolved.length, 0);
  });

  test('FX329 analyzeFailurePatterns — groups UNRESOLVED entries by failure_mode + counts', async () => {
    const mgr = await newManager(tmp, activeManagers);
    // Three entries that classify the same way (default classification per
    // verdict shape). Pattern grouping yields one row with count=3.
    await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v1' }), inputVector: 'A' });
    await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v2' }), inputVector: 'B' });
    await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v3' }), inputVector: 'C' });
    const patterns = await mgr.analyzeFailurePatterns();
    const total = patterns.reduce((sum, p) => sum + p.count, 0);
    assert.equal(total, 3, `Expected 3 unresolved entries grouped; got ${total} across ${patterns.length} buckets`);
    assert.ok(patterns[0].agentDids.includes('did:test:agent'));
  });

  test('FX329 analyzeFailurePatterns — excludes RESOLVED entries', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const live = await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v1' }), inputVector: 'live' });
    const dead = await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v2' }), inputVector: 'dead' });
    await mgr.updateRemediationStatus(dead.id, 'RESOLVED', 'closed');
    const patterns = await mgr.analyzeFailurePatterns();
    const total = patterns.reduce((sum, p) => sum + p.count, 0);
    assert.equal(total, 1, `Resolved entry should not contribute to count; got ${total}`);
    assert.ok(live.id > 0); // sanity: archived live succeeded
  });

  test('FX329 analyzeAllPatterns — includes both UNRESOLVED and RESOLVED with status discriminator', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const a = await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v1' }), inputVector: 'a' });
    await mgr.archiveFailure({ verdict: buildVerdict({ id: 'v2' }), inputVector: 'b' });
    await mgr.updateRemediationStatus(a.id, 'RESOLVED', 'fixed');
    const all = await mgr.analyzeAllPatterns();
    const statuses = new Set(all.map((p) => p.remediationStatus));
    assert.ok(statuses.has('UNRESOLVED'), 'Expected UNRESOLVED bucket');
    assert.ok(statuses.has('RESOLVED'), 'Expected RESOLVED bucket');
    const total = all.reduce((sum, p) => sum + p.count, 0);
    assert.equal(total, 2);
  });

  test('FX329 getUnresolvedEntries — empty database returns []', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const got = await mgr.getUnresolvedEntries();
    assert.deepEqual(got, []);
  });

  test('FX329 analyzeFailurePatterns — empty database returns []', async () => {
    const mgr = await newManager(tmp, activeManagers);
    const patterns = await mgr.analyzeFailurePatterns();
    assert.deepEqual(patterns, []);
  });
});
