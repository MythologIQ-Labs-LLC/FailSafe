// Functional tests for BrainstormRoute node-label truncation feedback (B132, FX585).
// setupBrainstormRoutes is invoked with a mock express app that captures
// route handlers by (method, path). Each handler is then invoked directly
// with mock req/res; the sink is the JSON object passed to res.json().

import { strict as assert } from 'assert';
import { setupBrainstormRoutes } from '../../roadmap/routes/BrainstormRoute';

type Handler = (req: any, res: any) => void | Promise<void>;

interface MockApp {
  handlers: Map<string, Handler>;
  get(path: string, ...h: Handler[]): void;
  post(path: string, ...h: Handler[]): void;
  patch(path: string, ...h: Handler[]): void;
  delete(path: string, ...h: Handler[]): void;
}

function makeApp(): MockApp {
  const handlers = new Map<string, Handler>();
  const register = (method: string) => (path: string, ...h: Handler[]) => {
    // The last argument is always the route handler (express.raw middleware
    // may precede it for the audio route).
    handlers.set(`${method} ${path}`, h[h.length - 1]);
  };
  return {
    handlers,
    get: register('get'),
    post: register('post'),
    patch: register('patch'),
    delete: register('delete'),
  };
}

interface MockRes {
  statusCode: number;
  jsonBody: any;
  status(code: number): MockRes;
  json(body: any): MockRes;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    jsonBody: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.jsonBody = body; return this; },
  };
  return res;
}

function makeDeps(): any {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    brainstormService: {
      // Echo the (already-truncated) label back as the stored node, exactly
      // as the real service does — the route caps before calling the service.
      addNode: (label: string, type: string, clientId?: string) => ({
        id: clientId || 'srv-1', label, type,
      }),
      updateNode: (id: string, label: string, type: string) => ({
        id, label, type,
      }),
    },
  };
}

function getHandler(app: MockApp, key: string): Handler {
  const h = app.handlers.get(key);
  assert.ok(h, `route ${key} must be registered`);
  return h!;
}

suite('BrainstormRoute label truncation (B132, FX585)', () => {

  test('FX585.1 POST /node — 250-char label truncates with additive fields', async () => {
    const app = makeApp();
    setupBrainstormRoutes(app as any, makeDeps());
    const handler = getHandler(app, 'post /api/v1/brainstorm/node');

    const longLabel = 'x'.repeat(250);
    const res = makeRes();
    await handler({ body: { label: longLabel, type: 'Feature' } }, res);

    assert.equal(res.jsonBody.labelTruncated, true, 'labelTruncated must be true');
    assert.equal(res.jsonBody.labelOriginalLength, 250, 'original length recorded');
    assert.equal(res.jsonBody.label.length, 200, 'stored label capped at 200');
    assert.ok(res.jsonBody.id, 'node id preserved (additive, not breaking)');
  });

  test('FX585.2 PATCH /node/:id — same truncation contract on edit', async () => {
    const app = makeApp();
    setupBrainstormRoutes(app as any, makeDeps());
    const handler = getHandler(app, 'patch /api/v1/brainstorm/node/:id');

    const longLabel = 'y'.repeat(250);
    const res = makeRes();
    await handler({ params: { id: 'n1' }, body: { label: longLabel, type: 'Risk' } }, res);

    assert.equal(res.jsonBody.labelTruncated, true, 'labelTruncated must be true on PATCH');
    assert.equal(res.jsonBody.labelOriginalLength, 250, 'original length recorded on PATCH');
    assert.equal(res.jsonBody.label.length, 200, 'stored label capped at 200 on PATCH');
    assert.equal(res.jsonBody.id, 'n1', 'node id preserved on PATCH');
  });

  test('FX585.3 POST /node — 50-char label is NOT flagged truncated', async () => {
    const app = makeApp();
    setupBrainstormRoutes(app as any, makeDeps());
    const postHandler = getHandler(app, 'post /api/v1/brainstorm/node');

    const shortLabel = 'z'.repeat(50);
    const res = makeRes();
    await postHandler({ body: { label: shortLabel, type: 'Feature' } }, res);

    assert.ok(!res.jsonBody.labelTruncated, 'labelTruncated absent or false for short label');
    assert.equal(res.jsonBody.labelOriginalLength, undefined, 'no labelOriginalLength field');
    assert.equal(res.jsonBody.label, shortLabel, 'short label stored verbatim');

    // PATCH path — same negative contract.
    const patchHandler = getHandler(app, 'patch /api/v1/brainstorm/node/:id');
    const res2 = makeRes();
    await patchHandler({ params: { id: 'n2' }, body: { label: shortLabel, type: 'Idea' } }, res2);
    assert.ok(!res2.jsonBody.labelTruncated, 'PATCH: labelTruncated absent for short label');
  });
});
