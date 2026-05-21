// FX564 — B-BIC-12: open a decision's bound source file in the editor. A new
// POST /api/actions/bicameral-open-binding route validates `filePath` and calls
// the injected `openFileInEditor` dep; the decision row renders an "Open"
// affordance wired through `onOpenBinding` to that route.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import type { Request, Response } from 'express';
import { setupBicameralRoutes, type BicameralRouteDeps } from '../../roadmap/routes/BicameralRoute';
// @ts-expect-error JS module import in TS test context
import { renderBicameralCard, bindBicameralCard, INITIAL_BICAMERAL_STATE } from '../../../src/roadmap/ui/modules/bicameral-card.js';

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

function fakeReq(body: any): Request {
  return { body, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
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

function mount(html: string): Element {
  const dom = new JSDOM(`<!DOCTYPE html><div id="root">${html}</div>`);
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  return dom.window.document.getElementById('root')!;
}

function clearDom() {
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { window?: unknown }).window = undefined;
}

const ROW_FEATURES = [{
  feature: 'auth',
  decisions: [{
    id: 'd1', title: 'session decision', source: 's', status: 'in-sync',
    bindings: [{ filePath: 'src/auth/session.ts', symbol: 'createSession', startLine: 14 }],
  }],
}];

suite('FX564 bicameral open-binding route (B-BIC-12)', () => {

  test('POST open-binding with {filePath,startLine} → openFileInEditor called once, 200 {ok:true}', async () => {
    const opened: Array<{ path: string; line?: number }> = [];
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({
      openFileInEditor: async (filePath: string, startLine?: number) => {
        opened.push({ path: filePath, line: startLine });
      },
    }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-open-binding');
    const { res, status, body } = fakeRes();
    await h.handler(fakeReq({ filePath: 'src/auth/session.ts', startLine: 14 }), res);
    assert.equal(status(), 200);
    assert.deepEqual(body(), { ok: true });
    assert.equal(opened.length, 1, 'dep called exactly once');
    assert.deepEqual(opened[0], { path: 'src/auth/session.ts', line: 14 });
  });

  test('POST open-binding with missing filePath → 400', async () => {
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({ openFileInEditor: async () => undefined }));
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-open-binding');
    const { res, status } = fakeRes();
    await h.handler(fakeReq({ startLine: 3 }), res);
    assert.equal(status(), 400);
  });

  test('POST open-binding when dep not wired → 503', async () => {
    const { app, handlers } = makeFakeApp();
    setupBicameralRoutes(app, makeDeps({})); // no openFileInEditor
    const h = findHandler(handlers, 'post', '/api/actions/bicameral-open-binding');
    const { res, status } = fakeRes();
    await h.handler(fakeReq({ filePath: 'src/auth/session.ts' }), res);
    assert.equal(status(), 503);
  });

  test('renderDecisionRow emits a bicameral-open-binding element carrying the binding filePath', () => {
    try {
      const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features: ROW_FEATURES });
      assert.match(html, /data-action="bicameral-open-binding"/);
      assert.match(html, /data-file-path="src\/auth\/session\.ts"/);
      assert.match(html, /data-start-line="14"/);
    } finally {
      clearDom();
    }
  });

  test('bindBicameralCard wires the Open affordance → click invokes onOpenBinding with path + line', () => {
    try {
      const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features: ROW_FEATURES });
      const root = mount(html);
      const captured: Array<{ path: string; line?: number }> = [];
      bindBicameralCard(root, {
        onOpenBinding: (path: string, line?: number) => captured.push({ path, line }),
      });
      const btn = root.querySelector('[data-action="bicameral-open-binding"]') as HTMLButtonElement;
      assert.ok(btn, 'open-binding element present');
      btn.click();
      assert.equal(captured.length, 1);
      assert.equal(captured[0].path, 'src/auth/session.ts');
      assert.equal(captured[0].line, 14);
    } finally {
      clearDom();
    }
  });
});
