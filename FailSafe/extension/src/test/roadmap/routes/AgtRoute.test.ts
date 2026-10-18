import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgtRoute, AGT_INSTALL_PATH, setupAgtInstallRoute } from '../../../roadmap/routes/AgtRoute';
import { RouteHarness, makeApp } from '../../extension/helpers/routeTestHarness';

function res() {
  const r: { code: number; body: unknown; status: (c: number) => typeof r; json: (b: unknown) => void } = {
    code: 200, body: undefined,
    status(c: number) { r.code = c; return r; },
    json(b: unknown) { r.body = b; },
  };
  return r;
}
function mkWs(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-agt-')); }

suite('AgtRoute (B-INT-16)', () => {
  test('modules returns all 9 + detects the workspace environment (recommended flag)', () => {
    const ws = mkWs();
    fs.writeFileSync(path.join(ws, 'go.mod'), 'module example.com/x\n');
    const r = res();
    AgtRoute.modules({} as never, r as never, { workspaceRoot: ws });
    const body = r.body as { modules: Array<{ id: string; recommended: boolean }>; detected: string[]; preview: string };
    assert.equal(body.modules.length, 9);
    assert.deepEqual(body.detected, ['golang']);
    assert.equal(body.modules.find((m) => m.id === 'golang')!.recommended, true);
    assert.equal(body.modules.find((m) => m.id === 'python')!.recommended, false);
    assert.match(body.preview, /Public Preview/i);
  });

  test('modules tolerates an unreadable workspace (no detection, still lists modules)', () => {
    const r = res();
    AgtRoute.modules({} as never, r as never, { workspaceRoot: path.join(os.tmpdir(), 'failsafe-agt-does-not-exist-zzz') });
    const body = r.body as { modules: unknown[]; detected: string[] };
    assert.equal(body.modules.length, 9);
    assert.deepEqual(body.detected, []);
  });

  test('install runs a runnable module command in the terminal via the injected dep', async () => {
    const calls: Array<[string, string]> = [];
    // #538: through the real route chain, with an approving VS Code confirmer.
    const app = makeApp();
    setupAgtInstallRoute(app, {
      workspaceRoot: '/tmp', rejectIfRemote: () => false, confirmOperatorAction: async () => 'approved',
      runInTerminal: (n, c) => { calls.push([n, c]); },
    });
    const h = new RouteHarness(app);
    await h.start();
    const r = await h.request({ method: 'POST', path: AGT_INSTALL_PATH, body: { id: 'python' } }).finally(() => h.stop());
    assert.equal(r.body.ok, true);
    assert.equal(r.body.id, 'python');
    assert.equal(r.body.ran, 'pip install agent-governance-toolkit[full]');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'AGT: Python');
    assert.equal(calls[0][1], 'pip install agent-governance-toolkit[full]');
  });

  test('install of a copy-only module (claude-code) → 400 and never touches the terminal', async () => {
    const calls: number[] = [];
    const r = res();
    await AgtRoute.install({ body: { id: 'claude-code' } } as never, r as never, {
      workspaceRoot: '/tmp', runInTerminal: () => calls.push(1),
    });
    assert.equal(r.code, 400);
    assert.equal(calls.length, 0);
  });

  test('install with unknown id → 404', async () => {
    const r = res();
    await AgtRoute.install({ body: { id: 'nope' } } as never, r as never, { workspaceRoot: '/tmp' });
    assert.equal(r.code, 404);
  });

  test('install when runInTerminal is unwired → 503', async () => {
    const r = res();
    await AgtRoute.install({ body: { id: 'python' } } as never, r as never, { workspaceRoot: '/tmp' });
    assert.equal(r.code, 503);
  });
});
