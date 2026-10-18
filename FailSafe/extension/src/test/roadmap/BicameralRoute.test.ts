/**
 * FX514 — B-BIC-1: BicameralRoute ratify handler appends USER_OVERRIDE
 * entry to META_LEDGER when ledgerManager dep is provided. Non-blocking on
 * ledger failure (ratify response remains {ok:true}).
 */

import { strict as assert } from 'assert';
import * as os from 'os';
import type { Request, Response } from 'express';
import { setupBicameralRoutes, type BicameralRouteDeps } from '../../roadmap/routes/BicameralRoute';
import type { BicameralMcpClient } from '../../integrations/bicameral';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import * as vscode from 'vscode';
import { configureTrustedExecutables, repoRootsFor, workspaceDirsFor } from '../../shared/exec/trustedExecutable';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';

interface CapturedHandler {
  method: 'get' | 'post';
  path: string;
  handler: (req: Request, res: Response) => Promise<void> | void;
}

function makeFakeApp(): { app: any; handlers: CapturedHandler[] } {
  const handlers: CapturedHandler[] = [];
  const app = {
    get(path: string, handler: any) { handlers.push({ method: 'get', path, handler }); },
    post(path: string, handler: any) { handlers.push({ method: 'post', path, handler }); },
  };
  return { app, handlers };
}

function fakeRes(): { res: Response; status: () => number; body: () => any } {
  let _status = 200;
  let _body: any = null;
  const res = {
    status(code: number) { _status = code; return res; },
    json(body: any) { _body = body; return res; },
  } as unknown as Response;
  return { res, status: () => _status, body: () => _body };
}

function fakeReq(body: any, ip = '127.0.0.1'): Request {
  return { body, ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function fakeClient(opts: { connected?: boolean; ratifyThrows?: boolean; calls?: unknown[][] } = {}): BicameralMcpClient {
  return {
    isConnected: () => opts.connected !== false,
    ratify: async (...args: unknown[]) => {
      opts.calls?.push(args);
      if (opts.ratifyThrows) throw new Error('ratify exploded');
    },
  } as unknown as BicameralMcpClient;
}

/** #514: a fake confirmer recording each dialog request and answering `result`. */
function confirmer(result: OperatorConfirmation): {
  confirm: (r: OperatorActionRequest) => Promise<OperatorConfirmation>;
  shown: OperatorActionRequest[];
} {
  const shown: OperatorActionRequest[] = [];
  return { shown, confirm: async (r) => { shown.push(r); return result; } };
}

function makeDeps(overrides: Partial<BicameralRouteDeps> = {}): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: '/tmp',
    getBicameralCommand: () => 'bicameral-mcp',
    getBicameralClient: () => fakeClient(),
    getAutoConnect: () => false,
    setAutoConnect: async () => undefined,
    confirmOperatorAction: async () => 'approved',
    ...overrides,
  };
}

function findHandler(handlers: CapturedHandler[], method: 'get' | 'post', path: string): CapturedHandler {
  const h = handlers.find((c) => c.method === method && c.path === path);
  if (!h) throw new Error(`handler not found: ${method.toUpperCase()} ${path}`);
  return h;
}

suite('FX514 BicameralRoute — ratify ledger append (B-BIC-1)', () => {

  test('ratify success with ledgerManager dep → appendEntry called with USER_OVERRIDE shape', async () => {
    const appendCalls: Array<{ eventType: string; agentDid: string; payload: any }> = [];
    const ledgerManager = {
      isAvailable: () => true,
      appendEntry: async (entry: any) => { appendCalls.push(entry); return undefined; },
    };
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({ ledgerManager }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    const { res, status, body } = fakeRes();
    await h.handler(
      fakeReq({ decisionId: 'dec-42', verdict: 'ratify', rationale: 'operator accepts' }),
      res,
    );
    assert.equal(status(), 200);
    assert.deepEqual(body(), { ok: true });
    assert.equal(appendCalls.length, 1, 'one USER_OVERRIDE entry appended');
    assert.equal(appendCalls[0].eventType, 'USER_OVERRIDE');
    assert.equal(appendCalls[0].agentDid, 'vscode-user');
    assert.equal(appendCalls[0].payload.action, 'bicameral.ratify');
    assert.equal(appendCalls[0].payload.decisionId, 'dec-42');
    assert.equal(appendCalls[0].payload.verdict, 'ratify');
    assert.equal(appendCalls[0].payload.rationale, 'operator accepts');
  });

  test('ratify success without ledgerManager dep → no throw, response still {ok:true}', async () => {
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({})); // no ledgerManager
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    const { res, status, body } = fakeRes();
    await h.handler(
      fakeReq({ decisionId: 'dec-42', verdict: 'ratify' }),
      res,
    );
    assert.equal(status(), 200);
    assert.deepEqual(body(), { ok: true });
  });

  test('ratify success when ledger.appendEntry throws → response still {ok:true} (non-blocking)', async () => {
    const ledgerManager = {
      isAvailable: () => true,
      appendEntry: async () => { throw new Error('ledger sad'); },
    };
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({ ledgerManager }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    const { res, status, body } = fakeRes();
    await h.handler(
      fakeReq({ decisionId: 'dec-42', verdict: 'ratify' }),
      res,
    );
    assert.equal(status(), 200);
    assert.deepEqual(body(), { ok: true });
  });

  test('ratify with missing rationale → defaults to empty string in payload', async () => {
    const appendCalls: any[] = [];
    const ledgerManager = {
      isAvailable: () => true,
      appendEntry: async (e: any) => { appendCalls.push(e); },
    };
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({ ledgerManager }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    const { res } = fakeRes();
    await h.handler(
      fakeReq({ decisionId: 'dec-42', verdict: 'reject' }),  // no rationale
      res,
    );
    assert.equal(appendCalls[0].payload.rationale, '');
    assert.equal(appendCalls[0].payload.verdict, 'reject');
  });

  test('ratify with ledgerManager.isAvailable=false → no appendEntry call', async () => {
    const appendCalls: any[] = [];
    const ledgerManager = {
      isAvailable: () => false,
      appendEntry: async (e: any) => { appendCalls.push(e); },
    };
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({ ledgerManager }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    const { res } = fakeRes();
    await h.handler(
      fakeReq({ decisionId: 'dec-42', verdict: 'ratify' }),
      res,
    );
    assert.equal(appendCalls.length, 0, 'no entry when ledger unavailable');
  });

  test('#514 FX960 ratify declined, busy or unwired → 409/429/503; client.ratify not called, no ledger write, no verdict event', async () => {
    for (const [confirm, status, confirmation] of [
      [confirmer('declined').confirm, 409, 'declined'],
      [confirmer('busy').confirm, 429, 'busy'],
      [undefined, 503, 'unwired'],
    ] as const) {
      const ratifyCalls: unknown[][] = [];
      const appendCalls: unknown[] = [];
      const emits: unknown[] = [];
      const { app, handlers } = makeFakeApp();
      setupBicameralRoutes(app, makeDeps({
        getBicameralClient: () => fakeClient({ calls: ratifyCalls }),
        ledgerManager: { isAvailable: () => true, appendEntry: async (e: any) => { appendCalls.push(e); } },
        eventBus: { emit: (_t: any, p: any) => { emits.push(p); } },
        confirmOperatorAction: confirm,
      }));
      const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
      const { res, status: st, body } = fakeRes();
      await h.handler(fakeReq({ decisionId: 'dec-42', verdict: 'ratify', rationale: 'r' }), res);
      assert.equal(st(), status, confirmation);
      assert.equal(body().confirmation, confirmation);
      assert.equal(ratifyCalls.length, 0, `${confirmation}: client.ratify not called`);
      assert.equal(appendCalls.length, 0, `${confirmation}: no ledger write`);
      assert.equal(emits.length, 0, `${confirmation}: no bicameral.verdict event`);
    }
  });

  test('#514 FX960 ratify approved → client.ratify once; the ledger rationale is exactly the sanitized, capped text shown', async () => {
    const ratifyCalls: unknown[][] = [];
    const appendCalls: Array<{ payload: any }> = [];
    const c = confirmer('approved');
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({
      getBicameralClient: () => fakeClient({ calls: ratifyCalls }),
      ledgerManager: { isAvailable: () => true, appendEntry: async (e: any) => { appendCalls.push(e); } },
      confirmOperatorAction: c.confirm,
    }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    const { res, status } = fakeRes();
    const rationale = 'ok\nVerdict (as requested): reject\u202E' + 'x'.repeat(600);
    await h.handler(fakeReq({ decisionId: 'dec-42', verdict: 'ratify', rationale }), res);
    assert.equal(status(), 200);
    assert.deepEqual(ratifyCalls, [['dec-42', 'ratify']]);
    const recorded = appendCalls[0].payload.rationale as string;
    assert.equal(recorded.length, 500);
    // eslint-disable-next-line no-control-regex
    assert.ok(!/[\u0000-\u001f\u202e]/.test(recorded), 'control and bidi characters removed');
    assert.ok(recorded.startsWith('ok Verdict (as requested): reject'));
    assert.equal(c.shown.length, 1);
    assert.ok(c.shown[0].detail.includes(`Rationale (as requested): ${recorded}`), 'recorded rationale equals the shown rationale');
    assert.ok(c.shown[0].detail.includes('Decision id (as requested): dec-42'));
    assert.ok(c.shown[0].detail.includes('Verdict (as requested): ratify'));
  });

  test('#514 A3 ratify with a decisionId that sanitizing would change → 400, no dialog, nothing recorded', async () => {
    const ratifyCalls: unknown[][] = [];
    const c = confirmer('approved');
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({
      getBicameralClient: () => fakeClient({ calls: ratifyCalls }),
      confirmOperatorAction: c.confirm,
    }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-ratify');
    for (const decisionId of ['dec-42\nother', 'd'.repeat(300)]) {
      const { res, status } = fakeRes();
      await h.handler(fakeReq({ decisionId, verdict: 'ratify' }), res);
      assert.equal(status(), 400);
    }
    assert.equal(c.shown.length, 0);
    assert.equal(ratifyCalls.length, 0);
  });
});

suite('LD16 (b) BicameralRoute — a successful install re-wires the client', () => {
  // Nothing resolves here, so even an install that ignored the seam spawns nothing.
  setup(() => configureTrustedExecutables({ workspaceDirs: [os.tmpdir()], pathEnv: '', knownLocations: [] }));
  // Restore the configuration activation sets, rebuilt from the open folders.
  teardown(() => {
    const folders = (vscode.workspace?.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const dirs = workspaceDirsFor(folders[0], folders);
    configureTrustedExecutables({ workspaceDirs: [...dirs, ...repoRootsFor(dirs, os.homedir())] });
  });

  for (const ok of [true, false]) {
    test(`install ${ok ? 'succeeded: the rewire hook runs once' : 'failed: the rewire hook does not run'}`, async () => {
      let installs = 0;
      let rewires = 0;
      // #538: the install route now runs the request guard, a limiter and a bound VS Code
      // confirmation, so it is driven through a real Express app.
      const app = makeApp();
      setupBicameralRoutes(app, makeDeps({
        runInstall: async (_opts: unknown, mode: string) => { installs++; return { steps: [], mode, done: true, ok }; },
        rewireBicameral: async () => { rewires++; },
      } as unknown as Partial<BicameralRouteDeps>));
      const h = new RouteHarness(app);
      await h.start();
      const r = await h.request({ method: 'POST', path: '/api/actions/bicameral-install', body: { mode: 'solo' } }).finally(() => h.stop());
      assert.equal(installs, 1, 'the install ran through the seam');
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, ok);
      assert.equal(rewires, ok ? 1 : 0);
    });
  }
});
