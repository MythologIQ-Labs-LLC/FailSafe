/**
 * isolated-run — run a coding agent in a disposable git worktree so nothing it
 * writes through its working directory reaches the workspace (#475, LD5).
 *
 * Order is fixed: preconditions -> start process tracking -> worktree add ->
 * agent -> kill the agent's process tree -> post-run snapshot -> worktree
 * admin-dir check -> capture -> validation -> worktree removal (always).
 * The agent's environment carries FAILSAFE_ISOLATED_RUN=<random per run>, the
 * marker linux tracking follows (process-tree.ts); POSIX samples every 250 ms.
 *
 * A worktree is not a process sandbox. Direct writes to the repository and its
 * git state are DETECTED (WORKSPACE_CHANGED_DURING_RUN) and never promoted, but
 * they have already happened; writes outside the repository are not detected.
 */

import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AgentRunFn, AgentRunResult, DiffSummary } from './agent-cli-core';
import { createSafeGit, PINNED_DIFF, type SafeGit } from './git-safety';
import { patchStats, validatePatch } from './patch-paths';
import { startTreeTracker, type TreeTracker } from './process-tree';
import { changedPaths, diffSnapshots, isCleanSnapshot, takeSnapshot, type Snapshot } from './workspace-snapshot';

export type RunStatus =
  | 'BLOCKED_PRE_EXECUTION' | 'NO_CHANGES' | 'QUARANTINED_PENDING_APPROVAL'
  | 'REJECTED_PATCH' | 'WORKSPACE_CHANGED_DURING_RUN' | 'FAILED_INCONCLUSIVE';

export interface IsolatedRunResult {
  status: RunStatus;
  reason: string;
  details: string[];
  /** True once the agent process was launched. */
  agentStarted: boolean;
  exitCode: number | null;
  stdout: string;
  stats: DiffSummary;
  /** Repository top level the run was based on (promotion applies here). */
  root?: string;
  baseHead?: string;
  preSnapshot?: Snapshot;
  /** Captured change set — present only for QUARANTINED_PENDING_APPROVAL. */
  patch?: Buffer;
  patchSha256?: string;
  worktreePath?: string;
  /** Set when the disposable worktree could not be removed. */
  cleanupError?: string;
}

export interface AgentInvocation { cmd: string; args: string[]; env?: Record<string, string | undefined> }

export interface IsolatedRunDeps {
  run: AgentRunFn;
  timeoutMs: number;
  /** `marker` is the FAILSAFE_ISOLATED_RUN value placed in the agent's environment. */
  startTracker?: (sinceMs: number, marker: string) => Promise<TreeTracker>;
  sampleIntervalMs?: number;
  tmpRoot?: string;
}

const NO_STATS: DiffSummary = { files: 0, additions: 0, deletions: 0, paths: [] };
const MAX_DETAILS = 50;

class RunStop extends Error {
  constructor(readonly status: RunStatus, reason: string, readonly details: string[] = []) { super(reason); }
}

export const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

interface Prepared { root: string; prefix: string; baseHead: string; pre: Snapshot }

async function preconditions(git: SafeGit, cwd: string): Promise<Prepared> {
  const top = await git.tryRun(cwd, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) throw new RunStop('BLOCKED_PRE_EXECUTION', 'the workspace is not a git work tree');
  const root = path.resolve(top.stdout.toString().trim());
  const prefix = (await git.run(cwd, ['rev-parse', '--show-prefix'])).toString().trim();
  const head = await git.tryRun(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (head.code !== 0) throw new RunStop('BLOCKED_PRE_EXECUTION', 'HEAD does not resolve to a commit (empty repository?)');
  const flagged = (await git.run(root, ['ls-files', '-v', '-z'])).toString('utf8').split('\0')
    .filter((l) => l.length > 2 && (l[0] === 'S' || /[a-z]/.test(l[0]))).map((l) => l.slice(2));
  if (flagged.length) throw new RunStop('BLOCKED_PRE_EXECUTION', 'skip-worktree / assume-unchanged entries hide changes from review', flagged.slice(0, MAX_DETAILS));
  const pre = await takeSnapshot(git, root);
  if (!isCleanSnapshot(pre)) {
    const dirty = changedPaths(pre);
    throw new RunStop('BLOCKED_PRE_EXECUTION', 'the work tree has uncommitted or untracked files; commit, stash or exclude them (.gitignore or .git/info/exclude) first', dirty.slice(0, MAX_DETAILS));
  }
  return { root, prefix, baseHead: head.stdout.toString().trim(), pre };
}

interface Worktree { dir: string; adminDir: string; markers: Map<string, string> }

const readOrAbsent = (f: string): string => { try { return fs.readFileSync(f, 'utf8'); } catch { return '<absent>'; } };

async function addWorktree(git: SafeGit, prep: Prepared, tmpRoot: string): Promise<Worktree> {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'fsa-'));
  const added = await git.tryRun(prep.root, ['worktree', 'add', '--detach', dir, prep.baseHead]);
  if (added.code !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    await git.tryRun(prep.root, ['worktree', 'prune']);
    throw new RunStop('FAILED_INCONCLUSIVE', `git worktree add failed: ${added.stderr.trim().slice(0, 300)}`);
  }
  const link = /^gitdir:\s*(.+)$/m.exec(readOrAbsent(path.join(dir, '.git')));
  if (!link) throw new RunStop('FAILED_INCONCLUSIVE', 'the new worktree has no .git link file');
  const adminDir = path.resolve(dir, link[1].trim());
  const markers = new Map<string, string>();
  for (const f of [path.join(dir, '.git'), path.join(adminDir, 'gitdir'), path.join(adminDir, 'commondir')]) markers.set(f, readOrAbsent(f));
  return { dir, adminDir, markers };
}

interface AgentRun { res: AgentRunResult; timedOut: boolean; survivors: number[]; trackingError?: string }

async function runAgent(agent: AgentInvocation, cwd: string, tracker: TreeTracker, marker: string, deps: IsolatedRunDeps): Promise<AgentRun> {
  let trackingError: string | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    inFlight = inFlight.then(() => tracker.sample()).catch((e) => { trackingError = String(e); });
  }, deps.sampleIntervalMs ?? (process.platform === 'win32' ? 1000 : 250));
  const runP = deps.run(agent.cmd, agent.args, {
    cwd, env: { ...(agent.env ?? process.env), FAILSAFE_ISOLATED_RUN: marker },
    detached: process.platform !== 'win32', onSpawn: (pid) => tracker.attach(pid),
  });
  let timeout: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    runP.then(() => false),
    new Promise<boolean>((r) => { timeout = setTimeout(() => r(true), deps.timeoutMs); }),
  ]);
  clearTimeout(timeout);
  clearInterval(timer);
  await inFlight;
  let survivors: number[] = [];
  try { survivors = await tracker.killAll(); } catch (e) { trackingError = String(e); }
  const res = await Promise.race([runP, new Promise<AgentRunResult>((r) => setTimeout(() => r({ stdout: '', stderr: 'agent did not exit after kill', code: null }), 10000))]);
  return { res, timedOut, survivors, trackingError };
}

function verifyAfterRun(pre: Snapshot, post: Snapshot, wt: Worktree): void {
  const changed = diffSnapshots(pre, post);
  for (const [f, before] of wt.markers) if (readOrAbsent(f) !== before) changed.push(`worktree-link:${f}`);
  if (changed.length) {
    throw new RunStop('WORKSPACE_CHANGED_DURING_RUN', 'the repository changed outside the isolated worktree during the run; nothing is promotable', changed.slice(0, MAX_DETAILS));
  }
}

function checkAgentExit(run: AgentRun, timeoutMs: number): void {
  if (run.trackingError) throw new RunStop('FAILED_INCONCLUSIVE', `process tracking failed: ${run.trackingError}`);
  if (run.survivors.length) throw new RunStop('FAILED_INCONCLUSIVE', 'agent processes survived termination', run.survivors.map(String));
  if (run.timedOut) throw new RunStop('FAILED_INCONCLUSIVE', `the agent did not finish within ${timeoutMs} ms and was stopped`);
  if (run.res.code !== 0) throw new RunStop('FAILED_INCONCLUSIVE', `the agent exited with code ${run.res.code}`, [run.res.stderr.slice(-500)]);
}

async function capture(git: SafeGit, prep: Prepared, wt: Worktree): Promise<{ patch: Buffer; stats: DiffSummary }> {
  const gd = [`--git-dir=${wt.adminDir}`, `--work-tree=${wt.dir}`];
  await git.run(wt.dir, [...gd, 'add', '-A']);
  const patch = await git.run(wt.dir, [...gd, 'diff', '--cached', ...PINNED_DIFF, prep.baseHead]);
  if (!patch.length) return { patch, stats: NO_STATS };
  const numstat = (await git.run(prep.root, ['apply', '--numstat', '-z', '-'], { input: patch })).toString('utf8');
  const summary = (await git.run(prep.root, ['apply', '--summary', '-'], { input: patch })).toString('utf8');
  const problems = validatePatch(numstat, summary);
  if (problems.length) throw new RunStop('REJECTED_PATCH', 'the change set contains paths or modes that are never promoted', problems.slice(0, MAX_DETAILS));
  return { patch, stats: patchStats(numstat) };
}

async function removeWorktree(git: SafeGit, root: string, wt: Worktree): Promise<string | undefined> {
  try {
    fs.rmSync(wt.dir, { recursive: true, force: true, maxRetries: 3 });
    await git.tryRun(root, ['worktree', 'prune']);
    if (fs.existsSync(wt.adminDir)) fs.rmSync(wt.adminDir, { recursive: true, force: true });
    return fs.existsSync(wt.dir) ? `worktree left at ${wt.dir}` : undefined;
  } catch (e) {
    return `worktree removal failed at ${wt.dir}: ${String(e)}`;
  }
}

/** Run `agent` in a disposable worktree of the repository containing `cwd`. */
export async function runIsolated(cwd: string, agent: AgentInvocation, deps: IsolatedRunDeps): Promise<IsolatedRunResult> {
  const base: IsolatedRunResult = { status: 'FAILED_INCONCLUSIVE', reason: '', details: [], agentStarted: false, exitCode: null, stdout: '', stats: NO_STATS };
  let git: SafeGit;
  try { git = createSafeGit(cwd); } catch (e) { return { ...base, status: 'BLOCKED_PRE_EXECUTION', reason: `cannot prepare git: ${String(e)}` }; }
  let tracker: TreeTracker | undefined;
  let wt: Worktree | undefined;
  const out = { ...base };
  try {
    const prep = await preconditions(git, cwd);
    Object.assign(out, { root: prep.root, baseHead: prep.baseHead, preSnapshot: prep.pre });
    const marker = randomBytes(16).toString('hex');
    const start = deps.startTracker ?? ((since: number, m: string) => startTreeTracker(since, process.platform, { marker: m }));
    try { tracker = await start(Date.now(), marker); } catch (e) {
      throw new RunStop('BLOCKED_PRE_EXECUTION', `process tracking is unavailable, so the agent is not started: ${String(e)}`);
    }
    wt = await addWorktree(git, prep, deps.tmpRoot ?? os.tmpdir());
    out.worktreePath = wt.dir;
    out.agentStarted = true;
    const run = await runAgent(agent, path.join(wt.dir, prep.prefix), tracker, marker, deps);
    Object.assign(out, { exitCode: run.res.code, stdout: run.res.stdout });
    verifyAfterRun(prep.pre, await takeSnapshot(git, prep.root), wt);
    checkAgentExit(run, deps.timeoutMs);
    const { patch, stats } = await capture(git, prep, wt);
    if (!patch.length) return Object.assign(out, { status: 'NO_CHANGES', reason: 'the agent made no changes' });
    return Object.assign(out, { status: 'QUARANTINED_PENDING_APPROVAL', reason: 'changes are held for review', stats, patch, patchSha256: sha256(patch) });
  } catch (e) {
    if (e instanceof RunStop) return Object.assign(out, { status: e.status, reason: e.message, details: e.details });
    return Object.assign(out, { status: 'FAILED_INCONCLUSIVE', reason: e instanceof Error ? e.message : String(e) });
  } finally {
    tracker?.dispose();
    if (wt && out.root) out.cleanupError = await removeWorktree(git, out.root, wt);
    git.dispose();
  }
}
