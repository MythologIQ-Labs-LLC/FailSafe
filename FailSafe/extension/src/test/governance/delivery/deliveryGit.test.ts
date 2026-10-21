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
  changedFiles, changedPaths, commitParents, commitSubject, currentBranch, DELIVERY_GIT_SUBCOMMANDS, DIFF_IDENTITY_ARGS, diffIdentity, isAncestor,
  listRecentCommits, resolveCommit,
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

// #532 B320 (plan-b320 LD2/LD6, audit should-fix 7): merge-base --is-ancestor and the commit subject.
suite('deliveryGit ancestry (#532 B320)', () => {
  teardown(() => { for (const d of made.splice(0)) removeTempTree(d); });

  test('exit 0 is an ancestor, exit 1 is not, any other exit is unavailable; equal names need no git call', () => {
    const root = repo();
    commit(root, 'a');
    const a = git(root, 'rev-parse', 'HEAD');
    commit(root, 'b <subject>');
    const b = git(root, 'rev-parse', 'HEAD');
    const real = makeArchitectureGit();
    const calls: string[][] = [];
    const rec: ArchitectureGit = (r, args) => { calls.push([...args]); return real(r, args); };
    assert.equal(isAncestor(root, a, b, rec), 'ancestor');
    assert.equal(isAncestor(root, b, a, rec), 'not-ancestor');
    assert.deepEqual(calls[0], ['merge-base', '--is-ancestor', '--end-of-options', a, b]);
    calls.length = 0;
    assert.equal(isAncestor(root, a, a, rec), 'ancestor');
    assert.equal(calls.length, 0, 'equal names: no git call');
    assert.equal(isAncestor(root, 'HEAD', b, rec), 'unavailable');
    assert.equal(isAncestor(root, '--output=x', b, rec), 'unavailable');
    assert.equal(calls.length, 0, 'a name that is not a full object name never reaches git');
    assert.equal(isAncestor(root, 'e'.repeat(40), b, rec), 'unavailable', 'a bad object exits 128: unavailable, never "not an ancestor"');
    const exit = (status: number): ArchitectureGit => () => ({ kind: 'exit', status, stderr: '' } as GitOutcome);
    assert.equal(isAncestor(root, a, b, exit(1)), 'not-ancestor');
    assert.equal(isAncestor(root, a, b, exit(2)), 'unavailable');
    assert.equal(isAncestor(root, a, b, () => ({ kind: 'unavailable', detail: 'x' })), 'unavailable');
    assert.equal(commitSubject(root, b, real), 'b <subject>');
    assert.equal(commitSubject(root, 'HEAD', real), null);
  });
});

// #532 B344 (plan-b344 LD6/LD7): the diff identity, the parents and the changed paths behind the
// rework relation. Red-first unless marked; "non-object name never reaches git" is a regression
// guard (resolveCommit already refused such names on main).
suite('deliveryGit rework reads (#532 B344)', () => {
  teardown(() => { for (const d of made.splice(0)) removeTempTree(d); });
  const write = (root: string, f: string, c: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), c); };
  const real = makeArchitectureGit();
  function setup(): string {
    const root = repo();
    git(root, 'config', 'core.autocrlf', 'false');
    write(root, 'base.txt', 'base\n');
    git(root, 'add', '-A');
    commit(root, 'base', false);
    return root;
  }
  const head = (root: string) => git(root, 'rev-parse', 'HEAD');

  test('diffIdentity: equal for a cherry-pick, different for an edit, none for a merge, an empty commit and a non-UTF-8 file', () => {
    const root = setup();
    const base = head(root);
    write(root, 'a.ts', 'one\ntwo\n');
    git(root, 'add', '-A'); commit(root, 'b', false);
    const b = head(root);
    git(root, 'checkout', '-q', '--detach', base);
    write(root, 'c.ts', 'c\n');
    git(root, 'add', '-A'); commit(root, 'c', false);
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@failsafe.invalid', '-c', 'commit.gpgsign=false', 'cherry-pick', b);
    const picked = head(root);
    const ib = diffIdentity(root, b, real);
    const ip = diffIdentity(root, picked, real);
    assert.equal(ib.state, 'ok');
    assert.match((ib as { id: string }).id, /^[0-9a-f]{64}$/);
    assert.deepEqual(ip, ib, 'a cherry-pick has the same diff identity');
    write(root, 'a.ts', 'one\nTWO\n');
    git(root, 'add', '-A'); commit(root, 'edit', false);
    assert.notDeepEqual(diffIdentity(root, head(root), real), ib, 'an edit differs');
    commit(root, 'empty', true);
    assert.deepEqual(diffIdentity(root, head(root), real), { state: 'none', reason: 'empty' });
    git(root, 'checkout', '-q', '--detach', b);
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@failsafe.invalid', '-c', 'commit.gpgsign=false', 'merge', '-q', '--no-ff', '-m', 'm', picked);
    assert.equal(diffIdentity(root, head(root), real).state, 'none', 'a merge has no diff identity');
    write(root, 'bin.txt', Buffer.from([0x61, 0xff, 0xfe, 0x0a]));
    git(root, 'add', '-A'); commit(root, 'bytes', false);
    assert.deepEqual(diffIdentity(root, head(root), real), { state: 'none', reason: 'undecodable' });
  });

  test('diffIdentity: the strip regexes are line-anchored (a "+index ..." content line is kept)', () => {
    const root = setup();
    const base = head(root);
    write(root, 'n.txt', 'index 1234567..89abcde\n');
    git(root, 'add', '-A'); commit(root, 'one', false);
    const one = diffIdentity(root, head(root), real);
    git(root, 'checkout', '-q', '--detach', base);
    write(root, 'n.txt', 'index 7654321..89abcde\n');
    git(root, 'add', '-A'); commit(root, 'two', false);
    const two = diffIdentity(root, head(root), real);
    assert.equal(one.state, 'ok');
    assert.notDeepEqual(one, two, 'content lines that look like index headers are part of the identity');
  });

  test('diffIdentity: the exact argv pins every diff flag; a diff driver configured for histogram cannot change the identity (needs git >= 2.40; fails, never skips)', () => {
    const root = setup();
    const before = ['{', 'c', 'b', '}', '}', '}', 'b', 'a', '', 'a'];
    const after = ['}', 'b', '{', 'c', 'a', '', '{', '}', '{', 'b'];
    write(root, 't.txt', before.join('\n') + '\n');
    git(root, 'add', '-A'); commit(root, 'before', false);
    write(root, 't.txt', after.join('\n') + '\n');
    git(root, 'add', '-A'); commit(root, 'after', false);
    const sha = head(root);
    const calls: string[][] = [];
    const baseline = diffIdentity(root, sha, (r, a) => { calls.push([...a]); return real(r, a); });
    assert.equal(baseline.state, 'ok');
    assert.match((baseline as { id: string }).id, /^[0-9a-f]{64}$/);
    assert.deepEqual(calls[calls.length - 1], ['diff-tree', ...DIFF_IDENTITY_ARGS, '--end-of-options', sha]);
    for (const flag of ['--diff-algorithm=myers', '--no-indent-heuristic', '--no-renames', '--unified=3', '--no-ext-diff', '--no-textconv', '--binary']) {
      assert.ok(DIFF_IDENTITY_ARGS.includes(flag), flag);
    }
    write(root, '.gitattributes', '* diff=x\n');
    git(root, 'config', 'diff.x.algorithm', 'histogram');
    git(root, 'config', 'diff.indentHeuristic', 'false');
    const pinned = git(root, 'diff-tree', ...DIFF_IDENTITY_ARGS, '--end-of-options', sha);
    const unpinned = git(root, 'diff-tree', '-p', '--no-commit-id', sha);
    assert.notEqual(unpinned, pinned, 'self-check: the configured driver must change the unpinned diff (git >= 2.40), or this row proves nothing');
    assert.deepEqual(diffIdentity(root, sha, real), baseline, 'the pinned identity ignores the configuration');
  });

  test('commitParents lists the parents (none for a root commit, two for a merge)', () => {
    const root = setup();
    const base = head(root);
    assert.deepEqual(commitParents(root, base, real), { state: 'ok', parents: [] });
    commit(root, 'next', true);
    const next = head(root);
    assert.deepEqual(commitParents(root, next, real), { state: 'ok', parents: [base] });
    git(root, 'checkout', '-q', '--detach', base);
    commit(root, 'side', true);
    const side = head(root);
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@failsafe.invalid', '-c', 'commit.gpgsign=false', 'merge', '-q', '--no-ff', '-m', 'm', next);
    assert.deepEqual(commitParents(root, head(root), real), { state: 'ok', parents: [side, next] });
    assert.equal(commitParents(root, base, () => ({ kind: 'unavailable', detail: 'x' })).state, 'unavailable');
  });

  test('changedPaths: A, M, D and T statuses with no cap; a git exit is unavailable (review fold: it was "missing")', () => {
    const root = setup();
    write(root, 'm.txt', '1\n'); write(root, 'd.txt', '1\n'); write(root, 't.txt', '1\n');
    git(root, 'add', '-A'); commit(root, 'files', false);
    write(root, 'm.txt', '2\n'); fs.rmSync(path.join(root, 'd.txt')); write(root, 'a.txt', '1\n');
    git(root, 'add', '-A');
    // A type change: t.txt becomes a symlink in the index (no filesystem symlink needed).
    const blob = spawnSyncGit(root, ['hash-object', '-w', '--stdin'], 'base.txt');
    git(root, 'update-index', '--cacheinfo', `120000,${blob},t.txt`);
    commit(root, 'changes', false);
    const out = changedPaths(root, head(root), real);
    assert.equal(out.state, 'ok');
    assert.deepEqual((out as { paths: Array<{ status: string; path: string; showable: boolean }> }).paths.map((p) => `${p.status} ${p.path} ${p.showable}`).sort(),
      ['A a.txt true', 'D d.txt true', 'M m.txt true', 'T t.txt true']);
    assert.equal(changedPaths(root, 'e'.repeat(40), real).state, 'unavailable', 'a bad object exits 128: unavailable');
    assert.equal(changedPaths(root, head(root), () => ({ kind: 'unavailable', detail: 'x' })).state, 'unavailable');
  });

  test('B344 review fold (red-first): a git exit and a name that is not a full object name are unavailable for changedPaths, as for diffIdentity and commitParents', () => {
    const root = setup();
    const exit: ArchitectureGit = () => ({ kind: 'exit', status: 128, stderr: 'fatal: bad object' } as GitOutcome);
    for (const read of [changedPaths, diffIdentity, commitParents] as const) {
      assert.equal(read(root, head(root), exit).state, 'unavailable', `${read.name}: an exit`);
      assert.equal(read(root, 'HEAD', real).state, 'unavailable', `${read.name}: not a full object name`);
    }
  });

  test('changedPaths fails closed on output it cannot parse: an unknown status, an unpaired field, a trailing record with no path, an empty path', () => {
    const root = setup();
    const sha = head(root);
    // 'M\0\0' (an even-count record with an empty path) was added after the implementation, for the
    // "empty-path check off" mutation (K35b); it is not red-first evidence.
    for (const stdout of ['X\0a.txt\0', 'M\0', 'M\0a.txt\0D', 'R100\0a\0b\0', 'M\0\0']) {
      assert.equal(changedPaths(root, sha, () => ({ kind: 'ok', stdout })).state, 'unavailable', JSON.stringify(stdout));
    }
    assert.deepEqual(changedPaths(root, sha, () => ({ kind: 'ok', stdout: 'M\0f\uFFFD.ts\0' })),
      { state: 'ok', paths: [{ status: 'M', path: 'f\uFFFD.ts', showable: false }] }, 'a path that decoded with U+FFFD is unshowable');
  });

  test('regression guard: a name that is not a full object name never reaches git', () => {
    const calls: string[][] = [];
    const rec: ArchitectureGit = (r, a) => { calls.push([...a]); return real(r, a); };
    for (const bad of ['HEAD', '--output=x', 'e'.repeat(39)]) {
      diffIdentity('.', bad, rec); commitParents('.', bad, rec); changedPaths('.', bad, rec);
    }
    assert.equal(calls.length, 0);
  });
});

function spawnSyncGit(root: string, args: string[], stdinFile: string): string {
  const r = childProcess.spawnSync('git', args, { cwd: root, input: fs.readFileSync(path.join(root, stdinFile)), encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
  return String(r.stdout).trim();
}
