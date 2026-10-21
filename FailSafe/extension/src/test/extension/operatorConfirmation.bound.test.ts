/**
 * #538 lane B (plan-538b LD2/LD3): `confirmBoundOperation` shows a server-built operation,
 * returns that frozen object only on a timely approval, and answers every other outcome.
 * The new exports are read from the module at run time, so the suite fails by assertion
 * (not a build error) on the source before they exist.
 */
import { strict as assert } from 'assert';
import * as http from 'http';
import type { Response } from 'express';
import * as confirmation from '../../extension/operatorConfirmation';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

type Confirm = (r: OperatorActionRequest) => Promise<OperatorConfirmation>;
type Bound = { operationId: string; operation: { kind: string; list: string[] } } | null;
type BoundFn = (
  confirm: Confirm | undefined, operation: unknown,
  describe: (op: unknown, id: string) => OperatorActionRequest, res: Response, options?: { deadlineMs?: number },
) => Promise<Bound>;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const api = confirmation as unknown as Record<string, unknown>;
function bound(): BoundFn {
  assert.equal(typeof api.confirmBoundOperation, 'function', 'confirmBoundOperation is exported');
  return api.confirmBoundOperation as BoundFn;
}
const describe = (op: unknown, id: string): OperatorActionRequest => ({
  title: 'Run it?', approveLabel: 'Run', detail: `${JSON.stringify(op)}\nOperation: ${id}`,
});

suite('#538 confirmBoundOperation', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });

  /** Mount one route that binds `operation`, records what it got and answers 200 on approval. */
  async function mount(confirm: Confirm | undefined, deadlineMs?: number) {
    const fn = bound();
    const got: Bound[] = [];
    const app = makeApp();
    app.post('/op', async (_req, res) => {
      const operation = { kind: 'demo', list: ['a'] };
      const r = await fn(confirm, operation, describe, res, { deadlineMs });
      got.push(r);
      operation.list.push('changed after the dialog');
      if (r) res.json({ ok: true, operationId: r.operationId, operation: r.operation });
    });
    harness = new RouteHarness(app);
    await harness.start();
    return { got, post: () => harness!.request({ method: 'POST', path: '/op', body: {} }) };
  }

  test('approved: returns a frozen copy, the id is in the dialog and unique per call', async () => {
    const shown: OperatorActionRequest[] = [];
    const m = await mount(async (r) => { shown.push(r); return 'approved'; });
    const a = await m.post();
    const b = await m.post();
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.operation, { kind: 'demo', list: ['a'] }, 'a later change to the source object is not seen');
    assert.notEqual(a.body.operationId, b.body.operationId);
    assert.ok(shown[0].detail.includes(a.body.operationId));
    const op = m.got[0]!.operation;
    assert.ok(Object.isFrozen(op) && Object.isFrozen(op.list));
    assert.throws(() => { (op.list as string[]).push('x'); }, TypeError);
  });

  for (const [answer, status] of [['declined', 409], ['busy', 429]] as const) {
    test(`${answer} answers ${status} with the operation id and returns null`, async () => {
      const m = await mount(async () => answer);
      const res = await m.post();
      assert.equal(res.status, status);
      assert.equal(res.body.confirmation, answer);
      assert.match(res.body.operationId, /^op_/);
      assert.deepEqual(m.got, [null]);
    });
  }

  test('a confirmer that throws counts as declined', async () => {
    const m = await mount(async () => { throw new Error('dialog failed'); });
    const res = await m.post();
    assert.equal(res.status, 409);
    assert.equal(res.body.confirmation, 'declined');
  });

  test('unwired answers 503 before any dialog', async () => {
    const m = await mount(undefined);
    const res = await m.post();
    assert.equal(res.status, 503);
    assert.equal(res.body.confirmation, 'unwired');
    assert.deepEqual(m.got, [null]);
  });

  test('a late approval answers 410 expired once and returns null', async () => {
    const m = await mount(async () => { await delay(120); return 'approved'; }, 20);
    const res = await m.post();
    assert.equal(res.status, 410);
    assert.equal(res.body.confirmation, 'expired');
    await delay(160);
    assert.deepEqual(m.got, [null]);
  });

  test('a closed client is cancelled: nothing is returned and no dialog result is used', async () => {
    let approve: (v: OperatorConfirmation) => void = () => undefined;
    let opened: () => void = () => undefined;
    const openedP = new Promise<void>((r) => { opened = r; });
    const m = await mount(() => { opened(); return new Promise((r) => { approve = r; }); });
    const port = (harness as unknown as { port: number }).port;
    const req = http.request({ host: '127.0.0.1', port, path: '/op', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '2' } });
    req.on('error', () => undefined);
    req.end('{}');
    await openedP;
    req.destroy();
    await delay(80);
    assert.deepEqual(m.got, [null], 'the close itself settles the request, before any approval');
    approve('approved');
    await delay(50);
    assert.deepEqual(m.got, [null]);
  });

  /** A response double whose socket can be destroyed without a close event. */
  function fakeRes(destroyed = false) {
    const written: Array<{ status: number; body: unknown }> = [];
    let status = 200;
    const res = {
      socket: { destroyed }, writableEnded: false, headersSent: false,
      once() { return res; }, off() { return res; },
      status(s: number) { status = s; return res; },
      json(body: unknown) { written.push({ status, body }); return res; },
    };
    return { res, written };
  }

  test('a socket already destroyed when the request arrives: no dialog, nothing returned', async () => {
    let asked = 0;
    const f = fakeRes(true);
    const r = await bound()(async () => { asked += 1; return 'approved'; }, { kind: 'demo' }, describe, f.res as unknown as Response);
    assert.equal(r, null);
    assert.equal(asked, 0);
    assert.deepEqual(f.written, []);
  });

  test('a socket destroyed while the dialog is open (no close event): the approval is not used', async () => {
    const f = fakeRes(false);
    const r = await bound()(async () => { f.res.socket.destroyed = true; return 'approved'; }, { kind: 'demo' }, describe, f.res as unknown as Response);
    assert.equal(r, null);
    assert.deepEqual(f.written, [], 'nothing is written to a gone socket');
  });

  test('exactly one response is written when the deadline and a decline race', async () => {
    const f = fakeRes(false);
    const r = await bound()(async () => { await delay(40); return 'declined'; }, { kind: 'demo' }, describe, f.res as unknown as Response, { deadlineMs: 10 });
    assert.equal(r, null);
    await delay(60); // let the late decline arrive
    assert.equal(f.written.length, 1);
    assert.equal(f.written[0].status, 410);
  });

  test('failure map: expired 410, cancelled 499, existing statuses unchanged', () => {
    const map = confirmation.confirmationFailure as unknown as (r: string) => { status: number; body: { confirmation: string } };
    assert.equal(map('unwired').status, 503);
    assert.equal(map('busy').status, 429);
    assert.equal(map('declined').status, 409);
    assert.equal(map('expired').status, 410);
    assert.equal(map('cancelled').status, 499);
    assert.equal(map('expired').body.confirmation, 'expired');
    assert.equal(api.CONFIRMATION_DEADLINE_MS, 120_000);
  });
});

// #532 B320 (plan-b320 LD3): the same binding for a VS Code command (no HTTP response).
suite('#532 B320 confirmBoundCommand', () => {
  const op = () => ({ kind: 'review', list: ['a'] });

  test('approved: confirm is called exactly once and a deep-frozen copy is returned with its operation id', async () => {
    const shown: OperatorActionRequest[] = [];
    const source = op();
    const r = await confirmation.confirmBoundCommand(async (q) => { shown.push(q); return 'approved'; }, source, describe);
    source.list.push('changed after the dialog');
    assert.equal(shown.length, 1);
    assert.equal(r.ok, true);
    const b = (r as Extract<typeof r, { ok: true }>).bound;
    assert.deepEqual(b.operation, { kind: 'review', list: ['a'] });
    assert.ok(Object.isFrozen(b.operation) && Object.isFrozen(b.operation.list));
    assert.ok(shown[0].detail.includes(b.operationId));
    assert.match(b.operationId, /^op_/);
  });

  test('declined, busy, a throwing confirmer, unwired and an approval after the deadline are failures', async () => {
    for (const answer of ['declined', 'busy'] as const) {
      let calls = 0;
      const r = await confirmation.confirmBoundCommand(async () => { calls += 1; return answer; }, op(), describe);
      assert.deepEqual([r.ok, (r as { failure?: string }).failure, calls], [false, answer, 1]);
    }
    const threw = await confirmation.confirmBoundCommand(async () => { throw new Error('x'); }, op(), describe);
    assert.equal((threw as { failure?: string }).failure, 'declined');
    assert.deepEqual(await confirmation.confirmBoundCommand(undefined, op(), describe), { ok: false, failure: 'unwired', operationId: null });
    const late = await confirmation.confirmBoundCommand(async () => { await delay(60); return 'approved'; }, op(), describe, { deadlineMs: 20 });
    assert.equal((late as { failure?: string }).failure, 'expired');
  });
});
