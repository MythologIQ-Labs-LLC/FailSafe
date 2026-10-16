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
  // v6.0.8 lane A (#468, plan T3): the clone-and-stage flow is `stage`, which
  // `install()` calls only after the release gate. These rows call `stage`
  // directly; the gate itself is pinned by marketplace-release-gate.test.ts.
  const REFUSAL = /Isolated setup is not available/;

  test('T3 (a) sandboxEnabled true is refused before any command, removal or folder creation', async () => {
    await withTempHome(async (home) => {
      const cache = path.join(home, '.failsafe', 'marketplace');
      const { calls, runner } = makeRunner(() => ({ code: 0, stdout: '', stderr: '' }));
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const progress: InstallProgress[] = [];
      const fresh = await (ins as any).stage(ITEM, { sandboxEnabled: true, runSecurityScan: true }, (p: InstallProgress) => progress.push(p));
      assert.equal(fresh.success, false);
      assert.match(String(fresh.error), REFUSAL);
      assert.equal(fs.existsSync(cache), false, 'the cache folder was not created');
      const installPath = path.join(cache, ITEM.id);
      fs.mkdirSync(installPath, { recursive: true });
      fs.writeFileSync(path.join(installPath, 'old-marker.txt'), 'old');
      const again = await (ins as any).stage(ITEM, { sandboxEnabled: true, runSecurityScan: false }, () => {});
      assert.equal(again.success, false);
      assert.equal(fs.existsSync(path.join(installPath, 'old-marker.txt')), true, 'the previous installation is untouched');
      assert.equal(calls.length, 0, 'no command ran');
      assert.ok(progress.some((p) => p.phase === 'failed' && REFUSAL.test(String(p.error))));
    });
  });

  test('T3 (b) sandboxEnabled false clones and runs nothing else, even with setup files present', async () => {
    await withTempHome(async (home) => {
      const installPath = path.join(home, '.failsafe', 'marketplace', ITEM.id);
      const progress: InstallProgress[] = [];
      const { calls, runner } = makeRunner((call) => {
        if (call.args[0] === 'clone') {
          fs.mkdirSync(installPath, { recursive: true });
          for (const f of ['requirements.txt', 'pyproject.toml', 'package.json']) fs.writeFileSync(path.join(installPath, f), '{}');
        }
        return { code: 0, stdout: '', stderr: '' };
      });
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const r = await (ins as any).stage(ITEM, { sandboxEnabled: false, runSecurityScan: false }, (p: InstallProgress) => progress.push(p));
      assert.equal(r.success, true);
      assert.match(String(r.installPath), /test-item$/);
      assert.equal(calls.length, 1, 'exactly one command');
      assert.equal(calls[0].command, 'git');
      assert.equal(calls[0].args[0], 'clone');
      assert.equal(fs.existsSync(path.join(installPath, '.failsafe-sandbox.json')), false);
      const last = progress[progress.length - 1];
      assert.equal(last.phase, 'complete');
      assert.match(last.message, /setup was not run/i);
      assert.ok(progress.some((p) => /No setup was run/.test(p.message)));
    });
  });

  test('T3 (c) clone failure reports phase=failed + error', async () => {
    await withTempHome(async () => {
      const progress: InstallProgress[] = [];
      const { runner } = makeRunner(() => ({ code: 1, stdout: '', stderr: 'Repository not found' }));
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      const r = await (ins as any).stage(ITEM, { sandboxEnabled: false, runSecurityScan: false }, (p: InstallProgress) => progress.push(p));
      assert.equal(r.success, false);
      assert.match(String(r.error), /Repository not found/);
      assert.ok(progress.find((p) => p.phase === 'failed'));
    });
  });

  test('T3 (f) the clone argv ends options with -- before the URL', async () => {
    await withTempHome(async () => {
      const { calls, runner } = makeRunner(() => ({ code: 1, stdout: '', stderr: 'x' }));
      const ins = new MarketplaceInstaller(new EventBus(), runner);
      await (ins as any).stage(ITEM, { sandboxEnabled: false, runSecurityScan: false }, () => {});
      const args = calls[0].args;
      const i = args.indexOf('--');
      assert.ok(i > 0, `-- present: ${JSON.stringify(args)}`);
      assert.equal(args[i + 1], ITEM.repoUrl);
    });
  });

  test("T3 (d) the installer's own runner supports only git: pip and npm return 126", async () => {
    const ins = new MarketplaceInstaller(new EventBus());
    for (const cmd of ['pip', 'npm']) {
      const r = await (ins as any).runner(cmd, ['--version'], os.tmpdir(), 5000);
      assert.equal(r.code, 126, `${cmd} is not started`);
      assert.match(r.stderr, /Unsupported marketplace executable/);
    }
  });

  test('T3 (e) install() is the only production caller of stage', () => {
    const src = path.resolve(__dirname, '..', '..', '..', 'src');
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { if (path.relative(src, full) !== 'test' && e.name !== 'vendor') walk(full); continue; }
        if (!/\.(ts|js)$/.test(e.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/\.stage\(/g)) hits.push(`${path.relative(src, full)}@${m.index}`);
      }
    };
    walk(src);
    assert.equal(hits.length, 1, `exactly one call: ${hits.join(', ')}`);
    const installer = fs.readFileSync(path.join(src, 'roadmap', 'services', 'MarketplaceInstaller.ts'), 'utf8');
    const body = installer.slice(installer.indexOf('async install('), installer.indexOf('async stage('));
    assert.ok(body.indexOf('MARKETPLACE_INSTALLS_ENABLED') >= 0 && body.indexOf('MARKETPLACE_INSTALLS_ENABLED') < body.indexOf('this.stage('), 'the gate is checked before stage');
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

  test.skip('FX384 update — not installed → returns failure', async () => {
    await withTempHome(async () => {
      const ins = new MarketplaceInstaller(new EventBus(), makeRunner(() => ({ code: 0, stdout: '', stderr: '' })).runner);
      const r = await ins.update(ITEM, () => {});
      assert.equal(r.success, false);
      assert.match(String(r.error), /not installed/);
    });
  });

  test.skip('FX384 update — successful pull reports complete', async () => {
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

  test.skip('FX384 update — pull failure reports failed phase', async () => {
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
