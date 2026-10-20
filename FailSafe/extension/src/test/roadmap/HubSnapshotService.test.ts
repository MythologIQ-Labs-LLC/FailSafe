// Functional tests for HubSnapshotService (Phase 60 §0 refactor).
// Verifies pre-snapshot refresh hooks run BEFORE downstream payload
// composition, and that the payload composes from injected fakes.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { HubSnapshotService } from '../../roadmap/services/HubSnapshotService';
import { readWorkspaceHead } from '../../roadmap/services/workspaceHead';

interface CallLog { name: string; t: number; }

function makeFakes(opts: { ledgerEntries?: any[]; workspaceRoot?: string; readHead?: (root: string) => string } = {}): {
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
    refreshFromWorkspace: () => { stamp('plan.refreshFromWorkspace'); },
  };
  const sentinelDaemon: any = {
    getStatus: () => { stamp('sentinel.getStatus'); return { running: true, eventsProcessed: 0 }; },
    getRecentObservationIds: () => [],
  };
  const trustEngine = { getAllAgents: async () => { stamp('trust.getAllAgents'); return []; } };
  // FailSafe#367 tranche 2: when `opts.ledgerEntries` is supplied, the fake
  // behaves like an initialized LedgerManager so buildAuditResolutionLog()'s
  // real read path (isAvailable + getRecentEntries) is exercised. Every
  // pre-existing test omits it and gets the original no-db/unavailable fake
  // unchanged, so this is additive only.
  const ledgerManager = opts.ledgerEntries
    ? {
        getDatabase: () => { throw new Error('no-db'); },
        isAvailable: () => true,
        getRecentEntries: async () => opts.ledgerEntries,
      }
    : {
        getDatabase: () => { throw new Error('no-db'); },
      };
  const qorelogicManager: any = {
    getL3Queue: () => { stamp('qor.getL3Queue'); return []; },
    getTrustEngine: () => trustEngine,
    getLedgerManager: () => ledgerManager,
    refreshL3Queue: () => { stamp('qor.refreshL3Queue'); },
  };
  const gitResetService: any = {};

  const deps = {
    workspaceRoot: opts.workspaceRoot ?? tmp,
    extensionVersion: 'test-9.9.9',
    ...(opts.readHead ? { readHead: opts.readHead } : {}),
    planManager, qorelogicManager, sentinelDaemon,
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
    const names = calls.map(c => c.name);
    const refreshPlan = names.indexOf('plan.refreshFromWorkspace');
    const refreshL3 = names.indexOf('qor.refreshL3Queue');
    const readPlan = names.indexOf('plan.getActivePlan');
    const readL3 = names.indexOf('qor.getL3Queue');
    assert.ok(refreshPlan >= 0 && refreshPlan < readPlan, `plan.refreshFromWorkspace must precede plan.getActivePlan; got refresh@${refreshPlan} read@${readPlan}`);
    assert.ok(refreshL3 >= 0 && refreshL3 < readL3, `qor.refreshL3Queue must precede qor.getL3Queue; got refresh@${refreshL3} read@${readL3}`);
    const idx = (n: string) => calls.findIndex((c) => c.name === n);
    // Sentinel + trust are pre-snapshot reads; they must happen before
    // risk-register / transparency tail reads that supply downstream payload
    // fields. (B289 removed the Qor runtime fetch that used to sit here.)
    const sentinelAt = idx('sentinel.getStatus');
    const trustAt = idx('trust.getAllAgents');
    const transparencyAt = idx('transparency.getEvents');
    assert.ok(sentinelAt >= 0 && trustAt >= 0, 'pre-snapshot hooks not all invoked');
    assert.ok(sentinelAt < transparencyAt, 'sentinel must read before transparency tail');
    assert.ok(trustAt < transparencyAt, 'trust must resolve before transparency tail');
  });

  test('B289 buildHubSnapshot — no Qor runtime field and no Qor Runtime node', async () => {
    const { hub, tmp } = makeFakes();
    try {
      const snap = await hub.buildHubSnapshot();
      assert.equal(Object.prototype.hasOwnProperty.call(snap, 'qorRuntime'), false, 'payload must not carry qorRuntime');
      const ids = (snap.nodeStatus as Array<{ id: string }>).map((n) => n.id);
      assert.deepEqual(ids, ['workspace-core', 'verification-queue', 'trust-engine']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
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

  // FX501 — WorkspaceMutationBus subscription for chain-validity refresh
  test('FX501 — construction with mutationBus subscribes to LedgerManager.getLedgerPath()', () => {
    let registeredPath: string | null = null;
    const fakeBus = {
      registerWatcher: (absPath: string, _onMutation: () => void): { dispose: () => void } => {
        registeredPath = absPath;
        return { dispose: () => {} };
      },
    };
    const transparencyLogger = { getRecentEvents: () => [], log: () => {} } as any;
    const riskRegisterManager = { getCurrent: () => [], save: () => {} } as any;
    const planManager = {
      getActivePlan: () => null,
      getAllSprints: () => [],
      getCurrentSprint: () => null,
      refreshFromWorkspace: () => {},
    } as any;
    const ledgerManager = {
      getDatabase: () => { throw new Error('no-db'); },
      getLedgerPath: () => '/tmp/test-ledger-path.db',
    };
    const qorelogicManager: any = {
      getL3Queue: () => [],
      getTrustEngine: () => ({ getAllAgents: async () => [] }),
      getLedgerManager: () => ledgerManager,
      refreshL3Queue: () => {},
    };
    const fs = require('fs');
    // Create the watched path so fs.watch (called inside registerWatcher in
    // real bus) wouldn't bail; fake bus does not use real fs.watch.
    if (!fs.existsSync('/tmp')) fs.mkdirSync('/tmp', { recursive: true });

    const deps = {
      workspaceRoot: '/tmp',
      extensionVersion: 'test',
      planManager, qorelogicManager,
      sentinelDaemon: { getStatus: () => ({ running: false }), getRecentObservationIds: () => [] } as any,
      gitResetService: {} as any,
      transparencyLogger, riskRegisterManager,
      mergePlanBlockers: (p: unknown) => p,
      getActualPort: () => 9376,
      getIdeTracker: () => null,
      getAgentHealthIndicator: () => null,
      checkpointTypeRegistry: new Set<string>(),
      mutationBus: fakeBus as unknown as import('../../shared/WorkspaceMutationBus').WorkspaceMutationBus,
    };
    const hub = new HubSnapshotService(deps);
    try {
      assert.strictEqual(registeredPath, '/tmp/test-ledger-path.db', 'registered the ledger path');
    } finally {
      hub.dispose();
    }
  });

  test('FX501 — mutation event clears cachedChainValid + chainValidAt', () => {
    let mutationCallback: (() => void) | null = null;
    const fakeBus = {
      registerWatcher: (_absPath: string, onMutation: () => void): { dispose: () => void } => {
        mutationCallback = onMutation;
        return { dispose: () => {} };
      },
    };
    const ledgerManager = { getDatabase: () => { throw new Error('no-db'); }, getLedgerPath: () => '/tmp/db.sqlite' };
    const qorelogicManager: any = {
      getL3Queue: () => [],
      getTrustEngine: () => ({ getAllAgents: async () => [] }),
      getLedgerManager: () => ledgerManager,
      refreshL3Queue: () => {},
    };
    const deps = {
      workspaceRoot: '/tmp',
      extensionVersion: 'test',
      planManager: { getActivePlan: () => null, getAllSprints: () => [], getCurrentSprint: () => null, refreshFromWorkspace: () => {} } as any,
      qorelogicManager,
      sentinelDaemon: { getStatus: () => ({ running: false }), getRecentObservationIds: () => [] } as any,
      gitResetService: {} as any,
      transparencyLogger: { getRecentEvents: () => [], log: () => {} } as any,
      riskRegisterManager: { getCurrent: () => [], save: () => {} } as any,
      mergePlanBlockers: (p: unknown) => p,
      getActualPort: () => 9376,
      getIdeTracker: () => null,
      getAgentHealthIndicator: () => null,
      checkpointTypeRegistry: new Set<string>(),
      mutationBus: fakeBus as unknown as import('../../shared/WorkspaceMutationBus').WorkspaceMutationBus,
    };
    const hub = new HubSnapshotService(deps);
    try {
      hub.setCachedChainValid(true, '2026-05-18T10:00:00Z');
      assert.strictEqual(hub.getChainValidAt(), '2026-05-18T10:00:00Z', 'pre-mutation chainValidAt populated');
      assert.ok(mutationCallback, 'a mutation callback was registered');
      (mutationCallback as () => void)();
      assert.strictEqual(hub.getChainValidAt(), null, 'mutation cleared chainValidAt');
    } finally {
      hub.dispose();
    }
  });

  test('FX501 — construction without mutationBus dep does not throw (back-compat)', () => {
    const { hub } = makeFakes();
    assert.ok(hub, 'hub constructed without bus');
    assert.doesNotThrow(() => hub.dispose());
  });

  suite('buildHubSnapshot — auditLog (FailSafe#367 tranche 2)', () => {
    test('ledger unavailable — auditLog is an empty array, never throws or omits the field', async () => {
      const { hub } = makeFakes();
      const snap = await hub.buildHubSnapshot();
      assert.ok(Array.isArray((snap as any).auditLog), 'auditLog must always be an array');
      assert.deepEqual((snap as any).auditLog, []);
    });

    test('projects resolution state per entry and excludes non-resolvable ledger rows', async () => {
      const entries = [
        { id: 10, timestamp: 't10', eventType: 'AUDIT_FAIL', verificationResult: 'BLOCK', artifactPath: 'src/a.ts', riskGrade: 'L2', payload: {} },
        { id: 11, timestamp: 't11', eventType: 'AUDIT_FAIL', verificationResult: 'ESCALATE', artifactPath: 'src/b.ts', riskGrade: 'L3', payload: {} },
        { id: 12, timestamp: 't12', eventType: 'L3_QUEUED', artifactPath: 'src/b.ts', payload: { sourceLedgerEntryId: 11 } },
        { id: 13, timestamp: 't13', eventType: 'AUDIT_FAIL', verificationResult: 'WARN', artifactPath: 'src/c.ts', riskGrade: 'L1', payload: {} },
        { id: 14, timestamp: 't14', eventType: 'L3_QUEUED', artifactPath: 'src/c.ts', payload: { sourceLedgerEntryId: 13 } },
        { id: 15, timestamp: 't15', eventType: 'L3_APPROVED', artifactPath: 'src/c.ts', payload: { sourceLedgerEntryId: 13 } },
        { id: 16, timestamp: 't16', eventType: 'SYSTEM_EVENT', payload: {} },
        { id: 17, timestamp: 't17', eventType: 'AUDIT_FAIL', verificationResult: 'PASS', artifactPath: 'src/d.ts', payload: {} },
      ];
      const { hub } = makeFakes({ ledgerEntries: entries });
      const snap = await hub.buildHubSnapshot();
      const auditLog = (snap as any).auditLog as Array<Record<string, unknown>>;

      assert.equal(auditLog.length, 3, 'only the three AUDIT_FAIL WARN/BLOCK/ESCALATE rows are resolvable');
      const byId = new Map(auditLog.map((e) => [e.id, e]));
      assert.ok(!byId.has(16), 'SYSTEM_EVENT must not appear');
      assert.ok(!byId.has(17), 'a PASS verdict must not appear');

      assert.equal((byId.get(10) as any).resolution.state, 'LIVE');
      assert.equal((byId.get(11) as any).resolution.state, 'ESCALATED_UNDECIDED');
      assert.equal((byId.get(11) as any).resolution.resolvedByEntryId, 12);
      assert.equal((byId.get(13) as any).resolution.state, 'DECIDED_APPROVED');
      assert.equal((byId.get(13) as any).resolution.resolvedByEntryId, 15);

      assert.deepEqual(auditLog.map((e) => e.id), [13, 11, 10], 'most-recent ledger id first');
    });

    test('is deterministic across repeated builds against the same entries', async () => {
      const entries = [
        { id: 1, timestamp: 't1', eventType: 'AUDIT_FAIL', verificationResult: 'WARN', artifactPath: 'src/x.ts', payload: {} },
      ];
      const { hub } = makeFakes({ ledgerEntries: entries });
      const first = await hub.buildHubSnapshot();
      const second = await hub.buildHubSnapshot();
      assert.deepEqual((first as any).auditLog, (second as any).auditLog);
    });
  });

  // #532 (plan-532c LD8, B284): hub checkpoints record this workspace's HEAD, read from disk,
  // whatever the extension process's working directory is.
  suite('workspace HEAD (#532 B284)', () => {
    const temps: string[] = [];
    teardown(() => { for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); });
    function tempRepo(prefix: string): { root: string; head: string } {
      const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
      temps.push(root);
      const run = (...args: string[]) => {
        const r = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@t.invalid', ...args],
          { cwd: root, encoding: 'utf8', windowsHide: true });
        assert.equal(r.status, 0, r.stderr);
        return String(r.stdout).trim();
      };
      run('init', '-q');
      run('commit', '-q', '--allow-empty', '-m', prefix);
      return { root, head: run('rev-parse', 'HEAD') };
    }
    const record = (hub: HubSnapshotService) => hub.recordCheckpoint({
      checkpointType: 'snapshot.created', actor: 'test', phase: 'plan', status: 'validated', policyVerdict: 'PASS', evidenceRefs: ['e-1'], payload: {},
    });

    test('H1: a checkpoint over a temp repository records its HEAD', () => {
      const ws = tempRepo('hub-head-');
      const { hub } = makeFakes({ workspaceRoot: ws.root });
      record(hub);
      assert.equal(hub.getRecentCheckpoints(1)[0].gitHash, ws.head);
    });

    test('H2: with process.cwd() in another repository, the row still names the workspace HEAD', () => {
      const ws = tempRepo('hub-head-ws-');
      const other = tempRepo('hub-head-other-');
      const { hub } = makeFakes({ workspaceRoot: ws.root });
      const before = process.cwd();
      try {
        process.chdir(other.root);
        record(hub);
      } finally {
        process.chdir(before);
      }
      assert.equal(process.cwd(), before, 'the working directory is restored');
      assert.equal(hub.getRecentCheckpoints(1)[0].gitHash, ws.head);
      assert.notEqual(hub.getRecentCheckpoints(1)[0].gitHash, other.head);
    });

    test('W8: 200 checkpoints on the memory store name HEAD with zero child processes and zero fallback calls', () => {
      const ws = tempRepo('hub-head-burst-');
      let fallbacks = 0;
      const { hub } = makeFakes({
        workspaceRoot: ws.root,
        readHead: (root) => readWorkspaceHead(root, { fallback: () => { fallbacks += 1; return null; } }),
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cp = require('child_process') as Record<string, unknown>;
      const names = ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'];
      const originals = names.map((n) => cp[n]);
      let children = 0;
      names.forEach((n, i) => { cp[n] = function (this: unknown, ...a: unknown[]) { children += 1; return (originals[i] as (...x: unknown[]) => unknown).apply(this, a); }; });
      const t0 = Date.now();
      try {
        for (let i = 0; i < 200; i += 1) record(hub);
      } finally {
        names.forEach((n, i) => { cp[n] = originals[i]; });
      }
      const ms = Date.now() - t0;
      console.log(`  W8: 200 checkpoints in ${ms} ms (mean ${(ms / 200).toFixed(2)} ms); the spawn path measured 8.0 s on the plan host`);
      const rows = hub.getRecentCheckpoints(200);
      assert.equal(rows.length, 200);
      assert.ok(rows.every((r) => r.gitHash === ws.head), 'every row names rev-parse HEAD');
      assert.equal(children, 0, 'no child process');
      assert.equal(fallbacks, 0, 'no fallback');
      assert.ok(ms < 5000, `backstop only: ${ms} ms`);
    });
  });
});
