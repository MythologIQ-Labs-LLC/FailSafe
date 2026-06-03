import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpRoute } from '../../../roadmap/routes/McpRoute';

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

  test('install writes the server entry to .mcp.json (added=true), idempotent on re-install', () => {
    const ws = mkWs();
    const r1 = res();
    McpRoute.install({ body: { id: 'context7' } } as never, r1 as never, { workspaceRoot: ws });
    assert.deepEqual(r1.body, { ok: true, added: true, id: 'context7' });
    const cfg = JSON.parse(fs.readFileSync(path.join(ws, '.mcp.json'), 'utf-8'));
    assert.deepEqual(cfg.mcpServers.context7, { command: 'npx', args: ['-y', '@upstash/context7-mcp'] });

    const r2 = res();
    McpRoute.install({ body: { id: 'context7' } } as never, r2 as never, { workspaceRoot: ws });
    assert.deepEqual(r2.body, { ok: true, added: false, id: 'context7' }); // update, not duplicate
  });

  test('install with unknown id → 404', () => {
    const ws = mkWs();
    const r = res();
    McpRoute.install({ body: { id: 'nope' } } as never, r as never, { workspaceRoot: ws });
    assert.equal(r.code, 404);
    assert.match((r.body as { error: string }).error, /unknown MCP catalog id/);
  });
});
