import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runIsolated, type IsolatedRunResult } from '../../../integrations/agent-cli/isolated-run';
import { startTreeTracker } from '../../../integrations/agent-cli/process-tree';
import { extraWorktrees, git, isAlive, makeRepo, read, removeRepo, scriptedAgent, useGitConfig } from './git-fixture';

// FX951 (#475): real git, scripted node agent. Every case asserts the outcome AND
// the live bytes / git state / process liveness / worktree removal on disk.

const AGENT = { cmd: 'agent', args: [] as string[] };

async function runScript(root: string, script: string, env: Record<string, string> = {}, timeoutMs = 60000): Promise<{ r: IsolatedRunResult; calls: number }> {
  const agent = scriptedAgent(script, { LIVE_ROOT: root, ...env });
  const r = await runIsolated(root, AGENT, { run: agent.run, timeoutMs });
  return { r, calls: agent.calls.filter((c) => c.cmd === 'agent').length };
}

function assertCleanedUp(root: string, r: IsolatedRunResult): void {
  assert.equal(r.cleanupError, undefined, `cleanup error: ${r.cleanupError}`);
  if (r.worktreePath) assert.equal(fs.existsSync(r.worktreePath), false, 'worktree directory removed');
  assert.deepEqual(extraWorktrees(root), [], 'no worktree left registered');
}

const patchText = (r: IsolatedRunResult): string => r.patch?.toString('utf8') ?? '';

suite('isolated-run (#475 FX951)', function () {
  this.timeout(120000);
  let root = '';
  let cfg: ReturnType<typeof useGitConfig>;
  setup(() => { cfg = useGitConfig(); root = makeRepo(); });
  teardown(() => { removeRepo(root); cfg.restore(); });

  test('edit + untracked create + delete stay out of the workspace and all appear in the patch', async () => {
    const { r } = await runScript(root, `
      const fs = require('fs');
      fs.writeFileSync('a.txt', 'alpha CHANGED\\n');
      fs.mkdirSync('new', { recursive: true }); fs.writeFileSync('new/c.txt', 'charlie\\n');
      fs.unlinkSync('b.txt');`);
    assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
    assert.equal(read(root, 'a.txt'), 'alpha\n');
    assert.equal(read(root, 'b.txt'), 'bravo\n');
    assert.equal(fs.existsSync(path.join(root, 'new')), false);
    assert.deepEqual([...r.stats.paths].sort(), ['a.txt', 'b.txt', 'new/c.txt']);
    assert.match(patchText(r), /\+alpha CHANGED/);
    assert.match(patchText(r), /deleted file mode/);
    assert.equal(git(root, 'status', '--porcelain'), '');
    assertCleanedUp(root, r);
  });

  test('an agent commit inside the worktree is captured against the base commit', async () => {
    const { r } = await runScript(root, `
      const fs = require('fs'); const cp = require('child_process');
      fs.writeFileSync('a.txt', 'committed\\n');
      cp.execFileSync('git', ['commit', '-qam', 'agent']);`);
    assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
    assert.match(patchText(r), /\+committed/);
    assert.equal(git(root, 'rev-parse', 'HEAD').trim(), r.baseHead);
    assertCleanedUp(root, r);
  });

  test('a subprocess writing inside the worktree is captured', async () => {
    const { r } = await runScript(root, `
      const cp = require('child_process');
      cp.execFileSync(process.execPath, ['-e', "require('fs').writeFileSync('sub.txt', 'from child\\\\n')"]);`);
    assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
    assert.deepEqual(r.stats.paths, ['sub.txt']);
    assert.equal(fs.existsSync(path.join(root, 'sub.txt')), false);
    assertCleanedUp(root, r);
  });

  test('no changes -> NO_CHANGES', async () => {
    const { r } = await runScript(root, `/* reads only */ require('fs').readFileSync('a.txt');`);
    assert.equal(r.status, 'NO_CHANGES', r.reason);
    assertCleanedUp(root, r);
  });

  for (const [name, prepare] of [
    ['dirty tracked file', (rt: string) => fs.writeFileSync(path.join(rt, 'a.txt'), 'dirty\n')],
    ['untracked file', (rt: string) => fs.writeFileSync(path.join(rt, 'u.txt'), 'u\n')],
    ['skip-worktree entry', (rt: string) => git(rt, 'update-index', '--skip-worktree', 'a.txt')],
    ['assume-unchanged entry', (rt: string) => git(rt, 'update-index', '--assume-unchanged', 'a.txt')],
  ] as Array<[string, (rt: string) => void]>) {
    test(`${name} -> BLOCKED_PRE_EXECUTION, agent never spawned`, async () => {
      prepare(root);
      const { r, calls } = await runScript(root, `require('fs').writeFileSync('x.txt', 'x');`);
      assert.equal(r.status, 'BLOCKED_PRE_EXECUTION', r.reason);
      assert.equal(calls, 0);
      assert.equal(r.agentStarted, false);
      assert.deepEqual(extraWorktrees(root), []);
    });
  }

  test('not a git repository -> BLOCKED_PRE_EXECUTION, agent never spawned', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'fsn-'));
    try {
      const agent = scriptedAgent(`require('fs').writeFileSync('x.txt', 'x');`);
      const r = await runIsolated(plain, AGENT, { run: agent.run, timeoutMs: 60000 });
      assert.equal(r.status, 'BLOCKED_PRE_EXECUTION');
      assert.equal(agent.calls.length, 0);
    } finally { removeRepo(plain); }
  });

  test('process tracking unavailable -> BLOCKED_PRE_EXECUTION, agent never spawned', async () => {
    const agent = scriptedAgent(`require('fs').writeFileSync('x.txt', 'x');`);
    const r = await runIsolated(root, AGENT, { run: agent.run, timeoutMs: 60000, startTracker: () => Promise.reject(new Error('no sampler')) });
    assert.equal(r.status, 'BLOCKED_PRE_EXECUTION');
    assert.match(r.reason, /process tracking is unavailable/);
    assert.equal(agent.calls.length, 0);
    assert.deepEqual(extraWorktrees(root), []);
  });

  test('each run puts a fresh random FAILSAFE_ISOLATED_RUN marker in the agent env and hands it to the tracker', async () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-')), 'marker');
    const markers: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const agent = scriptedAgent(`require('fs').writeFileSync(${JSON.stringify(out)}, process.env.FAILSAFE_ISOLATED_RUN || '');`);
      const r = await runIsolated(root, AGENT, {
        run: agent.run, timeoutMs: 60000,
        startTracker: (since, marker) => { markers.push(marker); return startTreeTracker(since, process.platform, { marker }); },
      });
      assert.equal(r.status, 'NO_CHANGES', r.reason);
      seen.push(fs.readFileSync(out, 'utf8'));
    }
    assert.deepEqual(seen, markers, 'the agent sees the marker the tracker was started with');
    assert.ok(markers.every((m) => /^[0-9a-f]{32}$/.test(m)), JSON.stringify(markers));
    assert.notEqual(markers[0], markers[1], 'a new marker per run');
    removeRepo(path.dirname(out));
  });

  const direct: Array<[string, string, RegExp]> = [
    ['writes a live tracked file by absolute path', `fs.writeFileSync(path.join(live, 'a.txt'), 'pwned\\n');`, /^status:a\.txt$/],
    ['adds a hook', `fs.writeFileSync(path.join(live, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\\n');`, /^git-hooks:pre-commit$/],
    ['edits .git/config', `fs.appendFileSync(path.join(live, '.git', 'config'), '[core]\\n\\tfsmonitor = evil\\n');`, /^git:config$/],
    ['moves a ref', `cp.execFileSync('git', ['branch', 'evil']);`, /^refs$/],
    ['sets skip-worktree in the live index', `cp.execFileSync('git', ['-C', live, 'update-index', '--skip-worktree', 'a.txt']);`, /^index-flags$/],
    ['writes a top-level ignored file', `fs.writeFileSync(path.join(live, 'debug.log'), 'x');`, /^ignored:debug\.log$/],
    // Same size, mtime restored: invisible to stat-based `git status`.
    ['rewrites a live file in place keeping size and mtime', `
        const f = path.join(live, 'a.txt'); const st = fs.statSync(f);
        const fd = fs.openSync(f, 'r+'); fs.writeSync(fd, 'ALPHA\\n', 0); fs.closeSync(fd);
        fs.utimesSync(f, st.atime, st.mtime);`, /^content:a\.txt$/],
  ];
  for (const [name, body, key] of direct) {
    test(`agent ${name} -> WORKSPACE_CHANGED_DURING_RUN naming the change`, async () => {
      const { r } = await runScript(root, `
        const fs = require('fs'); const path = require('path'); const cp = require('child_process');
        const live = process.env.LIVE_ROOT;
        fs.writeFileSync('a.txt', 'legit edit\\n');
        ${body}`);
      assert.equal(r.status, 'WORKSPACE_CHANGED_DURING_RUN', r.reason);
      assert.ok(r.details.some((d) => key.test(d)), `details ${JSON.stringify(r.details)}`);
      assert.equal(r.patch, undefined, 'nothing promotable');
      assertCleanedUp(root, r);
    });
  }

  test('agent repointing its worktree .git file at the main repo -> WORKSPACE_CHANGED, real index untouched', async () => {
    const indexBefore = fs.readFileSync(path.join(root, '.git', 'index'));
    const { r } = await runScript(root, `
      const fs = require('fs'); const path = require('path');
      // Git for Windows hides the .git file; rewrite it in place rather than recreating it.
      const fd = fs.openSync('.git', 'r+'); fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, 'gitdir: ' + path.join(process.env.LIVE_ROOT, '.git') + '\\n'); fs.closeSync(fd);
      fs.writeFileSync('planted.txt', 'x');`);
    assert.equal(r.status, 'WORKSPACE_CHANGED_DURING_RUN', r.reason);
    assert.ok(r.details.some((d) => d.startsWith('worktree-link:')), JSON.stringify(r.details));
    assert.ok(fs.readFileSync(path.join(root, '.git', 'index')).equals(indexBefore), 'live index bytes unchanged');
    assert.equal(git(root, 'status', '--porcelain'), '');
    assertCleanedUp(root, r);
  });

  test('a global core.excludesFile written by the agent does not hide its new file', async () => {
    const globalCfg = process.env.GIT_CONFIG_GLOBAL ?? '';
    const { r } = await runScript(root, `
      const fs = require('fs'); const path = require('path');
      const ex = path.join(${JSON.stringify(cfg.dir)}, 'excludes');
      fs.writeFileSync(ex, 'secret.txt\\n');
      fs.appendFileSync(${JSON.stringify(globalCfg)}, '[core]\\n\\texcludesFile = ' + ex.replace(/\\\\/g, '/') + '\\n');
      fs.writeFileSync('secret.txt', 'hidden?\\n');`);
    assert.match(fs.readFileSync(globalCfg, 'utf8'), /excludesFile/, 'the agent did write the global config');
    assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
    assert.deepEqual(r.stats.paths, ['secret.txt']);
    assertCleanedUp(root, r);
  });

  test('a clean filter the agent defines in the global config never runs during capture', async () => {
    const globalCfg = process.env.GIT_CONFIG_GLOBAL ?? '';
    const marker = path.join(cfg.dir, 'filter-ran').replace(/\\/g, '/');
    const { r } = await runScript(root, `
      const fs = require('fs');
      fs.writeFileSync('.gitattributes', '*.txt filter=evil\\n');
      fs.appendFileSync(${JSON.stringify(globalCfg)}, '[filter "evil"]\\n\\tclean = touch ${marker} && cat\\n');
      fs.writeFileSync('a.txt', 'filtered?\\n');`);
    assert.match(fs.readFileSync(globalCfg, 'utf8'), /filter "evil"/, 'the agent did define the filter');
    assert.equal(fs.existsSync(marker), false, 'FailSafe git never executed the agent-defined filter');
    assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
    assertCleanedUp(root, r);
    // Positive control: ordinary git with the same global config does run it.
    const control = makeRepo({ '.gitattributes': '*.txt filter=evil\n' });
    try {
      fs.writeFileSync(path.join(control, 'a.txt'), 'control\n');
      git(control, 'add', 'a.txt');
      assert.equal(fs.existsSync(marker), true, 'the filter is runnable on this machine');
    } finally { removeRepo(control); }
  });

  // LD6: on POSIX the agent makes a real symlink (capture's `git add -A` would
  // restage a regular file as 100644). Git for Windows runs with
  // core.symlinks=false, which keeps a 120000 index entry over a regular file.
  const SYMLINK = process.platform === 'win32' ? `
        const oid = cp.execFileSync('git', ['hash-object', '-w', '--stdin'], { input: '../../outside' }).toString().trim();
        fs.writeFileSync('link', '../../outside');
        cp.execFileSync('git', ['update-index', '--add', '--cacheinfo', '120000,' + oid + ',link']);`
    : `fs.symlinkSync('../../outside', 'link');`;
  for (const [name, mode] of [['symlink', '120000'], ['submodule', '160000']] as const) {
    test(`${name} entry -> REJECTED_PATCH`, async () => {
      const head = git(root, 'rev-parse', 'HEAD').trim();
      const { r } = await runScript(root, `
        const cp = require('child_process'); const fs = require('fs');
        ${mode === '120000' ? SYMLINK : `fs.mkdirSync('link');
        cp.execFileSync('git', ['update-index', '--add', '--cacheinfo', '160000,${head},link']);`}`);
      assert.equal(r.status, 'REJECTED_PATCH', `${r.status}: ${r.reason}`);
      assert.ok(r.details.some((d) => d.includes(name)), JSON.stringify(r.details));
      assert.equal(r.patch, undefined);
      assertCleanedUp(root, r);
    });
  }

  test('a .gitmodules file -> REJECTED_PATCH', async () => {
    const { r } = await runScript(root, `require('fs').writeFileSync('.gitmodules', '[submodule "x"]\\n\\tpath = x\\n\\turl = ../x\\n');`);
    assert.equal(r.status, 'REJECTED_PATCH', r.reason);
    assertCleanedUp(root, r);
  });

  test('synchronous runner throw still cleans up the worktree and fails inconclusive', async () => {
    const r = await runIsolated(root, AGENT, {
      run: () => { throw new Error('sensitive-internal-runner-error'); },
      timeoutMs: 60000,
    });
    assert.equal(r.status, 'FAILED_INCONCLUSIVE', r.reason);
    assert.equal(r.exitCode, 127);
    assert.equal(r.patch, undefined);
    assert.equal(r.reason.includes('sensitive-internal-runner-error'), false, 'runner errors are redacted');
    assertCleanedUp(root, r);
  });

  test('rejected runner promise still cleans up and never produces a promotable patch', async () => {
    const r = await runIsolated(root, AGENT, {
      run: async () => { throw new Error('untrusted child error'); },
      timeoutMs: 60000,
    });
    assert.equal(r.status, 'FAILED_INCONCLUSIVE', r.reason);
    assert.equal(r.exitCode, 127);
    assert.equal(r.patch, undefined);
    assertCleanedUp(root, r);
  });

  test('non-zero exit -> FAILED_INCONCLUSIVE, nothing promotable', async () => {
    const { r } = await runScript(root, `require('fs').writeFileSync('a.txt', 'half\\n'); process.exit(3);`);
    assert.equal(r.status, 'FAILED_INCONCLUSIVE');
    assert.equal(r.exitCode, 3);
    assert.equal(r.patch, undefined);
    assert.equal(read(root, 'a.txt'), 'alpha\n');
    assertCleanedUp(root, r);
  });

  test('timeout -> FAILED_INCONCLUSIVE and the agent is stopped', async () => {
    const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsp-')), 'pid');
    const { r } = await runScript(root, `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`, {}, 4000);
    assert.equal(r.status, 'FAILED_INCONCLUSIVE');
    assert.match(r.reason, /did not finish within 4000 ms/);
    assert.equal(isAlive(Number(fs.readFileSync(pidFile, 'utf8'))), false);
    assertCleanedUp(root, r);
  });

  test('a detached child left behind by the agent is killed before the snapshot', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsp-'));
    const pidFile = path.join(dir, 'pid');
    const childScript = path.join(dir, 'child.js');
    fs.writeFileSync(childScript, `
      const fs = require('fs'); const path = require('path');
      fs.writeFileSync(process.env.PID_FILE, String(process.pid));
      setTimeout(() => fs.writeFileSync(path.join(process.env.LIVE_ROOT, 'late.txt'), 'late'), 8000);`);
    const { r } = await runScript(root, `
      const cp = require('child_process'); const fs = require('fs');
      cp.spawn(process.execPath, [process.env.CHILD_SCRIPT], { detached: true, stdio: 'ignore' }).unref();
      const t = Date.now(); while (!fs.existsSync(process.env.PID_FILE) && Date.now() - t < 5000) { /* wait */ }
      fs.writeFileSync('a.txt', 'edit\\n');`, { PID_FILE: pidFile, CHILD_SCRIPT: childScript });
    const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.equal(isAlive(childPid), false, 'detached child killed');
    assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
    await new Promise((res) => setTimeout(res, 9000));
    assert.equal(fs.existsSync(path.join(root, 'late.txt')), false, 'the child never got to write');
    assertCleanedUp(root, r);
    removeRepo(dir);
  });
});
