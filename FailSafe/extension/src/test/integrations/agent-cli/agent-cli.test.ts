import { strict as assert } from 'assert';
import type { RiskGrade } from '../../../shared/types/risk';
import {
  type AgentRunFn, type AgentRunResult,
  maxRisk, detectBinary, summarizeDiff, classifyDiffRisk, decideAgentRun, buildAgentReceipt,
} from '../../../integrations/agent-cli/agent-cli-core';
import { mapAllowlistToRisk, buildContinueArgs, runContinueGoverned } from '../../../integrations/agent-cli/continue-wrapper';
import { buildAiderArgs, runAiderGoverned } from '../../../integrations/agent-cli/aider-wrapper';

// ---- test fakes ---------------------------------------------------------

interface RunCall { cmd: string; args: string[]; opts?: { cwd?: string; env?: Record<string, string | undefined> } }

interface FakeOpts {
  cnVersionCode?: number; aiderVersionCode?: number;
  dirty?: boolean; diff?: string; cnCode?: number; aiderCode?: number;
}

function makeRunner(o: FakeOpts = {}): { run: AgentRunFn; calls: RunCall[] } {
  const calls: RunCall[] = [];
  const run: AgentRunFn = async (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], opts });
    const a = [...args];
    const r = (stdout: string, code: number | null = 0): AgentRunResult => ({ stdout, stderr: '', code });
    if (cmd === 'cn' && a[0] === '--version') return r('cn 1.2.3', o.cnVersionCode ?? 0);
    if (cmd === 'aider' && a[0] === '--version') return r('aider 0.50.1', o.aiderVersionCode ?? 0);
    if (cmd === 'git' && a[0] === 'status') return r(o.dirty ? ' M src/x.ts\n' : '');
    if (cmd === 'git' && a[0] === 'diff') return r(o.diff ?? '');
    if (cmd === 'cn') return r('{"ok":true}', o.cnCode ?? 0);
    if (cmd === 'aider') return r('applied', o.aiderCode ?? 0);
    return r('');
  };
  return { run, calls };
}

// classify: paths under src/security/** are L3, src/** is L2, else L1.
const classify = (path: string): RiskGrade =>
  /(^|\/)security\//.test(path) ? 'L3' : path.startsWith('src/') ? 'L2' : 'L1';

const L1_DIFF = 'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n+a line\n';
const L3_DIFF = 'diff --git a/src/security/Auth.ts b/src/security/Auth.ts\n--- a/src/security/Auth.ts\n+++ b/src/security/Auth.ts\n-old\n+new1\n+new2\n';

// ---- core ---------------------------------------------------------------

suite('agent-cli-core (Group B)', () => {
  test('maxRisk picks the most severe', () => {
    assert.equal(maxRisk('L1', 'L3'), 'L3');
    assert.equal(maxRisk('L2', 'L1'), 'L2');
  });

  test('detectBinary: available iff exit 0, parses version', async () => {
    const { run } = makeRunner();
    assert.deepEqual(await detectBinary('cn', ['--version'], run), { available: true, version: '1.2.3' });
    const { run: bad } = makeRunner({ cnVersionCode: 127 });
    assert.deepEqual(await detectBinary('cn', ['--version'], bad), { available: false });
  });

  test('summarizeDiff counts files / +/- lines / paths', () => {
    const s = summarizeDiff(L3_DIFF);
    assert.deepEqual(s.paths, ['src/security/Auth.ts']);
    assert.equal(s.files, 1);
    assert.equal(s.additions, 2);
    assert.equal(s.deletions, 1);
    assert.deepEqual(summarizeDiff(''), { files: 0, additions: 0, deletions: 0, paths: [] });
  });

  test('classifyDiffRisk = max tier across changed paths', () => {
    assert.equal(classifyDiffRisk(summarizeDiff(L1_DIFF), classify), 'L1');
    assert.equal(classifyDiffRisk(summarizeDiff(L3_DIFF), classify), 'L3');
  });

  test('decideAgentRun: L3→ESCALATE, no-writes→BLOCK, else ALLOW', () => {
    assert.equal(decideAgentRun('L3', { writesAllowed: true }).verdict, 'ESCALATE');
    assert.equal(decideAgentRun('L2', { writesAllowed: false }).verdict, 'BLOCK');
    assert.equal(decideAgentRun('L1', { writesAllowed: true }).verdict, 'ALLOW');
  });

  test('buildAgentReceipt is deterministic + never carries env/secret', () => {
    const r = buildAgentReceipt({ agent: 'continue', argv: ['-p', 'hi'], decision: { verdict: 'ALLOW', reason: 'ok', riskGrade: 'L1' }, exitCode: 0, diff: summarizeDiff(L1_DIFF), issuedAt: '2026-06-04T00:00:00Z' });
    assert.equal(r.verdict, 'ALLOW');
    assert.equal(r.issuedBy, 'did:failsafe:agent:continue');
    assert.ok(r.receiptId.length === 32);
    assert.ok(!JSON.stringify(r).includes('CONTINUE_API_KEY'));
  });
});

// ---- Continue (#104) ----------------------------------------------------

suite('continue-wrapper (#104)', () => {
  test('mapAllowlistToRisk: shell→L3, write→L2, read/empty→L1', () => {
    assert.equal(mapAllowlistToRisk([]), 'L1');
    assert.equal(mapAllowlistToRisk(['read', 'search']), 'L1');
    assert.equal(mapAllowlistToRisk(['editFile']), 'L2');
    assert.equal(mapAllowlistToRisk(['runTerminalCommand']), 'L3');
    assert.equal(mapAllowlistToRisk(['read', 'writeFile', 'shell']), 'L3');
  });

  test('buildContinueArgs is argv-form with -p + repeated --allow (no shell string)', () => {
    assert.deepEqual(buildContinueArgs('do it', ['read', 'editFile']), ['-p', 'do it', '--allow', 'read', '--allow', 'editFile']);
  });

  test('detect failure → available:false, no spawn', async () => {
    const { run, calls } = makeRunner({ cnVersionCode: 127 });
    const out = await runContinueGoverned({ prompt: 'x', allow: [], cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.available, false);
    assert.equal(calls.some((c) => c.cmd === 'cn' && c.args[0] !== '--version'), false);
  });

  test('no-tool mode (empty allowlist, L1) → ALLOW, spawns, captures diff + receipt', async () => {
    const { run, calls } = makeRunner({ diff: L1_DIFF });
    const out = await runContinueGoverned({ prompt: 'tidy', allow: [], cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.spawned, true);
    assert.equal(out.decision?.verdict, 'ALLOW');
    assert.equal(out.diff?.additions, 1);
    assert.equal(out.receipt?.exitCode, 0);
    assert.ok(calls.some((c) => c.cmd === 'cn' && c.args.includes('-p')));
  });

  test('write-request mode (shell allowlist, L3) → ESCALATE BEFORE spawning', async () => {
    const { run, calls } = makeRunner({ diff: L1_DIFF });
    const out = await runContinueGoverned({ prompt: 'rm stuff', allow: ['runShellCommand'], cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.decision?.verdict, 'ESCALATE');
    assert.equal(out.spawned, false, 'a dangerous allowlist must not spawn');
    assert.equal(calls.some((c) => c.cmd === 'cn' && c.args.includes('-p')), false);
  });

  test('writes-disallowed + write allowlist → BLOCK before spawning', async () => {
    const { run } = makeRunner();
    const out = await runContinueGoverned({ prompt: 'x', allow: ['editFile'], cwd: '/repo', writesAllowed: false }, { run, classify, issuedAt: 'T' });
    assert.equal(out.decision?.verdict, 'BLOCK');
    assert.equal(out.spawned, false);
  });

  test('surprise L3 diff from an L1 allowlist → ESCALATE post-run', async () => {
    const { run } = makeRunner({ diff: L3_DIFF });
    const out = await runContinueGoverned({ prompt: 'edit', allow: [], cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.spawned, true);
    assert.equal(out.decision?.verdict, 'ESCALATE');
  });

  test('failed run capture: cn exits non-zero → still captures diff + receipt.exitCode', async () => {
    const { run } = makeRunner({ diff: L1_DIFF, cnCode: 2 });
    const out = await runContinueGoverned({ prompt: 'x', allow: [], cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.spawned, true);
    assert.equal(out.receipt?.exitCode, 2);
  });

  test('SECRET: API key goes in child env ONLY — never argv, never receipt', async () => {
    const { run, calls } = makeRunner({ diff: L1_DIFF });
    const out = await runContinueGoverned({ prompt: 'x', allow: [], apiKey: 'CONT_TOPSECRET', cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    const cnCall = calls.find((c) => c.cmd === 'cn' && c.args.includes('-p'))!;
    assert.equal(cnCall.opts?.env?.CONTINUE_API_KEY, 'CONT_TOPSECRET', 'key passed via child env');
    assert.ok(!cnCall.args.join(' ').includes('CONT_TOPSECRET'), 'key never in argv');
    assert.ok(!JSON.stringify(out.receipt).includes('CONT_TOPSECRET'), 'key never in receipt');
  });
});

// ---- Aider (#107) -------------------------------------------------------

suite('aider-wrapper (#107)', () => {
  test('buildAiderArgs: --message + --yes; auto-commit OFF by default', () => {
    assert.deepEqual(buildAiderArgs('fix bug'), ['--message', 'fix bug', '--yes', '--no-auto-commits']);
    assert.deepEqual(buildAiderArgs('fix bug', { autoCommit: true }), ['--message', 'fix bug', '--yes', '--auto-commits']);
  });

  test('detect → clean run → ALLOW with captured diff', async () => {
    const { run, calls } = makeRunner({ dirty: false, diff: L1_DIFF });
    const out = await runAiderGoverned({ prompt: 'tidy', cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.spawned, true);
    assert.equal(out.decision?.verdict, 'ALLOW');
    assert.equal(out.diff?.additions, 1);
    assert.ok(calls.some((c) => c.cmd === 'aider' && c.args.includes('--no-auto-commits')));
  });

  test('dirty worktree → BLOCK, refuses to spawn (unless allowDirty)', async () => {
    const { run, calls } = makeRunner({ dirty: true, diff: L1_DIFF });
    const out = await runAiderGoverned({ prompt: 'x', cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.decision?.verdict, 'BLOCK');
    assert.equal(out.spawned, false);
    assert.equal(calls.some((c) => c.cmd === 'aider' && c.args.includes('--message')), false);
    // override
    const { run: run2 } = makeRunner({ dirty: true, diff: L1_DIFF });
    const out2 = await runAiderGoverned({ prompt: 'x', cwd: '/repo', allowDirty: true, writesAllowed: true }, { run: run2, classify, issuedAt: 'T' });
    assert.equal(out2.spawned, true);
  });

  test('high-risk diff gate: L3 change → ESCALATE', async () => {
    const { run } = makeRunner({ dirty: false, diff: L3_DIFF });
    const out = await runAiderGoverned({ prompt: 'touch auth', cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.decision?.verdict, 'ESCALATE');
    assert.equal(out.receipt?.riskGrade, 'L3');
  });

  test('diff capture robust when Aider exits non-zero', async () => {
    const { run } = makeRunner({ dirty: false, diff: L1_DIFF, aiderCode: 1 });
    const out = await runAiderGoverned({ prompt: 'x', cwd: '/repo', writesAllowed: true }, { run, classify, issuedAt: 'T' });
    assert.equal(out.spawned, true);
    assert.equal(out.receipt?.exitCode, 1);
    assert.equal(out.diff?.files, 1);
  });
});
