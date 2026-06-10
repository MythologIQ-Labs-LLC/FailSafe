/**
 * governedCommit — turn a set of workspace edits (e.g. the Organize/Initialize
 * outputs) into a clean, attributed git history instead of a lingering "dirty"
 * tree. Operator-confirmed (the caller asks first); this just runs the ladder.
 *
 * Degrade-safe ladder (operator-chosen floor = "commit + push branch, skip PR"):
 *   not-a-repo  → no-op (report only)
 *   noop        → the named paths have nothing staged
 *   committed   → committed locally (no `origin` remote, or push failed)
 *   pushed      → committed + pushed a branch (no GitHub token, or PR rejected) + compare URL
 *   pr          → committed + pushed + opened a PR
 *
 * PURE wiring over an INJECTED git runner + POST transport — no `spawn`/network
 * in tests. Never throws: every failure becomes a lower rung + a `warning`.
 */

import { spawn } from 'child_process';
import { parseRepoSlug } from '../integrations/github-checks/github-checks-map';
import { createPullRequest, type GitHubPostFn } from '../integrations/github-checks/github-checks-client';

export type GitRunner = (args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface GovernedCommitRequest {
  workspaceRoot: string;
  /** The exact paths the feature touched — staged precisely (add -A covers deletes). */
  paths: string[];
  branch: string;
  message: string;
  base: string;     // PR base, e.g. "main"
  prTitle: string;
  prBody: string;
}

export interface GovernedCommitDeps {
  git: GitRunner;
  post?: GitHubPostFn;
  token?: string;
  apiBaseUrl?: string;
}

export type GovernedCommitStep = 'not-a-repo' | 'noop' | 'committed' | 'pushed' | 'pr';

export interface GovernedCommitResult {
  step: GovernedCommitStep;
  branch?: string;
  commit?: string;
  remoteUrl?: string;
  prUrl?: string;
  compareUrl?: string;
  /** Non-fatal note explaining why the ladder stopped where it did. */
  warning?: string;
}

function compareUrl(remoteUrl: string, base: string, head: string): string | undefined {
  const slug = parseRepoSlug(remoteUrl);
  if (!slug) return undefined;
  return `https://github.com/${slug.owner}/${slug.repo}/compare/${base}...${head}`;
}

export async function commitPushOpenPr(
  req: GovernedCommitRequest,
  deps: GovernedCommitDeps,
): Promise<GovernedCommitResult> {
  const { git } = deps;
  const cwd = req.workspaceRoot;

  const isRepo = await git(['rev-parse', '--is-inside-work-tree'], cwd);
  if (isRepo.code !== 0 || isRepo.stdout.trim() !== 'true') return { step: 'not-a-repo' };

  const status = await git(['status', '--porcelain', '--', ...req.paths], cwd);
  if (status.code === 0 && status.stdout.trim() === '') return { step: 'noop' };

  // Create the branch (fall back to switching to it if it already exists).
  const branched = await git(['checkout', '-b', req.branch], cwd);
  if (branched.code !== 0) await git(['checkout', req.branch], cwd);

  await git(['add', '-A', '--', ...req.paths], cwd);
  const committed = await git(['commit', '-m', req.message], cwd);
  if (committed.code !== 0) {
    return { step: 'noop', branch: req.branch, warning: `commit failed: ${committed.stderr.trim() || 'nothing staged'}` };
  }
  const head = await git(['rev-parse', '--short', 'HEAD'], cwd);
  const commit = head.stdout.trim();

  const remote = await git(['remote', 'get-url', 'origin'], cwd);
  if (remote.code !== 0 || !remote.stdout.trim()) {
    return { step: 'committed', branch: req.branch, commit, warning: 'no `origin` remote — committed locally only' };
  }
  const remoteUrl = remote.stdout.trim();

  const pushed = await git(['push', '-u', 'origin', req.branch], cwd);
  if (pushed.code !== 0) {
    return { step: 'committed', branch: req.branch, commit, remoteUrl, warning: `push failed: ${pushed.stderr.trim()}` };
  }

  const cmp = compareUrl(remoteUrl, req.base, req.branch);
  if (!deps.post || !deps.token || !deps.token.trim()) {
    return { step: 'pushed', branch: req.branch, commit, remoteUrl, compareUrl: cmp, warning: 'no GitHub token — branch pushed; open the PR manually' };
  }

  const pr = await createPullRequest(
    { token: deps.token, apiBaseUrl: deps.apiBaseUrl, remoteUrl, head: req.branch, base: req.base, title: req.prTitle, body: req.prBody },
    deps.post,
  );
  if (pr.ok && pr.url) {
    return { step: 'pr', branch: req.branch, commit, remoteUrl, prUrl: pr.url, compareUrl: cmp };
  }
  return { step: 'pushed', branch: req.branch, commit, remoteUrl, compareUrl: cmp, warning: pr.error || 'PR not created — open it manually' };
}

/** Production git runner — `spawn` (shell:false), never throws (non-zero → {code}). */
export const defaultGitRunner: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    const child = spawn('git', args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c); });
    child.on('error', (e) => resolve({ code: 1, stdout, stderr: stderr || String(e) }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

/** Parse `git status --porcelain` → the set of changed paths (strips status flags + rename arrows + quotes). */
export async function statusPaths(git: GitRunner, cwd: string): Promise<string[]> {
  const res = await git(['status', '--porcelain'], cwd);
  if (res.code !== 0) return [];
  return res.stdout.split(/\r?\n/).map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0)
    .map((l) => l.slice(3).replace(/^.*\s->\s/, '').replace(/^"|"$/g, '').trim());
}
