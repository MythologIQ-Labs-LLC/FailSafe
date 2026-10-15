// #476: the production ShieldEvidenceSource, against real temporary git repos.

import { strict as assert } from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWorkspaceEvidenceSource } from '../../../integrations/shield-receipts/workspace-evidence-source';

const CLEAN_ENV: NodeJS.ProcessEnv = { ...process.env };
for (const k of Object.keys(CLEAN_ENV)) if (k.startsWith('GIT_')) delete CLEAN_ENV[k];

function git(cwd: string, ...args: string[]): string {
  return cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', env: CLEAN_ENV,
  }).trim();
}

function tmpDirs(prefix: string): Set<string> {
  return new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(prefix)));
}

suite('workspace-evidence-source (#476)', () => {
  let repo = '';
  let first = '';
  let second = '';
  let merge = '';
  const LEDGER = '### Entry #644: SESSION SEAL - x\n\n**Session**: `s1`\n';

  suiteSetup(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-shield-repo-'));
    git(repo, 'init', '-q');
    fs.mkdirSync(path.join(repo, 'docs'));
    fs.writeFileSync(path.join(repo, 'docs', 'META_LEDGER.md'), LEDGER);
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first');
    first = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'branch', 'side');
    fs.writeFileSync(path.join(repo, 'src.txt'), 'code\n');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'second');
    second = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', 'side');
    fs.writeFileSync(path.join(repo, 'side.txt'), 'side\n');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'side');
    git(repo, 'checkout', '-q', '-');
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'side');
    merge = git(repo, 'rev-parse', 'HEAD');
  });

  suiteTeardown(() => { fs.rmSync(repo, { recursive: true, force: true }); });

  test('headSha, parents (root, single, merge)', async () => {
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    try {
      assert.equal(await source.headSha(), merge);
      assert.deepEqual(await source.parents(second), [first]);
      assert.deepEqual(await source.parents(first), []);
      assert.equal((await source.parents(merge))?.length, 2);
    } finally { dispose(); }
  });

  test('replace refs and .git/info/grafts do not change parents()', async () => {
    git(repo, 'replace', '--graft', second);
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    try {
      assert.equal(git(repo, 'rev-list', '--parents', '-n', '1', second), second, 'plain git sees the graft');
      assert.deepEqual(await source.parents(second), [first]);
    } finally { dispose(); git(repo, 'replace', '-d', second); }

    const grafts = path.join(repo, '.git', 'info', 'grafts');
    fs.mkdirSync(path.dirname(grafts), { recursive: true });
    fs.writeFileSync(grafts, `${second}\n`);
    const again = createWorkspaceEvidenceSource(repo);
    try {
      assert.deepEqual(await again.source.parents(second), [first]);
    } finally { again.dispose(); fs.rmSync(grafts, { force: true }); }
  });

  test('an inherited GIT_DIR does not redirect the source', async () => {
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(os.tmpdir(), 'no-such-git-dir');
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    try {
      assert.equal(await source.headSha(), merge);
    } finally {
      dispose();
      if (saved === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved;
    }
  });

  test('isShallow is true for a depth-1 clone and false for the full repo', async () => {
    const shallowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-shield-shallow-'));
    try {
      const p = repo.split(path.sep).join('/');
      git(os.tmpdir(), 'clone', '-q', '--depth', '1', p.startsWith('/') ? `file://${p}` : `file:///${p}`, shallowDir);
      const shallow = createWorkspaceEvidenceSource(shallowDir);
      const full = createWorkspaceEvidenceSource(repo);
      try {
        assert.equal(await shallow.source.isShallow(), true);
        assert.equal(await full.source.isShallow(), false);
      } finally { shallow.dispose(); full.dispose(); }
    } finally { fs.rmSync(shallowDir, { recursive: true, force: true }); }
  });

  test('showAtCommit reads the committed blob, not the working copy', async () => {
    const file = path.join(repo, 'docs', 'META_LEDGER.md');
    fs.writeFileSync(file, 'uncommitted edit\n');
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    try {
      assert.equal((await source.showAtCommit(merge, 'docs/META_LEDGER.md'))?.replace(/\r\n/g, '\n'), LEDGER);
      assert.equal(await source.showAtCommit(merge, 'docs/NOPE.md'), undefined);
      await assert.rejects(source.showAtCommit(merge, '../outside.md'));
      await assert.rejects(source.showAtCommit('HEAD', 'docs/META_LEDGER.md'));
    } finally { dispose(); git(repo, 'checkout', '-q', '--', 'docs/META_LEDGER.md'); }
  });

  test('path refusals happen before any filesystem read', async () => {
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    const realRead = fs.promises.readFile;
    let reads = 0;
    (fs.promises as { readFile: unknown }).readFile = (async (...a: unknown[]) => { reads += 1; return (realRead as (...x: unknown[]) => unknown)(...a); }) as unknown;
    try {
      await assert.rejects(source.readGateFile('s1', '../x'));
      await assert.rejects(source.readGateFile('s1', 'plan.json'));
      await assert.rejects(source.readGateFile('a/b', 'audit.json'));
      await assert.rejects(source.readGateFile('..', 'audit.json'));
      await assert.rejects(source.readQorSessionKey('../k'));
      await assert.rejects(source.readQorSessionKey(''));
      await assert.rejects(source.readReceipt('not-a-sha'));
      assert.equal(reads, 0);
      assert.equal(await source.readGateFile('s1', 'audit.json'), undefined, 'ENOENT is undefined');
    } finally {
      (fs.promises as { readFile: unknown }).readFile = realRead;
      dispose();
    }
  });

  test('writeReceipt then readReceipt round-trips under .failsafe/shield-receipts', async () => {
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    try {
      await source.writeReceipt(merge, '{"x":1}\n');
      assert.equal(await source.readReceipt(merge), '{"x":1}\n');
      assert.ok(fs.existsSync(path.join(repo, '.failsafe', 'shield-receipts', `${merge}.json`)));
      assert.deepEqual(fs.readdirSync(path.join(repo, '.failsafe', 'shield-receipts')), [`${merge}.json`], 'no temp file left');
    } finally { dispose(); fs.rmSync(path.join(repo, '.failsafe'), { recursive: true, force: true }); }
  });

  test('dispose removes the safe-git and graft temporary directories', () => {
    const beforeGit = tmpDirs('failsafe-git-');
    const beforeShield = tmpDirs('failsafe-shield-src-');
    const { dispose } = createWorkspaceEvidenceSource(repo);
    const madeGit = [...tmpDirs('failsafe-git-')].filter((n) => !beforeGit.has(n));
    const madeShield = [...tmpDirs('failsafe-shield-src-')].filter((n) => !beforeShield.has(n));
    assert.equal(madeGit.length, 1);
    assert.equal(madeShield.length, 1);
    dispose();
    for (const n of [...madeGit, ...madeShield]) assert.equal(fs.existsSync(path.join(os.tmpdir(), n)), false, n);
  });
});
