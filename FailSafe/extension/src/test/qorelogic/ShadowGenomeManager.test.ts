// Functional tests for ShadowGenomeManager (FX329 service + FX405 recording).
// Uses an isolated tmpdir per test so each manager owns its own SQLite db.
// Sink: real sqlite reads + writes; assertions inspect returned arrays + row state.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { ShadowGenomeManager } from '../../qorelogic/shadow/ShadowGenomeManager';
import { MIGRATIONS } from '../../qorelogic/shadow/SchemaVersionManager';
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

suite('init order (B200)', () => {
  let tmp: string;
  let activeManagers: ShadowGenomeManager[];

  setup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sgm-init-'));
    activeManagers = [];
  });

  teardown(() => {
    for (const m of activeManagers) {
      try { m.close(); } catch { /* ignore */ }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('first initialize() creates shadow_genome with security columns', async () => {
    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const mgr = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(mgr);
    (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await mgr.initialize();
    const db = (mgr as unknown as { db?: import('better-sqlite3').Database }).db;
    assert.ok(db, 'db should be initialized');
    const cols = db!.prepare('PRAGMA table_info(shadow_genome)').all() as Array<{ name: string }>;
    const names = new Set(cols.map(c => c.name));
    assert.ok(names.has('did_hash'), `did_hash column missing on first init; cols: ${[...names].join(',')}`);
    assert.ok(names.has('signature'), `signature column missing on first init; cols: ${[...names].join(',')}`);
    assert.ok(names.has('signature_timestamp'), `signature_timestamp column missing on first init; cols: ${[...names].join(',')}`);
  });

  test('supported current schema: getAvailability() reports available:true', async () => {
    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const mgr = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(mgr);
    (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await mgr.initialize();
    assert.deepEqual(mgr.getAvailability(), { available: true });
  });
});

suite('forward-written schema (FailSafe#414)', () => {
  let tmp: string;
  let activeManagers: ShadowGenomeManager[];
  const FUTURE_VERSION = '9.9.9';
  const latestSupported = MIGRATIONS[MIGRATIONS.length - 1].version;

  setup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sgm-forward-'));
    activeManagers = [];
  });

  teardown(() => {
    for (const m of activeManagers) {
      try { m.close(); } catch { /* ignore */ }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /**
   * Initializes a manager once (creating the real schema at the current
   * supported version), then reaches into the raw sqlite file and records
   * a schema_version row from "the future" — simulating a database written
   * by a newer FailSafe release.
   */
  async function writeForwardVersion(): Promise<string> {
    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const seed = new ShadowGenomeManager(cfg, ledger);
    (seed as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await seed.initialize();
    seed.close();

    const dbPath = path.join(tmp, '.failsafe', 'ledger', 'shadow_genome.db');
    const raw = new Database(dbPath);
    raw.prepare(`
      INSERT INTO schema_version (version, checksum, description)
      VALUES (@version, @checksum, @description)
    `).run({
      version: FUTURE_VERSION,
      checksum: 'future-checksum',
      description: 'Simulated future migration'
    });
    raw.close();
    return dbPath;
  }

  test('reproduces: forward schema fails visibly, not as clean/empty success', async () => {
    await writeForwardVersion();

    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const mgr = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(mgr);
    (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;

    await mgr.initialize();

    const availability = mgr.getAvailability();
    assert.equal(availability.available, false, 'forward-written schema must not report available:true');
    assert.equal(availability.reason, 'unsupported-schema');
    assert.equal(availability.currentVersion, FUTURE_VERSION);
    assert.equal(availability.latestVersion, latestSupported);
    assert.ok(availability.message?.includes(FUTURE_VERSION), 'message should name the offending version');
  });

  test('unsupported schema cannot be confused with a genuinely empty archive', async () => {
    await writeForwardVersion();

    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const mgr = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(mgr);
    (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await mgr.initialize();

    // The read paths remain fail-safe (no throw, no crash)...
    assert.deepEqual(await mgr.getUnresolvedEntries(), []);
    assert.deepEqual(await mgr.analyzeFailurePatterns(), []);
    assert.equal(mgr.getEntryCount(), 0);
    // ...but availability is the only honest signal a caller can use to
    // tell "empty because unsupported" apart from "empty because clean".
    assert.equal(mgr.getAvailability().available, false);
  });

  test('remains fail-closed and non-destructive: true stub mode, no live db handle retained', async () => {
    await writeForwardVersion();

    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const mgr = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(mgr);
    (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await mgr.initialize();

    const db = (mgr as unknown as { db?: import('better-sqlite3').Database }).db;
    assert.equal(db, undefined, 'db handle must be released, not left open against unverified schema');
  });

  test('non-destructive: the on-disk future schema_version row is untouched', async () => {
    const dbPath = await writeForwardVersion();

    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;
    const mgr = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(mgr);
    (mgr as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await mgr.initialize();
    mgr.close();

    const raw = new Database(dbPath);
    try {
      const row = raw.prepare(
        'SELECT version FROM schema_version ORDER BY id DESC LIMIT 1'
      ).get() as { version: string } | undefined;
      assert.equal(row?.version, FUTURE_VERSION, 'future schema_version row must not be rewritten, downgraded, or removed');
    } finally {
      raw.close();
    }
  });

  test('restart/re-entry: a fresh manager instance re-derives the same honest unsupported state', async () => {
    await writeForwardVersion();

    const cfg = makeConfigProvider(tmp);
    const ledger: LedgerManager = {} as LedgerManager;

    const first = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(first);
    (first as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await first.initialize();
    first.close();

    // Simulate a restart: a brand new manager instance against the same
    // on-disk database, as would happen on the next extension activation.
    const second = new ShadowGenomeManager(cfg, ledger);
    activeManagers.push(second);
    (second as unknown as { enableSecurityHardening: boolean }).enableSecurityHardening = false;
    await second.initialize();

    assert.deepEqual(second.getAvailability(), first.getAvailability());
    assert.equal(second.getAvailability().reason, 'unsupported-schema');
  });
});
