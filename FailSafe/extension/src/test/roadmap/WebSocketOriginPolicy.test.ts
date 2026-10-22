// #564 (plan-564-websocket-origin LD2, LD4, LD5): the Console WebSocket accepts a handshake only
// from the Console's own page on this machine, and refuses everything else before the upgrade.
//
// Policy tables for the shared Host rule and the handshake rule, then real upgrades through
// ConsoleLifecycleService and a real WebSocketManager: a trusted client gets the bounded hub
// event; each hostile handshake gets 403 before the connection callback runs (no snapshot built,
// no client counted, no frame received); start/stop does not leak; reconnect works; a throwing
// request is refused by the real verifyClient. The guard module is loaded with a guarded require,
// so the policy rows fail by assertion on a base that does not have it.

import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import { WebSocket } from 'ws';
import { ConsoleLifecycleService, type ConsoleLifecycleDeps } from '../../roadmap/services/ConsoleLifecycleService';
import { WebSocketManager } from '../../roadmap/services/WebSocketManager';

type HostRefusal = 'listener' | 'host' | null;
type WsRefusal = 'version' | 'remote' | 'listener' | 'host' | 'origin' | null;
interface WsRequestLike { headers: Record<string, unknown>; socket: { remoteAddress?: unknown; localAddress?: unknown } }
type GuardModule = {
  consoleHostRefusal?(host: unknown, localAddress: unknown): HostRefusal;
  consoleWebSocketRefusal?(req: WsRequestLike): WsRefusal;
  isLoopbackAddress?(address: unknown): boolean;
};

function guard(): GuardModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../roadmap/routes/consoleRequestGuard') as GuardModule;
}

const P = 45123;
const V4 = '127.0.0.1';
const V6 = '::1';

function hostRefusal(host: unknown, local: unknown): HostRefusal {
  const fn = guard().consoleHostRefusal;
  assert.equal(typeof fn, 'function', 'consoleHostRefusal exists');
  return fn!(host, local);
}

function wsRefusal(headers: Record<string, unknown>, socket: WsRequestLike['socket'] = { remoteAddress: V4, localAddress: V4 }): WsRefusal {
  const fn = guard().consoleWebSocketRefusal;
  assert.equal(typeof fn, 'function', 'consoleWebSocketRefusal exists');
  return fn!({ headers: { 'sec-websocket-version': '13', ...headers }, socket });
}

suite('#564 Host rule (consoleHostRefusal)', () => {
  test('an IPv4 connection accepts exactly localhost and 127.0.0.1, with any port or none', () => {
    for (const host of [`127.0.0.1:${P}`, `localhost:${P}`, `LOCALHOST:${P}`, 'localhost:1', 'localhost', '127.0.0.1']) {
      assert.equal(hostRefusal(host, V4), null, host);
    }
  });

  test('an IPv4 connection refuses every other spelling, as an exact string rule', () => {
    for (const host of [`localhost.:${P}`, `127.0.0.2:${P}`, `2130706433:${P}`, `0177.0.0.1:${P}`, `0x7f.0.0.1:${P}`,
      `[0:0:0:0:0:0:0:1]:${P}`, `[::ffff:127.0.0.1]:${P}`, `[::1]:${P}`, `rebind.example:${P}`, `localhost:${P}:1`,
      'localhost:abc', 'localhost:123456', `localhost:${P}/x`, '', ' ', ` localhost:${P}`, undefined, [`localhost:${P}`], 42]) {
      assert.equal(hostRefusal(host, V4), 'host', String(JSON.stringify(host)));
    }
  });

  test('an IPv6 connection accepts [::1] and localhost and refuses 127.0.0.1', () => {
    assert.equal(hostRefusal(`[::1]:${P}`, V6), null);
    assert.equal(hostRefusal(`localhost:${P}`, V6), null);
    assert.equal(hostRefusal(`127.0.0.1:${P}`, V6), 'host');
  });

  test('pure-function inputs: a connection that did not arrive on 127.0.0.1 or ::1 is refused', () => {
    // 0.0.0.0 and :: are bind addresses, never a connection's local address; they are inputs here only.
    for (const local of ['0.0.0.0', '::', '::ffff:127.0.0.1', '192.168.1.5', undefined, null, 7]) {
      assert.equal(hostRefusal(`localhost:${P}`, local), 'listener', String(local));
    }
  });
});

suite('#564 handshake rule (consoleWebSocketRefusal)', () => {
  test('Origin equal to http:// plus the loopback Host is accepted, on any port', () => {
    assert.equal(wsRefusal({ host: `127.0.0.1:${P}`, origin: `http://127.0.0.1:${P}` }), null);
    assert.equal(wsRefusal({ host: `localhost:${P}`, origin: `http://localhost:${P}` }), null);
    assert.equal(wsRefusal({ host: 'localhost:61001', origin: 'http://localhost:61001' }), null, 'a forwarded port');
    assert.equal(wsRefusal({ host: `[::1]:${P}`, origin: `http://[::1]:${P}` }, { remoteAddress: V6, localAddress: V6 }), null);
  });

  test('cross-site, null, missing, malformed and cross-port origins are refused', () => {
    const host = `127.0.0.1:${P}`;
    for (const origin of ['https://attacker.example', `http://attacker.example:${P}`, 'null', undefined, 'http://',
      `127.0.0.1:${P}`, `http://127.0.0.1:${P}/`, `http://u@127.0.0.1:${P}`, ` http://127.0.0.1:${P}`, '',
      `https://127.0.0.1:${P}`, `http://127.0.0.1:${P + 1}`, `http://localhost:${P}`,
      `http://127.0.0.1:${P}, http://127.0.0.1:${P}`, [`http://127.0.0.1:${P}`, `http://127.0.0.1:${P}`]]) {
      assert.equal(wsRefusal({ host, origin }), 'origin', String(JSON.stringify(origin)));
    }
  });

  test('a protocol 8 handshake is refused even with a matching Origin and Sec-WebSocket-Origin', () => {
    const o = `http://127.0.0.1:${P}`;
    assert.equal(wsRefusal({ host: `127.0.0.1:${P}`, origin: o, 'sec-websocket-origin': o, 'sec-websocket-version': '8' }), 'version');
    assert.equal(wsRefusal({ host: `127.0.0.1:${P}`, origin: o, 'sec-websocket-version': undefined }), 'version');
  });

  test('a rebinding Host, a missing Host, a remote peer and a non-string peer are refused', () => {
    assert.equal(wsRefusal({ host: `rebind.example:${P}`, origin: `http://rebind.example:${P}` }), 'host');
    assert.equal(wsRefusal({ origin: `http://127.0.0.1:${P}` }), 'host');
    assert.equal(wsRefusal({ host: `127.0.0.1:${P}`, origin: `http://127.0.0.1:${P}` }, { remoteAddress: '192.168.1.5', localAddress: V4 }), 'remote');
    assert.equal(wsRefusal({ host: `127.0.0.1:${P}`, origin: `http://127.0.0.1:${P}` }, { remoteAddress: undefined, localAddress: V4 }), 'remote');
  });

  test('isLoopbackAddress is exactly 127.0.0.1, ::1 and ::ffff:127.0.0.1', () => {
    const fn = guard().isLoopbackAddress;
    assert.equal(typeof fn, 'function', 'isLoopbackAddress exists');
    assert.deepEqual(['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.2', '::', '', undefined].map((a) => fn!(a)),
      [true, true, true, false, false, false, false]);
  });
});

// ---------------------------------------------------------------- real upgrades

let home = '';
const previousHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

interface Started { svc: ConsoleLifecycleService; manager: WebSocketManager; port: number; builds: { n: number } }

async function startConsole(): Promise<Started> {
  const manager = new WebSocketManager();
  const builds = { n: 0 };
  const deps: ConsoleLifecycleDeps = {
    app: express(), port: 0, host: '127.0.0.1', workspaceRoot: home, wsManager: manager,
    hub: {
      buildHubSnapshot: async () => { builds.n += 1; return { marker: 'hub-564' }; },
      recordCheckpoint: () => undefined,
      inferPhaseKeyFromPlan: () => 'plan',
    } as unknown as ConsoleLifecycleDeps['hub'],
    planManager: { getActivePlan: () => null } as unknown as ConsoleLifecycleDeps['planManager'],
    broadcast: (d) => manager.broadcast(d),
  };
  const svc = new ConsoleLifecycleService(deps);
  await svc.start();
  return { svc, manager, port: svc.getPort(), builds };
}

const clientCount = (m: WebSocketManager): number => {
  const fn = (m as unknown as { clientCount?: () => number }).clientCount;
  assert.equal(typeof fn, 'function', 'WebSocketManager.clientCount exists');
  return fn!.call(m);
};

function trusted(port: number, name = '127.0.0.1'): Promise<{ ws: WebSocket; messages: unknown[] }> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];
    const ws = new WebSocket(`ws://${name}:${port}`, { origin: `http://${name}:${port}` });
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

/** One raw HTTP/1.1 upgrade request; resolves with everything the server sent until it closed. */
function rawUpgrade(port: number, headerLines: string[], settleMs = 300, requestLine = 'GET / HTTP/1.1'): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    const key = crypto.randomBytes(16).toString('base64');
    sock.on('connect', () => {
      sock.write([requestLine, 'Connection: Upgrade', 'Upgrade: websocket', `Sec-WebSocket-Key: ${key}`, ...headerLines, '', ''].join('\r\n'));
    });
    sock.on('data', (d) => { data += d.toString('latin1'); });
    sock.on('error', reject);
    const timer = setTimeout(() => { sock.destroy(); resolve(data); }, settleMs);
    sock.on('close', () => { clearTimeout(timer); resolve(data); });
  });
}

const until = async (cond: () => boolean, ms = 2000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
};

suite('#564 Console WebSocket handshake over real sockets', function () {
  this.timeout(30000);

  suiteSetup(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-ws-origin-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });
  suiteTeardown(() => {
    for (const [k, v] of Object.entries(previousHome)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('a trusted same-origin client gets the bounded hub event, then a broadcast', async () => {
    const c = await startConsole();
    try {
      for (const name of ['127.0.0.1', 'localhost']) {
        const { ws, messages } = await trusted(c.port, name);
        await until(() => messages.length >= 1);
        assert.deepEqual(messages[0], { type: 'init', payload: { marker: 'hub-564' } }, name);
        assert.equal(clientCount(c.manager), 1);
        c.manager.broadcast({ type: 'hub.refresh' });
        await until(() => messages.length >= 2);
        assert.deepEqual(messages[1], { type: 'hub.refresh' });
        ws.close();
        await until(() => clientCount(c.manager) === 0);
      }
    } finally { c.svc.stop(); }
  });

  test('hostile handshakes get 403 before the connection callback: no snapshot, no client, no frame', async () => {
    const c = await startConsole();
    const p = c.port;
    const H = `Host: 127.0.0.1:${p}`;
    const cases: Record<string, string[]> = {
      'https://attacker.example': [H, 'Sec-WebSocket-Version: 13', 'Origin: https://attacker.example'],
      'Origin: null': [H, 'Sec-WebSocket-Version: 13', 'Origin: null'],
      'malformed Origin': [H, 'Sec-WebSocket-Version: 13', `Origin: http://127.0.0.1:${p}/`],
      'absent Origin': [H, 'Sec-WebSocket-Version: 13'],
      'DNS rebinding Host': [`Host: rebind.example:${p}`, 'Sec-WebSocket-Version: 13', `Origin: http://rebind.example:${p}`],
      'cross-port Origin': [H, 'Sec-WebSocket-Version: 13', `Origin: http://127.0.0.1:${p + 1}`],
      'protocol 8 with Sec-WebSocket-Origin': [H, 'Sec-WebSocket-Version: 8', `Origin: http://127.0.0.1:${p}`, `Sec-WebSocket-Origin: http://127.0.0.1:${p}`],
      'duplicate Origin': [H, 'Sec-WebSocket-Version: 13', `Origin: http://127.0.0.1:${p}`, `Origin: http://127.0.0.1:${p}`],
      // HTTP/1.0: Node itself answers 400 to an HTTP/1.1 request without Host, before any upgrade
      // handling; an HTTP/1.0 request reaches the handshake policy.
      'no Host header (HTTP/1.0)': ['Sec-WebSocket-Version: 13', `Origin: http://127.0.0.1:${p}`],
    };
    try {
      for (const [name, lines] of Object.entries(cases)) {
        const pending = rawUpgrade(p, lines, 300, name.includes('HTTP/1.0') ? 'GET / HTTP/1.0' : 'GET / HTTP/1.1');
        await new Promise((r) => setTimeout(r, 100));
        c.manager.broadcast({ type: 'hub.refresh', name });
        const answer = await pending;
        assert.match(answer, /^HTTP\/1\.1 403 /, `${name}: ${answer.slice(0, 40)}`);
        assert.ok(!answer.includes('101 Switching'), name);
        assert.ok(!answer.includes('hub.refresh') && !answer.includes('hub-564'), `${name}: no frame`);
        assert.equal(c.builds.n, 0, `${name}: the connection callback never ran`);
        assert.equal(clientCount(c.manager), 0, `${name}: no client`);
      }
    } finally { c.svc.stop(); }
  });

  test('a request whose headers throw is refused by the real verifyClient', async () => {
    const c = await startConsole();
    try {
      const wss = (c.manager as unknown as { wss: { options: { verifyClient?: (info: unknown, cb: (...a: unknown[]) => void) => void } } }).wss;
      const verify = wss.options.verifyClient;
      assert.equal(typeof verify, 'function', 'verifyClient is installed');
      const req = { socket: { remoteAddress: V4, localAddress: V4 } } as Record<string, unknown>;
      Object.defineProperty(req, 'headers', { get: () => { throw new Error('boom'); } });
      const calls: unknown[][] = [];
      verify!({ origin: `http://127.0.0.1:${c.port}`, secure: false, req }, (...a: unknown[]) => { calls.push(a); });
      assert.deepEqual(calls.map((a) => a.slice(0, 2)), [[false, 403]]);
      assert.equal(clientCount(c.manager), 0);
    } finally { c.svc.stop(); }
  });

  test('three start/stop cycles leave no client and no upgrade listener behind', async () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const c = await startConsole();
      const server = c.svc.getServer()!;
      assert.equal(server.listenerCount('upgrade'), 1, `cycle ${cycle}: one upgrade listener while running`);
      const { ws } = await trusted(c.port);
      assert.equal(clientCount(c.manager), 1, `cycle ${cycle}`);
      const closed = new Promise<void>((r) => ws.once('close', () => r()));
      c.svc.stop();
      await closed;
      assert.equal(clientCount(c.manager), 0, `cycle ${cycle}: no client after stop`);
      assert.equal(server.listenerCount('upgrade'), 0, `cycle ${cycle}: no upgrade listener after stop`);
    }
  });

  test('reconnect: a closed Console socket can connect again and gets init again', async () => {
    const c = await startConsole();
    try {
      const first = await trusted(c.port, 'localhost');
      await until(() => first.messages.length >= 1);
      first.ws.close();
      await until(() => clientCount(c.manager) === 0);
      const second = await trusted(c.port, 'localhost');
      await until(() => second.messages.length >= 1);
      assert.deepEqual(second.messages[0], { type: 'init', payload: { marker: 'hub-564' } });
      assert.equal(clientCount(c.manager), 1);
      second.ws.close();
    } finally { c.svc.stop(); }
  });
});
