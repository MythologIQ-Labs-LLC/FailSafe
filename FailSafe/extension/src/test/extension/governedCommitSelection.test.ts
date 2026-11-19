// Real-Git admission tests for #715 directory selection manifests.
// Deliberately use disposable repositories, no GitHub remote or authenticated PR.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { defaultGitRunner, type GitRunner } from '../../extension/governedCommit';
import { snapshotExactSelection, sameExactSelection } from '../../extension/governedCommitSelection';

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
});
