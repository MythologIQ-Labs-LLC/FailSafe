// Lane D2 (plan-d2-resume-guard LD1-LD5, B383): the Console request guard in front of
// resume-monitoring and verify-integrity, and a limiter after it on verify-integrity.
//
// A cross-site page, a rebinding Host, Origin null, a form or text body and a remote socket are
// refused with no Sentinel start, no checkpoint, no chain verify, no cache write and no broadcast.
// Same-origin JSON, and what the Console's postAction sends (JSON content type, no body), keep
// their behaviour. verify-integrity answers 429 after 10 requests a minute, and refused requests
// do not spend the budget; resume-monitoring has no limiter, like panic-stop.

import { strict as assert } from 'assert';
import type { Request, Response } from 'express';
import { setupActionsRoutes } from '../../roadmap/routes/ActionsRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote, type RouteRequestOptions } from '../extension/helpers/routeTestHarness';

// The real ConsoleServer check (ConsoleServer.ts rejectIfRemote), so its body is asserted.
function rejectIfRemote(req: Request, res: Response): boolean {
  const n = String(req.socket?.remoteAddress || req.ip || '').trim();
  if (n === '127.0.0.1' || n === '::1' || n === '::ffff:127.0.0.1') return false;
  res.status(403).json({ error: 'Forbidden: local access only' });
  return true;
}

interface Spies { starts: number; checkpoints: Array<Record<string, unknown>>; verifies: number; cacheWrites: number; broadcasts: number }

function build() {
  const spies: Spies = { starts: 0, checkpoints: [], verifies: 0, cacheWrites: 0, broadcasts: 0 };
  let running = false; // the state after an operator's Panic Stop
  const app = makeApp();
  const deps = {
    rejectIfRemote,
    broadcast: () => { spies.broadcasts += 1; },
    sentinelDaemon: {
      isRunning: () => running,
      start: async () => { spies.starts += 1; running = true; },
      stop: () => { running = false; },
      getStatus: () => ({ running }),
    },
    planManager: { getActivePlan: () => null },
    qorelogicManager: { getL3Queue: () => [] },
    recordCheckpoint: (cp: Record<string, unknown>) => { spies.checkpoints.push(cp); },
    inferPhaseKeyFromPlan: () => 'plan',
    verifyCheckpointChain: () => { spies.verifies += 1; return true; },
    setCachedChainValid: () => { spies.cacheWrites += 1; },
    confirmOperatorAction: async () => 'approved' as const,
  } as unknown as ApiRouteDeps;
  setupActionsRoutes(app, deps);
  return { app, spies };
}

const nothingHappened = (s: Spies, label: string) => {
  assert.equal(s.starts, 0, `${label}: the Sentinel was not started`);
  assert.equal(s.checkpoints.length, 0, `${label}: no checkpoint was recorded`);
  assert.equal(s.verifies, 0, `${label}: the chain was not verified`);
  assert.equal(s.cacheWrites, 0, `${label}: the chain cache was not written`);
  assert.equal(s.broadcasts, 0, `${label}: nothing was broadcast`);
};

const portOf = (h: RouteHarness) => (h as unknown as { port: number }).port;
const EVIL = 'http://evil.example';

interface RouteCase { name: 'resume-monitoring' | 'verify-integrity'; path: string }
const ROUTES: RouteCase[] = [
  { name: 'resume-monitoring', path: '/api/actions/resume-monitoring' },
  { name: 'verify-integrity', path: '/api/actions/verify-integrity' },
];

/** The effects one accepted request has on each route. */
function assertAccepted(c: RouteCase, s: Spies, body: Record<string, unknown>, label: string) {
  assert.equal(s.broadcasts, 1, `${label}: one hub.refresh`);
  if (c.name === 'resume-monitoring') {
    assert.equal(s.starts, 1, `${label}: the Sentinel was started`);
    assert.equal(s.checkpoints.length, 1);
    assert.equal(s.checkpoints[0].checkpointType, 'monitoring.resumed');
    assert.equal(s.checkpoints[0].policyVerdict, 'PASS');
    assert.equal(s.verifies, 0);
  } else {
    assert.equal(s.verifies, 1, `${label}: the chain was verified`);
    assert.equal(s.cacheWrites, 1);
    assert.equal(body.chainValid, true);
    assert.equal(s.starts, 0);
  }
}

suite('Lane D2: Console request guard on resume-monitoring and verify-integrity (B383)', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });

  async function start() {
    const built = build();
    harness = new RouteHarness(built.app);
    await harness.start();
    return { h: harness, spies: built.spies };
  }

  for (const c of ROUTES) {
    suite(c.name, () => {
      const refused: Array<[string, Omit<RouteRequestOptions, 'path'>, number, string]> = [
        ['R1 a cross-site text/plain POST with no body', { headers: { origin: EVIL, 'content-type': 'text/plain' } }, 403, 'origin'],
        ['R1b a cross-site text/plain;charset=UTF-8 POST (what sendBeacon sends)', { rawBody: '', headers: { origin: EVIL, 'content-type': 'text/plain;charset=UTF-8' } }, 403, 'origin'],
        ['R2a a text/plain POST with an empty body and no Origin', { rawBody: '', headers: { 'content-type': 'text/plain' } }, 415, 'content-type'],
        ['R2b a POST with no body and no content type', {}, 415, 'content-type'],
        ['R2c a urlencoded form POST with no Origin', { rawBody: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, 415, 'content-type'],
        ['R2d a multipart form POST with no Origin', { rawBody: '--x--\r\n', headers: { 'content-type': 'multipart/form-data; boundary=x' } }, 415, 'content-type'],
        ['R3 cross-site JSON', { body: {}, headers: { origin: EVIL } }, 403, 'origin'],
        ['R4 Origin null with JSON', { body: {}, headers: { origin: 'null' } }, 403, 'origin'],
        ['R5 a rebinding Host with JSON', { body: {}, headers: { host: 'evil.example:9376' } }, 403, 'host'],
      ];
      for (const [label, shape, status, guard] of refused) {
        test(`${label} is refused (${status} ${guard}) with no side effect`, async () => {
          const { h, spies } = await start();
          const res = await h.request({ ...shape, method: 'POST', path: c.path });
          assert.equal(res.status, status, JSON.stringify(res.body));
          assert.equal(res.body?.guard, guard);
          nothingHappened(spies, label);
        });
      }

      test('R6 (regression guard) a remote socket with a loopback Host gets the rejectIfRemote 403', async () => {
        const { app, spies } = build();
        const captured = await invokeRemote(app, 'POST', c.path, {
          headers: { host: '127.0.0.1:9376', 'content-type': 'application/json' }, body: {},
        });
        assert.equal(captured.statusCode, 403);
        assert.deepEqual(captured.body, { error: 'Forbidden: local access only' });
        nothingHappened(spies, 'R6');
      });

      test('S1 (regression guard) same origin: Origin equal to Host, Application/JSON', async () => {
        const { h, spies } = await start();
        const res = await h.request({
          method: 'POST', path: c.path, rawBody: '{}',
          headers: { origin: `http://127.0.0.1:${portOf(h)}`, 'content-type': 'Application/JSON' },
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assertAccepted(c, spies, res.body, 'S1');
      });

      test('S2 (regression guard) what postAction sends: a JSON content type and no body', async () => {
        const { h, spies } = await start();
        const res = await h.request({ method: 'POST', path: c.path, headers: { 'content-type': 'application/json' } });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assertAccepted(c, spies, res.body, 'S2');
      });
    });
  }

  test('L1 verify-integrity: the limiter answers 429 after 10 requests', async () => {
    const { h, spies } = await start();
    for (let i = 0; i < 10; i++) {
      assert.equal((await h.request({ method: 'POST', path: '/api/actions/verify-integrity', body: {} })).status, 200, `request ${i + 1}`);
    }
    const over = await h.request({ method: 'POST', path: '/api/actions/verify-integrity', body: {} });
    assert.equal(over.status, 429);
    assert.equal(spies.verifies, 10, 'the limited request did not verify the chain');
  });

  test('L2 verify-integrity: 12 refused cross-site requests are each 403 and do not spend the budget', async () => {
    const { h, spies } = await start();
    for (let i = 0; i < 12; i++) {
      const res = await h.request({ method: 'POST', path: '/api/actions/verify-integrity', body: {}, headers: { origin: EVIL } });
      assert.equal(res.status, 403, `refusal ${i + 1}`);
      assert.equal(spies.verifies, 0, `refusal ${i + 1}: no verify`);
    }
    const valid = await h.request({ method: 'POST', path: '/api/actions/verify-integrity', body: {} });
    assert.equal(valid.status, 200, JSON.stringify(valid.body));
    assert.equal(spies.verifies, 1);
  });

  test('L3 (regression guard) resume-monitoring has no limiter: 15 valid requests are all 200', async () => {
    const { h, spies } = await start();
    for (let i = 0; i < 15; i++) {
      assert.equal((await h.request({ method: 'POST', path: '/api/actions/resume-monitoring', body: {} })).status, 200, `request ${i + 1}`);
    }
    assert.equal(spies.starts, 1, 'started once; the Sentinel was then running');
    assert.equal(spies.checkpoints.length, 15);
  });
});
