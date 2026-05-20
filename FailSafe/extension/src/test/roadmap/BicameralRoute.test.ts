/**
 * FX514 — B-BIC-1: BicameralRoute ratify handler appends USER_OVERRIDE
 * entry to META_LEDGER when ledgerManager dep is provided. Non-blocking on
 * ledger failure (ratify response remains {ok:true}).
 */

import { strict as assert } from 'assert';
import type { Request, Response } from 'express';
import { setupBicameralRoutes, type BicameralRouteDeps } from '../../roadmap/routes/BicameralRoute';
import type { BicameralMcpClient } from '../../integrations/bicameral';

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

function fakeClient(opts: { connected?: boolean; ratifyThrows?: boolean } = {}): BicameralMcpClient {
  return {
    isConnected: () => opts.connected !== false,
    ratify: async () => { if (opts.ratifyThrows) throw new Error('ratify exploded'); },
  } as unknown as BicameralMcpClient;
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
});
