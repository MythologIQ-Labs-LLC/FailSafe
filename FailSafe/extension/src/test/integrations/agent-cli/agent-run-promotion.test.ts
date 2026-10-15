import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runIsolated, sha256 } from '../../../integrations/agent-cli/isolated-run';
import {
  applyQuarantined, pruneAuditCopies, writeAuditCopy, type QuarantinedChangeSet,
} from '../../../integrations/agent-cli/agent-run-promotion';
import { git, makeRepo, read, removeRepo, scriptedAgent, useGitConfig } from './git-fixture';

// FX952 (#475, LD8): a quarantined change set reaches the workspace only through
// applyQuarantined, which applies exactly the in-memory bytes after the checks.

async function quarantine(root: string, script: string): Promise<QuarantinedChangeSet> {
  const agent = scriptedAgent(script, { LIVE_ROOT: root });
  const r = await runIsolated(root, { cmd: 'agent', args: [] }, { run: agent.run, timeoutMs: 60000 });
  assert.equal(r.status, 'QUARANTINED_PENDING_APPROVAL', r.reason);
  if (!r.patch || !r.patchSha256 || !r.root || !r.baseHead || !r.preSnapshot) throw new Error('incomplete quarantine');
  return { receiptId: `r${Date.now()}`, agent: 'agent', root: r.root, baseHead: r.baseHead, preSnapshot: r.preSnapshot, patch: r.patch, patchSha256: r.patchSha256, stats: r.stats };
}

const EDIT = `const fs = require('fs');
  fs.writeFileSync('a.txt', 'alpha EDITED\\n');
  fs.mkdirSync('docs', { recursive: true }); fs.writeFileSync('docs/new.md', '# new\\n');
  fs.unlinkSync('b.txt');`;

const workingDiff = (root: string): string => {
  git(root, 'add', '-A');
  const d = git(root, 'diff', '--cached', '--no-ext-diff', '--binary', '--full-index', 'HEAD');
  git(root, 'reset', '-q');
  return d;
};

suite('agent-run-promotion (#475 FX952)', function () {
  this.timeout(120000);
  let root = '';
  let cfg: ReturnType<typeof useGitConfig>;
  setup(() => { cfg = useGitConfig(); root = makeRepo(); });
  teardown(() => { removeRepo(root); cfg.restore(); });

  test('Apply writes exactly the in-memory bytes, including created and deleted files', async () => {
    const cs = await quarantine(root, EDIT);
    const res = await applyQuarantined(cs);
    assert.equal(res.status, 'APPLIED', `${res.reason} ${res.details.join('; ')}`);
    assert.equal(read(root, 'a.txt'), 'alpha EDITED\n');
    assert.equal(read(root, 'docs/new.md'), '# new\n');
    assert.equal(fs.existsSync(path.join(root, 'b.txt')), false);
    assert.equal(workingDiff(root), cs.patch.toString('utf8'));
  });

  test('not applying leaves the workspace unchanged', async () => {
    await quarantine(root, EDIT);
    assert.equal(git(root, 'status', '--porcelain'), '');
    assert.equal(read(root, 'a.txt'), 'alpha\n');
  });

  test('HEAD moved since the run -> REFUSED, nothing written', async () => {
    const cs = await quarantine(root, EDIT);
    git(root, 'commit', '-q', '--allow-empty', '-m', 'moved');
    const res = await applyQuarantined(cs);
    assert.equal(res.status, 'REFUSED');
    assert.match(res.reason, /HEAD moved/);
    assert.equal(read(root, 'a.txt'), 'alpha\n');
  });

  test('workspace changed since the run -> REFUSED naming the change', async () => {
    const cs = await quarantine(root, EDIT);
    fs.writeFileSync(path.join(root, 'operator.txt'), 'mine\n');
    const res = await applyQuarantined(cs);
    assert.equal(res.status, 'REFUSED');
    assert.match(res.reason, /workspace changed since the run/);
    assert.ok(res.details.includes('status:operator.txt'), JSON.stringify(res.details));
    assert.equal(read(root, 'a.txt'), 'alpha\n');
  });

  test('bytes that no longer match the captured hash -> REFUSED', async () => {
    const cs = await quarantine(root, EDIT);
    const res = await applyQuarantined({ ...cs, patch: Buffer.concat([cs.patch, Buffer.from('\n')]) });
    assert.equal(res.status, 'REFUSED');
    assert.match(res.reason, /captured hash/);
    assert.equal(read(root, 'a.txt'), 'alpha\n');
  });

  test('validator rejection -> REFUSED', async () => {
    const cs = await quarantine(root, EDIT);
    const evil = Buffer.from('diff --git a/.gitmodules b/.gitmodules\nnew file mode 100644\n--- /dev/null\n+++ b/.gitmodules\n@@ -0,0 +1 @@\n+[submodule "x"]\n');
    const res = await applyQuarantined({ ...cs, patch: evil, patchSha256: sha256(evil) });
    assert.equal(res.status, 'REFUSED');
    assert.match(res.reason, /failed validation/);
    assert.equal(fs.existsSync(path.join(root, '.gitmodules')), false);
  });

  test('git apply --check failure -> REFUSED, nothing written', async () => {
    const cs = await quarantine(root, EDIT);
    const stale = Buffer.from(cs.patch.toString('utf8').replace('-alpha\n', '-not the base text\n'));
    const res = await applyQuarantined({ ...cs, patch: stale, patchSha256: sha256(stale) });
    assert.equal(res.status, 'REFUSED');
    assert.match(res.reason, /apply --check/);
    assert.equal(git(root, 'status', '--porcelain'), '');
  });

  test('swapping the on-disk audit copy has no effect on what is applied', async () => {
    const cs = await quarantine(root, EDIT);
    const audit = fs.mkdtempSync(path.join(os.tmpdir(), 'fsau-'));
    try {
      const dir = writeAuditCopy(audit, cs, { note: 'test' });
      fs.writeFileSync(path.join(dir, 'change-set.patch'), 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-alpha\n+SWAPPED\n');
      const res = await applyQuarantined(cs);
      assert.equal(res.status, 'APPLIED', res.reason);
      assert.equal(read(root, 'a.txt'), 'alpha EDITED\n');
    } finally { removeRepo(audit); }
  });

  test('a post-apply tree that differs from the bytes -> APPLY_MISMATCH', async () => {
    // The agent force-adds an ignored file; applying it to the live tree creates a
    // file the throwaway index cannot see, so the re-derived diff differs.
    const cs = await quarantine(root, `const cp = require('child_process'); const fs = require('fs');
      fs.writeFileSync('forced.log', 'x\\n'); cp.execFileSync('git', ['add', '-f', 'forced.log']);`);
    const res = await applyQuarantined(cs);
    assert.equal(res.status, 'APPLY_MISMATCH', res.reason);
    assert.ok(res.details.some((d) => d.startsWith('expected sha256')));
  });

  for (const level of ['global', 'system'] as const) {
    test(`CRLF checkout (core.autocrlf=true in the ${level} config) quarantines and applies cleanly`, async () => {
      cfg.restore();
      cfg = useGitConfig({ [level]: '[core]\n\tautocrlf = true\n' });
      fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\ntwo\n');
      git(root, 'add', 'crlf.txt'); git(root, 'commit', '-q', '-m', 'crlf');
      fs.rmSync(path.join(root, 'crlf.txt')); git(root, 'checkout', '--', 'crlf.txt');
      assert.equal(read(root, 'crlf.txt'), 'one\r\ntwo\r\n', 'checked out with CRLF');
      const cs = await quarantine(root, `const fs = require('fs'); fs.writeFileSync('crlf.txt', fs.readFileSync('crlf.txt', 'utf8').replace('two', 'TWO'));`);
      assert.doesNotMatch(cs.patch.toString('utf8'), /\r/, 'the change set is EOL-normalized');
      const res = await applyQuarantined(cs);
      assert.equal(res.status, 'APPLIED', `${res.reason} ${res.details.join('; ')}`);
      assert.equal(read(root, 'crlf.txt'), 'one\r\nTWO\r\n');
    });
  }

  test('audit retention keeps the newest 20 runs', () => {
    const audit = fs.mkdtempSync(path.join(os.tmpdir(), 'fsau-'));
    try {
      const now = Date.now() / 1000;
      for (let i = 0; i < 23; i++) {
        const d = path.join(audit, `run${String(i).padStart(2, '0')}`);
        fs.mkdirSync(d);
        fs.utimesSync(d, now - 100 + i, now - 100 + i);
      }
      pruneAuditCopies(audit, 20);
      const left = fs.readdirSync(audit).sort();
      assert.equal(left.length, 20);
      assert.deepEqual(left.slice(0, 1), ['run03'], 'the three oldest were removed');
    } finally { removeRepo(audit); }
  });
});
