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
    approve('approved');
    await delay(50);
    assert.deepEqual(m.got, [null]);
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
