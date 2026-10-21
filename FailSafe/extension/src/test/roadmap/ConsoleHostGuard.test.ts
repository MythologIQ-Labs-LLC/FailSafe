// #564 (plan-564-websocket-origin LD2, LD3; owner ruling R1): every HTTP request to the Console
// whose Host is not a loopback name for the connection's address family is refused with 403
// before any route, static file or late-registered route runs. Ports are not pinned.
//
// Runs against the real ConsoleServer app through the UI harness, booted WITHOUT the /api/hub
// fixture (the harness moves that fixture layer ahead of every middleware). Requests are raw
// sockets so the Host header is exactly what the test writes; HubSnapshotService builds are
// counted on the prototype.

import { strict as assert } from 'assert';
import * as net from 'net';
import { HubSnapshotService } from '../../roadmap/services/HubSnapshotService';
import { serveConsoleServerUI, type ConsoleServerController } from '../ui/helpers/serveConsoleServerUI';

interface Answer { status: number; body: string }

/** One raw request; `host` null sends no Host header. */
function raw(port: number, pathName: string, host: string | null, version = '1.1'): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    sock.on('connect', () => {
      const lines = [`GET ${pathName} HTTP/${version}`, ...(host === null ? [] : [`Host: ${host}`]), 'Connection: close', '', ''];
      sock.write(lines.join('\r\n'));
    });
    sock.on('data', (d) => { data += d.toString('utf8'); });
    sock.on('error', reject);
    sock.on('close', () => {
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(data)?.[1] ?? 0);
      const at = data.indexOf('\r\n\r\n');
      resolve({ status, body: at >= 0 ? data.slice(at + 4) : '' });
    });
  });
}

const PATHS = ['/api/hub', '/api/roadmap', '/api/v1/workspaces', '/command-center.html', '/api/integrations/voice-pack/status'];

suite('#564 Console Host guard (all HTTP routes)', function () {
  this.timeout(30000);
  let ctrl: ConsoleServerController;
  let port = 0;
  let builds = 0;
  const original = HubSnapshotService.prototype.buildHubSnapshot;

  suiteSetup(async () => {
    HubSnapshotService.prototype.buildHubSnapshot = function (this: HubSnapshotService, ...a: unknown[]) {
      builds += 1;
      return (original as (...x: unknown[]) => Promise<Record<string, unknown>>).apply(this, a);
    } as typeof original;
    ctrl = await serveConsoleServerUI({});
    port = Number(new URL(ctrl.url).port);
  });
  suiteTeardown(async () => {
    HubSnapshotService.prototype.buildHubSnapshot = original;
    await ctrl?.close();
  });

  test('a DNS-rebinding Host is refused on core, API, static and late-registered routes, with no snapshot built', async () => {
    for (const p of PATHS) {
      builds = 0;
      const a = await raw(port, p, `rebind.example:${port}`);
      assert.equal(a.status, 403, `${p}: ${a.status}`);
      assert.equal(JSON.parse(a.body).guard, 'host', p);
      assert.equal(builds, 0, `${p}: no snapshot built`);
    }
  });

  test('every non-loopback spelling of the Host is refused on /api/hub', async () => {
    for (const host of [`localhost.:${port}`, `127.0.0.2:${port}`, `2130706433:${port}`, `0177.0.0.1:${port}`,
      `[0:0:0:0:0:0:0:1]:${port}`, `[::ffff:127.0.0.1]:${port}`, `[::1]:${port}`, 'localhost:123456']) {
      builds = 0;
      const a = await raw(port, '/api/hub', host);
      assert.equal(a.status, 403, host);
      assert.equal(builds, 0, host);
    }
  });

  test('a request with no Host header (HTTP/1.0) is refused', async () => {
    builds = 0;
    const a = await raw(port, '/api/hub', null, '1.0');
    assert.equal(a.status, 403);
    assert.equal(builds, 0);
  });

  test('127.0.0.1 and localhost, on the Console port or another, still answer', async () => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, 'localhost:61001']) {
      for (const p of PATHS) {
        const a = await raw(port, p, host);
        assert.equal(a.status, 200, `${host} ${p}: ${a.status}`);
      }
      builds = 0;
      await raw(port, '/api/hub', host);
      assert.equal(builds, 1, `${host}: /api/hub builds once`);
    }
  });
});
