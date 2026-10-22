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
 *   diff-tree <DIFF_IDENTITY_ARGS> --end-of-options <sha>  (#532 B344: the diff identity of a rework)
 *   log -1 --format=%P --end-of-options <sha>            (#532 B344: the parents of a rework)
 *   diff-tree --no-commit-id --name-status -r -z --root --no-renames --end-of-options <sha>   (#532 B344: complete, uncapped)
 *
 * A commit name read back from the intent history is re-validated as a full object name before
 * it reaches git; anything else is `missing` and git is not called with it.
 */

import { createHash } from 'crypto';
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

/** #532 B344 (plan-b344 LD6): every flag that can change the diff text, pinned in argv. */
export const DIFF_IDENTITY_ARGS: readonly string[] = Object.freeze([
  '-p', '--binary', '-r', '--no-commit-id', '--root', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames',
  '--diff-algorithm=myers', '--no-indent-heuristic', '--unified=3',
]);

export type DiffIdentity =
  | { state: 'ok'; id: string }
  | { state: 'none'; reason: 'empty' | 'undecodable' }
  | { state: 'unavailable'; detail: string };

/** U+FFFD, the character a byte sequence that is not UTF-8 decodes to. */
const REPLACEMENT = String.fromCharCode(0xfffd);
const INDEX_LINE = /^index [0-9a-f]+\.\.[0-9a-f]+( [0-7]{6})?$/;
const HUNK_LINE = /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@.*$/;
const firstLine = (text: string): string => text.split(/\r?\n/)[0] || UNAVAILABLE;

/**
 * #532 B344 (plan-b344 LD6): SHA-256 of the commit's patch with the blob names (`index` lines)
 * removed and the hunk headers reduced to `@@`, so the same change on another base has the same
 * identity. Both regexes are line-anchored, so content lines (which start with +, - or a space)
 * are kept. An empty patch (an empty commit, or a merge, which diff-tree prints nothing for) and a
 * patch that is not UTF-8 have no identity (`none`). A git that cannot answer, or any exit, is
 * `unavailable`.
 */
export function diffIdentity(root: string, sha: string, git: ArchitectureGit = defaultArchitectureGit): DiffIdentity {
  if (!COMMIT_NAME_RE.test(sha)) return { state: 'unavailable', detail: 'not a full commit name' };
  const out = git(root, ['diff-tree', ...DIFF_IDENTITY_ARGS, '--end-of-options', sha]);
  if (out.kind === 'unavailable') return { state: 'unavailable', detail: out.detail };
  if (out.kind === 'exit') return { state: 'unavailable', detail: firstLine(out.stderr) };
  if (!out.stdout.trim()) return { state: 'none', reason: 'empty' };
  if (out.stdout.includes(REPLACEMENT)) return { state: 'none', reason: 'undecodable' };
  const text = out.stdout.split('\n').filter((l) => !INDEX_LINE.test(l)).map((l) => (HUNK_LINE.test(l) ? '@@' : l)).join('\n');
  return { state: 'ok', id: createHash('sha256').update(text, 'utf8').digest('hex') };
}

export type CommitParents = { state: 'ok'; parents: string[] } | { state: 'unavailable'; detail: string };

/** #532 B344: the commit's parents (none for a root commit). Any exit, or a name that is not a full object name, is `unavailable`. */
export function commitParents(root: string, sha: string, git: ArchitectureGit = defaultArchitectureGit): CommitParents {
  if (!COMMIT_NAME_RE.test(sha)) return { state: 'unavailable', detail: 'not a full commit name' };
  const out = git(root, ['log', '-1', '--format=%P', '--end-of-options', sha]);
  if (out.kind === 'unavailable') return { state: 'unavailable', detail: out.detail };
  if (out.kind === 'exit') return { state: 'unavailable', detail: firstLine(out.stderr) };
  const parents = out.stdout.trim().split(/\s+/).filter(Boolean);
  if (!parents.every((p) => COMMIT_NAME_RE.test(p))) return { state: 'unavailable', detail: 'git printed a parent that is not a full commit name' };
  return { state: 'ok', parents };
}

export interface ChangedPath {
  status: 'A' | 'M' | 'D' | 'T';
  path: string;
  /** False when the path decoded with U+FFFD (its bytes are not UTF-8), so it cannot be shown exactly. */
  showable: boolean;
}

export type ChangedPaths =
  | { state: 'ok'; paths: ChangedPath[] }
  | { state: 'unavailable'; detail: string };

const PATH_STATUSES: ReadonlySet<string> = new Set(['A', 'M', 'D', 'T']);

/**
 * #532 B344 (plan-b344 LD6): every path the commit changed, with its status, uncapped. The `-z`
 * output is status NUL path NUL, repeated. It fails closed: an unknown status (renames and copies
 * are off, so R and C never belong here), an unpaired field, an empty path or a trailing record
 * with no terminator is `unavailable`, never a shorter list. As for diffIdentity and commitParents,
 * any exit, or a name that is not a full object name, is `unavailable` (the caller has resolved it).
 */
export function changedPaths(root: string, sha: string, git: ArchitectureGit = defaultArchitectureGit): ChangedPaths {
  if (!COMMIT_NAME_RE.test(sha)) return { state: 'unavailable', detail: 'not a full commit name' };
  const out = git(root, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--root', '--no-renames', '--end-of-options', sha]);
  if (out.kind === 'unavailable') return { state: 'unavailable', detail: out.detail };
  if (out.kind === 'exit') return { state: 'unavailable', detail: firstLine(out.stderr) };
  if (out.stdout === '') return { state: 'ok', paths: [] };
  const bad = (detail: string): ChangedPaths => ({ state: 'unavailable', detail: `git printed a change list FailSafe cannot read: ${detail}` });
  const fields = out.stdout.split('\0');
  if (fields.pop() !== '') return bad('a record with no terminator');
  if (fields.length % 2 !== 0) return bad('an unpaired field');
  const paths: ChangedPath[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const status = fields[i];
    const file = fields[i + 1];
    if (!PATH_STATUSES.has(status)) return bad(`status ${JSON.stringify(status.slice(0, 8))}`);
    if (!file) return bad('an empty path');
    paths.push({ status: status as ChangedPath['status'], path: file, showable: !file.includes(REPLACEMENT) });
  }
  return { state: 'ok', paths };
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
