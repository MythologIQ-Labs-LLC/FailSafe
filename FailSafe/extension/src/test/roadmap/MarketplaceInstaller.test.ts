// Functional tests for MarketplaceInstaller (FX384).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MarketplaceInstaller } from '../../roadmap/services/MarketplaceInstaller';
import { EventBus } from '../../shared/EventBus';
import type { MarketplaceItem, CommandRunnerResult, InstallProgress } from '../../roadmap/services/MarketplaceTypes';

interface RunnerCall { command: string; args: string[]; cwd?: string; }

function makeRunner(responseFor: (call: RunnerCall) => CommandRunnerResult): { calls: RunnerCall[]; runner: any } {
  const calls: RunnerCall[] = [];
  return {
    calls,
    runner: async (command: string, args: string[], cwd?: string): Promise<CommandRunnerResult> => {
      const call = { command, args, cwd };
      calls.push(call);
      return responseFor(call);
    },
  };
}

const ITEM: MarketplaceItem = {
  id: 'test-item', name: 'Test Item',
  description: '', category: 'autonomous-multi-agent',
  author: 'test', repoUrl: 'https://example.com/test.git', repoRef: 'main',
  status: 'not-installed', trustTier: 'unverified',
  sandboxEnabled: false, requiredPermissions: [],
  featured: false, tags: [], version: '1.0', techStack: [],
  difficulty: 'beginner', auditStatus: 'community',
} as MarketplaceItem;

function withTempHome(action: (home: string) => Promise<void> | void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    (async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mph-i-'));
    const prevHome = process.env.HOME;
    const prevUser = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      await action(home);
      resolve();
    } catch (e) { reject(e); }
    finally {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevUser === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUser;
      fs.rmSync(home, { recursive: true, force: true });
    }
    })();
  });
}

suite('MarketplaceInstaller (FX384)', () => {
  test('FX384 install — successful clone reports complete + 100% progress', async () => {
    await withTempHome(async (home) => {
      const progress: InstallProgress[] = [];
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      const { calls, runner } = makeRunner((call) => {
        if (call.args[0] === 'clone') {
          // Simulate clone success: create the install dir
          fs.mkdirSync(installPath, { recursive: true });
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      });
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const r = await ins.install(ITEM, { sandboxEnabled: false, runSecurityScan: false }, p => progress.push(p));
      assert.equal(r.success, true);
      assert.match(String(r.installPath), /test-item$/);
      const last = progress[progress.length - 1];
      assert.equal(last.phase, 'complete');
      assert.equal(last.progress, 100);
      assert.ok(calls.some(c => c.command === 'git' && c.args[0] === 'clone'));
    });
  });

  test('FX384 install — clone failure reports phase=failed + error', async () => {
    await withTempHome(async () => {
      const progress: InstallProgress[] = [];
      const { runner } = makeRunner(() => ({ code: 1, stdout: '', stderr: 'Repository not found' }));
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const r = await ins.install(ITEM, { sandboxEnabled: false, runSecurityScan: false }, p => progress.push(p));
      assert.equal(r.success, false);
      assert.match(String(r.error), /Repository not found/);
      const failedFrame = progress.find(p => p.phase === 'failed');
      assert.ok(failedFrame);
    });
  });

  test('FX384 install — re-install removes existing dir before cloning', async () => {
    await withTempHome(async (home) => {
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      // Pre-create existing dir with a marker file
      fs.mkdirSync(installPath, { recursive: true });
      fs.writeFileSync(path.join(installPath, 'old-marker.txt'), 'old');
      const { runner } = makeRunner((call) => {
        if (call.args[0] === 'clone') {
          // Re-create dir minus marker
          fs.mkdirSync(installPath, { recursive: true });
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      });
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      await ins.install(ITEM, { sandboxEnabled: false, runSecurityScan: false }, () => {});
      assert.equal(fs.existsSync(path.join(installPath, 'old-marker.txt')), false);
    });
  });

  test('FX384 install — sandboxEnabled writes .failsafe-sandbox.json', async () => {
    await withTempHome(async (home) => {
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      const { runner } = makeRunner((call) => {
        if (call.args[0] === 'clone') {
          fs.mkdirSync(installPath, { recursive: true });
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      });
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      await ins.install(ITEM, { sandboxEnabled: true, runSecurityScan: false }, () => {});
      const sandboxFile = path.join(installPath, '.failsafe-sandbox.json');
      assert.ok(fs.existsSync(sandboxFile));
      const cfg = JSON.parse(fs.readFileSync(sandboxFile, 'utf-8'));
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.item.id, ITEM.id);
      assert.equal(cfg.restrictions.networkAfterSetup, false);
    });
  });

  test('FX384 install — sandbox runs npm install --ignore-scripts when package.json present', async () => {
    await withTempHome(async (home) => {
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      const { calls, runner } = makeRunner((call) => {
        if (call.args[0] === 'clone') {
          fs.mkdirSync(installPath, { recursive: true });
          fs.writeFileSync(path.join(installPath, 'package.json'), '{}');
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      });
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      await ins.install(ITEM, { sandboxEnabled: true, runSecurityScan: false }, () => {});
      const npmCall = calls.find(c => c.command === 'npm');
      assert.ok(npmCall);
      assert.deepEqual(npmCall!.args, ['install', '--ignore-scripts']);
    });
  });

  test('FX384 isInstalled — returns false when path missing, true when present', async () => {
    await withTempHome(async (home) => {
      const ins = new MarketplaceInstaller(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      assert.equal(ins.isInstalled('foo'), false);
      const installPath = path.join(home, '.failsafe', 'marketplace', 'foo');
      fs.mkdirSync(installPath, { recursive: true });
      assert.equal(ins.isInstalled('foo'), true);
    });
  });

  test('FX384 getInstallPath — under ~/.failsafe/marketplace/<id>', async () => {
    await withTempHome(async (home) => {
      const ins = new MarketplaceInstaller(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      assert.equal(ins.getInstallPath('foo-id'), path.join(home, '.failsafe', 'marketplace', 'foo-id'));
    });
  });

  test('FX384 uninstall — removes install directory', async () => {
    await withTempHome(async (home) => {
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      fs.mkdirSync(installPath, { recursive: true });
      const ins = new MarketplaceInstaller(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      const ok = await ins.uninstall(ITEM);
      assert.equal(ok, true);
      assert.equal(fs.existsSync(installPath), false);
    });
  });

  test('FX384 update — not installed → returns failure', async () => {
    await withTempHome(async () => {
      const ins = new MarketplaceInstaller(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      const r = await ins.update(ITEM, () => {});
      assert.equal(r.success, false);
      assert.match(String(r.error), /not installed/);
    });
  });

  test('FX384 update — successful pull reports complete', async () => {
    await withTempHome(async (home) => {
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      fs.mkdirSync(installPath, { recursive: true });
      const progress: InstallProgress[] = [];
      const { calls, runner } = makeRunner(() => ({ code: 0, stdout: '', stderr: '' }));
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const r = await ins.update(ITEM, p => progress.push(p));
      assert.equal(r.success, true);
      assert.equal(progress[progress.length - 1].phase, 'complete');
      const pull = calls.find(c => c.args[0] === 'pull');
      assert.ok(pull);
    });
  });

  test('FX384 update — pull failure reports failed phase', async () => {
    await withTempHome(async (home) => {
      fs.mkdirSync(path.join(home, '.failsafe', 'marketplace', ITEM.id), { recursive: true });
      const progress: InstallProgress[] = [];
      const { runner } = makeRunner(() => ({ code: 1, stdout: '', stderr: 'merge conflict' }));
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const r = await ins.update(ITEM, p => progress.push(p));
      assert.equal(r.success, false);
      assert.match(String(r.error), /merge conflict/);
      assert.ok(progress.some(p => p.phase === 'failed'));
    });
  });
});
