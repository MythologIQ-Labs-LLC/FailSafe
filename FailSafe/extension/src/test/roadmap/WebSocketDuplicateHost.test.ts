// #564 follow-up (D1): Node keeps only the first of several Host headers, so a handshake with a
// trusted Host followed by another Host was judged by the first value alone. Only a raw local client
// can send two Host headers (browsers cannot), so this is fail-closed hardening, not a browser
// exploit: such a handshake now gets 403 and no frame.

import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import { consoleWebSocketRefusal } from '../../roadmap/routes/consoleRequestGuard';
import { ConsoleLifecycleService, type ConsoleLifecycleDeps } from '../../roadmap/services/ConsoleLifecycleService';
import { WebSocketManager } from '../../roadmap/services/WebSocketManager';

suite('#564 D1 handshake rule: one Host header only (consoleWebSocketRefusal)', () => {
  const P = 45123;
  const req = (rawHeaders: string[]) => ({
    headers: { host: `127.0.0.1:${P}`, origin: `http://127.0.0.1:${P}`, 'sec-websocket-version': '13' },
    rawHeaders,
    socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
  });

  test('a single Host, in any case spelling, is accepted', () => {
    for (const name of ['Host', 'host', 'HOST']) {
      assert.equal(consoleWebSocketRefusal(req([name, `127.0.0.1:${P}`, 'Origin', `http://127.0.0.1:${P}`])), null, name);
    }
  });

  test('two Host headers are refused as host, whether hostile, contradictory or identical', () => {
    for (const second of [`rebind.example:${P}`, `localhost:${P}`, `127.0.0.1:${P}`]) {
      assert.equal(consoleWebSocketRefusal(req(['Host', `127.0.0.1:${P}`, 'host', second, 'Origin', `http://127.0.0.1:${P}`])), 'host', second);
    }
  });

  test('a header value spelled "Host" is not counted as a Host header', () => {
    assert.equal(consoleWebSocketRefusal(req(['Host', `127.0.0.1:${P}`, 'X-Note', 'Host'])), null);
  });
});

function rawUpgrade(port: number, headerLines: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    sock.on('connect', () => {
      const key = crypto.randomBytes(16).toString('base64');
      sock.write(['GET / HTTP/1.1', 'Connection: Upgrade', 'Upgrade: websocket', `Sec-WebSocket-Key: ${key}`, ...headerLines, '', ''].join('\r\n'));
    });
    sock.on('data', (d) => { data += d.toString('latin1'); });
    sock.on('error', reject);
    const timer = setTimeout(() => { sock.destroy(); resolve(data); }, 400);
    sock.on('close', () => { clearTimeout(timer); resolve(data); });
  });
}

suite('#564 duplicated Host headers fail closed', function () {
  this.timeout(30000);
  let home = '';
  const previousHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

  suiteSetup(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-ws-duphost-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });
  suiteTeardown(() => {
    for (const [k, v] of Object.entries(previousHome)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('a trusted Host followed by another Host gets 403 before the connection callback', async () => {
    const manager = new WebSocketManager();
    const builds = { n: 0 };
    const svc = new ConsoleLifecycleService({
      app: express(), port: 0, host: '127.0.0.1', workspaceRoot: home, wsManager: manager,
      hub: {
        buildHubSnapshot: async () => { builds.n += 1; return { marker: 'hub-564' }; },
        recordCheckpoint: () => undefined,
        inferPhaseKeyFromPlan: () => 'plan',
      } as unknown as ConsoleLifecycleDeps['hub'],
      planManager: { getActivePlan: () => null } as unknown as ConsoleLifecycleDeps['planManager'],
      broadcast: (d) => manager.broadcast(d),
    });
    await svc.start();
    const p = svc.getPort();
    try {
      for (const second of [`rebind.example:${p}`, `localhost:${p}`, `127.0.0.1:${p}`]) {
        const answer = await rawUpgrade(p, [`Host: 127.0.0.1:${p}`, `host: ${second}`, 'Sec-WebSocket-Version: 13', `Origin: http://127.0.0.1:${p}`]);
        assert.match(answer, /^HTTP\/1\.1 403 /, `second Host ${second}: ${answer.slice(0, 40)}`);
        assert.ok(!answer.includes('hub-564'), `second Host ${second}: no frame`);
      }
      assert.equal(builds.n, 0, 'the connection callback never ran');
      assert.equal(manager.clientCount(), 0);
      // The same server still accepts the Console's own single-Host handshake.
      const ok = await rawUpgrade(p, [`Host: 127.0.0.1:${p}`, 'Sec-WebSocket-Version: 13', `Origin: http://127.0.0.1:${p}`]);
      assert.match(ok, /^HTTP\/1\.1 101 /, ok.slice(0, 40));
      assert.ok(ok.includes('hub-564'), 'the trusted client gets init');
      assert.equal(builds.n, 1);
    } finally { svc.stop(); }
  });
});
