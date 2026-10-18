// #532 part B (plan-532b LD4/LD10): the git reads behind the committed-under edge, on temp
// `git init` repositories (each test makes its own repository, so the host's C:\ repository
// is never the one read).
//
// The 50-commit bound, separators in subjects, an unborn repository (told apart from a
// repository git cannot read by sourceShaOf's exit 1), cat-file hit and miss, the tree,
// diff-tree --root with its 500-file cap, a detached HEAD, a failing resolver ->
// unavailable, the exact argv of every call, no shell, and a non-hex target never
// reaching git.

import { strict as assert } from 'assert';
import type { SpawnSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  changedFiles, currentBranch, DELIVERY_GIT_SUBCOMMANDS, listRecentCommits, resolveCommit,
} from '../../../governance/delivery/deliveryGit';
import { makeArchitectureGit, type ArchitectureGit, type GitOutcome } from '../../../governance/architecture/ArchitectureIndexDiscovery';
import { TrustedGitUnavailable } from '../../../shared/git/trustedGit';

// The module object itself (an `import * as` namespace is a copy), so a patched spawnSync is the one the runner calls.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const childProcess = require('child_process') as typeof import('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const made: string[] = [];

function git(root: string, ...args: string[]): string {
  const r = childProcess.spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

function commit(root: string, message: string, allowEmpty = true): void {
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', ...(allowEmpty ? ['--allow-empty'] : []), '-m', message);
}

function repo(): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-delivery-git-')));
  made.push(root);
  git(root, 'init', '-q');
  return root;
}

function recording(inner: ArchitectureGit = makeArchitectureGit()): { git: ArchitectureGit; calls: string[][] } {
  const calls: string[][] = [];
  return { calls, git: (root, args) => { calls.push([...args]); return inner(root, args); } };
}

suite('deliveryGit (#532 LD4)', () => {
  suiteTeardown(() => { for (const d of made) removeTempTree(d); });

  test('lists at most 50 commits from HEAD, newest first, with the branch', function () {
    this.timeout(60000);
    const root = repo();
    for (let i = 1; i <= 55; i += 1) commit(root, `commit ${i}`);
    const out = listRecentCommits(root);
    assert.equal(out.state, 'ok');
    const ok = out as Extract<typeof out, { state: 'ok' }>;
    assert.equal(ok.commits.length, 50);
    assert.equal(ok.commits[0].sha, git(root, 'rev-parse', 'HEAD'));
    assert.equal(ok.head, ok.commits[0].sha);
    assert.equal(ok.commits[0].subject, 'commit 55');
    assert.equal(ok.commits[49].subject, 'commit 6');
    assert.equal(ok.branch, git(root, 'symbolic-ref', '--short', 'HEAD'));
  });

  test('subjects keep separators: pipes, tabs, percent signs and the unit separator itself', () => {
    const root = repo();
    const subject = 'fix: a | b\tc %x1f d \u001f e';
    commit(root, subject);
    const out = listRecentCommits(root) as Extract<ReturnType<typeof listRecentCommits>, { state: 'ok' }>;
    assert.equal(out.commits.length, 1);
    assert.match(out.commits[0].sha, /^[0-9a-f]{40}$/);
    assert.equal(out.commits[0].subject, subject);
  });

  test('an unborn repository is unborn (sourceShaOf exit 1) and log is never run', () => {
    const root = repo();
    const rec = recording();
    const out = listRecentCommits(root, rec.git);
    assert.equal(out.state, 'unborn');
    assert.equal(rec.calls.some((a) => a[0] === 'log'), false, 'no git log on an unborn repository');
  });

  test('a repository git cannot read (exit 128) is unavailable, not unborn', () => {
    const fake: ArchitectureGit = (): GitOutcome => ({ kind: 'exit', status: 128, stderr: 'fatal: not a git repository' });
    assert.equal(listRecentCommits('X:\\nowhere', fake).state, 'unavailable');
  });

  test('cat-file finds HEAD with its tree and misses an absent commit', () => {
    const root = repo();
    commit(root, 'one');
    const head = git(root, 'rev-parse', 'HEAD');
    assert.deepEqual(resolveCommit(root, head), { state: 'found', sha: head, tree: git(root, 'rev-parse', 'HEAD^{tree}') });
    assert.equal(resolveCommit(root, '0'.repeat(40)).state, 'missing');
    assert.equal(resolveCommit(root, 'f'.repeat(64)).state, 'missing');
  });

  test('a target that is not a full commit name is missing and never reaches git', () => {
    const rec = recording();
    for (const bad of ['--output=x', 'HEAD', 'a'.repeat(39), 'A'.repeat(40), `${'a'.repeat(40)}\n`, 'a'.repeat(50)]) {
      assert.equal(resolveCommit('X:\\nowhere', bad, rec.git).state, 'missing', JSON.stringify(bad));
      assert.equal(changedFiles('X:\\nowhere', bad, rec.git), null);
    }
    assert.deepEqual(rec.calls, []);
  });

  test('diff-tree --root lists a root commit\'s files and caps the list at 500', function () {
    this.timeout(60000);
    const root = repo();
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    git(root, 'add', '-A');
    commit(root, 'root', false);
    const first = git(root, 'rev-parse', 'HEAD');
    assert.deepEqual(changedFiles(root, first), { files: ['a.txt'], truncated: false });
    fs.mkdirSync(path.join(root, 'many'));
    for (let i = 0; i < 501; i += 1) fs.writeFileSync(path.join(root, 'many', `f${String(i).padStart(3, '0')}.txt`), String(i));
    git(root, 'add', '-A');
    commit(root, 'many', false);
    const many = changedFiles(root, git(root, 'rev-parse', 'HEAD'));
    assert.ok(many);
    assert.equal(many!.files.length, 500);
    assert.equal(many!.truncated, true);
  });

  test('a detached HEAD has branch null', () => {
    const root = repo();
    commit(root, 'one');
    git(root, 'checkout', '-q', '--detach');
    assert.equal(currentBranch(root), null);
    const out = listRecentCommits(root) as Extract<ReturnType<typeof listRecentCommits>, { state: 'ok' }>;
    assert.equal(out.branch, null);
  });

  test('a failing resolver makes every read unavailable', () => {
    const root = repo();
    commit(root, 'one');
    const head = git(root, 'rev-parse', 'HEAD');
    const failing = makeArchitectureGit(() => { throw new TrustedGitUnavailable([]); });
    assert.equal(listRecentCommits(root, failing).state, 'unavailable');
    assert.equal(resolveCommit(root, head, failing).state, 'unavailable');
  });

  test('every call uses the exact argv, an allowlisted subcommand and no shell', () => {
    const root = repo();
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    git(root, 'add', '-A');
    commit(root, 'root', false);
    const head = git(root, 'rev-parse', 'HEAD');
    const spawned: Array<{ args: string[]; opts: SpawnSyncOptions }> = [];
    const original = childProcess.spawnSync;
    (childProcess as { spawnSync: unknown }).spawnSync = (cmd: string, args: string[], opts: SpawnSyncOptions) => {
      spawned.push({ args, opts });
      return original(cmd, args, opts);
    };
    const rec = recording();
    try {
      listRecentCommits(root, rec.git);
      resolveCommit(root, head, rec.git);
      changedFiles(root, head, rec.git);
    } finally {
      (childProcess as { spawnSync: unknown }).spawnSync = original;
    }
    assert.deepEqual(rec.calls, [
      ['rev-parse', '--verify', '--quiet', 'HEAD'],
      ['log', '-z', '-n', '50', '--format=%H%x1f%s', 'HEAD'],
      ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      ['cat-file', '-e', '--end-of-options', `${head}^{commit}`],
      ['rev-parse', '--verify', '--quiet', '--end-of-options', `${head}^{tree}`],
      ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--root', '--end-of-options', head],
    ]);
    for (const a of rec.calls) assert.ok(DELIVERY_GIT_SUBCOMMANDS.has(a[0]), a[0]);
    assert.equal(spawned.length, rec.calls.length, 'one process per call');
    for (const s of spawned) {
      assert.equal(s.opts.shell, false);
      assert.equal(s.opts.windowsHide, true);
      assert.ok(Number(s.opts.timeout) > 0);
      assert.ok(Number(s.opts.maxBuffer) > 0);
    }
  });
});
