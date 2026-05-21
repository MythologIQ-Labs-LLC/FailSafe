// FX563 — B-BIC-13: the `running` empty-state renders the `/bicameral-ingest`
// hint only when the connected client reports the `ingest` capability. The
// `/status` route exposes `capabilities: string[]` sourced from the client's
// getCapabilities() set (empty array when the client is null/disconnected).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import type { Request, Response } from 'express';
import { setupBicameralRoutes, type BicameralRouteDeps } from '../../roadmap/routes/BicameralRoute';
import type { BicameralMcpClient } from '../../integrations/bicameral';
// @ts-expect-error JS module import in TS test context
import { renderBicameralCard, INITIAL_BICAMERAL_STATE } from '../../../src/roadmap/ui/modules/bicameral-card.js';

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
    json(b: any) { _body = b; return res; },
  } as unknown as Response;
  return { res, status: () => _status, body: () => _body };
}

function fakeReq(): Request {
  return { body: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
}

function makeDeps(overrides: Partial<BicameralRouteDeps> = {}): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: '/tmp',
    getBicameralCommand: () => '__failsafe_test_no_such_command__',
    getBicameralClient: () => null,
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

function withDom<T>(fn: () => T): T {
  const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  try { return fn(); } finally {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { window?: unknown }).window = undefined;
  }
}

suite('FX563 bicameral capability-gated empty-state (B-BIC-13)', () => {

  test('renderRunning with capabilities:[ingest] → /bicameral-ingest hint present', () => {
    withDom(() => {
      const html = renderBicameralCard({
        ...INITIAL_BICAMERAL_STATE, installState: 'running', features: [], capabilities: ['ingest'],
      });
      assert.match(html, /\/bicameral-ingest/);
    });
  });

  test('renderRunning with capabilities:[] → hint absent, capability-neutral copy', () => {
    withDom(() => {
      const html = renderBicameralCard({
        ...INITIAL_BICAMERAL_STATE, installState: 'running', features: [], capabilities: [],
      });
      assert.equal(html.includes('/bicameral-ingest'), false, 'ingest hint suppressed');
      assert.match(html, /No decisions yet/);
    });
  });

  test('renderRunning with capabilities undefined → hint absent (safe default)', () => {
    withDom(() => {
      const html = renderBicameralCard({
        ...INITIAL_BICAMERAL_STATE, installState: 'running', features: [],
      });
      assert.equal(html.includes('/bicameral-ingest'), false, 'undefined capabilities → no hint');
    });
  });

  test('/status route includes capabilities from getCapabilities(); [] when client null', async () => {
    // Client present + capable.
    const capableClient = {
      isConnected: () => true,
      getCapabilities: () => new Set(['ingest', 'search']),
    } as unknown as BicameralMcpClient;
    const appA = makeFakeApp();
    setupBicameralRoutes(appA.app, makeDeps({ getBicameralClient: () => capableClient }));
    const hA = findHandler(appA.handlers, 'get', '/api/integrations/bicameral/status');
    const rA = fakeRes();
    await hA.handler(fakeReq(), rA.res);
    assert.ok(Array.isArray(rA.body().capabilities), 'capabilities is an array');
    assert.deepEqual([...rA.body().capabilities].sort(), ['ingest', 'search']);

    // Client null → empty array (no field omission).
    const appB = makeFakeApp();
    setupBicameralRoutes(appB.app, makeDeps({ getBicameralClient: () => null }));
    const hB = findHandler(appB.handlers, 'get', '/api/integrations/bicameral/status');
    const rB = fakeRes();
    await hB.handler(fakeReq(), rB.res);
    assert.deepEqual(rB.body().capabilities, [], 'null client → []');
  });
});
