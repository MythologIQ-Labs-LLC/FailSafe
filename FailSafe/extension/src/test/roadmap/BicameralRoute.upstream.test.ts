// FX533 — Phase 4 of plan-qor-bicameral-cluster-high.
// GET /api/integrations/bicameral/upstream route behavior.
import { strict as assert } from 'assert';
import express, { Request, Response } from 'express';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { setupBicameralRoutes, BicameralRouteDeps } from '../../roadmap/routes/BicameralRoute';
import type { UpstreamSnapshot } from '../../integrations/bicameral/types';

function makeDeps(overrides: Partial<BicameralRouteDeps> = {}): BicameralRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    workspaceRoot: '/tmp',
    getBicameralCommand: () => 'bicameral-mcp',
    getBicameralClient: () => null,
    getAutoConnect: () => false,
    setAutoConnect: async () => undefined,
    ...overrides,
  };
}

/** RC1: node:http GET helper — the test must not depend on a global `fetch`,
 *  which the vscode-test electron extension-host runtime does not reliably
 *  expose. Mirrors the fetchJson pattern in src/test/ui/bus-renderer-flow.spec.ts. */
async function httpGet(url: string): Promise<{ status: number; json(): Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          status: res.statusCode ?? 0,
          json: async () => JSON.parse(body),
        });
      });
    }).on('error', reject);
  });
}

async function startServer(deps: BicameralRouteDeps): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  setupBicameralRoutes(app, deps);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

suite('BicameralRoute upstream (FX533)', () => {
  test('GET /api/integrations/bicameral/upstream returns 200 + snapshot when monitor has a snapshot', async () => {
    const snapshot: UpstreamSnapshot = {
      latestVersion: '0.15.2',
      latestReleasedAt: '2026-04-01T00:00:00Z',
      openIssueCount: 7,
      openPrCount: null,
      fetchedAt: '2026-05-20T00:00:00Z',
    };
    const deps = makeDeps({ upstreamMonitor: { getSnapshot: () => snapshot } });
    const server = await startServer(deps);
    try {
      const resp = await httpGet(`${server.url}/api/integrations/bicameral/upstream`);
      assert.equal(resp.status, 200);
      const body = await resp.json() as { ok: boolean; snapshot: UpstreamSnapshot };
      assert.equal(body.ok, true);
      assert.equal(body.snapshot.latestVersion, '0.15.2');
      assert.equal(body.snapshot.openIssueCount, 7);
    } finally {
      await server.close();
    }
  });

  test('GET returns 503 when monitor has never fetched (getSnapshot returns null)', async () => {
    const deps = makeDeps({ upstreamMonitor: { getSnapshot: () => null } });
    const server = await startServer(deps);
    try {
      const resp = await httpGet(`${server.url}/api/integrations/bicameral/upstream`);
      assert.equal(resp.status, 503);
      const body = await resp.json() as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.match(body.error, /snapshot not yet available/);
    } finally {
      await server.close();
    }
  });

  test('GET returns 503 when no upstreamMonitor dep is wired', async () => {
    const deps = makeDeps(); // upstreamMonitor omitted
    const server = await startServer(deps);
    try {
      const resp = await httpGet(`${server.url}/api/integrations/bicameral/upstream`);
      assert.equal(resp.status, 503);
      const body = await resp.json() as { ok: boolean; error: string };
      assert.match(body.error, /not wired/);
    } finally {
      await server.close();
    }
  });

  test('rejectIfRemote=true blocks the request before reading monitor', async () => {
    let monitorCalled = false;
    const deps = makeDeps({
      rejectIfRemote: (_req: Request, res: Response) => {
        res.status(403).json({ ok: false, error: 'remote denied' });
        return true;
      },
      upstreamMonitor: {
        getSnapshot: () => { monitorCalled = true; return null; },
      },
    });
    const server = await startServer(deps);
    try {
      const resp = await httpGet(`${server.url}/api/integrations/bicameral/upstream`);
      assert.equal(resp.status, 403);
      assert.equal(monitorCalled, false, 'rejectIfRemote must short-circuit before monitor read');
    } finally {
      await server.close();
    }
  });
});
