// FX891 — TrackerConfigRoute: GET derives from programs.yaml, POST is a governed
// local write (config + directive), remote requests are short-circuited.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setupTrackerConfigRoutes } from '../../roadmap/routes/TrackerConfigRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function tmpWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fx891-'));
}

function makeDeps(workspaceRoot: string, remote = false): ApiRouteDeps {
  return {
    workspaceRoot,
    rejectIfRemote: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
      if (remote) { res.status(403).json({ error: 'remote' }); return true; }
      return false;
    },
    broadcast: () => { /* noop */ },
  } as unknown as ApiRouteDeps;
}

suite('FX891 TrackerConfigRoute', () => {
  let harness: RouteHarness;
  let ws: string;
  teardown(async () => {
    if (harness) await harness.stop();
    if (ws) { try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  test('GET /config with no config but a programs.yaml → source:derived + non-empty agents', async () => {
    ws = tmpWs();
    fs.mkdirSync(path.join(ws, 'docs', 'roadmap'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'docs', 'roadmap', 'programs.yaml'),
      'programs:\n  - {key: ci, name: CI, accent: "#0f0"}\n'
      + 'verticals:\n  - {key: ci, name: CI, accent: "#0f0"}\n'
      + 'phases:\n  - {prog: ci, key: A, rc: v1.0, w: 100, title: a}\n', 'utf-8');
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'GET', path: '/api/v1/tracker/config' });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'derived');
    assert.ok(res.body.config.agents.length >= 1, 'agents proposed from programs (FX887)');
    assert.equal(res.body.config.programs[0].key, 'ci');
  });

  test('POST /config writes tracker-config.yaml + the governed directive; returns written paths', async () => {
    ws = tmpWs();
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws));
    harness = new RouteHarness(app);
    await harness.start();
    const body = { programs: [{ key: 'core', name: 'Core', accent: '#0f0' }], verticals: [], agents: [] };
    const res = await harness.request({ method: 'POST', path: '/api/v1/tracker/config', body });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.written.includes('docs/roadmap/tracker-config.yaml'));
    assert.ok(res.body.written.includes('.failsafe/governance/tracker-taxonomy.directive.md'));
    const cfg = fs.readFileSync(path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml'), 'utf-8');
    assert.ok(cfg.includes('core'), 'posted program persisted to the config file');
    const directive = fs.readFileSync(path.join(ws, '.failsafe', 'governance', 'tracker-taxonomy.directive.md'), 'utf-8');
    assert.ok(directive.includes('`core`'), 'directive lists the declared program');
    assert.ok(directive.includes('MUST consult'), 'directive carries the must-consult clause');
  });

  test('POST /config from a remote request is short-circuited — NO file written', async () => {
    ws = tmpWs();
    const app = makeApp();
    setupTrackerConfigRoutes(app, makeDeps(ws, true));
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/v1/tracker/config', body: { programs: [{ key: 'x', name: 'X' }] } });
    assert.equal(res.status, 403);
    assert.ok(!fs.existsSync(path.join(ws, 'docs', 'roadmap', 'tracker-config.yaml')), 'no config written for a remote request');
  });
});
