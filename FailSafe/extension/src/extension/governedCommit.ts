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
 *
 * #532 (plan-532c LD7a, B286): the commit is bound to this run before it may be offered for
 * linking to the active intent: `commitSha` is set only when its parent is the HEAD read before
 * the commit (none when unborn), its tree is the index tree FailSafe staged (`write-tree`), its
 * message is the one FailSafe wrote (`--cleanup=verbatim`), and it is the tip of the branch.
 */

import { spawn } from 'child_process';
import { trustedGitPath } from '../shared/git/trustedGit';
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
  /** #532 (plan-532c LD7): the full name of the commit FailSafe made, set only when its parent, tree,
   *  message and branch tip bind it to this run; otherwise unset (and `warning` says why). */
  commitSha?: string;
  /** Always credential-redacted (`https://***@host/...`) — never a fetchable URL. */
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

/**
 * Strip http(s) userinfo (`https://user:pw@host` → `https://***@host`). `git remote
 * get-url` returns userinfo verbatim, and whether git redacts it in error text is
 * version-dependent — so redact at our own boundary rather than trusting the caller's
 * git. ssh URLs are left alone: `git@host` is a username, not a credential.
 */
export function redactUrlCredentials(text: string): string {
  // Greedy to the LAST `@` before the path/whitespace (#349): curl/git parse
  // userinfo to the last `@`, so a raw `@` inside a password must not leave a
  // tail exposed. Path `@` stays safe — `/` remains excluded from the run.
  return text.replace(/(https?:\/\/)[^/\s]+@/gi, '$1***@');
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
  const before = await readBeforeCommit(git, cwd);
  const committed = await git(['commit', '--cleanup=verbatim', '-m', req.message], cwd);
  if (committed.code !== 0) {
    return { step: 'noop', branch: req.branch, warning: `commit failed: ${committed.stderr.trim() || 'nothing staged'}` };
  }
  const head = await git(['rev-parse', '--short', 'HEAD'], cwd);
  const commit = head.stdout.trim();
  const bound = await bindCommit(git, cwd, req, before);
  const withBinding = <T extends GovernedCommitResult>(r: T): T => ('sha' in bound
    ? { ...r, commitSha: bound.sha }
    : { ...r, warning: [r.warning, `commit not bound to this run (${bound.reason}); it is not offered for linking`].filter(Boolean).join('\n') });

  const remote = await git(['remote', 'get-url', 'origin'], cwd);
  if (remote.code !== 0 || !remote.stdout.trim()) {
    return withBinding({ step: 'committed', branch: req.branch, commit, warning: 'no `origin` remote — committed locally only' });
  }
  const remoteUrl = remote.stdout.trim();
  // Redacted copy for anything that leaves this function; `remoteUrl` itself stays
  // intact for slug parsing and the PR call.
  const safeRemoteUrl = redactUrlCredentials(remoteUrl);

  const pushed = await git(['push', '-u', 'origin', req.branch], cwd);
  if (pushed.code !== 0) {
    return withBinding({ step: 'committed', branch: req.branch, commit, remoteUrl: safeRemoteUrl, warning: `push failed: ${redactUrlCredentials(pushed.stderr.trim())}` });
  }

  const cmp = compareUrl(remoteUrl, req.base, req.branch);
  if (!deps.post || !deps.token || !deps.token.trim()) {
    return withBinding({ step: 'pushed', branch: req.branch, commit, remoteUrl: safeRemoteUrl, compareUrl: cmp, warning: 'no GitHub token — branch pushed; open the PR manually' });
  }

  const pr = await createPullRequest(
    { token: deps.token, apiBaseUrl: deps.apiBaseUrl, remoteUrl, head: req.branch, base: req.base, title: req.prTitle, body: req.prBody },
    deps.post,
  );
  if (pr.ok && pr.url) {
    return withBinding({ step: 'pr', branch: req.branch, commit, remoteUrl: safeRemoteUrl, prUrl: pr.url, compareUrl: cmp });
  }
  return withBinding({ step: 'pushed', branch: req.branch, commit, remoteUrl: safeRemoteUrl, compareUrl: cmp, warning: pr.error || 'PR not created — open it manually' });
}

/** A full object name: SHA-1 (40 hex) or SHA-256 (64 hex). */
const FULL_NAME = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const CHANGED_BY_HOOK = 'a commit hook or a configured trailer changed the commit';

interface BeforeCommit {
  /** HEAD before the commit; null when the branch is unborn; undefined when git could not read it (a spawn error is not unborn). */
  head: string | null | undefined;
  tree: string | undefined;
}

/** #532 (plan-532c LD7a): HEAD (or unborn) and the index tree, read after staging and before the commit. */
async function readBeforeCommit(git: GitRunner, cwd: string): Promise<BeforeCommit> {
  const pre = await git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd);
  const preName = pre.stdout.trim();
  // `--verify --quiet` exits 1 with no output on an unborn branch; a runner that could not start git
  // also answers code 1, but with an error message, so only a silent exit 1 is unborn.
  const unborn = pre.code === 1 && !preName && !pre.stderr.trim();
  const head = pre.code === 0 && FULL_NAME.test(preName) ? preName : unborn ? null : undefined;
  const tree = await git(['write-tree'], cwd);
  const treeName = tree.stdout.trim();
  return { head, tree: tree.code === 0 && FULL_NAME.test(treeName) ? treeName : undefined };
}

/** #532 (plan-532c LD7a): the commit FailSafe made, or why it cannot be bound to this run. */
async function bindCommit(
  git: GitRunner, cwd: string, req: GovernedCommitRequest, before: BeforeCommit,
): Promise<{ sha: string } | { reason: string }> {
  if (before.head === undefined) return { reason: 'git could not read HEAD before the commit' };
  if (!before.tree) return { reason: 'git could not read the staged tree before the commit' };
  const sha = (await git(['rev-parse', '--verify', 'HEAD'], cwd)).stdout.trim();
  if (!FULL_NAME.test(sha)) return { reason: 'the commit name is not a full commit name' };
  const log = await git(['log', '-1', '--format=%T%x00%P%x00%B', sha], cwd);
  if (log.code !== 0) return { reason: 'git could not read the commit' };
  const [tree = '', parents = '', ...rest] = log.stdout.split('\u0000');
  const message = rest.join('\u0000');
  const expectedParents = before.head ? [before.head] : [];
  const actualParents = parents.trim() ? parents.trim().split(/\s+/) : [];
  if (actualParents.join(' ') !== expectedParents.join(' ')) return { reason: 'its parent is not the HEAD recorded before the commit' };
  if (tree.trim() !== before.tree) return { reason: `its tree differs from what FailSafe staged; ${CHANGED_BY_HOOK}` };
  if (message !== `${req.message}\n` && message !== `${req.message}\n\n`) {
    return { reason: `its message differs from the one FailSafe wrote; ${CHANGED_BY_HOOK}` };
  }
  const tip = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${req.branch}`], cwd);
  if (tip.code !== 0 || tip.stdout.trim() !== sha) return { reason: `it is not the tip of ${req.branch}` };
  return { sha };
}

/** Production git runner — trusted absolute git, `spawn` (shell:false), never throws (non-zero → {code}). */
export const defaultGitRunner: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    let exe: string;
    try { exe = trustedGitPath(cwd); } catch (e) { resolve({ code: 1, stdout: '', stderr: String(e) }); return; }
    const child = spawn(exe, args, { cwd, shell: false, windowsHide: true }); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
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
