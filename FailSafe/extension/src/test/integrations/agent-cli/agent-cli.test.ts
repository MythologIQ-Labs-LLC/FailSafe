import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { RiskGrade } from '../../../shared/types/risk';
import {
  type AgentRunFn, type AgentRunOptions, type AgentRunResult, type ResolveAgentFn,
  maxRisk, detectBinary, classifyDiffRisk, buildAgentReceipt, EMPTY_DIFF, defaultAgentRun, resolveAgentExecutable,
} from '../../../integrations/agent-cli/agent-cli-core';
import { mapAllowlistToRisk, buildContinueArgs, runContinueGoverned } from '../../../integrations/agent-cli/continue-wrapper';
import { buildAiderArgs, runAiderGoverned } from '../../../integrations/agent-cli/aider-wrapper';
import { git, makeRepo, read, removeRepo, useGitConfig } from './git-fixture';

// FX831 / FX832 (#475): both wrappers spawn in an isolated worktree, never the
// workspace, and their changes come back quarantined; nothing touches live files.

interface RunCall { cmd: string; args: string[]; opts?: AgentRunOptions }

/** Fake agent: `--version` succeeds; a real run writes `edit` into its cwd. */
function makeRunner(o: { versionCode?: number; agentCode?: number; edit?: Record<string, string> } = {}): { run: AgentRunFn; calls: RunCall[] } {
  const calls: RunCall[] = [];
  const run: AgentRunFn = async (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], opts });
    const r = (stdout: string, code: number | null = 0): AgentRunResult => ({ stdout, stderr: '', code });
    if (args[0] === '--version') return r(`${cmd} 1.2.3`, o.versionCode ?? 0);
    for (const [rel, body] of Object.entries(o.edit ?? { 'README.md': 'edited\n' })) {
      fs.mkdirSync(path.dirname(path.join(opts?.cwd ?? '.', rel)), { recursive: true });
      fs.writeFileSync(path.join(opts?.cwd ?? '.', rel), body);
    }
    return r('done', o.agentCode ?? 0);
  };
  return { run, calls };
}

const spawnCalls = (calls: RunCall[]): RunCall[] => calls.filter((c) => c.args[0] !== '--version');

/** The fake runners stand in for CLIs that are not installed, so detection resolves to a fixture path. */
const fixtureExe: ResolveAgentFn = (name) => path.join(os.tmpdir(), 'fixture-bin', name);

// classify: paths under src/security/** are L3, src/** is L2, else L1.
const classify = (p: string): RiskGrade =>
  /(^|\/)security\//.test(p) ? 'L3' : p.startsWith('src/') ? 'L2' : 'L1';

const T = 60000;

suite('agent-cli-core (Group B)', () => {
  test('maxRisk picks the most severe', () => {
    assert.equal(maxRisk('L1', 'L3'), 'L3');
    assert.equal(maxRisk('L2', 'L1'), 'L2');
  });

  test('detectBinary: available iff resolved and exit 0, parses version, probes from the OS temp dir', async () => {
    const opts = { workspaceRoot: os.tmpdir(), resolve: fixtureExe };
    const ok = makeRunner();
    assert.deepEqual(await detectBinary('cn', ['--version'], ok.run, opts), { available: true, version: '1.2.3' });
    assert.deepEqual(ok.calls.map((c) => [c.cmd, c.opts?.cwd]), [['cn', os.tmpdir()]]);
    assert.deepEqual(await detectBinary('cn', ['--version'], makeRunner({ versionCode: 127 }).run, opts), { available: false });
    const unresolved = makeRunner();
    assert.deepEqual(await detectBinary('cn', ['--version'], unresolved.run, { ...opts, resolve: () => undefined }), { available: false });
    assert.equal(unresolved.calls.length, 0, 'nothing probed when no executable resolves');
  });

  test('classifyDiffRisk = max tier across touched paths', () => {
    assert.equal(classifyDiffRisk({ ...EMPTY_DIFF, paths: ['README.md'] }, classify), 'L1');
    assert.equal(classifyDiffRisk({ ...EMPTY_DIFF, paths: ['README.md', 'src/security/Auth.ts'] }, classify), 'L3');
  });

  test('buildAgentReceipt is deterministic + never carries env/secret', () => {
    const input = { agent: 'continue', argv: ['-p', 'hi'], status: 'NO_CHANGES' as const, reason: 'none', riskGrade: 'L1' as const, exitCode: 0, diff: EMPTY_DIFF, issuedAt: '2026-06-04T00:00:00Z' };
    const r = buildAgentReceipt(input);
    assert.equal(r.status, 'NO_CHANGES');
    assert.equal(r.issuedBy, 'did:failsafe:agent:continue');
    assert.equal(r.receiptId, buildAgentReceipt(input).receiptId);
    assert.equal(r.receiptId.length, 32);
    assert.ok(!JSON.stringify(r).includes('CONTINUE_API_KEY'));
  });
});

suite('governed wrappers run isolated (#475 FX831/FX832)', function () {
  this.timeout(120000);
  let root = '';
  let cfg: ReturnType<typeof useGitConfig>;
  setup(() => { cfg = useGitConfig(); root = makeRepo({ 'README.md': 'readme\n' }); });
  teardown(() => { removeRepo(root); cfg.restore(); });

  const deps = (run: AgentRunFn) => ({ run, classify, issuedAt: 'T', resolve: fixtureExe });

  test('Continue: spawn cwd is a disposable worktree, never the workspace; change quarantined', async () => {
    const { run, calls } = makeRunner();
    const out = await runContinueGoverned({ prompt: 'tidy', allow: [], cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    const spawned = spawnCalls(calls);
    assert.equal(spawned.length, 1);
    const cwd = spawned[0].opts?.cwd ?? '';
    assert.notEqual(path.resolve(cwd), path.resolve(root));
    assert.ok(!path.resolve(cwd).startsWith(path.resolve(root) + path.sep), 'not inside the workspace');
    assert.equal(fs.existsSync(cwd), false, 'worktree removed after the run');
    assert.equal(out.status, 'QUARANTINED_PENDING_APPROVAL', out.reason);
    assert.equal(out.spawned, true);
    assert.deepEqual(out.diff?.paths, ['README.md']);
    assert.ok(out.changeSet && out.changeSet.patch.length > 0);
    assert.equal(read(root, 'README.md'), 'readme\n', 'workspace bytes unchanged');
  });

  test('Aider: argv always has --no-auto-commits; spawn cwd is the worktree; change quarantined', async () => {
    assert.deepEqual(buildAiderArgs('fix bug'), ['--message', 'fix bug', '--yes-always', '--no-auto-commits']);
    const { run, calls } = makeRunner();
    const out = await runAiderGoverned({ prompt: 'fix', cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    const spawned = spawnCalls(calls);
    assert.equal(spawned.length, 1);
    assert.ok(spawned[0].args.includes('--no-auto-commits'));
    assert.notEqual(path.resolve(spawned[0].opts?.cwd ?? ''), path.resolve(root));
    assert.equal(out.status, 'QUARANTINED_PENDING_APPROVAL', out.reason);
    assert.equal(read(root, 'README.md'), 'readme\n');
  });

  test('a run from a subdirectory starts the agent in the same subdirectory of the worktree', async () => {
    fs.mkdirSync(path.join(root, 'pkg'));
    fs.writeFileSync(path.join(root, 'pkg', 'x.txt'), 'x\n');
    git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'pkg');
    const { run, calls } = makeRunner({ edit: { 'x.txt': 'changed\n' } });
    const out = await runAiderGoverned({ prompt: 'fix', cwd: path.join(root, 'pkg'), writesAllowed: true, timeoutMs: T }, deps(run));
    assert.equal(path.basename(spawnCalls(calls)[0].opts?.cwd ?? ''), 'pkg');
    assert.deepEqual(out.diff?.paths, ['pkg/x.txt']);
  });

  test('without write authorization neither wrapper spawns (BLOCKED_PRE_EXECUTION)', async () => {
    const c = makeRunner();
    const co = await runContinueGoverned({ prompt: 'x', allow: [], cwd: root, writesAllowed: false, timeoutMs: T }, deps(c.run));
    const a = makeRunner();
    const ao = await runAiderGoverned({ prompt: 'x', cwd: root, writesAllowed: false, timeoutMs: T }, deps(a.run));
    for (const [out, calls] of [[co, c.calls], [ao, a.calls]] as const) {
      assert.equal(out.status, 'BLOCKED_PRE_EXECUTION');
      assert.equal(out.spawned, false);
      assert.equal(spawnCalls(calls).length, 0);
      assert.equal(out.receipt?.status, 'BLOCKED_PRE_EXECUTION');
    }
  });

  test('Continue: a shell/exec allowlist is refused before spawning', async () => {
    const { run, calls } = makeRunner();
    const out = await runContinueGoverned({ prompt: 'rm', allow: ['runTerminalCommand'], cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    assert.equal(out.status, 'BLOCKED_PRE_EXECUTION');
    assert.equal(out.riskGrade, 'L3');
    assert.equal(spawnCalls(calls).length, 0);
  });

  test('binary not found -> unavailable, no spawn', async () => {
    const { run, calls } = makeRunner({ versionCode: 127 });
    const out = await runContinueGoverned({ prompt: 'x', allow: [], cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    assert.equal(out.available, false);
    assert.equal(spawnCalls(calls).length, 0);
  });

  test('risk grade = max(allowlist tier, touched paths)', async () => {
    const { run } = makeRunner({ edit: { 'src/security/Auth.ts': 'x\n' } });
    const out = await runContinueGoverned({ prompt: 'x', allow: ['editFile'], cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    assert.equal(out.status, 'QUARANTINED_PENDING_APPROVAL', out.reason);
    assert.equal(out.riskGrade, 'L3');
    const { run: run2 } = makeRunner({ edit: { 'notes.md': 'x\n' } });
    const out2 = await runContinueGoverned({ prompt: 'x', allow: ['editFile'], cwd: root, writesAllowed: true, timeoutMs: T }, deps(run2));
    assert.equal(out2.riskGrade, 'L2');
  });

  test('agent exits non-zero -> FAILED_INCONCLUSIVE, nothing promotable, receipt has the exit code', async () => {
    const { run } = makeRunner({ agentCode: 2 });
    const out = await runAiderGoverned({ prompt: 'x', cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    assert.equal(out.status, 'FAILED_INCONCLUSIVE');
    assert.equal(out.changeSet, undefined);
    assert.equal(out.receipt?.exitCode, 2);
  });

  test('SECRET: API key goes in child env ONLY — never argv, never receipt', async () => {
    const { run, calls } = makeRunner();
    const out = await runContinueGoverned({ prompt: 'x', allow: [], apiKey: 'CONT_TOPSECRET', cwd: root, writesAllowed: true, timeoutMs: T }, deps(run));
    const cnCall = spawnCalls(calls)[0];
    assert.equal(cnCall.opts?.env?.CONTINUE_API_KEY, 'CONT_TOPSECRET', 'key passed via child env');
    assert.ok(!cnCall.args.join(' ').includes('CONT_TOPSECRET'), 'key never in argv');
    assert.ok(!JSON.stringify(out.receipt).includes('CONT_TOPSECRET'), 'key never in receipt');
  });
});

suite('continue-wrapper pure helpers (#104)', () => {
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
});

// FX951 (#475 LD7): agent executables resolve only to absolute PATH entries
// outside the workspace, and the production runner spawns nothing else.
suite('agent executable resolution (#475 LD7)', () => {
  const win = process.platform === 'win32';
  const sep = win ? ';' : ':';
  let tmp = '';
  setup(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsx-'))); });
  teardown(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const place = (dir: string, file: string): string => {
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, file);
    fs.writeFileSync(full, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(full, 0o755);
    return full;
  };

  test('skips the workspace and relative PATH entries; returns the absolute entry outside the workspace', () => {
    const exe = win ? 'aider.exe' : 'aider';
    const ws = path.join(tmp, 'ws');
    const wsBin = path.join(ws, 'node_modules', '.bin');
    place(wsBin, exe);
    place(path.join(tmp, 'relbin'), exe);
    const outside = place(path.join(tmp, 'tools'), exe);
    const cwd = process.cwd();
    process.chdir(tmp); // 'relbin' now resolves to a directory that holds the executable
    try {
      const pathEnv = [wsBin, 'relbin', path.join(tmp, 'tools')].join(sep);
      assert.equal(resolveAgentExecutable('aider', { pathEnv, platform: process.platform, excludeDirs: [ws] }), outside);
      assert.equal(resolveAgentExecutable('aider', { pathEnv: wsBin, platform: process.platform, excludeDirs: [ws] }), undefined);
      // Control: without the exclusion the workspace copy is the first match.
      assert.equal(resolveAgentExecutable('aider', { pathEnv, platform: process.platform, excludeDirs: [] }), path.join(wsBin, exe));
      if (win) assert.equal(resolveAgentExecutable('aider', { pathEnv: wsBin, platform: 'win32', excludeDirs: [ws.toUpperCase()] }), undefined, 'case-insensitive on win32');
    } finally { process.chdir(cwd); }
  });

  test('a .cmd-only Continue install on win32 resolves to nothing', function () {
    if (!win) this.skip(); // win32 PATH semantics (drive-letter entries, .exe/.com) need a Windows host
    const bin = path.join(tmp, 'npm');
    place(bin, 'cn.cmd');
    assert.equal(resolveAgentExecutable('cn', { pathEnv: bin, platform: 'win32', excludeDirs: [] }), undefined);
    const exe = place(bin, 'cn.exe'); // control: the same directory is searched
    assert.equal(resolveAgentExecutable('cn', { pathEnv: bin, platform: 'win32', excludeDirs: [] }), exe);
  });

  test('the production runner spawns only a recorded path; with none recorded it returns 126 and spawns nothing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- the spy must replace spawn on the real module object
    const cp = require('child_process') as { spawn: (...a: unknown[]) => unknown };
    const realSpawn = cp.spawn;
    const spawned: unknown[] = [];
    cp.spawn = (...a: unknown[]) => { spawned.push(a[0]); return realSpawn(...a); };
    try {
      // Control: a recorded path is what gets spawned (the spy sees it).
      const ok = await detectBinary('cn', ['--version'], defaultAgentRun, { workspaceRoot: tmp, resolve: () => process.execPath });
      assert.equal(ok.available, true);
      assert.deepEqual(spawned, [process.execPath]);
      // Detection that resolves nothing deletes the record.
      assert.deepEqual(await detectBinary('cn', ['--version'], defaultAgentRun, { workspaceRoot: tmp, resolve: () => undefined }), { available: false });
      const res = await defaultAgentRun('cn', ['--version']);
      assert.equal(res.code, 126);
      assert.equal((await defaultAgentRun('node', ['--version'])).code, 126, 'names other than aider / cn are refused');
      assert.deepEqual(spawned, [process.execPath], 'spawn never called after the record was deleted');
    } finally { cp.spawn = realSpawn; }
  });
});
