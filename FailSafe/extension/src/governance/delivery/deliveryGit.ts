/**
 * #532 part B (plan-532b LD4): the git reads behind the `committed-under` edge.
 *
 * Every call goes through the architecture index's git runner (makeArchitectureGit): the
 * trusted resolver, an argv array, no shell, a timeout and a buffer cap. Only these
 * subcommands are run (DELIVERY_GIT_SUBCOMMANDS):
 *
 *   rev-parse --verify --quiet HEAD                      (sourceShaOf: exit 1 is an unborn repository)
 *   log -z -n 50 --format=%H%x1f%s HEAD                  (the commits the operator may pick)
 *   symbolic-ref --quiet --short HEAD                    (exit 1 is a detached HEAD: branch null)
 *   cat-file -e --end-of-options <sha>^{commit}
 *   rev-parse --verify --quiet --end-of-options <sha>^{tree}
 *   diff-tree --no-commit-id --name-only -r -z --root --end-of-options <sha>   (display only, capped)
 *
 * A commit name read back from the intent history is re-validated as a full object name before
 * it reaches git; anything else is `missing` and git is not called with it.
 */

import { defaultArchitectureGit, type ArchitectureGit } from '../architecture/ArchitectureIndexDiscovery';

export const DELIVERY_GIT_SUBCOMMANDS: ReadonlySet<string> =
  new Set(['rev-parse', 'log', 'symbolic-ref', 'cat-file', 'diff-tree']);
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

export function listRecentCommits(_root: string, _git: ArchitectureGit = defaultArchitectureGit): RecentCommits {
  throw new Error('not implemented');
}

export function currentBranch(_root: string, _git: ArchitectureGit = defaultArchitectureGit): string | null {
  throw new Error('not implemented');
}

export function resolveCommit(_root: string, _sha: string, _git: ArchitectureGit = defaultArchitectureGit): CommitResolution {
  throw new Error('not implemented');
}

export function changedFiles(_root: string, _sha: string, _git: ArchitectureGit = defaultArchitectureGit): ChangedFiles | null {
  throw new Error('not implemented');
}
