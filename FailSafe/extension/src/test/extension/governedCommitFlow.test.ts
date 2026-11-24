// Tests for the operator-confirmed Organize/Initialize commit flow.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runGovernedCommitFlow, type GovernedFlowDeps } from '../../extension/governedCommitFlow';
import { describeAffectedArchitecture } from '../../governance/architecture/affectedArchitecture';
import type { GitRunner } from '../../extension/governedCommit';

function defaultFor(args: string[]): { code: number; stdout: string; stderr: string } {
  if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
  if (args[0] === 'rev-parse' && args.includes('--show-prefix')) return { code: 0, stdout: '', stderr: '' };
  // Mock only the precise read-only manifest commands. Real-Git tests validate
  // the same snapshot against a genuine filesystem and index.
  const selected = args.slice(args.indexOf('--') + 1).filter(x => x.startsWith(':(literal)'))
    .map(x => x.slice(':(literal)'.length));
  if (args.includes('status') && args.includes('-z')) {
    return { code: 0, stdout: selected.map(p => ' M ' + p + '\\0').join('').replaceAll('\\0', '\0'), stderr: '' };
  }
  if (args[0] === 'ls-files' && args.includes('--stage')) {
    return { code: 0, stdout: selected.map(p => '100644 ' + 'f'.repeat(40) + ' 0\\t' + p + '\\0').join('').replaceAll('\\t', '\t').replaceAll('\\0', '\0'), stderr: '' };
  }
  if (args[0] === 'hash-object') return { code: 0, stdout: 'f'.repeat(40), stderr: '' };
  const bindingOp = args.join(' ');
  if (bindingOp === 'rev-parse --verify --quiet HEAD') return { code: 0, stdout: 'a'.repeat(40), stderr: '' };
  if (bindingOp === 'rev-parse --verify HEAD') return { code: 0, stdout: 'b'.repeat(40), stderr: '' };
  if (bindingOp.startsWith('rev-parse --verify --quiet refs/heads/')) return { code: 0, stdout: 'b'.repeat(40), stderr: '' };
  if (bindingOp === 'write-tree') return { code: 0, stdout: '7'.repeat(40), stderr: '' };
  if (args[0] === 'log') return { code: 0, stdout: '7'.repeat(40) + '\0' + 'a'.repeat(40) + '\0' + "chore(organize): apply 2 workspace change(s)\n\n- Create .editorconfig\n- Add patterns" + '\n', stderr: '' };
  if (args[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (args[0] === 'status') return { code: 0, stdout: ' M .gitignore\n', stderr: '' };
  if (args[0] === 'symbolic-ref') return { code: 0, stdout: 'fix/organize-20260610120000', stderr: '' };
  if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}
// File-only approvals now require valid raw filesystem identities before
// consent. These are mock-Git unit fixtures, not a substitute for the real-Git
// coverage in governedCommitSelection.test.ts.
const flowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-715-flow-files-'));
for (const name of ['.gitignore', '.editorconfig', 'src/a.ts', 'src/b.ts', 'src/c.ts']) {
  const disk = path.join(flowRoot, name);
  fs.mkdirSync(path.dirname(disk), { recursive: true });
  fs.writeFileSync(disk, 'test fixture\n');
}
process.on('exit', () => fs.rmSync(flowRoot, { recursive: true, force: true }));

const git: GitRunner = async (args) => defaultFor(args);
const DEST = ' Git push destination: https://github.com/o/r.git. Repository: github.com/o/r.';

function baseDeps(over: Partial<GovernedFlowDeps>): GovernedFlowDeps {
  return {
    workspaceRoot: flowRoot, git, confirm: async () => true, recordDeclined: async () => {},
    now: () => '2026-06-10T12:00:00.000Z', ...over,
  };
}

suite('runGovernedCommitFlow', () => {
  test('no changes → noop, never prompts', async () => {
    let prompted = false;
    const r = await runGovernedCommitFlow('organize', [], [], baseDeps({ confirm: async () => { prompted = true; return true; } }));
    assert.deepEqual(r, { step: 'noop' });
    assert.equal(prompted, false);
  });

  test('declined → records to the ledger, no commit', async () => {
    const recorded: unknown[] = [];
    let committed = false;
    const r = await runGovernedCommitFlow(
      'organize', ['.gitignore'], ['Add 1 governance pattern to .gitignore'],
      baseDeps({
        confirm: async () => false,
        recordDeclined: async (info) => { recorded.push(info); },
        git: async (a) => { if (a[0] === 'commit') committed = true; return defaultFor(a); },
      }),
    );
    assert.deepEqual(r, { step: 'declined' });
    assert.equal(committed, false);
    assert.deepEqual(recorded, [{ action: 'organize', changes: ['Add 1 governance pattern to .gitignore'], at: '2026-06-10T12:00:00.000Z' }]);
  });

  test('approved + token → drives the ladder to a PR; branch is timestamp-stamped', async () => {
    const calls: string[][] = [];
    const r = await runGovernedCommitFlow(
      'organize', ['.gitignore', '.editorconfig'], ['Create .editorconfig', 'Add patterns'],
      baseDeps({
        git: async (a) => { calls.push(a); return defaultFor(a); },
        post: async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/3' }) }),
        token: 'tok',
      }),
    );
    assert.equal((r as { step: string }).step, 'pr');
    const checkout = calls.find((c) => c[0] === 'checkout' && c[1] === '-b');
    assert.equal(checkout?.[2], 'fix/organize-20260610120000');
  });
});

// #532 (plan-532c LD7b, B286): linkCommit is offered the bound commit once after committed, pushed
// or pr, never otherwise, and a throwing linkCommit never changes the commit result.
suite('runGovernedCommitFlow — linkCommit (#532 B286)', () => {
  const PRE = 'a'.repeat(40);
  const TREE = '7'.repeat(40);
  const NEW = 'b'.repeat(40);
  const message = 'chore(organize): apply 1 workspace change(s)\n\n- Add patterns';
  function bound(over: (a: string[]) => { code: number; stdout: string; stderr: string } | undefined = () => undefined): GitRunner {
    return async (a) => {
      const hit = over(a);
      if (hit) return hit;
      const j = a.join(' ');
      if (j === 'rev-parse --verify --quiet HEAD') return { code: 0, stdout: PRE, stderr: '' };
      if (j === 'write-tree') return { code: 0, stdout: TREE, stderr: '' };
      if (j === 'rev-parse --verify HEAD') return { code: 0, stdout: NEW, stderr: '' };
      if (a[0] === 'log') return { code: 0, stdout: `${TREE}\0${PRE}\0${message}\n`, stderr: '' };
      if (a[0] === 'rev-parse' && a.some((x) => x.startsWith('refs/heads/'))) return { code: 0, stdout: NEW, stderr: '' };
      return defaultFor(a);
    };
  }
  const run = (deps: Partial<GovernedFlowDeps>) =>
    runGovernedCommitFlow('organize', ['.gitignore'], ['Add patterns'], baseDeps(deps));

  test('committed, pushed and pr each call linkCommit once with the bound commit and the run', async () => {
    const cases: Array<[string, Partial<GovernedFlowDeps>, GitRunner]> = [
      ['committed', {}, bound((a) => (a[0] === 'remote' ? { code: 1, stdout: '', stderr: '' } : undefined))],
      ['pushed', {}, bound()],
      ['pr', { post: async () => ({ status: 201, body: JSON.stringify({ html_url: 'https://github.com/o/r/pull/3' }) }), token: 'tok' }, bound()],
    ];
    for (const [step, extra, g] of cases) {
      const seen: Array<{ sha: string; action: string; paths: string[] }> = [];
      const r = await run({ ...extra, git: g, linkCommit: async (res, info) => { seen.push({ sha: res.commitSha, ...info }); } });
      assert.equal((r as { step: string }).step, step);
      assert.deepEqual(seen, [{ sha: NEW, action: 'organize', paths: ['.gitignore'] }], step);
    }
  });

  test('never called on declined, noop, not-a-repo, a failed commit or an unbound commit', async () => {
    let calls = 0;
    const linkCommit = async () => { calls += 1; };
    await run({ confirm: async () => false, git: bound(), linkCommit });
    await runGovernedCommitFlow('organize', [], [], baseDeps({ git: bound(), linkCommit }));
    await run({ git: bound((a) => (a.includes('--is-inside-work-tree') ? { code: 0, stdout: 'false', stderr: '' } : undefined)), linkCommit });
    await run({ git: bound((a) => (a[0] === 'commit' ? { code: 1, stdout: '', stderr: 'nothing' } : undefined)), linkCommit });
    const foreign = await run({ git: bound((a) => (a[0] === 'log' ? { code: 0, stdout: `${TREE}\0${'c'.repeat(40)}\0${message}\n`, stderr: '' } : undefined)), linkCommit });
    assert.equal((foreign as { commitSha?: string }).commitSha, undefined);
    assert.equal(calls, 0);
  });

  test('a throwing linkCommit leaves the result unchanged', async () => {
    const r = await run({ git: bound(), linkCommit: async () => { throw new Error('boom'); } });
    assert.equal((r as { step: string }).step, 'pushed');
    assert.equal((r as { commitSha?: string }).commitSha, NEW);
  });
});

// B311 (plan-b311-b312 LD8): the prompt lists affected architecture decisions, warn-only. Lines are
// capped at 3 (then "and N more"); without lines, or when describe throws or rejects, the prompt is
// unchanged and a Yes still commits.
suite('runGovernedCommitFlow - affected architecture decisions (B311)', () => {
  const BASE = 'FailSafe organize applied 1 change(s). Commit, push & open a PR for them?';
  // #719 D5: every selection, not only a directory, names its exact files before consent.
  const FILES = '\nExact changed files to commit (1):\n • .gitignore';

  const withDescribe = (describe: unknown, prompts: string[], extra: Partial<GovernedFlowDeps> = {}) =>
    baseDeps({ confirm: async (m) => { prompts.push(m); return true; }, describeArchitecture: describe, ...extra } as Partial<GovernedFlowDeps>);

  test('lines are appended to the prompt, capped at 3', async () => {
    const prompts: string[] = [];
    const seen: string[][] = [];
    await runGovernedCommitFlow('organize', ['.gitignore'], ['x'], withDescribe(async (paths: string[]) => {
      seen.push(paths);
      return ['a: r1 (canonical, "d") docs/A.md, via contract', 'b: r2 (proposed, "d") docs/B.md, via document', 'and 1 more'];
    }, prompts));
    assert.deepEqual(seen, [['.gitignore']]);
    assert.equal(prompts[0], `${BASE} Architecture decisions these files touch (warn-only): ` +
      'a: r1 (canonical, "d") docs/A.md, via contract; b: r2 (proposed, "d") docs/B.md, via document; and 1 more.' + DEST + FILES);
  });

  test('no lines: the prompt is unchanged', async () => {
    const prompts: string[] = [];
    await runGovernedCommitFlow('organize', ['.gitignore'], ['x'], withDescribe(async () => [], prompts));
    assert.equal(prompts[0], BASE + DEST + FILES);
  });

  test('a throwing or rejecting describe leaves the prompt unchanged, and Yes still commits', async () => {
    for (const describe of [() => { throw new Error('boom'); }, async () => { throw new Error('boom'); }]) {
      const prompts: string[] = [];
      let committed = false;
      const r = await runGovernedCommitFlow('organize', ['.gitignore'], ['x'], withDescribe(describe, prompts, {
        git: async (a) => { if (a[0] === 'commit') committed = true; return defaultFor(a); },
      }));
      assert.equal(prompts[0], BASE + DEST + FILES);
      assert.equal(committed, true);
      assert.notEqual((r as { step: string }).step, 'declined');
    }
  });
});

// B311 (plan-b311-b312 LD8): the production wiring (bootstrapServers: describeAffectedArchitecture with
// maxLines 3) over a real index: an RLO is rendered, a long path is capped, and lines stop at 3.
suite('runGovernedCommitFlow - affected architecture decisions through describe (B311)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };
  const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
  const row = (id: string, contract: string) =>
    `| ${id} | ${id} | [${id}](architecture/${id}.md) | canonical | manual | - | - | - | ${contract} | unknown | manual |`;
  const LONG = `src/${'L'.repeat(300)}.ts`;
  let root = '';
  suiteSetup(() => {
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-gcf-arch-')));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), ['# Architecture Index', '', '## Registry', '', HEADER,
      '|---|---|---|---|---|---|---|---|---|---|---|', row('rlo', '[evil](../src/%E2%80%AEevil.ts)'), row('long', `\`${LONG}\``),
      row('a', '`src/a.ts`'), row('b', '`src/b.ts`'), row('c', '`src/c.ts`'), ''].join('\n'));
  });
  suiteTeardown(() => { if (root) removeTempTree(root); });
  const describe = async (paths: string[]) => (await describeAffectedArchitecture({ workspaceRoot: root }, paths, { maxLines: 3 })).lines;

  test('the prompt carries review text, a capped long path and at most 3 lines, then "and N more"', async () => {
    const prompts: string[] = [];
    await runGovernedCommitFlow('organize', [LONG, 'src/a.ts', 'src/b.ts', 'src/c.ts'], ['x'], baseDeps({
      confirm: async (m) => { prompts.push(m); return true; }, describeArchitecture: describe,
    }));
    const p = prompts[0];
    const segment = p.split('; ').find((s) => s.includes('src/LLL')) ?? '';
    const long = segment.slice(segment.indexOf('src/LLL'));
    assert.ok(long.length > 0 && Array.from(long).length <= 240 && long.endsWith('...'), long);
    assert.ok(p.includes('; and 1 more.' + DEST + '\nExact changed files to commit (4):'), p);
    assert.ok(!p.includes('src/c.ts: c '), 'the fourth line is not shown');
  });

  // #715 refuses a bidi filename before consent, so it never reaches the prompt;
  // the describe step it feeds still renders the character as review text.
  test('an RLO path is rendered as review text and refused before any prompt', async () => {
    const lines = await describe(['src/\u202Eevil.ts']);
    assert.ok(lines.some((l) => l.includes('src/[U+202E]evil.ts: rlo (canonical, "rlo")')), lines.join('\n'));
    assert.ok(!lines.join('').includes('\u202E'), 'no raw RLO in the review text');
    const prompts: string[] = [];
    const r = await runGovernedCommitFlow('organize', ['src/\u202Eevil.ts', 'src/a.ts'], ['x'], baseDeps({
      confirm: async (m) => { prompts.push(m); return true; }, describeArchitecture: describe,
    }));
    assert.deepEqual(prompts, []);
    assert.equal((r as { step: string }).step, 'noop');
    assert.match((r as { warning?: string }).warning ?? '', /invalid requested file/);
  });
});
