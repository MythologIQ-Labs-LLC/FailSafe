/**
 * A bounded, operator-visible manifest for directory selections in governed commits.
 * Candidate for #715, not a release or owner-authorized policy change.
 *
 * Git's default porcelain output collapses untracked directories. Using -z with
 * --untracked-files=all lists the actual filenames, including unusual spaces.
 * Never interpret pathspec magic from user input.
 */
import type { GitRunner } from './governedCommit';

export interface ApprovedFile {
  /** cwd-relative file path, not a directory selector */
  path: string;
  /** Git's actual porcelain XY state at the approval checkpoint. */
  state: string;
  /** Working-tree Git blob ID with filters, or null for a tracked deletion. */
  blob: string | null;
}
export interface ExactSelection { files: ApprovedFile[]; }
export type SelectionResult =
  | { ok: true; selection: ExactSelection }
  | { ok: false; warning: string };

const FULL_BLOB = /^[a-f0-9]{40}([a-f0-9]{24})?$/;
const MAX_FILES = 64;
const MAX_NAME = 1024;
const MAX_STATUS_BYTES = 256 * 1024;
const refuse = (reason: string): SelectionResult => ({ ok: false, warning: 'selected file manifest unverified: ' + reason + '; no commit, push or PR attempted' });

function safePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.length <= MAX_NAME &&
    path.trim().length > 0 && !/[\u0000-\u001f\u007f\ufffd]/.test(path) &&
    !path.startsWith('/') && !path.startsWith('\\') && !/^[A-Za-z]:/.test(path) &&
    !path.split(/[\\/]/).some(p => p === '.' || p === '..');
}

/**
 * Capture an exact changed-file list and the content blob as Git would stage it.
 * A hash can still race a competing process; the caller must recheck before use.
 * This function never writes the worktree, index, branch, or remote.
 */
export async function snapshotExactSelection(
  git: GitRunner, cwd: string, requested: string[],
): Promise<SelectionResult> {
  if (!Array.isArray(requested) || requested.length === 0 ||
    requested.some(p => !safePath(p))) return refuse('invalid requested file or directory');
  const inside = await git(['rev-parse', '--is-inside-work-tree'], cwd);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return refuse('not a verified Git worktree');
  const scope = await git(['rev-parse', '--show-prefix'], cwd);
  const prefix = scope.stdout.replace(/\r?\n$/, '');
  if (scope.code !== 0 || (prefix.length > 0 && !safePath(prefix))) return refuse('invalid repository-relative scope');

  const status = await git([
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--',
    ...requested.map(p => ':(literal)' + p),
  ], cwd);
  if (status.code !== 0 || status.stdout.length > MAX_STATUS_BYTES ||
    (status.stdout.length > 0 && !status.stdout.endsWith('\0'))) return refuse('incomplete or oversized Git status');
  const records = status.stdout ? status.stdout.slice(0, -1).split('\0') : [];
  const states = new Map<string, string>();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.length < 4 || record[2] !== ' ') return refuse('invalid Git porcelain record');
    const state = record.slice(0, 2);
    const names = [record.slice(3)];
    // In -z porcelain v1, renamed/copied entries are followed by the old path.
    if (state.includes('R') || state.includes('C')) {
      if (++i >= records.length) return refuse('missing rename source path');
      names.push(records[i]);
    }
    for (const rootPath of names) {
      if (!rootPath.startsWith(prefix)) return refuse('path escaped the approved workspace');
      const localPath = rootPath.slice(prefix.length);
      if (!safePath(localPath) || !requested.some(p =>
        p.endsWith('/') ? localPath.startsWith(p) : localPath === p)) {
        return refuse('status includes a file outside the selection');
      }
      states.set(localPath, state);
      if (states.size > MAX_FILES) return refuse('more than 64 changed files require manual review');
    }
  }
  if (states.size === 0) return { ok: true, selection: { files: [] } };
  const files: ApprovedFile[] = [];
  for (const [path, state] of [...states.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const blob = await git(['hash-object', '--path=' + path, '--', path], cwd);
    if (blob.code !== 0) {
      // A missing tracked file is meaningful only for a Git-declared deletion.
      if (!state.includes('D')) return refuse('could not hash selected file');
      files.push({ path, state, blob: null });
      continue;
    }
    const objectId = blob.stdout.trim();
    if (!FULL_BLOB.test(objectId)) return refuse('unverifiable Git file content hash');
    files.push({ path, state, blob: objectId });
  }
  return { ok: true, selection: { files } };
}

/** Compare both exact filenames/status and actual working-tree blob identity. */
export function sameExactSelection(a: ExactSelection, b: ExactSelection): boolean {
  return a.files.length === b.files.length && a.files.every((f, i) =>
    f.path === b.files[i].path && f.state === b.files[i].state && f.blob === b.files[i].blob);
}
