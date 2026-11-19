// Real-Git pre-consent discovery for the governed Organize/Initialize offer
// (#719 local Windows qualification D1-D5). Disposable repositories only; no
// remote, no token, no network.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as crypto from 'crypto';
import { defaultGitRunner, statusPaths } from '../../extension/governedCommit';
import { snapshotExactSelection } from '../../extension/governedCommitSelection';
import { runGovernedCommitFlow } from '../../extension/governedCommitFlow';

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr || args.join(' '));
  return r.stdout.trim();
}
const write = (dir: string, rel: string, text: string): void => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const sha = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** A marker program Git can run through its shell on every platform. */
function markerCommand(root: string, marker: string): string {
  const script = path.join(root, 'marker.cjs');
  fs.writeFileSync(script, [
    "const fs = require('fs');",
    `fs.appendFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' ') + '\\n');`,
    // Only a clean filter echoes its input; fsmonitor and process markers exit at
    // once, so a hook that does run fails visibly instead of waiting on Git.
    "if (process.argv[2] !== 'clean') process.exit(1);",
    "process.stdin.on('data', d => process.stdout.write(d));",
    "process.stdin.on('end', () => process.exit(0));",
  ].join('\n'));
  const q = (p: string) => '"' + p.replace(/\\/g, '/') + '"';
  return `${q(process.execPath)} ${q(script)}`;
}

/** Restores a racy tracked entry: same size, newer mtime than the index, so status must read content. */
function makeRacy(repo: string, rel: string, sameSizeText: string): void {
  fs.writeFileSync(path.join(repo, rel), sameSizeText);
  const old = new Date(Date.now() - 3600e3);
  fs.utimesSync(path.join(repo, '.git', 'index'), old, old);
  const now = new Date();
  fs.utimesSync(path.join(repo, rel), now, now);
}

function offerDeps(repo: string, prompts: string[], answer: boolean) {
  return {
    workspaceRoot: repo, git: defaultGitRunner,
    confirm: async (m: string) => { prompts.push(m); return answer; },
    recordDeclined: async () => {}, now: () => '2026-11-18T12:00:00.000Z',
  };
}

suite('#719 D1-D5 pre-consent discovery, real Git', () => {
  let root = '';
  let repo = '';
  setup(() => {
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-discovery-')));
    repo = path.join(root, 'r');
    fs.mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 'FailSafe test');
    git(repo, 'config', 'user.email', 'fixture@failsafe.invalid');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'config', 'core.autocrlf', 'false');
    write(repo, 'README.md', 'base\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'base');
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  test('D1: change discovery runs no fsmonitor hook, clean filter or process filter, and never rewrites the index', async () => {
    const marker = path.join(root, 'marker.txt');
    const cmd = markerCommand(root, marker);
    write(repo, '.gitattributes', 'docs/* filter=mark\n');
    write(repo, 'docs/t.txt', 'orig\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'filtered');
    git(repo, 'config', 'core.fsmonitor', cmd + ' fsmonitor');
    git(repo, 'config', 'filter.mark.clean', cmd + ' clean');
    git(repo, 'config', 'filter.mark.required', 'true');
    for (const variant of ['clean', 'process']) {
      if (variant === 'process') {
        git(repo, 'config', '--unset', 'filter.mark.clean');
        git(repo, 'config', 'filter.mark.process', cmd + ' process');
      }
      makeRacy(repo, 'docs/t.txt', 'orxg\n');
      fs.rmSync(marker, { force: true });
      const index = sha(path.join(repo, '.git', 'index'));
      const paths = await statusPaths(defaultGitRunner, repo);
      assert.deepEqual(paths, ['docs/t.txt'], variant);
      assert.equal(fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '', '', `no program ran (${variant})`);
      assert.equal(sha(path.join(repo, '.git', 'index')), index, `index unchanged (${variant})`);
    }
  });

  test('D1: the directory manifest snapshot runs no filter and never rewrites the index', async () => {
    const marker = path.join(root, 'marker.txt');
    write(repo, '.gitattributes', 'docs/* filter=mark\n');
    write(repo, 'docs/t.txt', 'orig\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'filtered');
    git(repo, 'config', 'filter.mark.clean', markerCommand(root, marker) + ' clean');
    makeRacy(repo, 'docs/t.txt', 'orxg\n');
    write(repo, 'docs/new.txt', 'n\n');
    const index = sha(path.join(repo, '.git', 'index'));
    const snap = await snapshotExactSelection(defaultGitRunner, repo, ['docs/']);
    assert.equal(snap.ok, true, JSON.stringify(snap));
    assert.equal(fs.existsSync(marker), false, 'no clean filter before consent');
    assert.equal(sha(path.join(repo, '.git', 'index')), index, 'index unchanged before consent');
  });

  test('D2: a non-ASCII top-level filename is reported unquoted and committed after approval', async () => {
    const before = await statusPaths(defaultGitRunner, repo);
    write(repo, 'café.md', 'x\n');
    const changed = (await statusPaths(defaultGitRunner, repo)).filter(p => !before.includes(p));
    assert.deepEqual(changed, ['café.md']);
    const prompts: string[] = [];
    const r = await runGovernedCommitFlow('organize', changed, changed, offerDeps(repo, prompts, true));
    assert.match(prompts[0], /café\.md/);
    assert.equal(r.step, 'committed', JSON.stringify(r));
    assert.equal(git(repo, '-c', 'core.quotepath=false', 'show', '--format=', '--name-only', 'HEAD'), 'café.md');
  });

  test('D3: a nested workspace reports workspace-relative paths and commits its own new file', async () => {
    write(repo, 'sub/keep.txt', 'k\n');
    write(repo, 'outside.txt', 'o\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'nested');
    const ws = path.join(repo, 'sub');
    const before = await statusPaths(defaultGitRunner, ws);
    write(ws, 'new.txt', 'n\n');
    write(repo, 'outside.txt', 'changed outside the workspace\n');
    const changed = (await statusPaths(defaultGitRunner, ws)).filter(p => !before.includes(p));
    assert.deepEqual(changed, ['new.txt'], 'only the workspace file, relative to the workspace');
    const r = await runGovernedCommitFlow('organize', changed, changed, offerDeps(ws, [], true));
    assert.equal(r.step, 'committed', JSON.stringify(r));
    assert.equal(git(repo, 'show', '--format=', '--name-only', 'HEAD'), 'sub/new.txt');
  });

  test('D4: an action change outside a nested workspace never commits the operator\'s same-named file', async () => {
    write(repo, 'config.json', '{"root":1}\n');
    write(repo, 'sub/config.json', '{"sub":1}\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'configs');
    const ws = path.join(repo, 'sub');
    write(ws, 'config.json', '{"sub":"OPERATOR UNCOMMITTED WORK"}\n');
    const before = await statusPaths(defaultGitRunner, ws);
    write(repo, 'config.json', '{"root":"ACTION CHANGE"}\n');
    const changed = (await statusPaths(defaultGitRunner, ws)).filter(p => !before.includes(p));
    assert.deepEqual(changed, []);
    const head = git(repo, 'rev-parse', 'HEAD');
    const r = await runGovernedCommitFlow('organize', changed, changed, offerDeps(ws, [], true));
    assert.equal(r.step, 'noop');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
    assert.match(fs.readFileSync(path.join(ws, 'config.json'), 'utf8'), /OPERATOR UNCOMMITTED WORK/);
  });

  // Disclosed residual: file-only selections are named but, unlike directory
  // selections, their contents are not bound to blob ids at approval.
  test('D5: a file-only selection still shows the exact files before consent', async () => {
    write(repo, 'a.md', 'a\n');
    write(repo, 'b.md', 'b\n');
    const prompts: string[] = [];
    const r = await runGovernedCommitFlow('organize', ['a.md', 'b.md'], ['a', 'b'], offerDeps(repo, prompts, true));
    assert.match(prompts[0], /Exact changed files to commit \(2\):\n • a\.md\n • b\.md$/);
    assert.equal(r.step, 'committed', JSON.stringify(r));
    assert.equal(git(repo, 'show', '--format=', '--name-only', 'HEAD'), 'a.md\nb.md');
  });
});
