// Functional tests for ActionsRoute (FX066 panic-stop, FX068 show-output,
// + resume-monitoring, verify-integrity, approve-l3-batch from the
// "Reality without Promise" gap section in FEATURE_INDEX).

import { strict as assert } from 'assert';
import { setupActionsRoutes } from '../../roadmap/routes/ActionsRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';

/** #514: a fake confirmer recording each dialog request and answering `result`. */
function confirmer(result: OperatorConfirmation = 'approved', onShow?: () => void): {
  confirm: (r: OperatorActionRequest) => Promise<OperatorConfirmation>;
  shown: OperatorActionRequest[];
} {
  const shown: OperatorActionRequest[] = [];
  return {
    shown,
    confirm: async (r) => { shown.push(r); onShow?.(); return result; },
  };
}

/** #538 (#514 residual): the authentication the decide-l3 route records. */
const DECIDE_AUTH = { method: 'vscode-modal-confirmation', channel: 'console:/api/actions/decide-l3' };

function queued(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, state: 'QUEUED', filePath: `src/${id}.ts`, riskGrade: 'L3', agentDid: 'did:agent:x',
    agentTrust: 0.4, sentinelSummary: `summary for ${id}`, flags: [], queuedAt: 't', slaDeadline: 't', ...extra,
  };
}

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
    confirmOperatorAction: async () => 'approved',
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

  test('#514 FX960 POST /api/actions/panic-stop — declined in VS Code returns 409 and the sentinel keeps running', async () => {
    const app = makeApp();
    const c = confirmer('declined');
    const { deps, log } = makeDeps({ confirmOperatorAction: c.confirm });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/panic-stop' });
    assert.equal(res.status, 409);
    assert.equal(res.body.confirmation, 'declined');
    assert.equal(c.shown.length, 1);
    assert.equal(c.shown[0].approveLabel, 'Stop Sentinel');
    assert.equal(log.sentinelStopped, 0, 'sentinelDaemon.stop not called');
    assert.equal(log.checkpoints.length, 0);
    assert.equal(log.broadcasts.length, 0);
  });

  test('#514 FX960 POST /api/actions/panic-stop — no confirmer wired returns 503 and nothing stops', async () => {
    const app = makeApp();
    const { deps, log } = makeDeps({ confirmOperatorAction: undefined });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/panic-stop' });
    assert.equal(res.status, 503);
    assert.equal(res.body.confirmation, 'unwired');
    assert.equal(log.sentinelStopped, 0);
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
    const res = await harness.request({ method: 'POST', path: '/api/actions/scaffold-skills', body: {} });
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
    const res = await harness.request({ method: 'POST', path: '/api/actions/scaffold-skills', body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.cancelled, true);
  });

  test('POST /api/actions/scaffold-skills — 501 when scaffoldSkills not provided', async () => {
    const app = makeApp();
    const { deps } = makeDeps({ scaffoldSkills: undefined });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/scaffold-skills', body: {} });
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

  test('POST /api/actions/approve-l3-batch — empty queue returns processed=0 with no dialog (#514 A6)', async () => {
    const app = makeApp();
    const c = confirmer('approved');
    const { deps, log } = makeDeps({
      qorelogicManager: { getL3Queue: () => [], processL3Decision: async () => undefined } as never,
      confirmOperatorAction: c.confirm,
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
    assert.equal(c.shown.length, 0, 'no dialog for an empty queue');
  });

  test('POST /api/actions/approve-l3-batch — APPROVED decision processes each queued item + broadcasts results', async () => {
    const app = makeApp();
    const processed: Array<{ id: string; decision: string; auth: unknown; conds: unknown }> = [];
    const c = confirmer('approved');
    const { deps, log } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1'), queued('q2', { kind: 'open-design-create-artifact' })],
        processL3Decision: async (id: string, decision: string, auth?: unknown, conds?: string[]) => {
          processed.push({ id, decision, auth, conds });
        },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.results.every((r: { ok: boolean }) => r.ok), true);
    assert.equal(processed.length, 2);
    assert.ok(processed.every((p) => p.decision === 'APPROVED'));
    assert.ok(processed.every((p) => p.conds === undefined), 'no request conditions forwarded');
    // #538 (#514 residual): each batch decision records how it was authenticated.
    for (const p of processed) {
      assert.deepEqual(p.auth, { method: 'vscode-modal-confirmation', channel: 'console:/api/actions/approve-l3-batch' });
    }
    assert.ok(log.broadcasts.some((b) => b.type === 'l3.batch_processed'));
    // #514: the dialog showed the verb, count and each item's kind + filePath.
    assert.equal(c.shown.length, 1);
    assert.equal(c.shown[0].title, 'Approve all 2 queued L3 items?');
    assert.ok(c.shown[0].detail.includes('src/q1.ts'));
    assert.ok(c.shown[0].detail.includes('open-design-create-artifact: src/q2.ts'));
  });

  test('#514 FX809 POST /api/actions/approve-l3-batch — body conditions are rejected (400) with no dialog', async () => {
    const app = makeApp();
    const processed: string[] = [];
    const c = confirmer('approved');
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1')],
        processL3Decision: async (id: string) => { processed.push(id); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/approve-l3-batch',
      body: { decision: 'APPROVED', conditions: ['must-pass-checks'] },
    });
    assert.equal(res.status, 400);
    assert.equal(processed.length, 0);
    assert.equal(c.shown.length, 0);
  });

  test('#514 FX809 POST /api/actions/approve-l3-batch — declined returns 409 and no item is processed', async () => {
    const app = makeApp();
    const processed: string[] = [];
    const { deps, log } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1'), queued('q2')],
        processL3Decision: async (id: string) => { processed.push(id); },
      } as never,
      confirmOperatorAction: confirmer('declined').confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.confirmation, 'declined');
    assert.equal(processed.length, 0);
    assert.equal(log.broadcasts.length, 0);
  });

  test('#514 FX809 POST /api/actions/approve-l3-batch — a confirmed REJECTED batch rejects exactly the snapshot; items queued during the dialog stay queued', async () => {
    const app = makeApp();
    const queue = [queued('q1'), queued('q2')];
    const processed: Array<{ id: string; decision: string }> = [];
    const c = confirmer('approved', () => { queue.push(queued('late')); });
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [...queue],
        processL3Decision: async (id: string, decision: string) => { processed.push({ id, decision }); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'REJECTED' } });
    assert.equal(res.status, 200);
    assert.equal(c.shown[0].approveLabel, 'Reject 2');
    assert.deepEqual(processed, [{ id: 'q1', decision: 'REJECTED' }, { id: 'q2', decision: 'REJECTED' }]);
  });

  test('#514 A4 POST /api/actions/approve-l3-batch — a request with no body is confirmed as APPROVED', async () => {
    const app = makeApp();
    const decisions: string[] = [];
    const c = confirmer('approved');
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1')],
        processL3Decision: async (_id: string, decision: string) => { decisions.push(decision); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/approve-l3-batch' });
    assert.equal(res.status, 200);
    assert.deepEqual(decisions, ['APPROVED']);
    assert.equal(c.shown[0].title, 'Approve all 1 queued L3 item?');
  });

  test('POST /api/actions/approve-l3-batch — REJECTED decision is forwarded; non-string defaults to APPROVED', async () => {
    const app = makeApp();
    const decisions: string[] = [];
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1')],
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
        getL3Queue: () => [queued('q1'), queued('q2'), queued('q3')],
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

  // FX809 — B-OD-8: per-item L3 decision route.
  test('FX809 POST /api/actions/decide-l3 — routes one item to processL3Decision(id,decision)', async () => {
    const app = makeApp();
    const calls: unknown[][] = [];
    const c = confirmer('approved');
    const { deps, log } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q42')],
        processL3Decision: async (...args: unknown[]) => { calls.push(args); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q42', decision: 'APPROVED' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(calls, [['q42', 'APPROVED', DECIDE_AUTH]], 'processL3Decision called once with (id, decision, authentication)');
    assert.ok(log.broadcasts.some((b) => b.type === 'l3.decided'));
    // #514: the dialog carries the verb and the queue entry's server-side fields.
    assert.equal(c.shown.length, 1);
    assert.equal(c.shown[0].title, 'Approve this L3 item?');
    assert.equal(c.shown[0].approveLabel, 'Approve');
    assert.ok(c.shown[0].detail.includes('src/q42.ts'));
    assert.ok(c.shown[0].detail.includes('summary for q42'));
  });

  test('#514 FX809 POST /api/actions/decide-l3 — a confirmed REJECTED request records REJECTED', async () => {
    const app = makeApp();
    const calls: unknown[][] = [];
    const c = confirmer('approved');
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q7')],
        processL3Decision: async (...args: unknown[]) => { calls.push(args); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q7', decision: 'REJECTED' } });
    assert.equal(res.status, 200);
    assert.equal(c.shown[0].title, 'Reject this L3 item?');
    assert.equal(c.shown[0].approveLabel, 'Reject');
    assert.deepEqual(calls, [['q7', 'REJECTED', DECIDE_AUTH]]);
  });

  for (const [result, status] of [['declined', 409], ['busy', 429]] as const) {
    test(`#514 FX809 POST /api/actions/decide-l3 — ${result} returns ${status} and records nothing`, async () => {
      const app = makeApp();
      const calls: string[] = [];
      const { deps, log } = makeDeps({
        qorelogicManager: {
          getL3Queue: () => [queued('q1')],
          processL3Decision: async (id: string) => { calls.push(id); },
        } as never,
        confirmOperatorAction: confirmer(result).confirm,
      });
      setupActionsRoutes(app, deps);
      harness = new RouteHarness(app);
      await harness.start();
      const res = await harness.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q1', decision: 'APPROVED' } });
      assert.equal(res.status, status);
      assert.equal(res.body.confirmation, result);
      assert.equal(calls.length, 0, 'processL3Decision not called');
      assert.equal(log.broadcasts.length, 0);
    });
  }

  test('#514 FX809 POST /api/actions/decide-l3 — no confirmer wired returns 503 and records nothing', async () => {
    const app = makeApp();
    const calls: string[] = [];
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1')],
        processL3Decision: async (id: string) => { calls.push(id); },
      } as never,
      confirmOperatorAction: undefined,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q1' } });
    assert.equal(res.status, 503);
    assert.equal(res.body.confirmation, 'unwired');
    assert.equal(calls.length, 0);
  });

  test('#514 FX809 POST /api/actions/decide-l3 — body conditions are rejected (400) with no dialog', async () => {
    const app = makeApp();
    const calls: string[] = [];
    const c = confirmer('approved');
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1')],
        processL3Decision: async (id: string) => { calls.push(id); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q1', decision: 'APPROVED', conditions: ['x'] },
    });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
    assert.equal(c.shown.length, 0);
  });

  test('FX809 POST /api/actions/decide-l3 — missing id returns 400 without deciding', async () => {
    const app = makeApp();
    const calls: string[] = [];
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [],
        processL3Decision: async (id: string) => { calls.push(id); },
      } as never,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/decide-l3', body: { decision: 'APPROVED' } });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  test('FX809 POST /api/actions/decide-l3 — unknown id surfaces 404 before any dialog', async () => {
    const app = makeApp();
    const calls: string[] = [];
    const c = confirmer('approved');
    const { deps } = makeDeps({
      qorelogicManager: {
        getL3Queue: () => [queued('q1')],
        processL3Decision: async (id: string) => { calls.push(id); throw new Error(`L3 request not found: ${id}`); },
      } as never,
      confirmOperatorAction: c.confirm,
    });
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q99' } });
    assert.equal(res.status, 404);
    assert.match(String(res.body.error), /not found/);
    assert.equal(c.shown.length, 0, 'no dialog for an unknown id');
    assert.equal(calls.length, 0);
  });
});
