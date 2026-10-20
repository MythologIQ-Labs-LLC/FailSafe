// #532 (plan-532c LD8/LD10, B284): readWorkspaceHead reads the workspace HEAD from disk, and agrees
// with `git rev-parse HEAD` for each layout (W1-W7). Unsafe or unhandled input gives "unknown" with
// no read of the named path (W6, W9). The reftable layout is the only one that uses the fallback.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { sourceShaOf } from '../../governance/architecture/ArchitectureIndexBootstrap';
import { defaultHeadIo, readWorkspaceHead, UNKNOWN_HEAD, type HeadIo } from '../../roadmap/services/workspaceHead';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false',
    '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', ...args], { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}
const commit = (cwd: string, msg: string): string => { git(cwd, 'commit', '-q', '--allow-empty', '-m', msg); return git(cwd, 'rev-parse', 'HEAD'); };

/** An io that records every path it is asked about. */
function spyIo(): { io: HeadIo; seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    io: {
      readText: (p, max) => { seen.push(p); return defaultHeadIo.readText(p, max); },
      stat: (p) => { seen.push(p); return defaultHeadIo.stat(p); },
    },
  };
}

suite('workspaceHead (#532 B284)', () => {
  const roots: string[] = [];
  const tempDir = (prefix: string): string => {
    const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    roots.push(d);
    return d;
  };
  const repo = (prefix = 'fs-head-'): string => { const d = tempDir(prefix); git(d, 'init', '-q'); return d; };
  teardown(() => { for (const r of roots.splice(0)) removeTempTree(r); });

  const noFallback = () => { throw new Error('the fallback must not run for this layout'); };

  test('W1: a loose branch ref', () => {
    const r = repo();
    const head = commit(r, 'one');
    assert.equal(readWorkspaceHead(r, { fallback: noFallback }), head);
  });

  test('W2: a packed-refs-only branch, with an annotated tag whose ^peeled line is skipped; a re-pack is seen', () => {
    const r = repo();
    commit(r, 'one');
    git(r, 'tag', '-a', 'v1', '-m', 'annotated');
    const head = commit(r, 'two');
    git(r, 'pack-refs', '--all');
    const branch = git(r, 'symbolic-ref', '--short', 'HEAD');
    assert.equal(fs.existsSync(path.join(r, '.git', 'refs', 'heads', branch)), false, 'the branch is only in packed-refs');
    assert.match(fs.readFileSync(path.join(r, '.git', 'packed-refs'), 'utf8'), /^\^[0-9a-f]{40}/m, 'packed-refs has a peeled line');
    assert.equal(readWorkspaceHead(r, { fallback: noFallback }), head);
    const next = commit(r, 'three');
    git(r, 'pack-refs', '--all');
    assert.equal(readWorkspaceHead(r, { fallback: noFallback }), next, 'a changed packed-refs is re-read');
  });

  test('W3: a detached HEAD', () => {
    const r = repo();
    const first = commit(r, 'one');
    commit(r, 'two');
    git(r, 'checkout', '-q', '--detach', first);
    assert.equal(readWorkspaceHead(r, { fallback: noFallback }), first);
  });

  test('W4: a linked worktree (.git file plus commondir)', () => {
    const r = repo();
    commit(r, 'one');
    const wtParent = tempDir('fs-head-wt-');
    const wt = path.join(wtParent, 'wt');
    git(r, 'worktree', 'add', '-q', '-b', 'side', wt);
    const head = commit(wt, 'on side');
    assert.ok(fs.statSync(path.join(wt, '.git')).isFile(), 'the worktree has a .git file');
    assert.equal(readWorkspaceHead(wt, { fallback: noFallback }), head);
    assert.equal(readWorkspaceHead(wt, { fallback: noFallback }), git(wt, 'rev-parse', 'HEAD'));
    assert.notEqual(readWorkspaceHead(r, { fallback: noFallback }), head, 'the main worktree has its own HEAD');
    git(r, 'worktree', 'remove', '--force', wt);
  });

  test('W5: a workspace that is a subdirectory of the repository', () => {
    const r = repo();
    fs.mkdirSync(path.join(r, 'pkg', 'inner'), { recursive: true });
    const head = commit(r, 'one');
    assert.equal(readWorkspaceHead(path.join(r, 'pkg', 'inner'), { fallback: noFallback }), head);
  });

  test('W6: unborn, no repository (sandboxed io) and a malformed HEAD read unknown', () => {
    const unborn = repo();
    assert.equal(readWorkspaceHead(unborn, { fallback: noFallback }), UNKNOWN_HEAD);
    // The host's drive root can itself be a repository, so "no repository" is shown with an io
    // that sees nothing outside the temp directory.
    const plain = tempDir('fs-head-none-');
    const sandbox: HeadIo = {
      readText: (p, max) => (p.startsWith(plain) ? defaultHeadIo.readText(p, max) : null),
      stat: (p) => (p.startsWith(plain) ? defaultHeadIo.stat(p) : null),
    };
    assert.equal(readWorkspaceHead(plain, { io: sandbox, fallback: noFallback }), UNKNOWN_HEAD);
    const bad = repo();
    commit(bad, 'one');
    fs.writeFileSync(path.join(bad, '.git', 'HEAD'), 'not a ref\n');
    assert.equal(readWorkspaceHead(bad, { fallback: noFallback }), UNKNOWN_HEAD);
    fs.writeFileSync(path.join(bad, '.git', 'HEAD'), `${'z'.repeat(40)}\n`);
    assert.equal(readWorkspaceHead(bad, { fallback: noFallback }), UNKNOWN_HEAD);
  });

  test('W7: a reftable repository uses the fallback exactly once and records the right HEAD', function () {
    this.timeout(20000);
    const r = tempDir('fs-head-reftable-');
    const init = spawnSync('git', ['init', '-q', '--ref-format=reftable'], { cwd: r, encoding: 'utf8', windowsHide: true });
    let expected: string | null;
    if (init.status === 0) {
      expected = commit(r, 'one');
    } else {
      console.log(`  reftable synthesized: git ${git(r, 'version')} has no --ref-format`);
      git(r, 'init', '-q');
      commit(r, 'one');
      fs.mkdirSync(path.join(r, '.git', 'reftable'));
      expected = git(r, 'rev-parse', 'HEAD');
    }
    let calls = 0;
    const got = readWorkspaceHead(r, { fallback: (root) => { calls += 1; return sourceShaOf(root).sourceSha; } });
    assert.equal(calls, 1);
    assert.equal(got, expected);
  });

  test('W9: UNC and device paths and invalid ref names give unknown with no read of the named path', () => {
    const B = '\\';
    const forms = [`${B}${B}server${B}share${B}repo`, '//server/share/repo', `${B}${B}?${B}C:${B}repo`, `${B}${B}.${B}pipe${B}x`];
    const unsafe = (p: string) => p.startsWith(`${B}${B}`) || p.startsWith('//');
    for (const form of forms) {
      const d = tempDir('fs-head-unc-');
      fs.writeFileSync(path.join(d, '.git'), `gitdir: ${form}\n`);
      const spy = spyIo();
      assert.equal(readWorkspaceHead(d, { io: spy.io, fallback: noFallback }), UNKNOWN_HEAD, form);
      assert.deepEqual(spy.seen.filter(unsafe), [], `no read of ${form}`);
      // The same forms in a linked worktree's commondir.
      const r = repo();
      commit(r, 'one');
      const gd = path.join(r, '.git', 'worktrees', 'x');
      fs.mkdirSync(gd, { recursive: true });
      fs.writeFileSync(path.join(gd, 'HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(gd, 'commondir'), `${form}\n`);
      const w = tempDir('fs-head-cd-');
      fs.writeFileSync(path.join(w, '.git'), `gitdir: ${gd}\n`);
      const spy2 = spyIo();
      assert.equal(readWorkspaceHead(w, { io: spy2.io, fallback: noFallback }), UNKNOWN_HEAD, `commondir ${form}`);
      assert.deepEqual(spy2.seen.filter(unsafe), [], `no read of commondir ${form}`);
    }
    for (const ref of ['refs/heads/../../outside', 'refs/heads/a..b', 'refs/heads/x.lock', 'refs/heads/a b', 'HEAD', 'refs/heads/.hidden', 'refs/heads/a@{1}']) {
      const r = repo();
      commit(r, 'one');
      fs.writeFileSync(path.join(r, '.git', 'HEAD'), `ref: ${ref}\n`);
      const spy = spyIo();
      assert.equal(readWorkspaceHead(r, { io: spy.io, fallback: noFallback }), UNKNOWN_HEAD, ref);
      assert.deepEqual(spy.seen.filter((p) => p.includes('outside')), [], `no read outside the common dir for ${ref}`);
    }
  });

  test('W10 (review N4): a symbolic link or junction whose target is a UNC or device path is refused before the path is read', () => {
    const B = '\\';
    const unc = `${B}${B}server${B}share${B}repo`;
    // Deterministic on every host: an io whose lstat reports `.git` (or the gitdir it names) as a
    // link to a UNC target. The named path is never stat-ed or read through the inner io.
    const d = tempDir('fs-head-link-');
    const realGit = repo();
    commit(realGit, 'one');
    for (const linked of [path.join(d, '.git'), path.join(realGit, '.git')]) {
      if (linked.startsWith(d)) fs.writeFileSync(path.join(d, '.git'), `gitdir: ${path.join(realGit, '.git')}\n`);
      const spy = spyIo();
      const io: HeadIo = {
        ...spy.io,
        lstat: (p) => (p === linked ? ({ isSymbolicLink: () => true } as unknown as fs.Stats) : (() => { try { return fs.lstatSync(p); } catch { return null; } })()),
        readlink: (p) => (p === linked ? unc : null),
      };
      const root = linked.startsWith(d) ? d : realGit;
      assert.equal(readWorkspaceHead(root, { io, fallback: noFallback }), UNKNOWN_HEAD, linked);
      assert.ok(!spy.seen.some((p) => p === linked || p.startsWith(`${linked}${path.sep}`)), `${linked} is never stat-ed or read`);
    }
    // A real link when the host allows creating one (Windows needs Developer Mode or elevation).
    const host = tempDir('fs-head-reallink-');
    const target = process.platform === 'win32' ? unc : '//server/share/repo';
    try {
      fs.symlinkSync(target, path.join(host, '.git'), 'dir');
    } catch (e) {
      console.log(`  W10: a real symbolic link could not be created on this host (${(e as NodeJS.ErrnoException).code}); the injected-io rows above cover the check`);
      return;
    }
    const spy = spyIo();
    assert.equal(readWorkspaceHead(host, { io: spy.io, fallback: noFallback }), UNKNOWN_HEAD);
    assert.ok(!spy.seen.some((p) => p.startsWith(path.join(host, '.git'))), 'the link is never followed');
  });
});
