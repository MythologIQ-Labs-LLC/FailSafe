// Tests for the operator-confirmed Organize/Initialize commit flow.

import { strict as assert } from 'assert';
import { runGovernedCommitFlow, type GovernedFlowDeps } from '../../extension/governedCommitFlow';
import type { GitRunner } from '../../extension/governedCommit';

function defaultFor(args: string[]): { code: number; stdout: string; stderr: string } {
  if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true', stderr: '' };
  if (args[0] === 'rev-parse') return { code: 0, stdout: 'abc1234', stderr: '' };
  if (args[0] === 'status') return { code: 0, stdout: ' M .gitignore\n', stderr: '' };
  if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/o/r.git', stderr: '' };
  return { code: 0, stdout: '', stderr: '' };
}
const git: GitRunner = async (args) => defaultFor(args);

function baseDeps(over: Partial<GovernedFlowDeps>): GovernedFlowDeps {
  return {
    workspaceRoot: '/ws', git, confirm: async () => true, recordDeclined: async () => {},
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
