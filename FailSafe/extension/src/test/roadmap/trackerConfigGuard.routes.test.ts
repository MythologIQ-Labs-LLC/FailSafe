/**
 * #538 lane B (B293): `POST /api/v1/tracker/config` writes the operator taxonomy and its
 * directive record. A body-less cross-site POST must leave both files byte-identical;
 * the Workspace › Taxonomy editor's same-origin JSON save must still work.
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Request, Response } from 'express';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';
import { setupTrackerConfigRoutes } from '../../roadmap/routes/TrackerConfigRoute';

function rejectIfRemote(req: Request, res: Response): boolean {
  const n = String(req.socket?.remoteAddress || req.ip || '').trim();
  if (n === '127.0.0.1' || n === '::1' || n === '::ffff:127.0.0.1') return false;
  res.status(403).json({ error: 'Forbidden: local access only' });
  return true;
}

const PATH = '/api/v1/tracker/config';
const CONFIG = 'docs/roadmap/tracker-config.yaml';
const DIRECTIVE = '.failsafe/governance/tracker-taxonomy.directive.md';

suite('#538 B293 tracker config refuses cross-site writes', () => {
  let harness: RouteHarness | null = null;
  let ws = '';
  const bytes = (rel: string) => fs.readFileSync(path.join(ws, rel));

  setup(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-538b-tracker-'));
    for (const [rel, text] of [[CONFIG, 'programs:\n  - key: core\n    name: Core\n'], [DIRECTIVE, '# operator directive\n']]) {
      fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
      fs.writeFileSync(path.join(ws, rel), text);
    }
    const app = makeApp();
    setupTrackerConfigRoutes(app, { workspaceRoot: ws, rejectIfRemote, broadcast: () => undefined } as never);
    harness = new RouteHarness(app);
    await harness.start();
  });
  teardown(async () => {
    if (harness) await harness.stop();
    harness = null;
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const refused: Array<[string, Record<string, string>, number, string]> = [
    ['a body-less cross-site text/plain POST', { origin: 'http://evil.example', 'content-type': 'text/plain' }, 403, 'origin'],
    ['a body-less text/plain POST with no Origin', { 'content-type': 'text/plain' }, 415, 'content-type'],
    ['a POST addressed to a rebound host name', { host: 'rebound.evil.example:9376', 'content-type': 'application/json' }, 403, 'host'],
  ];
  for (const [label, headers, status, guard] of refused) {
    test(`${label} is refused and both files stay byte-identical`, async () => {
      const before = [bytes(CONFIG), bytes(DIRECTIVE)];
      const res = await harness!.request({ method: 'POST', path: PATH, headers, rawBody: '' });
      assert.equal(res.status, status, JSON.stringify(res.body));
      assert.equal(res.body.guard, guard);
      assert.ok(bytes(CONFIG).equals(before[0]), 'tracker-config.yaml unchanged');
      assert.ok(bytes(DIRECTIVE).equals(before[1]), 'directive record unchanged');
    });
  }

  test('the Taxonomy editor\'s same-origin JSON save still writes both files', async () => {
    const port = (harness as unknown as { port: number }).port;
    const body = { programs: [{ key: 'edited', name: 'Edited', accent: '#0f0' }], verticals: [], agents: [] };
    const res = await harness!.request({ method: 'POST', path: PATH, body, headers: { origin: `http://127.0.0.1:${port}` } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    assert.match(bytes(CONFIG).toString('utf8'), /edited/);
    assert.match(bytes(DIRECTIVE).toString('utf8'), /edited|Edited/);
  });
});
