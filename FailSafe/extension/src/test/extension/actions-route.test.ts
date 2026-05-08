// Functional tests for ActionsRoute (FX066 panic-stop, FX068 show-output,
// + resume-monitoring, verify-integrity, approve-l3-batch from the
// "Reality without Promise" gap section in FEATURE_INDEX).

import { strict as assert } from 'assert';
import { setupActionsRoutes } from '../../roadmap/routes/ActionsRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';

interface CallLog {
  sentinelStarted: number;
  sentinelStopped: number;
  checkpoints: Array<Record<string, unknown>>;
  broadcasts: Array<Record<string, unknown>>;
  showOutputCalls: number;
  scaffoldCalls: number;
  l3Decisions: Array<{ id: string; decision: string; conditions: string[] }>;
}

function makeDeps(overrides: Partial<ApiRouteDeps> = {}, log?: Partial<CallLog>): {
  deps: ApiRouteDeps;
  log: CallLog;
} {
  const callLog: CallLog = {
    sentinelStarted: 0,
    sentinelStopped: 0,
    checkpoints: [],
    broadcasts: [],
    showOutputCalls: 0,
    scaffoldCalls: 0,
    l3Decisions: [],
    ...log,
  };
  let isRunning = false;
  let chainValid = true;
  const sentinelStub = {
    isRunning: () => isRunning,
    start: async () => { isRunning = true; callLog.sentinelStarted += 1; },
    stop: () => { isRunning = false; callLog.sentinelStopped += 1; },
    getStatus: () => ({ running: isRunning, mode: 'observe' }),
  };
  const base: Partial<ApiRouteDeps> = {
    rejectIfRemote: () => false,
    broadcast: (data) => { callLog.broadcasts.push(data); },
    sentinelDaemon: sentinelStub as never,
    planManager: { getActivePlan: () => ({ id: 'plan-1', phase: 'plan' }) } as never,
    qorelogicManager: { getL3Queue: () => [], processL3Decision: async () => undefined } as never,
    recordCheckpoint: (cp) => { callLog.checkpoints.push(cp as Record<string, unknown>); },
    inferPhaseKeyFromPlan: () => 'plan',
    verifyCheckpointChain: () => chainValid,
    setCachedChainValid: () => undefined,
    showOutput: () => { callLog.showOutputCalls += 1; },
    scaffoldSkills: (async () => ({ ok: true, message: 'scaffolded' })) as never,
  };
  const deps = Object.assign({}, base, overrides) as ApiRouteDeps;
  // chainValid hook for tests that need to flip it
  (deps as unknown as { setChainValid?: (v: boolean) => void }).setChainValid = (v: boolean) => { chainValid = v; };
  return { deps, log: callLog };
}

suite('ActionsRoute (FX066, FX068, + resume/verify/approve-l3)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('FX066 POST /api/actions/panic-stop — stops sentinel + records checkpoint + broadcasts', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps();
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/panic-stop' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(log.sentinelStopped, 1);
    assert.equal(log.checkpoints.length, 1);
    assert.equal(log.checkpoints[0].checkpointType, 'monitoring.stopped');
    assert.equal(log.checkpoints[0].policyVerdict, 'WARN');
    assert.ok(log.broadcasts.some((b) => b.type === 'hub.refresh'));
  });

  test('FX066 POST /api/actions/panic-stop — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupActionsRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/panic-stop');
    assert.equal(captured.statusCode, 403);
  });

  test('POST /api/actions/resume-monitoring — starts sentinel + records validated checkpoint + broadcasts', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps();
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/resume-monitoring' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(log.sentinelStarted, 1);
    assert.equal(log.checkpoints.length, 1);
    assert.equal(log.checkpoints[0].checkpointType, 'monitoring.resumed');
    assert.equal(log.checkpoints[0].policyVerdict, 'PASS');
    assert.equal(log.checkpoints[0].status, 'validated');
    assert.ok(log.broadcasts.some((b) => b.type === 'hub.refresh'));
  });

  test('POST /api/actions/resume-monitoring — when already running, does NOT start again but still 200s', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps({
      sentinelDaemon: {
        isRunning: () => true,
        start: async () => { log.sentinelStarted += 1; },
        stop: () => undefined,
        getStatus: () => ({ running: true, mode: 'observe' }),
      } as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/resume-monitoring' });
    assert.equal(res.status, 200);
    assert.equal(log.sentinelStarted, 0, 'start() should NOT be called when already running');
  });

  test('POST /api/actions/resume-monitoring — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupActionsRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/resume-monitoring');
    assert.equal(captured.statusCode, 403);
  });

  test('POST /api/actions/verify-integrity — returns chain valid status + verifiedAt timestamp + broadcasts', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps();
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/verify-integrity' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.chainValid, true);
    assert.match(String(res.body.verifiedAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(log.broadcasts.some((b) => b.type === 'hub.refresh'));
  });

  test('POST /api/actions/verify-integrity — chainValid false flows through to response', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      verifyCheckpointChain: () => false,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/verify-integrity' });
    assert.equal(res.status, 200);
    assert.equal(res.body.chainValid, false);
  });

  test('POST /api/actions/verify-integrity — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupActionsRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/verify-integrity');
    assert.equal(captured.statusCode, 403);
  });

  test('POST /api/actions/scaffold-skills — invokes scaffoldSkills and forwards report', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      scaffoldSkills: (async () => ({ ok: true, message: 'done' })) as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/scaffold-skills' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.report.message, 'done');
  });

  test('POST /api/actions/scaffold-skills — null return signals user-cancelled flow', async () => {
    const app = makeApp();
    const { deps } = makeDeps({ scaffoldSkills: async () => null });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/scaffold-skills' });
    assert.equal(res.status, 200);
    assert.equal(res.body.cancelled, true);
  });

  test('POST /api/actions/scaffold-skills — 501 when scaffoldSkills not provided', async () => {
    const app = makeApp();
    const { deps } = makeDeps({ scaffoldSkills: undefined });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/scaffold-skills' });
    assert.equal(res.status, 501);
  });

  test('FX068 POST /api/actions/show-output — invokes deps.showOutput + returns 204', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps();
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/show-output' });
    assert.equal(res.status, 204);
    assert.equal(log.showOutputCalls, 1);
  });

  test('FX068 POST /api/actions/show-output — 501 when showOutput not provided', async () => {
    const app = makeApp();
    const { deps } = makeDeps({ showOutput: undefined });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/show-output' });
    assert.equal(res.status, 501);
  });

  test('POST /api/actions/approve-l3-batch — empty queue returns processed=0', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps({
      qorelogicManager: { getL3Queue: () => [], processL3Decision: async () => undefined } as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.processed, 0);
    // Empty queue path does not broadcast; only populated processing does
    assert.equal(log.broadcasts.length, 0);
  });

  test('POST /api/actions/approve-l3-batch — APPROVED decision processes each queued item + broadcasts results', async () => {
    const app = makeApp();
    const processed: Array<{ id: string; decision: string; conds: string[] }> = [];
    const { deps, log } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [{ id: 'q1' }, { id: 'q2' }],
        processL3Decision: async (id: string, decision: string, conds: string[]) => {
          processed.push({ id, decision, conds });
        },
      } as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/approve-l3-batch',
      body: { decision: 'APPROVED', conditions: ['must-pass-checks'] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.results.every((r: { ok: boolean }) => r.ok), true);
    assert.equal(processed.length, 2);
    assert.ok(processed.every((p) => p.decision === 'APPROVED'));
    assert.ok(processed.every((p) => p.conds[0] === 'must-pass-checks'));
    assert.ok(log.broadcasts.some((b) => b.type === 'l3.batch_processed'));
  });

  test('POST /api/actions/approve-l3-batch — REJECTED decision is forwarded; non-string defaults to APPROVED', async () => {
    const app = makeApp();
    const decisions: string[] = [];
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [{ id: 'q1' }],
        processL3Decision: async (_id: string, decision: string) => { decisions.push(decision); },
      } as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'REJECTED' } });
    await harness.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'NONSENSE' } });
    assert.deepEqual(decisions, ['REJECTED', 'APPROVED']);
  });

  test('POST /api/actions/approve-l3-batch — per-item failure is captured per-result without aborting batch', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
        processL3Decision: async (id: string) => {
          if (id === 'q2') throw new Error('quarantined');
        },
      } as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED' },
    });
    assert.equal(res.body.processed, 3);
    const failed = res.body.results.filter((r: { ok: boolean }) => !r.ok);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].id, 'q2');
    assert.match(String(failed[0].error), /quarantined/);
  });

  test('POST /api/actions/approve-l3-batch — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupActionsRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/approve-l3-batch');
    assert.equal(captured.statusCode, 403);
  });
});
