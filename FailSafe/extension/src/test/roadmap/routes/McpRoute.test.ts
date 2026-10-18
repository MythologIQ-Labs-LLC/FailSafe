import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpRoute, MCP_INSTALL_PATH, setupMcpInstallRoute } from '../../../roadmap/routes/McpRoute';
import { RouteHarness, makeApp } from '../../extension/helpers/routeTestHarness';

/** Minimal express req/res doubles. */
function res() {
  const r: { code: number; body: unknown; status: (c: number) => typeof r; json: (b: unknown) => void } = {
    code: 200, body: undefined,
    status(c: number) { r.code = c; return r; },
    json(b: unknown) { r.body = b; },
  };
  return r;
}
function mkWs(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-mcp-')); }

suite('McpRoute (B-INT-13/14 UI backing)', () => {
  test('catalog returns entries with risk assessments', () => {
    const r = res();
    McpRoute.catalog({} as never, r as never);
    const body = r.body as { entries: Array<{ id: string; risk: { level: string } }> };
    assert.equal(body.entries.length, 3);
    assert.deepEqual(body.entries.map((e) => e.id).sort(), ['context7', 'mermaid', 'playwright']);
    assert.ok(body.entries.every((e) => typeof e.risk.level === 'string'));
    // The route must surface the per-entry risk level the UI badges on — Playwright
    // is high-capability (browser automation + code-eval) and must read as 'high'.
    assert.equal(body.entries.find((e) => e.id === 'playwright')!.risk.level, 'high');
  });

  // #538: the install runs through the real route chain (guard, limiter, VS Code confirmation).
  async function serve(ws: string): Promise<RouteHarness> {
    const app = makeApp();
    setupMcpInstallRoute(app, { workspaceRoot: ws, rejectIfRemote: () => false, confirmOperatorAction: async () => 'approved' });
    const h = new RouteHarness(app);
    await h.start();
    return h;
  }

  test('install writes the server entry to .mcp.json (added=true), idempotent on re-install', async () => {
    const ws = mkWs();
    const h = await serve(ws);
    try {
      const r1 = await h.request({ method: 'POST', path: MCP_INSTALL_PATH, body: { id: 'context7' } });
      assert.equal(r1.body.ok, true);
      assert.equal(r1.body.added, true);
      assert.equal(r1.body.id, 'context7');
      assert.equal(r1.body.ledger, 'unavailable');
      const cfg = JSON.parse(fs.readFileSync(path.join(ws, '.mcp.json'), 'utf-8'));
      assert.deepEqual(cfg.mcpServers.context7, { command: 'npx', args: ['-y', '@upstash/context7-mcp'] });

      const r2 = await h.request({ method: 'POST', path: MCP_INSTALL_PATH, body: { id: 'context7' } });
      assert.equal(r2.body.added, false); // update, not duplicate
    } finally { await h.stop(); fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('install with unknown id → 404', async () => {
    const ws = mkWs();
    const h = await serve(ws);
    try {
      const r = await h.request({ method: 'POST', path: MCP_INSTALL_PATH, body: { id: 'nope' } });
      assert.equal(r.status, 404);
      assert.match((r.body as { error: string }).error, /unknown MCP catalog id/);
    } finally { await h.stop(); fs.rmSync(ws, { recursive: true, force: true }); }
  });
});
