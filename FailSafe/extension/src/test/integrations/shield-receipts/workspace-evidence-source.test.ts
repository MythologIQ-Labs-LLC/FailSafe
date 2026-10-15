// #476: the production ShieldEvidenceSource, against real temporary git repos.

import { strict as assert } from 'assert';
import * as cp from 'child_process';
import cpModule = require('child_process');
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWorkspaceEvidenceSource, gitSupportsNoLazyFetch, parseHistoryOutput } from '../../../integrations/shield-receipts/workspace-evidence-source';
import { verifyShieldReceipt } from '../../../integrations/shield-receipts/shield-receipt-verifier';
import { DEFAULT_SHIELD_POLICY } from '../../../integrations/shield-receipts/shield-policy';
import {
  BASE_LEDGER, NOW, QOR_KEY, RECEIPT_KEY, SESSION, baseScenario, chainOf, keysOf, putReceipt, receiptBody, sealBlock,
} from './fixtures';

const CLEAN_ENV: NodeJS.ProcessEnv = { ...process.env };
for (const k of Object.keys(CLEAN_ENV)) if (k.startsWith('GIT_')) delete CLEAN_ENV[k];

function git(cwd: string, ...args: string[]): string {
  return cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', env: CLEAN_ENV,
  }).trim();
}

/** Delete the loose object for a blob (simulates a missing or corrupt object). */
function deleteLooseObject(repo: string, oid: string): void {
  const p = path.join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
  fs.chmodSync(p, 0o666);
  fs.rmSync(p);
}

function newRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(dir, 'init', '-q');
  return dir;
}

function commitLedger(repo: string, text: string, msg: string, extra?: [string, string]): string {
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'META_LEDGER.md'), text);
  if (extra) fs.writeFileSync(path.join(repo, extra[0]), extra[1]);
  git(repo, 'add', 'docs');
  if (extra) git(repo, 'add', extra[0]);
  git(repo, 'commit', '-q', '-m', msg);
  return git(repo, 'rev-parse', 'HEAD');
}

function tmpDirs(prefix: string): Set<string> {
  return new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(prefix)));
}

suite('workspace-evidence-source (#476)', function () {
  // Real git spawns (slow on Windows); same budget as the vscode-test runner.
  this.timeout(15000);
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
      for (const dev of ['NUL', 'nul', 'CON', 'aux', 'COM1', 'lpt9', 'CONIN$']) {
        await assert.rejects(source.readQorSessionKey(dev), dev);
        await assert.rejects(source.readGateFile(dev, 'audit.json'), dev);
      }
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

  test('a missing or corrupt object is an error, never an absent file', async () => {
    const r = newRepo('fs-shield-corrupt-');
    try {
      const c1 = commitLedger(r, '### Entry #1: x\n', 'one');
      deleteLooseObject(r, git(r, 'rev-parse', `${c1}:docs/META_LEDGER.md`));
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        await assert.rejects(source.showAtCommit(c1, 'docs/META_LEDGER.md'));
        assert.equal(await source.showAtCommit(c1, 'docs/NOPE.md'), undefined, 'a path absent from the tree is still undefined');
      } finally { dispose(); }
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('end to end: parent ledger unreadable -> anything but Verified (not-seal-commit is not skipped)', async () => {
    const r = newRepo('fs-shield-e2e-');
    try {
      const sealSha = commitLedger(r, BASE_LEDGER + sealBlock(644), 'seal');
      const codeSha = commitLedger(r, `${BASE_LEDGER}${sealBlock(644)}### Entry #645: GATE TRIBUNAL - later\n\n**Session**: \`x\`\n`, 'code', ['src.txt', 'code\n']);
      git(r, 'remote', 'add', 'origin', 'https://github.com/acme/failsafe.git');
      const s = baseScenario(); s.head = codeSha;
      const gates = path.join(r, '.qor', 'gates', SESSION);
      fs.mkdirSync(gates, { recursive: true });
      for (const [name, bytes] of s.gates) fs.writeFileSync(path.join(gates, name), bytes);
      fs.mkdirSync(path.join(r, '.qor', 'session', 'keys'), { recursive: true });
      fs.writeFileSync(path.join(r, '.qor', 'session', 'keys', `${SESSION}.key`), QOR_KEY);
      putReceipt(s, receiptBody(s));
      fs.mkdirSync(path.join(r, '.failsafe', 'shield-receipts'), { recursive: true });
      fs.writeFileSync(path.join(r, '.failsafe', 'shield-receipts', `${codeSha}.json`), s.receipts.get(codeSha)!);
      const verify = async (): Promise<string> => {
        const { source, dispose } = createWorkspaceEvidenceSource(r);
        try {
          const v = await verifyShieldReceipt(source, keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
          return v.kind === 'verified' ? 'verified' : `${v.kind}:${v.reason}`;
        } finally { dispose(); }
      };
      assert.equal(await verify(), 'rejected:not-seal-commit', 'intact parent ledger: the code commit is not the Seal commit');
      deleteLooseObject(r, git(r, 'rev-parse', `${sealSha}:docs/META_LEDGER.md`));
      assert.equal(await verify(), 'neutral:evidence-source-error');
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('a ledger committed as a symlink (mode 120000) is an error, not a file', async () => {
    const r = newRepo('fs-shield-symlink-');
    try {
      commitLedger(r, '### Entry #1: x\n', 'one');
      const target = git(r, 'hash-object', '-w', '--stdin');
      git(r, 'update-index', '--cacheinfo', `120000,${target},docs/META_LEDGER.md`);
      git(r, 'commit', '-q', '-m', 'ledger becomes a symlink');
      const head = git(r, 'rev-parse', 'HEAD');
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        await assert.rejects(source.showAtCommit(head, 'docs/META_LEDGER.md'));
      } finally { dispose(); }
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('a partial clone (extensions.partialClone) is refused for every git read', async () => {
    const r = newRepo('fs-shield-partial-');
    try {
      const c1 = commitLedger(r, '### Entry #1: x\n', 'one');
      git(r, 'config', 'extensions.partialClone', 'origin');
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        await assert.rejects(source.headSha());
        await assert.rejects(source.showAtCommit(c1, 'docs/META_LEDGER.md'));
        await assert.rejects(source.parents(c1));
      } finally { dispose(); }
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('a promisor remote (remote.<name>.promisor) is refused for every git read', async () => {
    const r = newRepo('fs-shield-promisor-');
    try {
      const c1 = commitLedger(r, '### Entry #1: x\n', 'one');
      git(r, 'remote', 'add', 'origin', 'https://github.com/acme/failsafe.git');
      git(r, 'config', 'remote.origin.promisor', 'true');
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        await assert.rejects(source.headSha());
        await assert.rejects(source.showAtCommit(c1, 'docs/META_LEDGER.md'));
        const v = await verifyShieldReceipt(source, keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
        assert.equal(v.kind === 'verified' ? 'verified' : `${v.kind}:${v.reason}`, 'neutral:evidence-source-error');
      } finally { dispose(); }
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('gitTimeoutMs: null is refused at creation, not silently defaulted', () => {
    const r = newRepo('fs-shield-null-timeout-');
    try {
      assert.throws(() => createWorkspaceEvidenceSource(r, { gitTimeoutMs: null as unknown as number }));
      const ok = createWorkspaceEvidenceSource(r, {});
      ok.dispose();
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('git older than 2.44 (GIT_NO_LAZY_FETCH ignored) is unsupported', () => {
    assert.equal(gitSupportsNoLazyFetch('git version 2.43.5'), false);
    assert.equal(gitSupportsNoLazyFetch('git version 1.99.0'), false);
    assert.equal(gitSupportsNoLazyFetch('git version 2.44.0'), true);
    assert.equal(gitSupportsNoLazyFetch('git version 2.55.0.windows.4'), true);
    assert.equal(gitSupportsNoLazyFetch('git version 3.0.0'), true);
    assert.equal(gitSupportsNoLazyFetch('not git'), false);
    assert.equal(gitSupportsNoLazyFetch(''), false);
  });

  test('a base directory that is a link to outside the workspace is refused', async () => {
    const r = newRepo('fs-shield-link-');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-shield-outside-'));
    const sha = 'a'.repeat(40);
    try {
      fs.writeFileSync(path.join(outside, `${sha}.json`), '{"planted":true}');
      fs.writeFileSync(path.join(outside, 'audit.json'), '{"planted":true}');
      fs.mkdirSync(path.join(r, '.failsafe'), { recursive: true });
      fs.symlinkSync(outside, path.join(r, '.failsafe', 'shield-receipts'), 'junction');
      fs.mkdirSync(path.join(r, '.qor', 'gates'), { recursive: true });
      fs.symlinkSync(outside, path.join(r, '.qor', 'gates', 's1'), 'junction');
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        await assert.rejects(source.readReceipt(sha));
        await assert.rejects(source.writeReceipt(sha, '{}'));
        await assert.rejects(source.readGateFile('s1', 'audit.json'));
        assert.equal(fs.readFileSync(path.join(outside, `${sha}.json`), 'utf8'), '{"planted":true}', 'nothing written outside');
      } finally { dispose(); }
    } finally {
      fs.rmSync(r, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('concurrent writeReceipt calls leave exactly one receipt and no temp files', async () => {
    const r = newRepo('fs-shield-write-');
    const sha = 'b'.repeat(40);
    try {
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        await Promise.all([source.writeReceipt(sha, '{"n":1}\n'), source.writeReceipt(sha, '{"n":2}\n')]);
        assert.deepEqual(fs.readdirSync(path.join(r, '.failsafe', 'shield-receipts')), [`${sha}.json`]);
        assert.match((await source.readReceipt(sha)) ?? '', /^\{"n":[12]\}\n$/);
      } finally { dispose(); }
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  });

  test('a transient rename failure (EPERM/EBUSY) is retried; a persistent one leaves no temp file', async () => {
    const r = newRepo('fs-shield-rename-');
    const sha = 'c'.repeat(40);
    const realRename = fs.promises.rename;
    const failing = (n: number) => {
      let calls = 0;
      (fs.promises as { rename: unknown }).rename = (async (a: string, b: string) => {
        if (calls++ < n) throw Object.assign(new Error('busy'), { code: calls % 2 ? 'EPERM' : 'EBUSY' });
        return realRename(a, b);
      }) as unknown;
    };
    const { source, dispose } = createWorkspaceEvidenceSource(r);
    const dir = path.join(r, '.failsafe', 'shield-receipts');
    try {
      failing(2);
      await source.writeReceipt(sha, '{"n":1}\n');
      assert.equal(await source.readReceipt(sha), '{"n":1}\n');
      assert.deepEqual(fs.readdirSync(dir), [sha + '.json']);
      fs.rmSync(path.join(dir, sha + '.json'));
      failing(100);
      await assert.rejects(source.writeReceipt(sha, '{"n":2}\n'));
      assert.deepEqual(fs.readdirSync(dir), [], 'no temp file left behind');
    } finally {
      (fs.promises as { rename: unknown }).rename = realRename;
      dispose();
      fs.rmSync(r, { recursive: true, force: true });
    }
  });

  test('a failing temp cleanup never replaces the rename error', async () => {
    const r = newRepo('fs-shield-cleanup-');
    const sha = 'd'.repeat(40);
    const realRename = fs.promises.rename;
    const realRm = fs.promises.rm;
    (fs.promises as { rename: unknown }).rename = (async () => { throw Object.assign(new Error('rename failed: target locked'), { code: 'EPERM' }); }) as unknown;
    (fs.promises as { rm: unknown }).rm = (async () => { throw Object.assign(new Error('cleanup failed'), { code: 'EBUSY' }); }) as unknown;
    const { source, dispose } = createWorkspaceEvidenceSource(r);
    try {
      await assert.rejects(source.writeReceipt(sha, '{}\n'), /rename failed: target locked/);
    } finally {
      (fs.promises as { rename: unknown }).rename = realRename;
      (fs.promises as { rm: unknown }).rm = realRm;
      dispose();
      fs.rmSync(r, { recursive: true, force: true });
    }
  });

  test('a writeFile that fails after creating the temp file leaves no temp file and rethrows', async () => {
    const r = newRepo('fs-shield-writefail-');
    const sha = 'e'.repeat(40);
    const realWrite = fs.promises.writeFile;
    (fs.promises as { writeFile: unknown }).writeFile = (async (p: string, ...rest: unknown[]) => {
      await (realWrite as (...x: unknown[]) => Promise<void>)(p, 'partial', ...rest.slice(1));
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    }) as unknown;
    const { source, dispose } = createWorkspaceEvidenceSource(r);
    try {
      await assert.rejects(source.writeReceipt(sha, '{}\n'), /disk full/);
      assert.deepEqual(fs.readdirSync(path.join(r, '.failsafe', 'shield-receipts')), [], 'no temp file left');
    } finally {
      (fs.promises as { writeFile: unknown }).writeFile = realWrite;
      dispose();
      fs.rmSync(r, { recursive: true, force: true });
    }
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

suite('workspace-evidence-source: ledger history search (#476 N1)', function () {
  // Real git spawns (slow on Windows); same budget as the vscode-test runner.
  this.timeout(15000);
  const V = 'ab'.repeat(32);
  const repos: string[] = [];
  const mk = (prefix: string): string => { const r = newRepo(prefix); repos.push(r); return r; };
  suiteTeardown(() => { for (const r of repos) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });

  async function contains(repo: string, sha: string, v = V): Promise<boolean> {
    const { source, dispose } = createWorkspaceEvidenceSource(repo);
    try { return await source.ledgerHistoryContains(sha, v); } finally { dispose(); }
  }

  /** base -> A (adds V) -> Y1 (removes V); returns Y1. */
  function addThenRemove(r: string): string {
    commitLedger(r, 'base\n', 'base');
    commitLedger(r, `base\n${V}\n`, 'A');
    return commitLedger(r, 'base\n', 'Y1');
  }

  /** base; side commit; main commit; merge E whose own tree adds V. Returns E. */
  function evilMerge(r: string): string {
    commitLedger(r, 'base\n', 'base');
    git(r, 'branch', 'side');
    git(r, 'checkout', '-q', 'side');
    fs.writeFileSync(path.join(r, 's.txt'), 's\n'); git(r, 'add', 's.txt'); git(r, 'commit', '-q', '-m', 'side');
    git(r, 'checkout', '-q', '-');
    fs.writeFileSync(path.join(r, 'm.txt'), 'm\n'); git(r, 'add', 'm.txt'); git(r, 'commit', '-q', '-m', 'main2');
    git(r, 'merge', '-q', '--no-ff', '--no-commit', 'side');
    fs.writeFileSync(path.join(r, 'docs', 'META_LEDGER.md'), `base\n${V}\n`);
    git(r, 'add', 'docs'); git(r, 'commit', '-q', '-m', 'evil');
    return git(r, 'rev-parse', 'HEAD');
  }

  test('textconv row: a local diff.<driver>.textconv cannot hide the ledger', async () => {
    const r = mk('fs-n1-textconv-');
    const y1 = addThenRemove(r);
    git(r, 'config', 'diff.hide.textconv', 'true');
    fs.mkdirSync(path.join(r, '.git', 'info'), { recursive: true });
    fs.writeFileSync(path.join(r, '.git', 'info', 'attributes'), 'docs/META_LEDGER.md diff=hide\n');
    assert.equal(await contains(r, y1), true);
  });

  test('evil-merge row: a merge whose own tree adds the value is seen', async () => {
    const r = mk('fs-n1-evil-');
    assert.equal(await contains(r, evilMerge(r)), true);
  });

  test('log.diffMerges row: log.diffMerges=off in local config cannot hide a merge diff', async () => {
    const r = mk('fs-n1-diffmerges-');
    const e = evilMerge(r);
    git(r, 'config', 'log.diffMerges', 'off');
    assert.equal(await contains(r, e), true);
  });

  test('root row: a root commit adding the value is seen even with log.showRoot=false', async () => {
    const r = mk('fs-n1-root-');
    git(r, 'config', 'log.showRoot', 'false');
    assert.equal(await contains(r, commitLedger(r, `${V}\n`, 'root')), true);
  });

  test('TREESAME-merge row: a side branch behind a merge matching both parents is walked', async () => {
    const r = mk('fs-n1-treesame-');
    commitLedger(r, 'base\n', 'base');
    git(r, 'branch', 'side');
    git(r, 'checkout', '-q', 'side');
    commitLedger(r, `base\n${V}\n`, 'A');
    commitLedger(r, 'base\n', 'Y1p');
    git(r, 'checkout', '-q', '-');
    fs.writeFileSync(path.join(r, 'other.txt'), 'x\n'); git(r, 'add', 'other.txt'); git(r, 'commit', '-q', '-m', 'main2');
    git(r, 'merge', '-q', '--no-ff', '-m', 'M', 'side');
    assert.equal(await contains(r, git(r, 'rev-parse', 'HEAD')), true);
  });

  test('attributes regression row: a worktree .gitattributes -diff cannot hide the ledger', async () => {
    const r = mk('fs-n1-attrs-');
    const y1 = addThenRemove(r);
    fs.writeFileSync(path.join(r, '.gitattributes'), 'docs/META_LEDGER.md -diff\n');
    assert.equal(await contains(r, y1), true);
  });

  test('no-match row: the parent of the first introduction has no such value', async () => {
    const r = mk('fs-n1-nomatch-');
    const base = commitLedger(r, 'base\n', 'base');
    commitLedger(r, `base\n${V}\n`, 'A');
    assert.equal(await contains(r, base), false);
  });

  test('output parsing: duplicates and trailing newline, empty, non-hex, non-zero exit', () => {
    const h = 'f'.repeat(40);
    assert.equal(parseHistoryOutput(0, `${h}\n${h}\n`), true);
    assert.equal(parseHistoryOutput(0, `\n${h}\n\n`), true);
    assert.equal(parseHistoryOutput(0, ''), false);
    assert.equal(parseHistoryOutput(0, '\n'), false);
    assert.throws(() => parseHistoryOutput(0, `${h}\ndiff --git a/x b/x\n`));
    assert.throws(() => parseHistoryOutput(0, 'F'.repeat(40)));
    assert.throws(() => parseHistoryOutput(128, ''));
    assert.throws(() => parseHistoryOutput(null, ''));
  });

  test('a malformed value or sha is refused before any git spawn', async () => {
    const r = mk('fs-n1-refuse-');
    const head = commitLedger(r, 'base\n', 'base');
    const { source, dispose } = createWorkspaceEvidenceSource(r);
    const realSpawn = cpModule.spawn;
    let spawns = 0;
    (cpModule as { spawn: unknown }).spawn = ((...a: unknown[]) => { spawns += 1; return (realSpawn as (...x: unknown[]) => unknown)(...a); }) as unknown;
    try {
      await assert.rejects(source.ledgerHistoryContains(head, 'a'.repeat(63)));
      await assert.rejects(source.ledgerHistoryContains(head, 'A'.repeat(64)));
      await assert.rejects(source.ledgerHistoryContains('a'.repeat(39), V));
      await assert.rejects(source.ledgerHistoryContains(head, `${V} --all`));
      assert.equal(spawns, 0);
    } finally {
      (cpModule as { spawn: unknown }).spawn = realSpawn;
      dispose();
    }
  });

  test('gitTimeoutMs: 1 ms makes every git read throw; invalid values throw at creation', async () => {
    const r = mk('fs-n1-timeout-');
    commitLedger(r, 'base\n', 'base');
    for (const bad of [0, 30001, 1.5, -1, Number.NaN]) {
      assert.throws(() => createWorkspaceEvidenceSource(r, { gitTimeoutMs: bad }), String(bad));
    }
    const { source, dispose } = createWorkspaceEvidenceSource(r, { gitTimeoutMs: 1 });
    try {
      await assert.rejects(source.headSha());
      const v = await verifyShieldReceipt(source, keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
      assert.equal(v.kind === 'verified' ? 'verified' : `${v.kind}:${v.reason}`, 'neutral:evidence-source-error');
    } finally { dispose(); }
  });

  test('end to end: A verifies; Y2 restoring the seal is Rejected, also behind a committed .gitattributes -diff', async () => {
    const r = mk('fs-n1-e2e-');
    commitLedger(r, BASE_LEDGER, 'base');
    const a = commitLedger(r, BASE_LEDGER + sealBlock(644), 'A seal');
    const y1 = commitLedger(r, BASE_LEDGER, 'Y1 drops the seal');
    const y2 = commitLedger(r, BASE_LEDGER + sealBlock(644), 'Y2 restores it', ['src.txt', 'code\n']);
    git(r, 'checkout', '-q', y1);
    fs.writeFileSync(path.join(r, '.gitattributes'), 'docs/META_LEDGER.md -diff\n');
    git(r, 'add', '.gitattributes');
    const y2b = commitLedger(r, BASE_LEDGER + sealBlock(644), 'Y2b restores it behind -diff', ['src.txt', 'code\n']);
    git(r, 'remote', 'add', 'origin', 'https://github.com/acme/failsafe.git');
    const s = baseScenario();
    const gates = path.join(r, '.qor', 'gates', SESSION);
    fs.mkdirSync(gates, { recursive: true });
    for (const [name, bytes] of s.gates) fs.writeFileSync(path.join(gates, name), bytes);
    fs.mkdirSync(path.join(r, '.qor', 'session', 'keys'), { recursive: true });
    fs.writeFileSync(path.join(r, '.qor', 'session', 'keys', `${SESSION}.key`), QOR_KEY);
    fs.mkdirSync(path.join(r, '.failsafe', 'shield-receipts'), { recursive: true });
    for (const c of [a, y2, y2b]) {
      s.head = c;
      putReceipt(s, receiptBody(s));
      fs.writeFileSync(path.join(r, '.failsafe', 'shield-receipts', `${c}.json`), s.receipts.get(c)!);
    }
    const verifyAt = async (c: string): Promise<string> => {
      git(r, 'checkout', '-q', c);
      const { source, dispose } = createWorkspaceEvidenceSource(r);
      try {
        const v = await verifyShieldReceipt(source, keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
        return v.kind === 'verified' ? 'verified' : `${v.kind}:${v.reason}`;
      } finally { dispose(); }
    };
    assert.equal(await verifyAt(a), 'verified');
    assert.equal(await verifyAt(y2), 'rejected:seal-reintroduced');
    assert.equal(await verifyAt(y2b), 'rejected:seal-reintroduced');
  });

  test('real-ledger timing row: a no-match walk over the enclosing repository ledger takes under 10 s', async function () {
    this.timeout(30000);
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
    if (!fs.existsSync(path.join(repoRoot, 'docs', 'META_LEDGER.md'))) { this.skip(); return; }
    let shallow = 'unknown';
    try { shallow = git(repoRoot, 'rev-parse', '--is-shallow-repository'); } catch { this.skip(); return; }
    if (shallow !== 'false') { this.skip(); return; }
    const { source, dispose } = createWorkspaceEvidenceSource(repoRoot);
    try {
      const head = await source.headSha();
      assert.ok(head);
      const started = Date.now();
      const found = await source.ledgerHistoryContains(head!, '0123456789abcdef'.repeat(4));
      const ms = Date.now() - started;
      console.log(`      [timing] no-match ledger history walk: ${ms} ms`);
      assert.equal(found, false);
      assert.ok(ms < 10000, `took ${ms} ms`);
    } finally { dispose(); }
  });
});
