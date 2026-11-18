// #476: real Git-config falsification of the effective push URL contract.
// No push, network or credentials. Each test uses an isolated throwaway repo.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { inspectPushBinding } from '../../extension/githubPushBinding';
import type { GitRunner } from '../../extension/governedCommit';

const FETCH = 'https://github.com/acme/repo.git';
const BAD = 'https://attacker.invalid/acme/repo.git';
const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: '0' };

function git(root: string, args: string[]) {
  const r = spawnSync('git', args, { cwd: root, env: ENV, encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function setup(run: (root: string) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-476-git-push-'));
  const init = git(root, ['init', '-q']);
  if (init.code !== 0) throw new Error('isolated git init failed: ' + init.stderr);
  const add = git(root, ['remote', 'add', 'origin', FETCH]);
  if (add.code !== 0) throw new Error('isolated git remote add failed: ' + add.stderr);
  return run(root).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}
const runner: GitRunner = async (args, cwd) => git(cwd, args);

suite('#476 real-Git effective push target falsification (no network)', () => {
  test('default public origin resolves an allowed push target', async () => setup(async root => {
    const r = await inspectPushBinding(runner, root, FETCH);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.pushUrl, FETCH);
  }));

  test('remote.origin.pushurl cannot redirect public GitHub push', async () => setup(async root => {
    assert.equal(git(root, ['config', 'remote.origin.pushurl', BAD]).code, 0);
    assert.equal(git(root, ['remote', 'get-url', 'origin']).stdout.trim(), FETCH);
    assert.equal(git(root, ['remote', 'get-url', '--push', '--all', 'origin']).stdout.trim(), BAD);
    const r = await inspectPushBinding(runner, root, FETCH);
    assert.equal(r.ok, false);
  }));

  test('url.*.pushInsteadOf rewrite is detected before any push', async () => setup(async root => {
    assert.equal(git(root, ['config', 'url.https://attacker.invalid/.pushInsteadOf', 'https://github.com/']).code, 0);
    assert.equal(git(root, ['remote', 'get-url', 'origin']).stdout.trim(), FETCH);
    assert.equal(git(root, ['remote', 'get-url', '--push', '--all', 'origin']).stdout.trim(), BAD);
    const r = await inspectPushBinding(runner, root, FETCH);
    assert.equal(r.ok, false);
  }));

  test('multiple distinct push targets refuse rather than selecting one', async () => setup(async root => {
    assert.equal(git(root, ['config', '--add', 'remote.origin.pushurl', FETCH]).code, 0);
    assert.equal(git(root, ['config', '--add', 'remote.origin.pushurl', BAD]).code, 0);
    const raw = git(root, ['remote', 'get-url', '--push', '--all', 'origin']).stdout.trim();
    assert.equal(raw.split(/\r?\n/).length, 2);
    const r = await inspectPushBinding(runner, root, FETCH);
    assert.equal(r.ok, false);
  }));
});
