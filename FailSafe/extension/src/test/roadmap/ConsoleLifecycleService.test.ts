import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { ConsoleLifecycleService } from '../../roadmap/services/ConsoleLifecycleService';

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-console-ready-'));
  const previous = process.env.HOME;
  process.env.HOME = home;
  try { await run(home); }
  finally {
    if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function fixture(port = 0) {
  const observations: string[] = [];
  const checkpoints: Array<{ policyVerdict: string; payload: unknown }> = [];
  const app = {
    listen: (p: number, host: string) => net.createServer().listen(p, host),
  };
  const wsManager = {
    setup: (server: net.Server) => {
      assert.equal(server.listening, true, 'WebSocket must wait for real HTTP binding');
      observations.push('websocket');
    },
    close: () => { observations.push('close'); },
  };
  const hub = {
    inferPhaseKeyFromPlan: () => 'startup',
    recordCheckpoint: (cp: { policyVerdict: string; payload: unknown }) => { checkpoints.push(cp); },
  };
  const deps = {
    app, port, host: '127.0.0.1', workspaceRoot: path.join(os.tmpdir(), 'failsafe-no-ledger'),
    wsManager, hub, planManager: { getActivePlan: () => null },
    broadcast: () => {},
  };
  const service = new ConsoleLifecycleService(deps as any);
  return { service, checkpoints, observations };
}

suite('ConsoleLifecycleService listener evidence (FailSafe #471)', () => {
  test('bind completes before websocket and policy verdict is not fabricated PASS', async () => {
    await withTempHome(async () => {
      const { service, observations, checkpoints } = fixture();
      try {
        await service.start();
        assert.equal(service.getServer()?.listening, true);
        assert.ok(service.getPort() > 0);
        assert.deepEqual(observations, ['websocket']);
        assert.equal(checkpoints.length, 1);
        assert.equal(checkpoints[0].policyVerdict, 'UNKNOWN');
      } finally { service.stop(); }
    });
  });

  test('race-injected EADDRINUSE rejects with no registry and no policy checkpoint', async () => {
    await withTempHome(async home => {
      const occupying = net.createServer();
      await new Promise<void>(resolve => occupying.listen(0, '127.0.0.1', resolve));
      const occupiedPort = (occupying.address() as net.AddressInfo).port;
      const { service, checkpoints, observations } = fixture(occupiedPort);
      (service as any).findAvailablePort = async () => occupiedPort;
      try {
        await assert.rejects(service.start(), (err: any) => err?.code === 'EADDRINUSE');
        assert.equal(service.getServer(), null);
        assert.equal(checkpoints.length, 0);
        assert.deepEqual(observations, []);
        assert.equal(fs.existsSync(path.join(home, '.failsafe', 'servers.json')), false);
      } finally {
        service.stop();
        await new Promise<void>(resolve => occupying.close(() => resolve()));
      }
    });
  });

  test('exhausted 11-port range rejects before app.listen and records no PASS', async () => {
    await withTempHome(async home => {
      const { service, observations, checkpoints } = fixture(40000);
      (service as any).isPortAvailable = async () => false;
      try {
        await assert.rejects(service.start(), /No available Roadmap server port/);
        assert.equal(service.getServer(), null);
        assert.deepEqual(checkpoints, []);
        assert.deepEqual(observations, []);
        assert.equal(fs.existsSync(path.join(home, '.failsafe', 'servers.json')), false);
      } finally { service.stop(); }
    });
  });

  test('repeated start is idempotent and stop permits restart', async () => {
    await withTempHome(async () => {
      const { service, checkpoints } = fixture();
      try {
        await service.start();
        await service.start();
        assert.equal(checkpoints.length, 1);
        service.stop();
        await service.start();
        assert.equal(checkpoints.length, 2);
      } finally { service.stop(); }
    });
  });
});
