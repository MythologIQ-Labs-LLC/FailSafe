import { strict as assert } from 'assert';
import type { Application, Request, Response } from 'express';
import { registerQorlogicRoutes } from '../../roadmap/routes/QorlogicRoute';

suite('#463: frozen Qor-logic HTTP preview refuses without external actions', () => {
  test('preview endpoint always returns 501 and never invokes Python-backed preview', async () => {
    let previewCalls = 0;
    let route: ((req: Request, res: Response) => unknown) | undefined;
    const app = {
      get: () => undefined,
      post: (path: string, handler: (req: Request, res: Response) => unknown) => {
        if (path === '/api/actions/scaffold-skills/preview') route = handler;
      },
    } as unknown as Application;
    registerQorlogicRoutes(app, {
      enumerateSkillsForHost: async () => ({ skills: [], degraded: false }),
      previewInstall: async () => {
        previewCalls++;
        throw new Error('unsupported CLI invoked');
      },
    });
    assert.ok(route, 'frozen preview route is registered');
    for (const body of [
      { hosts: ['claude'], scope: 'repo' },
      { hosts: ['__proto__', 'constructor'], scope: 'global', skillFilter: { claude: [] } },
      {},
    ]) {
      let status = 200;
      let payload: Record<string, unknown> | undefined;
      const response = {
        status: (n: number) => { status = n; return response; },
        json: (value: Record<string, unknown>) => { payload = value; return response; },
      } as unknown as Response;
      await route!({ body } as Request, response);
      assert.equal(status, 501);
      assert.deepEqual(payload, {
        ok: false, degraded: true, reason: 'frozen-qor-logic-install-preview-unavailable',
      });
    }
    assert.equal(previewCalls, 0, 'even forged host names must never invoke the CLI');
  });
});
