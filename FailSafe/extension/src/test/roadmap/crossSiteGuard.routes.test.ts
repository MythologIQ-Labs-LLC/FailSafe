/**
 * #538 lane B (lead scope addition): routes that a body-less cross-site POST could reach
 * check Host and Origin. No dialog is needed on these. Their Console callers send no
 * JSON content type (voice pack, connect), so the content type is not checked here.
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Request, Response } from 'express';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';
import { setupVoicePackRoutes } from '../../roadmap/routes/VoicePackRoute';
import { setupBicameralRoutes } from '../../roadmap/routes/BicameralRoute';

function rejectIfRemote(req: Request, res: Response): boolean {
  const n = String(req.socket?.remoteAddress || req.ip || '').trim();
  if (n === '127.0.0.1' || n === '::1' || n === '::ffff:127.0.0.1') return false;
  res.status(403).json({ error: 'Forbidden: local access only' });
  return true;
}

interface Target { name: string; path: string; body?: unknown }
const TARGETS: Target[] = [
  { name: 'install-voice-pack', path: '/api/actions/install-voice-pack' },
  { name: 'uninstall-voice-pack', path: '/api/actions/uninstall-voice-pack' },
  { name: 'bicameral-connect', path: '/api/actions/bicameral-connect' },
  { name: 'bicameral auto-connect', path: '/api/integrations/bicameral/auto-connect', body: { enabled: true } },
];

suite('#538 cross-site POSTs are refused on the voice-pack and Bicameral connect routes', () => {
  let harness: RouteHarness | null = null;
  let storage = '';
  const calls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const handler = require('../../voice-pack/install-handler') as Record<string, unknown>;
  const originals = { install: handler.installVoicePack, uninstall: handler.uninstallVoicePack };

  setup(async () => {
    calls.length = 0;
    storage = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-538b-voice-'));
    // The barrel re-exports through getters, so the route sees these replacements; no download runs.
    handler.installVoicePack = async () => { calls.push('install-voice-pack'); return { ok: true, steps: [] }; };
    handler.uninstallVoicePack = () => { calls.push('uninstall-voice-pack'); };
    const app = makeApp();
    setupVoicePackRoutes(app, {
      rejectIfRemote, broadcast: () => undefined, globalStoragePath: storage, extensionVersion: '0.0.0',
      onPackStateChanged: () => undefined,
    });
    setupBicameralRoutes(app, {
      rejectIfRemote, broadcast: () => undefined, workspaceRoot: storage,
      getBicameralCommand: () => 'bicameral-mcp',
      getBicameralClient: () => ({ isConnected: () => false, connect: async () => { calls.push('bicameral-connect'); } }) as never,
      getAutoConnect: () => false,
      setAutoConnect: async () => { calls.push('bicameral auto-connect'); },
    });
    harness = new RouteHarness(app);
    await harness.start();
  });
  teardown(async () => {
    handler.installVoicePack = originals.install;
    handler.uninstallVoicePack = originals.uninstall;
    if (harness) await harness.stop();
    harness = null;
    fs.rmSync(storage, { recursive: true, force: true });
  });

  const port = () => (harness as unknown as { port: number }).port;

  for (const t of TARGETS) {
    test(`${t.name}: a foreign Origin is refused and nothing runs`, async () => {
      const res = await harness!.request({ method: 'POST', path: t.path, body: t.body, headers: { origin: 'http://evil.example' } });
      assert.equal(res.status, 403);
      assert.equal(res.body.guard, 'origin');
      assert.deepEqual(calls, []);
    });

    test(`${t.name}: a non-loopback Host is refused and nothing runs`, async () => {
      const res = await harness!.request({ method: 'POST', path: t.path, body: t.body, headers: { host: 'rebound.evil.example:9376' } });
      assert.equal(res.status, 403);
      assert.equal(res.body.guard, 'host');
      assert.deepEqual(calls, []);
    });

    test(`${t.name}: a same-origin request from the Console page runs once`, async () => {
      const res = await harness!.request({
        method: 'POST', path: t.path, body: t.body,
        headers: { origin: `http://127.0.0.1:${port()}` },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(calls, [t.name]);
    });
  }

  test('the body-less voice-pack POST the Console sends (no content type) is still accepted', async () => {
    const res = await harness!.request({ method: 'POST', path: '/api/actions/uninstall-voice-pack', headers: { origin: `http://127.0.0.1:${port()}` } });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, ['uninstall-voice-pack']);
  });
});
