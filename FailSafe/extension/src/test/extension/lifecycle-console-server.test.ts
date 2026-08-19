// #240 bounded first slice (Forge relay cycle #124): real-socket lifecycle
// evidence for the local server FailSafe's activate()/deactivate() owns via
// bootstrapServers -> ConsoleServer -> ConsoleLifecycleService (port 9376).
// Exercises two #240 acceptance items directly against real net sockets
// (no port/listen mocking): "port already occupied produces ... safe
// alternate behavior" and "repeated lifecycle tests do not multiply
// listeners, timers, servers". Deliberately scoped to the server-lifecycle
// resource only — activation/deactivation of the full singleton extension
// (ledger, sentinel, MCP, webviews, voice, child processes) remains
// unaudited by this slice; see the #240 handoff comment for what remains.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import express from 'express';

import { ConsoleLifecycleService, type ConsoleLifecycleDeps } from '../../roadmap/services/ConsoleLifecycleService';

function mkWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-lifecycle-e2e-'));
}

function makeDeps(workspaceRoot: string, port: number): ConsoleLifecycleDeps {
  return {
    app: express(),
    port,
    host: '127.0.0.1',
    workspaceRoot,
    wsManager: { setup: () => {}, close: () => {} } as unknown as ConsoleLifecycleDeps['wsManager'],
    hub: {
      buildHubSnapshot: async () => ({}),
      recordCheckpoint: () => {},
      inferPhaseKeyFromPlan: () => 'plan',
    } as unknown as ConsoleLifecycleDeps['hub'],
    planManager: { getActivePlan: () => null } as unknown as ConsoleLifecycleDeps['planManager'],
    broadcast: () => {},
  };
}

function occupyPort(port: number, host: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(port, host, () => resolve(srv));
  });
}

function closeServer(srv: net.Server): Promise<void> {
  return new Promise((resolve) => srv.close(() => resolve()));
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ConsoleLifecycleService.start() resolves as soon as express().listen() has
// been *called*, not once the underlying socket bind actually completes —
// Node's `listening` event fires on a later tick. Real callers (activation,
// this test) must wait for it explicitly rather than assuming synchronous
// readiness immediately after `await start()`.
async function waitForListening(svc: ConsoleLifecycleService, timeoutMs = 5000): Promise<void> {
  const server = svc.getServer();
  if (!server) throw new Error('waitForListening: no server (start() was not called or failed)');
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.off('listening', onListening);
      reject(new Error(`server did not emit 'listening' within ${timeoutMs}ms`));
    }, timeoutMs);
    function onListening() {
      clearTimeout(timer);
      resolve();
    }
    server.once('listening', onListening);
  });
}

// High, unregistered port band chosen to avoid collision with the real
// FailSafe server (9376) and other suites' fixed ports; randomized per run
// to avoid cross-run TIME_WAIT flakiness on shared CI hosts.
function pickTestPort(): number {
  return 45_760 + Math.floor(Math.random() * 500);
}

suite('FX240 — ConsoleLifecycleService real-socket lifecycle (#240 slice)', function () {
  this.timeout(20000);

  let workspaceRoot: string;

  setup(() => { workspaceRoot = mkWorkspace(); });
  teardown(() => { fs.rmSync(workspaceRoot, { recursive: true, force: true }); });

  test('binds the preferred port when free', async () => {
    const port = pickTestPort();
    const svc = new ConsoleLifecycleService(makeDeps(workspaceRoot, port));
    try {
      await svc.start();
      assert.equal(svc.getPort(), port);
      await waitForListening(svc);
      assert.ok(svc.getServer()?.listening, 'server should be listening after start()');
    } finally {
      svc.stop();
    }
  });

  test('port already occupied: falls back to the next available port instead of crashing', async () => {
    const port = pickTestPort();
    const occupier = await occupyPort(port, '127.0.0.1');
    const svc = new ConsoleLifecycleService(makeDeps(workspaceRoot, port));
    try {
      await assert.doesNotReject(() => svc.start());
      const bound = svc.getPort();
      assert.notEqual(bound, port, 'must not silently claim the already-occupied preferred port');
      assert.ok(bound > port && bound <= port + 10,
        `expected a fallback port within +1..+10 of ${port}; got ${bound}`);
      await waitForListening(svc);
      assert.ok(svc.getServer()?.listening, 'fallback server should be listening');
    } finally {
      svc.stop();
      await closeServer(occupier);
    }
  });

  test('repeated start/stop cycles (activation/deactivation/reload) do not leak the listening port', async () => {
    const port = pickTestPort();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const svc = new ConsoleLifecycleService(makeDeps(workspaceRoot, port));
      await svc.start();
      assert.equal(svc.getPort(), port,
        `cycle ${cycle}: preferred port must be free again after the prior cycle's stop()`);
      await waitForListening(svc);
      assert.ok(svc.getServer()?.listening, `cycle ${cycle}: server should be listening`);
      svc.stop();
      // Let the OS release the socket between cycles; stop() closes
      // asynchronously and does not return a completion promise.
      await settle(75);
    }
  });

  test('stop() is idempotent and safe to call after a failed/never-started service', () => {
    const svc = new ConsoleLifecycleService(makeDeps(workspaceRoot, pickTestPort()));
    assert.doesNotThrow(() => svc.stop(), 'stop() before start() must not throw');
    assert.doesNotThrow(() => svc.stop(), 'double stop() must not throw');
  });
});
