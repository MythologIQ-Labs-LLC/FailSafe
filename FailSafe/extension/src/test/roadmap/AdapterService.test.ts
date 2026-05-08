// Functional tests for AdapterService (FX389 + FX391).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AdapterService } from '../../roadmap/services/AdapterService';
import { EventBus } from '../../shared/EventBus';
import type { AdapterCommandResult } from '../../roadmap/services/AdapterTypes';

interface RunnerCall { command: string; args: string[]; cwd?: string; }

function makeRunner(handler: (call: RunnerCall) => AdapterCommandResult): { calls: RunnerCall[]; runner: any } {
  const calls: RunnerCall[] = [];
  return {
    calls,
    runner: async (command: string, args: string[], cwd?: string): Promise<AdapterCommandResult> => {
      const call = { command, args, cwd };
      calls.push(call);
      return handler(call);
    },
  };
}

function withTempHome(action: (home: string) => Promise<void> | void): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adp-'));
    const prevHome = process.env.HOME;
    const prevUser = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try { await action(home); resolve(); }
    catch (e) { reject(e); }
    finally {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevUser === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUser;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}

suite('AdapterService (FX389 + FX391)', () => {
  test('FX391 checkState — Python absent → reports pythonAvailable=false + error', async () => {
    await withTempHome(async () => {
      const { runner } = makeRunner(() => ({ code: 1, stdout: '', stderr: 'not found' }));
      const a = new AdapterService(new EventBus(), runner);
      const s = await a.checkState();
      assert.equal(s.pythonAvailable, false);
      assert.match(String(s.error), /Python/);
      assert.equal(s.adapterInstalled, false);
    });
  });

  test('FX391 checkState — Python present but pip absent → reports pipAvailable=false', async () => {
    await withTempHome(async () => {
      const { runner } = makeRunner((c) => {
        if (c.command === 'python3') return { code: 0, stdout: 'Python 3.11.0', stderr: '' };
        return { code: 1, stdout: '', stderr: 'no pip' };
      });
      const a = new AdapterService(new EventBus(), runner);
      const s = await a.checkState();
      assert.equal(s.pythonAvailable, true);
      assert.equal(s.pythonVersion, '3.11.0');
      assert.equal(s.pipAvailable, false);
      assert.match(String(s.error), /pip/);
    });
  });

  test('FX391 checkState — Python+pip present, adapter installed → version parsed', async () => {
    await withTempHome(async () => {
      const { runner } = makeRunner((c) => {
        if (c.command === 'python3') return { code: 0, stdout: 'Python 3.11.0', stderr: '' };
        if (c.command === 'pip3' && c.args[0] === '--version') return { code: 0, stdout: 'pip 23', stderr: '' };
        if (c.command === 'pip3' && c.args[0] === 'show' && c.args[1] === 'agent-failsafe') {
          return { code: 0, stdout: 'Name: agent-failsafe\nVersion: 0.3.1\n', stderr: '' };
        }
        if (c.command === 'pip3' && c.args[0] === 'show') {
          return { code: 1, stdout: '', stderr: 'not installed' };
        }
        return { code: 1, stdout: '', stderr: '' };
      });
      const a = new AdapterService(new EventBus(), runner);
      const s = await a.checkState();
      assert.equal(s.adapterInstalled, true);
      assert.equal(s.adapterVersion, '0.3.1');
    });
  });

  test('FX391 checkState — toolkitPackages enumerates all 4 packages with required flag on agent-os', async () => {
    await withTempHome(async () => {
      const { runner } = makeRunner((c) => {
        if (c.command === 'python3') return { code: 0, stdout: 'Python 3.11.0', stderr: '' };
        if (c.command === 'pip3' && c.args[0] === '--version') return { code: 0, stdout: '', stderr: '' };
        return { code: 1, stdout: '', stderr: '' };
      });
      const a = new AdapterService(new EventBus(), runner);
      const s = await a.checkState();
      assert.equal(s.toolkitPackages.length, 4);
      const names = s.toolkitPackages.map(p => p.name);
      assert.deepEqual(names, ['agent-os', 'agent-mesh', 'agent-hypervisor', 'agent-sre']);
      assert.equal(s.toolkitPackages.find(p => p.name === 'agent-os')!.required, true);
      assert.equal(s.toolkitPackages.find(p => p.name === 'agent-sre')!.required, false);
    });
  });

  test('FX391 checkState — falls back to "python" if "python3" missing', async () => {
    await withTempHome(async () => {
      const { runner } = makeRunner((c) => {
        if (c.command === 'python3') return { code: 1, stdout: '', stderr: 'not found' };
        if (c.command === 'python') return { code: 0, stdout: 'Python 3.10.5', stderr: '' };
        return { code: 1, stdout: '', stderr: '' };
      });
      const a = new AdapterService(new EventBus(), runner);
      const s = await a.checkState();
      assert.equal(s.pythonAvailable, true);
      assert.equal(s.pythonVersion, '3.10.5');
    });
  });

  test('FX389 saveConfig + getConfig — round-trips adapter config to disk', async () => {
    await withTempHome(async () => {
      const a = new AdapterService(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      await a.saveConfig({
        adapterBaseUrl: 'http://localhost:9999',
        mcpServerCommand: ['failsafe', 'mcp'],
        failOpen: true,
        trustThresholds: { cbt: 0.5, kbt: 0.8 },
      });
      const cfg = a.getConfig()!;
      assert.equal(cfg.adapterBaseUrl, 'http://localhost:9999');
      assert.equal(cfg.failOpen, true);
      assert.equal(cfg.trustThresholds.cbt, 0.5);
    });
  });

  test('FX389 getConfig — missing file returns null', async () => {
    await withTempHome(async () => {
      const a = new AdapterService(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      assert.equal(a.getConfig(), null);
    });
  });

  test('FX389 getConfig — corrupt JSON returns null (no throw)', async () => {
    await withTempHome(async (home) => {
      const dir = path.join(home, '.failsafe', 'adapter');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), '{not-json');
      const a = new AdapterService(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      assert.equal(a.getConfig(), null);
    });
  });

  test('FX391 healthCheck — returns details + healthy=false when nothing configured', async () => {
    await withTempHome(async () => {
      const { runner } = makeRunner(() => ({ code: 1, stdout: '', stderr: 'no module' }));
      const a = new AdapterService(new EventBus(), runner);
      const h = await a.healthCheck();
      assert.equal(h.healthy, false);
      assert.equal(h.ledgerAccessible, false);
      assert.equal(h.policyFilesFound, false);
      assert.ok(Array.isArray(h.details) && h.details.length > 0);
    });
  });

  test('FX391 getCachedState — returns null before checkState, populated after', async () => {
    await withTempHome(async () => {
      const a = new AdapterService(new EventBus(), makeRunner(() => ({ code: 1, stdout: '', stderr: '' })).runner);
      assert.equal(a.getCachedState(), null);
      await a.checkState();
      assert.ok(a.getCachedState());
    });
  });
});
