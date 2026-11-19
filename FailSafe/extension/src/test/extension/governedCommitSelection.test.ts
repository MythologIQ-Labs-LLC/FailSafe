// Real-Git admission tests for #715 directory selection manifests.
// Deliberately use disposable repositories, no GitHub remote or authenticated PR.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { defaultGitRunner, type GitRunner } from '../../extension/governedCommit';
import { snapshotExactSelection, sameExactSelection } from '../../extension/governedCommitSelection';
import { runGovernedCommitFlow } from '../../extension/governedCommitFlow';

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr || args.join(' '));
  return r.stdout.trim();
}

suite('#715 exact-directory manifest, real Git', () => {
  let root = '';
  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-exact-directory-'));
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'FailSafe test');
    git(root, 'config', 'user.email', 'fixture@failsafe.invalid');
    git(root, 'config', 'commit.gpgsign', 'false');
    fs.mkdirSync(path.join(root, 'docs'));
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  test('untracked directory is expanded to reviewed individual filenames, not "docs/"', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# approved\n');
    const first = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(first.ok, true, JSON.stringify(first));
    if (!first.ok) return;
    assert.deepEqual(first.selection.files.map(f => f.path), ['docs/approved.md']);
    assert.equal(first.selection.files[0].state, '??');
    assert.match(first.selection.files[0].blob ?? '', /^[a-f0-9]{40,64}$/);
    const again = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(sameExactSelection(first.selection, again.selection), true);
  });

  test('new descendant after checkpoint changes the manifest; content change also changes it', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# reviewed\n');
    const first = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    fs.writeFileSync(path.join(root, 'docs', 'unreviewed.md'), 'not consented\n');
    const second = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(sameExactSelection(first.selection, second.selection), false);
    assert.deepEqual(second.selection.files.map(f => f.path), ['docs/approved.md', 'docs/unreviewed.md']);
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# changed after review\n');
    const third = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(third.ok, true);
    if (third.ok) assert.equal(sameExactSelection(second.selection, third.selection), false);
  });

  test('nested workspace returns workspace-relative exact filenames', async () => {
    const nested = path.join(root, 'docs');
    fs.mkdirSync(path.join(nested, 'sub'));
    fs.writeFileSync(path.join(nested, 'sub', 'file.md'), 'nested\n');
    const result = await snapshotExactSelection(defaultGitRunner, nested, ['sub/']);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) assert.deepEqual(result.selection.files.map(f => f.path), ['sub/file.md']);
  });

  test('tracked deletion in selected directory has an explicit null blob', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'deleted.md'), 'old\n');
    git(root, 'add', '--', 'docs/deleted.md');
    git(root, 'commit', '-qm', 'baseline');
    fs.rmSync(path.join(root, 'docs', 'deleted.md'));
    const result = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) {
      assert.deepEqual(result.selection.files.map(f => f.path), ['docs/deleted.md']);
      assert.equal(result.selection.files[0].blob, null);
      assert.match(result.selection.files[0].state, /D/);
    }
  });

  test('more than 64 untracked files refuse rather than silently truncate approval', async () => {
    for (let i = 0; i < 65; i++) fs.writeFileSync(path.join(root, 'docs', 'a' + i + '.md'), 'x\n');
    const result = await snapshotExactSelection(defaultGitRunner, root, ['docs/']);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.warning, /64 changed files/i);
  });

  test('unreadable, misleading or truncated porcelain cannot authorize any filenames', async () => {
    const cases = [
      { code: 1, stdout: '', stderr: 'refused' },
      { code: 0, stdout: '?? docs/approved.md', stderr: '' },
      { code: 0, stdout: '?? docs/../private.md\0', stderr: '' },
      { code: 0, stdout: '?? docs/evil\nname.md\0', stderr: '' },
    ];
    for (const injected of cases) {
      const guard: GitRunner = async (args, cwd) => args[0] === 'status'
        ? injected : defaultGitRunner(args, cwd);
      const result = await snapshotExactSelection(guard, root, ['docs/']);
      assert.equal(result.ok, false, JSON.stringify(result));
    }
  });

  test('a symlinked selected file is refused before any content hashing', async () => {
    if (process.platform === 'win32') return; // Symlink creation is privileged on some Windows hosts.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-symlink-target-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret.md'), 'not workspace content\n');
      fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'docs', 'link.md'));
      const calls: string[][] = [];
      const guarded: GitRunner = async (args, cwd) => {
        calls.push(args);
        if (args[0] === 'hash-object') throw new Error('hashing a symlink target is forbidden');
        return defaultGitRunner(args, cwd);
      };
      const result = await snapshotExactSelection(guarded, root, ['docs/']);
      assert.equal(result.ok, false, JSON.stringify(result));
      if (!result.ok) assert.match(result.warning, /symlink|regular file|outside workspace/i);
      assert.equal(calls.some(args => args[0] === 'hash-object'), false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('pre-approval file hashes never invoke configured Git clean filters', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), 'original\n');
    const calls: string[][] = [];
    const captureOnly: GitRunner = async (args, cwd) => {
      calls.push(args);
      if (args[0] === 'hash-object' && !args.includes('--no-filters')) {
        throw new Error('Git filter capable hashing occurred before consent');
      }
      return defaultGitRunner(args, cwd);
    };
    const manifest = await snapshotExactSelection(captureOnly, root, ['docs/']);
    assert.equal(manifest.ok, true, JSON.stringify(manifest));
    assert.ok(calls.some(x => x[0] === 'hash-object' && x.includes('--no-filters')));
    assert.equal(calls.some(x => x[0] === 'hash-object' && x.some(v => v.startsWith('--path='))), false);
  });

  test('approved CRLF content can be staged with Git text normalization', async () => {
    fs.writeFileSync(path.join(root, '.gitattributes'), '*.md text\n');
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# win\r\nline\r\n');
    const result = await runGovernedCommitFlow('organize', ['docs/'], ['Normalize approved markdown'], {
      workspaceRoot: root, git: defaultGitRunner,
      confirm: async text => { assert.match(text, /docs\/approved\.md/); return true; },
      recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
    });
    assert.equal(result.step, 'committed', JSON.stringify(result));
    assert.equal(git(root, 'show', '--format=', '--name-only', 'HEAD'), 'docs/approved.md');
    const raw = git(root, 'hash-object', '--no-filters', '--', 'docs/approved.md');
    const staged = git(root, 'rev-parse', 'HEAD:docs/approved.md');
    assert.notEqual(raw, staged, 'Git text normalization changes the object ID');
  });

  test('approved directory lists exact filenames and commits only that reviewed set', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# approved\n');
    let prompt = '';
    const result = await runGovernedCommitFlow('organize', ['docs/'], ['Add docs files'], {
      workspaceRoot: root, git: defaultGitRunner,
      confirm: async text => { prompt = text; return true; },
      recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
    });
    assert.match(prompt, /Exact changed files to commit \(1\):/);
    assert.match(prompt, /docs\/approved\.md/);
    assert.equal(result.step, 'committed', JSON.stringify(result));
    assert.equal(git(root, 'show', '--format=', '--name-only', 'HEAD'), 'docs/approved.md');
  });

  test('new file inside selected directory after consent refuses without checkout or staging', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# approved\n');
    const before = git(root, 'symbolic-ref', '--short', 'HEAD');
    const result = await runGovernedCommitFlow('organize', ['docs/'], ['Add docs files'], {
      workspaceRoot: root, git: defaultGitRunner,
      confirm: async text => {
        assert.match(text, /docs\/approved\.md/);
        assert.doesNotMatch(text, /docs\/unreviewed\.md/);
        fs.writeFileSync(path.join(root, 'docs', 'unreviewed.md'), '# introduced later\n');
        return true;
      },
      recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
    });
    assert.equal(result.step, 'noop');
    assert.match('warning' in result ? result.warning || '' : '', /manifest changed after approval/i);
    assert.equal(git(root, 'symbolic-ref', '--short', 'HEAD'), before);
    assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
    assert.equal(git(root, 'branch', '--list', 'fix/organize-20261118120000'), '');
  });

  test('changed contents after directory approval refuse even when filename set is unchanged', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# approved\n');
    const result = await runGovernedCommitFlow('organize', ['docs/'], ['Add docs files'], {
      workspaceRoot: root, git: defaultGitRunner,
      confirm: async () => {
        fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# different content\n');
        return true;
      },
      recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
    });
    assert.equal(result.step, 'noop');
    assert.match('warning' in result ? result.warning || '' : '', /manifest changed after approval/i);
    assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
  });

  test('new descendant appearing after the recheck still cannot enter approved commit', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'approved.md'), '# approved\n');
    let injected = 0;
    const result = await runGovernedCommitFlow('organize', ['docs/'], ['Add docs files'], {
      workspaceRoot: root,
      git: async (args, cwd) => {
        const response = await defaultGitRunner(args, cwd);
        if (args[0] === 'checkout' && args[1] === '-b' && response.code === 0) {
          fs.writeFileSync(path.join(root, 'docs', 'unreviewed.md'), 'late newcomer\n');
          injected++;
        }
        return response;
      },
      confirm: async () => true,
      recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
    });
    assert.equal(injected, 1);
    assert.equal(result.step, 'committed', JSON.stringify(result));
    assert.equal(git(root, 'show', '--format=', '--name-only', 'HEAD'), 'docs/approved.md');
    assert.equal(git(root, 'status', '--porcelain', '--', 'docs/unreviewed.md'), '?? docs/unreviewed.md');
  });

  test('an approved tracked deletion remains a valid directory change', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'gone.md'), 'before\n');
    git(root, 'add', '--', 'docs/gone.md');
    git(root, 'commit', '-qm', 'baseline');
    fs.rmSync(path.join(root, 'docs', 'gone.md'));
    const result = await runGovernedCommitFlow('organize', ['docs/'], ['Remove file'], {
      workspaceRoot: root, git: defaultGitRunner,
      confirm: async text => { assert.match(text, /docs\/gone\.md/); return true; },
      recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
    });
    assert.equal(result.step, 'committed', JSON.stringify(result));
    assert.equal(git(root, 'show', '--format=', '--name-status', 'HEAD'), 'D\tdocs/gone.md');
  });

});
