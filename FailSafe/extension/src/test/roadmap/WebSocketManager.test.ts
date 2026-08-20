// FX240 — WebSocketManager real-socket lifecycle evidence.
// Bounded slice of the #240 extension-lifecycle audit program (#239):
// "websocket reconnect and duplicate subscription prevention."
//
// Uses a real http.Server + real `ws` client connections (not mocks) so
// close()'s actual client-teardown behavior is exercised, matching the
// real-socket convention established by FailSafe#281's
// lifecycle-console-server.test.ts for ConsoleLifecycleService.

import { strict as assert } from 'assert';
import * as http from 'http';
import { WebSocket } from 'ws';

import { WebSocketManager } from '../../roadmap/services/WebSocketManager';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', () => resolve());
  });
}

suite('FX240 WebSocketManager — real-socket lifecycle (#240 slice)', () => {

  test('broadcast delivers to every connected client', async () => {
    const httpServer = http.createServer();
    const port = await listen(httpServer);
    const manager = new WebSocketManager();
    manager.setup(httpServer, () => {});

    const clientA = new WebSocket(`ws://127.0.0.1:${port}`);
    const clientB = new WebSocket(`ws://127.0.0.1:${port}`);
    await Promise.all([waitOpen(clientA), waitOpen(clientB)]);

    const received: unknown[] = [];
    const gotBoth = new Promise<void>((resolve) => {
      let count = 0;
      const onMessage = (raw: Buffer) => {
        received.push(JSON.parse(raw.toString()));
        count += 1;
        if (count === 2) resolve();
      };
      clientA.on('message', onMessage);
      clientB.on('message', onMessage);
    });

    manager.broadcast({ type: 'hub.refresh' });
    await gotBoth;

    assert.deepEqual(received, [{ type: 'hub.refresh' }, { type: 'hub.refresh' }]);

    manager.close();
    await Promise.all([waitClose(clientA), waitClose(clientB)]);
    httpServer.close();
  });

  test('close() terminates already-open client connections instead of leaking them', async () => {
    const httpServer = http.createServer();
    const port = await listen(httpServer);
    const manager = new WebSocketManager();
    manager.setup(httpServer, () => {});

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitOpen(client);
    assert.equal(client.readyState, WebSocket.OPEN, 'precondition: client is connected before close()');

    // Real defect this test guards against: `wss.close()` alone does not
    // close pre-existing connections (per the `ws` library's own
    // documented behavior for `close()` called with the `server` option),
    // so an un-terminated client would remain OPEN indefinitely here.
    manager.close();
    await waitClose(client);
    assert.equal(client.readyState, WebSocket.CLOSED, 'client socket must be torn down by close(), not left dangling');

    httpServer.close();
  });

  test('repeated setup/close cycles (activation/deactivation/reload) do not multiply live clients', async () => {
    const httpServer = http.createServer();
    const port = await listen(httpServer);
    const manager = new WebSocketManager();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      manager.setup(httpServer, () => {});
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      await waitOpen(client);
      manager.close();
      await waitClose(client);
    }

    httpServer.close();
  });

  test('broadcast() before setup() and close() before setup() are safe no-ops', () => {
    const manager = new WebSocketManager();
    assert.doesNotThrow(() => manager.broadcast({ type: 'hub.refresh' }));
    assert.doesNotThrow(() => manager.close());
    // Idempotent: calling close() again after already-null wss must not throw.
    assert.doesNotThrow(() => manager.close());
  });
});
