// Lane D (plan-l3-routes-guard LD1-LD6): the Console request guard and a limiter in front of
// the L3 decision routes, and the guard in front of panic-stop.
//
// A cross-site page, a rebinding Host, Origin null and a remote socket are refused before any
// dialog, decision or architecture-index read. Same-origin JSON keeps its behaviour, including
// the #514 A4 empty-body default. The limiter answers 429 after its budget and refused requests
// do not spend it. The architecture lookup runs only after every cheap refusal, busy included.

import { strict as assert } from 'assert';
import type { Request, Response } from 'express';
import { setupActionsRoutes } from '../../roadmap/routes/ActionsRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import * as confirmation from '../../extension/operatorConfirmation';
import type { ConfirmOperatorAction, OperatorActionRequest } from '../../extension/operatorConfirmation';
import { RouteHarness, makeApp, invokeRemote, type RouteRequestOptions } from '../extension/helpers/routeTestHarness';

// The real ConsoleServer check (ConsoleServer.ts rejectIfRemote), so its body is asserted.
function rejectIfRemote(req: Request, res: Response): boolean {
  const n = String(req.socket?.remoteAddress || req.ip || '').trim();
  if (n === '127.0.0.1' || n === '::1' || n === '::ffff:127.0.0.1') return false;
  res.status(403).json({ error: 'Forbidden: local access only' });
  return true;
}

const item = (id: string) => ({
  id, state: 'QUEUED', filePath: `src/${id}.ts`, riskGrade: 'L3', agentDid: 'did:agent:x', agentTrust: 0.4,
  sentinelSummary: 's', flags: [], queuedAt: 't', slaDeadline: 't',
});

interface Spies { shown: OperatorActionRequest[]; decided: Array<{ id: string; decision: string }>; reads: number; stops: number }
interface BuildOptions { queue?: unknown[]; confirm?: ConfirmOperatorAction | null }

function build(o: BuildOptions = {}) {
  const spies: Spies = { shown: [], decided: [], reads: 0, stops: 0 };
  const queue = o.queue ?? [item('q1')];
  const app = makeApp();
  const deps = {
    rejectIfRemote,
    broadcast: () => undefined,
    qorelogicManager: {
      getL3Queue: () => queue,
      processL3Decision: async (id: string, decision: string) => { spies.decided.push({ id, decision }); },
    },
    describeArchitecture: async () => { spies.reads += 1; return { state: 'ok', lines: [] }; },
    confirmOperatorAction: o.confirm === null ? undefined
      : o.confirm ?? (async (r: OperatorActionRequest) => { spies.shown.push(r); return 'approved' as const; }),
    sentinelDaemon: { isRunning: () => true, stop: () => { spies.stops += 1; }, getStatus: () => ({ running: false }) },
    planManager: { getActivePlan: () => null },
    recordCheckpoint: () => undefined,
    inferPhaseKeyFromPlan: () => 'plan',
  } as unknown as ApiRouteDeps;
  setupActionsRoutes(app, deps);
  return { app, spies };
}

const portOf = (h: RouteHarness) => (h as unknown as { port: number }).port;
const nothingHappened = (s: Spies, label: string) => {
  assert.equal(s.shown.length, 0, `${label}: no dialog`);
  assert.equal(s.decided.length, 0, `${label}: no L3 decision`);
  assert.equal(s.reads, 0, `${label}: the architecture index was not read`);
  assert.equal(s.stops, 0, `${label}: the Sentinel was not stopped`);
};

interface RouteCase { name: string; path: string; body: Record<string, unknown>; budget: number | null; lookup: boolean }
const ROUTES: RouteCase[] = [
  { name: 'approve-l3-batch', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED' }, budget: 10, lookup: true },
  { name: 'decide-l3', path: '/api/actions/decide-l3', body: { id: 'q1', decision: 'APPROVED' }, budget: 30, lookup: true },
  { name: 'panic-stop', path: '/api/actions/panic-stop', body: {}, budget: null, lookup: false },
];

const EVIL = 'http://evil.example';

suite('Lane D: Console request guard and limiter on the L3 routes and panic-stop', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });

  async function start(o: BuildOptions = {}) {
    const built = build(o);
    harness = new RouteHarness(built.app);
    await harness.start();
    return { h: harness, spies: built.spies };
  }

  for (const c of ROUTES) {
    suite(c.name, () => {
      const refused: Array<[string, (c: RouteCase) => Omit<RouteRequestOptions, 'path'>, number, string]> = [
        ['R1 a cross-site text/plain POST with no body', () => ({ headers: { origin: EVIL, 'content-type': 'text/plain' } }), 403, 'origin'],
        ['R2 a text/plain POST with no body and no Origin', () => ({ rawBody: '', headers: { 'content-type': 'text/plain' } }), 415, 'content-type'],
        ['R2 a POST with no body and no content type (the old A4 shape)', () => ({}), 415, 'content-type'],
        ['R3 cross-site JSON', (k) => ({ body: k.body, headers: { origin: EVIL } }), 403, 'origin'],
        ['R4 Origin null with JSON', (k) => ({ body: k.body, headers: { origin: 'null' } }), 403, 'origin'],
        ['R5 a rebinding Host with JSON', (k) => ({ body: k.body, headers: { host: 'evil.example:9376' } }), 403, 'host'],
      ];
      for (const [label, shape, status, guard] of refused) {
        test(`${label} is refused (${status} ${guard}) with no dialog, decision or index read`, async () => {
          const { h, spies } = await start();
          const res = await h.request({ ...shape(c), method: 'POST', path: c.path });
          assert.equal(res.status, status, JSON.stringify(res.body));
          assert.equal(res.body?.guard, guard);
          nothingHappened(spies, label);
        });
      }

      test('R6 (regression guard) a remote socket with a loopback Host gets the rejectIfRemote 403', async () => {
        const { app, spies } = build();
        const captured = await invokeRemote(app, 'POST', c.path, {
          headers: { host: '127.0.0.1:9376', 'content-type': 'application/json' }, body: c.body,
        });
        assert.equal(captured.statusCode, 403);
        assert.deepEqual(captured.body, { error: 'Forbidden: local access only' });
        nothingHappened(spies, 'R6');
      });

      test('S1 (regression guard) same origin: Origin equal to Host, Application/JSON', async () => {
        const { h, spies } = await start();
        const res = await h.request({
          method: 'POST', path: c.path, rawBody: JSON.stringify(c.body),
          headers: { origin: `http://127.0.0.1:${portOf(h)}`, 'content-type': 'Application/JSON' },
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(spies.shown.length, 1);
        if (c.name === 'panic-stop') assert.equal(spies.stops, 1);
        else assert.deepEqual(spies.decided, [{ id: 'q1', decision: 'APPROVED' }]);
        assert.equal(spies.reads, c.lookup ? 1 : 0);
      });

      if (c.budget !== null) {
        const budget = c.budget;
        test(`L1 the limiter answers 429 after ${budget} requests`, async () => {
          const { h, spies } = await start({ queue: [] });
          const expected = c.name === 'decide-l3' ? 404 : 200;
          for (let i = 0; i < budget; i++) {
            assert.equal((await h.request({ method: 'POST', path: c.path, body: c.body })).status, expected, `request ${i + 1}`);
          }
          const over = await h.request({ method: 'POST', path: c.path, body: c.body });
          assert.equal(over.status, 429);
          assert.equal(over.body?.confirmation, undefined, 'the limiter answered, not the confirmer');
          assert.equal(spies.shown.length, 0);
        });

        const n = budget + 2;
        test(`L2 ${n} refused cross-site requests are each 403 with no dialog and do not spend the budget`, async () => {
          const { h, spies } = await start();
          for (let i = 0; i < n; i++) {
            const res = await h.request({ method: 'POST', path: c.path, body: c.body, headers: { origin: EVIL } });
            assert.equal(res.status, 403, `refusal ${i + 1}`);
            assert.equal(spies.shown.length, 0, `refusal ${i + 1}: no dialog`);
          }
          const valid = await h.request({ method: 'POST', path: c.path, body: c.body });
          assert.equal(valid.status, 200, JSON.stringify(valid.body));
          assert.equal(spies.shown.length, 1, 'the valid request still reached the confirmer');
        });
      }
    });
  }

  test('S2 (regression guard, #514 A4) approve-l3-batch: JSON content type and no body is confirmed as APPROVED', async () => {
    const { h, spies } = await start();
    const res = await h.request({ method: 'POST', path: '/api/actions/approve-l3-batch', headers: { 'content-type': 'application/json' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(spies.decided, [{ id: 'q1', decision: 'APPROVED' }]);
    assert.equal(spies.shown[0].title, 'Approve all 1 queued L3 item?');
  });

  suite('C1 the architecture lookup is not called on cheap refusals', () => {
    test('(regression guard) approve-l3-batch: body conditions -> 400', async () => {
      const { h, spies } = await start();
      const res = await h.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED', conditions: ['x'] } });
      assert.equal(res.status, 400);
      nothingHappened(spies, 'conditions');
    });
    test('(regression guard) decide-l3: body conditions -> 400', async () => {
      const { h, spies } = await start();
      const res = await h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q1', conditions: ['x'] } });
      assert.equal(res.status, 400);
      nothingHappened(spies, 'conditions');
    });
    test('(regression guard) approve-l3-batch: empty queue -> 200 processed 0', async () => {
      const { h, spies } = await start({ queue: [] });
      const res = await h.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.processed, 0);
      nothingHappened(spies, 'empty queue');
    });
    test('(regression guard) decide-l3: unknown id -> 404', async () => {
      const { h, spies } = await start();
      const res = await h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'q99' } });
      assert.equal(res.status, 404);
      nothingHappened(spies, 'unknown id');
    });
    for (const [route, body] of [['approve-l3-batch', { decision: 'APPROVED' }], ['decide-l3', { id: 'q1' }]] as const) {
      test(`${route}: no confirmer -> 503 before the index is read`, async () => {
        const { h, spies } = await start({ confirm: null });
        const res = await h.request({ method: 'POST', path: `/api/actions/${route}`, body });
        assert.equal(res.status, 503);
        assert.equal(res.body.confirmation, 'unwired');
        nothingHappened(spies, 'unwired');
      });
    }
  });

  suite('C2 busy with the real confirmer: a second request is 429 before the index is read', () => {
    for (const [route, body] of [['approve-l3-batch', { decision: 'APPROVED' }], ['decide-l3', { id: 'q1', decision: 'APPROVED' }]] as const) {
      test(route, async () => {
        let release: (choice: string | undefined) => void = () => undefined;
        let dialogs = 0;
        const confirm = confirmation.createOperatorConfirmer({
          showWarningMessage: (_m, _o, ..._items) => {
            dialogs += 1;
            return new Promise<string | undefined>((r) => { release = r; });
          },
        });
        const { h, spies } = await start({ confirm });
        const first = h.request({ method: 'POST', path: `/api/actions/${route}`, body });
        try {
          for (let i = 0; i < 100 && dialogs === 0; i++) await new Promise((r) => setTimeout(r, 10));
          assert.equal(dialogs, 1, 'the first request opened the dialog');
          assert.equal(spies.reads, 1);
          const second = await h.request({ method: 'POST', path: `/api/actions/${route}`, body });
          assert.equal(second.status, 429, JSON.stringify(second.body));
          assert.equal(second.body.confirmation, 'busy');
          assert.equal(spies.reads, 1, 'the busy request did not read the index');
          assert.equal(dialogs, 1);
        } finally {
          release(undefined); // dismiss, so the held request answers and teardown can close the server
        }
        assert.equal((await first).status, 409);
        assert.equal(spies.decided.length, 0);
      });
    }
  });
});
