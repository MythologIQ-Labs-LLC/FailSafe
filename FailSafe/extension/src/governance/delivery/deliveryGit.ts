/**
 * #532 part B (plan-532b LD4): the git reads behind the `committed-under` edge.
 *
 * Every call goes through the architecture index's git runner (makeArchitectureGit): the
 * trusted resolver, an argv array, no shell, a timeout and a buffer cap. Only these
 * subcommands are run (DELIVERY_GIT_SUBCOMMANDS):
 *
 *   rev-parse --verify --quiet HEAD                      (sourceShaOf: exit 1 is an unborn repository)
 *   log -z -n 50 --format=%H%x1f%s HEAD                  (the commits the operator may pick)
 *   log -1 --format=%s --end-of-options <sha>            (#532 B320: the subject a review dialog shows)
 *   symbolic-ref --quiet --short HEAD                    (exit 1 is a detached HEAD: branch null)
 *   cat-file -e --end-of-options <sha>^{commit}
 *   rev-parse --verify --quiet --end-of-options <sha>^{tree}
 *   diff-tree --no-commit-id --name-only -r -z --root --end-of-options <sha>   (display only, capped)
 *   merge-base --is-ancestor --end-of-options <a> <b>    (#532 B320: exit 0 ancestor, exit 1 not; anything else unavailable)
 *
 * A commit name read back from the intent history is re-validated as a full object name before
 * it reaches git; anything else is `missing` and git is not called with it.
 */

import { defaultArchitectureGit, type ArchitectureGit } from '../architecture/ArchitectureIndexDiscovery';
import { sourceShaOf } from '../architecture/ArchitectureIndexBootstrap';

export const DELIVERY_GIT_SUBCOMMANDS: ReadonlySet<string> =
  new Set(['rev-parse', 'log', 'symbolic-ref', 'cat-file', 'diff-tree', 'merge-base']);
/** A full object name: SHA-1 (40 hex) or SHA-256 (64 hex). */
export const COMMIT_NAME_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
export const RECENT_COMMIT_LIMIT = 50;
export const CHANGED_FILE_LIMIT = 500;

export interface RecentCommit {
  sha: string;
  subject: string;
}

export type RecentCommits =
  | { state: 'ok'; head: string; branch: string | null; commits: RecentCommit[] }
  | { state: 'unborn'; branch: string | null }
  | { state: 'unavailable'; detail: string };

export type CommitResolution =
  | { state: 'found'; sha: string; tree: string }
  | { state: 'missing'; reason: string }
  | { state: 'unavailable'; detail: string };

export interface ChangedFiles {
  files: string[];
  truncated: boolean;
}

const UNAVAILABLE = 'git is unavailable, or this workspace is not a git repository git can read';

/** `symbolic-ref --quiet --short HEAD`; a detached HEAD (exit 1) or any failure is null. */
export function currentBranch(root: string, git: ArchitectureGit = defaultArchitectureGit): string | null {
  const out = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return out.kind === 'ok' && out.stdout.trim() ? out.stdout.trim() : null;
}

/**
 * HEAD and its 49 predecessors (50 commits), newest first. An unborn repository is told apart from
 * one git cannot read by sourceShaOf (rev-parse exit 1), so `git log` never runs on an unborn HEAD.
 */
export function listRecentCommits(root: string, git: ArchitectureGit = defaultArchitectureGit): RecentCommits {
  const head = sourceShaOf(root, git);
  if (head.sourceShaReason === 'unborn') return { state: 'unborn', branch: currentBranch(root, git) };
  if (!head.sourceSha) return { state: 'unavailable', detail: UNAVAILABLE };
  const out = git(root, ['log', '-z', '-n', String(RECENT_COMMIT_LIMIT), '--format=%H%x1f%s', 'HEAD']);
  if (out.kind === 'unavailable') return { state: 'unavailable', detail: out.detail };
  if (out.kind === 'exit') return { state: 'unavailable', detail: out.stderr.split(/\r?\n/)[0] || UNAVAILABLE };
  const commits: RecentCommit[] = [];
  for (const record of out.stdout.split('\0')) {
    const r = record.replace(/^\n+/, '');
    const cut = r.indexOf('\u001f');
    if (cut < 0) continue;
    const sha = r.slice(0, cut);
    if (COMMIT_NAME_RE.test(sha)) commits.push({ sha, subject: r.slice(cut + 1) });
  }
  return { state: 'ok', head: head.sourceSha, branch: currentBranch(root, git), commits: commits.slice(0, RECENT_COMMIT_LIMIT) };
}

/** Whether `sha` names a commit here, and its tree. A name that is not a full object name never reaches git. */
export function resolveCommit(root: string, sha: string, git: ArchitectureGit = defaultArchitectureGit): CommitResolution {
  if (!COMMIT_NAME_RE.test(sha)) return { state: 'missing', reason: 'not a full commit name' };
  const exists = git(root, ['cat-file', '-e', '--end-of-options', `${sha}^{commit}`]);
  if (exists.kind === 'unavailable') return { state: 'unavailable', detail: exists.detail };
  if (exists.kind === 'exit') return { state: 'missing', reason: 'the commit is not in this repository' };
  const tree = git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${sha}^{tree}`]);
  if (tree.kind === 'unavailable') return { state: 'unavailable', detail: tree.detail };
  const name = tree.kind === 'ok' ? tree.stdout.trim() : '';
  if (!COMMIT_NAME_RE.test(name)) return { state: 'missing', reason: 'the commit has no readable tree' };
  return { state: 'found', sha, tree: name };
}

/** #532 B320: the subject line of a commit (display only), or null when git cannot read it. */
export function commitSubject(root: string, sha: string, git: ArchitectureGit = defaultArchitectureGit): string | null {
  if (!COMMIT_NAME_RE.test(sha)) return null;
  const out = git(root, ['log', '-1', '--format=%s', '--end-of-options', sha]);
  return out.kind === 'ok' ? out.stdout.trim() : null;
}

export type Ancestry = 'ancestor' | 'not-ancestor' | 'unavailable';

/**
 * #532 B320 (plan-b320 LD2/LD6): whether `ancestor` is `descendant` or one of its ancestors.
 * Both names must be full object names that resolve to commits here (callers pass SHAs that
 * resolveCommit found); anything else is `unavailable` and git is not called. Equal names are an
 * ancestor without a git call. `git merge-base --is-ancestor` exit 0 is an ancestor and exit 1 is
 * not; every other exit (a bad object, a damaged repository) and a git that cannot run is
 * `unavailable`, never read as "not an ancestor".
 */
export function isAncestor(root: string, ancestor: string, descendant: string, git: ArchitectureGit = defaultArchitectureGit): Ancestry {
  if (!COMMIT_NAME_RE.test(ancestor) || !COMMIT_NAME_RE.test(descendant)) return 'unavailable';
  if (ancestor === descendant) return 'ancestor';
  const out = git(root, ['merge-base', '--is-ancestor', '--end-of-options', ancestor, descendant]);
  if (out.kind === 'ok') return 'ancestor';
  if (out.kind === 'exit' && out.status === 1) return 'not-ancestor';
  return 'unavailable';
}

/** Files the commit changed (a root commit against the empty tree), at most 500. Display only. */
export function changedFiles(root: string, sha: string, git: ArchitectureGit = defaultArchitectureGit): ChangedFiles | null {
  if (!COMMIT_NAME_RE.test(sha)) return null;
  const out = git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--root', '--end-of-options', sha]);
  if (out.kind !== 'ok') return null;
  const files = out.stdout.split('\0').filter(Boolean);
  return { files: files.slice(0, CHANGED_FILE_LIMIT), truncated: files.length > CHANGED_FILE_LIMIT };
}
