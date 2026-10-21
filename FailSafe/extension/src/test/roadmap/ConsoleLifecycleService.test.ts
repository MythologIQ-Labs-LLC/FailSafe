import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { ConsoleLifecycleService } from '../../roadmap/services/ConsoleLifecycleService';

// The server registry lives under os.homedir(), which reads USERPROFILE on
// Windows and HOME elsewhere; both are redirected so no test touches the
// operator's real ~/.failsafe/servers.json (v6.0.8 LD2).
async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-console-ready-'));
  const previous = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    assert.equal(os.homedir(), home, 'precondition: the registry home is the temp directory');
    await run(home);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
}

interface RegistryEntry { port: number; status: string; workspacePath: string }

function registryEntries(home: string): RegistryEntry[] {
  const file = path.join(home, '.failsafe', 'servers.json');
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).servers as RegistryEntry[]) : [];
}

function listen(port: number): Promise<net.Server | null> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(null));
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function closeAll(servers: net.Server[]): Promise<void> {
  return Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve())))).then(() => undefined);
}

/** Eleven consecutive ports, all held by real listeners. */
async function occupyRange(): Promise<{ base: number; held: net.Server[] }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const base = 47000 + Math.floor(Math.random() * 8000);
    const held: net.Server[] = [];
    for (let p = base; p <= base + 10; p++) {
      const srv = await listen(p);
      if (!srv) break;
      held.push(srv);
    }
    if (held.length === 11) return { base, held };
    await closeAll(held);
  }
  throw new Error('could not occupy eleven consecutive ports');
}

function fixture(port = 0, host = '127.0.0.1', options: {
  workspaceRoot?: string;
  mutationBus?: { registerWatcher: (file: string, callback: () => void, debounceMs: number) => { dispose: () => void } };
  broadcast?: (event: Record<string, unknown>) => void;
} = {}) {
  const observations: string[] = [];
  const checkpoints: Array<{ status: string; policyVerdict: string; payload: any }> = [];
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
    recordCheckpoint: (cp: { status: string; policyVerdict: string; payload: any }) => { checkpoints.push(cp); },
  };
  const deps = {
    app, port, host, workspaceRoot: options.workspaceRoot ?? path.join(os.tmpdir(), 'failsafe-no-ledger'),
    wsManager, hub, planManager: { getActivePlan: () => null },
    mutationBus: options.mutationBus,
    broadcast: options.broadcast ?? (() => {}),
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

  test('C3 a real META_LEDGER watcher is released across a workspace switch and never opened on failed binding (#471)', async () => {
    await withTempHome(async () => {
      const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-ledger-watcher-one-'));
      const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-ledger-watcher-two-'));
      const roots = [firstRoot, secondRoot];
      for (const root of roots) {
        fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(root, 'docs', 'META_LEDGER.md'), '### Entry #1\n');
      }
      const tracker = (root: string) => {
        let callback: (() => void) | null = null;
        let active = false;
        let registrations = 0;
        let disposals = 0;
        return {
          bus: {
            registerWatcher: (file: string, fn: () => void, delay: number) => {
              assert.equal(file, path.join(root, 'docs', 'META_LEDGER.md'));
              assert.equal(fs.existsSync(file), true, 'non-vacuous watcher precondition');
              assert.equal(delay, 1500);
              registrations++;
              callback = fn;
              active = true;
              return { dispose: () => { assert.equal(active, true); active = false; disposals++; } };
            },
          },
          fire: () => { if (active && callback) (callback as () => void)(); },
          counts: () => ({ registrations, disposals, active }),
        };
      };
      const one = tracker(firstRoot);
      const two = tracker(secondRoot);
      const outOne: string[] = [];
      const outTwo: string[] = [];
      const first = fixture(0, '127.0.0.1', {
        workspaceRoot: firstRoot, mutationBus: one.bus,
        broadcast: (event) => outOne.push(String(event.type)),
      });
      const second = fixture(0, '127.0.0.1', {
        workspaceRoot: secondRoot, mutationBus: two.bus,
        broadcast: (event) => outTwo.push(String(event.type)),
      });
      const occupier = (await listen(0))!;
      const busyPort = (occupier.address() as net.AddressInfo).port;
      const refused = fixture(busyPort, '127.0.0.1', { workspaceRoot: firstRoot, mutationBus: one.bus });
      (refused.service as any).findAvailablePort = async () => busyPort;
      try {
        await assert.rejects(refused.service.start(), (error: any) => error?.code === 'EADDRINUSE');
        assert.deepEqual(one.counts(), { registrations: 0, disposals: 0, active: false }, 'bind failure cannot open watcher');
        await first.service.start();
        assert.deepEqual(one.counts(), { registrations: 1, disposals: 0, active: true });
        one.fire();
        assert.deepEqual(outOne, ['hub.refresh', 'tracker.refresh']);
        first.service.stop();
        assert.deepEqual(one.counts(), { registrations: 1, disposals: 1, active: false });
        await second.service.start();
        assert.deepEqual(two.counts(), { registrations: 1, disposals: 0, active: true });
        one.fire();
        assert.equal(outOne.length, 2, 'retired workspace does not broadcast');
        two.fire();
        assert.deepEqual(outTwo, ['hub.refresh', 'tracker.refresh']);
      } finally {
        refused.service.stop();
        first.service.stop();
        second.service.stop();
        await closeAll([occupier]);
        assert.deepEqual(two.counts(), { registrations: 1, disposals: 1, active: false });
        for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  test('C1 the startup checkpoint is proposed, not validated, and names the bound listener (v6.0.8 LD1)', async () => {
    await withTempHome(async (home) => {
      const { service, checkpoints } = fixture(0, 'localhost');
      try {
        await service.start();
        const address = service.getServer()!.address() as net.AddressInfo;
        assert.equal(checkpoints.length, 1);
        const cp = checkpoints[0];
        assert.equal(cp.status, 'proposed');
        assert.equal(cp.policyVerdict, 'UNKNOWN');
        assert.equal(cp.payload.transport, 'listening');
        assert.equal(cp.payload.port, address.port);
        assert.equal(cp.payload.port, service.getPort());
        // Configured as 'localhost': the record names the address actually bound.
        assert.equal(cp.payload.host, address.address);
        assert.notEqual(cp.payload.host, 'localhost');
        const active = registryEntries(home).filter((e) => e.status === 'active');
        assert.deepEqual(active.map((e) => e.port), [address.port]);
      } finally { service.stop(); }
    });
  });

  test('C2 a real port conflict records the fallback port, and an occupied range records nothing (v6.0.8 LD1)', async () => {
    await withTempHome(async (home) => {
      const occupier = (await listen(0))!;
      const occupied = (occupier.address() as net.AddressInfo).port;
      const { service, checkpoints } = fixture(occupied);
      try {
        await service.start();
        const bound = (service.getServer()!.address() as net.AddressInfo).port;
        assert.notEqual(bound, occupied);
        assert.ok(bound > occupied && bound <= occupied + 10, `fallback ${bound} outside ${occupied}+1..+10`);
        assert.equal(checkpoints.length, 1);
        assert.equal(checkpoints[0].status, 'proposed');
        assert.equal(checkpoints[0].payload.port, bound);
        const ports = registryEntries(home).filter((e) => e.status === 'active').map((e) => e.port);
        assert.deepEqual(ports, [bound]);
      } finally {
        service.stop();
        await closeAll([occupier]);
      }

      const { base, held } = await occupyRange();
      const second = fixture(base);
      try {
        await assert.rejects(second.service.start(), /No available Roadmap server port/);
        assert.deepEqual(second.checkpoints, []);
        assert.equal(second.service.getServer(), null);
        const inRange = registryEntries(home).filter((e) => e.port >= base && e.port <= base + 10);
        assert.deepEqual(inRange, []);
      } finally {
        second.service.stop();
        await closeAll(held);
      }
    });
  });
});
