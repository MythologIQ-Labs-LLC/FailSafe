// Functional tests for HubSnapshotService (Phase 60 §0 refactor).
// Verifies pre-snapshot refresh hooks run BEFORE downstream payload
// composition, and that the payload composes from injected fakes.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HubSnapshotService } from '../../roadmap/services/HubSnapshotService';

interface CallLog { name: string; t: number; }

function makeFakes(): {
  calls: CallLog[];
  deps: any;
  hub: HubSnapshotService;
  tmp: string;
} {
  const calls: CallLog[] = [];
  let counter = 0;
  const stamp = (n: string) => calls.push({ name: n, t: counter++ });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
  // Place a synthetic META_LEDGER and SYSTEM_STATE so the WorkspaceArtifactBuilder
  // doesn't blow up on missing inputs. Empty docs/ folder is fine.
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });

  const transparencyLogger: any = {
    getEvents: (l: number) => { stamp('transparency.getEvents'); return new Array(Math.min(l, 1)).fill({ id: 'evt-1' }); },
    log: () => undefined,
  };
  const riskRegisterManager: any = {
    getRisks: () => { stamp('risk.getRisks'); return [{ id: 'r-1' }]; },
    writeRisks: () => undefined,
  };
  const planManager: any = {
    getActivePlan: () => { stamp('plan.getActivePlan'); return { id: 'p-1', phases: [], blockers: [] }; },
    getCurrentSprint: () => ({ id: 's-1' }),
    getAllSprints: () => [],
  };
  const sentinelDaemon: any = {
    getStatus: () => { stamp('sentinel.getStatus'); return { running: true, eventsProcessed: 0 }; },
    getRecentObservationIds: () => [],
  };
  const trustEngine = { getAllAgents: async () => { stamp('trust.getAllAgents'); return []; } };
  const ledgerManager = {
    getDatabase: () => { throw new Error('no-db'); },
  };
  const qorelogicManager: any = {
    getL3Queue: () => { stamp('qore.getL3Queue'); return []; },
    getTrustEngine: () => trustEngine,
    getLedgerManager: () => ledgerManager,
  };
  const qoreRuntimeService: any = {
    fetchSnapshot: async () => { stamp('qore.fetchSnapshot'); return { enabled: false, connected: false, baseUrl: '', lastCheckedAt: '' }; },
  };
  const gitResetService: any = {};

  const deps = {
    workspaceRoot: tmp,
    extensionVersion: 'test-9.9.9',
    planManager, qorelogicManager, sentinelDaemon, qoreRuntimeService,
    gitResetService, transparencyLogger, riskRegisterManager,
    mergePlanBlockers: (plan: unknown) => plan,
    getActualPort: () => 9376,
    getIdeTracker: () => null,
    getAgentHealthIndicator: () => null,
    checkpointTypeRegistry: new Set<string>(['snapshot.created']),
  };
  const hub = new HubSnapshotService(deps);
  return { calls, deps, hub, tmp };
}

suite('HubSnapshotService (Phase 60 §0)', () => {
  test('buildHubSnapshot — refresh hooks run BEFORE payload reads', async () => {
    const { calls, hub } = makeFakes();
    const snap = await hub.buildHubSnapshot();
    assert.equal(typeof snap, 'object');
    assert.ok(calls.length > 0, 'no fake interactions recorded');
    const idx = (n: string) => calls.findIndex((c) => c.name === n);
    // Sentinel + trust + qoreRuntime are pre-snapshot reads; they must
    // happen before risk-register / transparency tail reads that supply
    // downstream payload fields.
    const sentinelAt = idx('sentinel.getStatus');
    const trustAt = idx('trust.getAllAgents');
    const qoreAt = idx('qore.fetchSnapshot');
    const transparencyAt = idx('transparency.getEvents');
    assert.ok(sentinelAt >= 0 && trustAt >= 0 && qoreAt >= 0, 'pre-snapshot hooks not all invoked');
    assert.ok(sentinelAt < transparencyAt, 'sentinel must read before transparency tail');
    assert.ok(trustAt < transparencyAt, 'trust must resolve before transparency tail');
    assert.ok(qoreAt < transparencyAt, 'qoreRuntime fetch must resolve before transparency tail');
  });

  test('buildHubSnapshot — payload exposes injected version + workspacePath', async () => {
    const { hub, tmp } = makeFakes();
    const snap = await hub.buildHubSnapshot();
    assert.equal(snap.version, 'test-9.9.9');
    assert.equal(snap.workspacePath, tmp);
    assert.equal(snap.serverPort, 9376);
  });

  test('recordObservedFileMutation — file_watcher event broadcasts hub.refresh', () => {
    const { hub } = makeFakes();
    const events: Array<Record<string, unknown>> = [];
    hub.recordObservedFileMutation(
      { source: 'file_watcher', type: 'FILE_MODIFIED', eventId: 'fe-1', timestamp: '2026-05-01T00:00:00Z' },
      (d) => events.push(d),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'hub.refresh');
  });

  test('recordObservedFileMutation — non-file_watcher source is ignored', () => {
    const { hub } = makeFakes();
    const events: Array<Record<string, unknown>> = [];
    hub.recordObservedFileMutation(
      { source: 'manual', type: 'FILE_MODIFIED' },
      (d) => events.push(d),
    );
    assert.equal(events.length, 0);
  });

  test('verifyCheckpointChain — memory-only mode returns true (no rows = vacuous)', () => {
    const { hub } = makeFakes();
    assert.equal(hub.verifyCheckpointChain(), true);
  });

  test('getRecentCheckpoints — empty memory returns empty array', () => {
    const { hub } = makeFakes();
    assert.deepEqual(hub.getRecentCheckpoints(10), []);
  });

  test('recordCheckpoint — unknown type is dropped (registry gate)', () => {
    const { hub } = makeFakes();
    hub.recordCheckpoint({
      checkpointType: 'unknown.type', actor: 'test', phase: 'plan',
      status: 'validated', policyVerdict: 'PASS', evidenceRefs: ['e-1'], payload: {},
    });
    assert.equal(hub.getRecentCheckpoints(10).length, 0);
  });

  test('recordCheckpoint — known type is persisted to memory store', () => {
    const { hub } = makeFakes();
    hub.recordCheckpoint({
      checkpointType: 'snapshot.created', actor: 'test', phase: 'plan',
      status: 'validated', policyVerdict: 'PASS', evidenceRefs: ['e-1'], payload: {},
    });
    const rs = hub.getRecentCheckpoints(10);
    assert.equal(rs.length, 1);
    assert.equal(rs[0].actor, 'test');
  });

  test('setCachedChainValid — updates both flag and timestamp', () => {
    const { hub } = makeFakes();
    hub.setCachedChainValid(false, '2026-05-02T01:00:00Z');
    assert.equal(hub.getCachedChainValid(), false);
    assert.equal(hub.getChainValidAt(), '2026-05-02T01:00:00Z');
  });

  test('getRiskRegister — delegates to injected RiskRegisterManager', () => {
    const { hub } = makeFakes();
    assert.deepEqual(hub.getRiskRegister(), [{ id: 'r-1' }]);
  });

  test('getTransparencyEvents — delegates with caller-provided limit', () => {
    const { hub } = makeFakes();
    const e = hub.getTransparencyEvents(1);
    assert.equal(e.length, 1);
    assert.equal(e[0].id, 'evt-1');
  });

  test('inferPhaseKeyFromPlan — null plan yields default key', () => {
    const { hub } = makeFakes();
    const key = hub.inferPhaseKeyFromPlan(null);
    assert.equal(typeof key, 'string');
    assert.ok(key.length > 0);
  });
});
