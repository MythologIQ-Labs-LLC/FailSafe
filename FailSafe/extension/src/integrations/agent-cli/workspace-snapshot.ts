/**
 * workspace-snapshot — what an agent could change in the authoritative repo
 * without going through its worktree (#475, LD3).
 *
 * Covers HEAD, every ref (incl. stash), tracked/untracked status with file
 * hashes, tracked files whose content differs from HEAD (stat-independent),
 * git metadata that runs or redirects code (config, config.worktree,
 * packed-refs, hooks/, info/), index flags (skip-worktree / assume-unchanged),
 * and top-level ignored FILES by content hash. Ignored directories are listed
 * by name only; their contents are not covered (disclosed limitation).
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SafeGit } from './git-safety';

export type Snapshot = Map<string, string>;

const sha = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

function hashFile(file: string): string {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink()) return `link:${fs.readlinkSync(file)}`;
    if (!st.isFile()) return st.isDirectory() ? 'dir' : 'other';
    return sha(fs.readFileSync(file));
  } catch {
    return 'absent';
  }
}

function walk(dir: string, rel: string, into: Snapshot, prefix: string): void {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { into.set(`${prefix}:${rel}`, 'absent'); return; }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, childRel, into, prefix);
    else into.set(`${prefix}:${childRel}`, hashFile(full));
  }
}

function porcelainPaths(raw: Buffer): Array<{ code: string; path: string }> {
  const items = raw.toString('utf8').split('\0').filter(Boolean);
  const out: Array<{ code: string; path: string }> = [];
  for (let i = 0; i < items.length; i++) {
    const code = items[i].slice(0, 2);
    out.push({ code, path: items[i].slice(3) });
    if (code[0] === 'R' || code[0] === 'C') i++; // skip the rename source
  }
  return out;
}

/**
 * Tracked files whose CONTENT differs from HEAD. `git status` trusts stat data,
 * so a same-size rewrite with the mtime restored is invisible to it (on Windows
 * git's ctime is the creation time). A throwaway index read from HEAD carries
 * no stat data, which forces git to hash every tracked file.
 */
async function contentChanges(git: SafeGit, root: string, into: Snapshot): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-snap-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
    await git.run(root, ['read-tree', 'HEAD'], { env });
    for (const e of porcelainPaths(await git.run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--no-renames'], { env }))) {
      into.set(`content:${e.path}`, hashFile(path.join(root, e.path)));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Snapshot the authoritative repository at `root` (its own .git directory). */
export async function takeSnapshot(git: SafeGit, root: string): Promise<Snapshot> {
  const snap: Snapshot = new Map();
  await contentChanges(git, root, snap);
  snap.set('head', (await git.run(root, ['rev-parse', 'HEAD'])).toString().trim());
  snap.set('refs', sha(await git.run(root, ['for-each-ref', '--format=%(refname) %(objectname)'])));
  snap.set('index-flags', sha(await git.run(root, ['ls-files', '-v', '-z'])));
  for (const e of porcelainPaths(await git.run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']))) {
    snap.set(`status:${e.path}`, `${e.code}:${hashFile(path.join(root, e.path))}`);
  }
  for (const e of porcelainPaths(await git.run(root, ['status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal']))) {
    if (e.code !== '!!') continue;
    snap.set(`ignored:${e.path}`, e.path.endsWith('/') ? 'dir' : hashFile(path.join(root, e.path)));
  }
  const gitDir = path.resolve(root, (await git.run(root, ['rev-parse', '--git-dir'])).toString().trim());
  for (const f of ['config', 'config.worktree', 'packed-refs']) snap.set(`git:${f}`, hashFile(path.join(gitDir, f)));
  walk(path.join(gitDir, 'hooks'), '', snap, 'git-hooks');
  walk(path.join(gitDir, 'info'), '', snap, 'git-info');
  return snap;
}

/** Keys whose value differs between two snapshots (added, removed or changed). */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((k) => before.get(k) !== after.get(k)).sort();
}

const CHANGE_PREFIXES = ['status:', 'content:'];

/** Paths with tracked/untracked changes recorded in the snapshot. */
export function changedPaths(snap: Snapshot): string[] {
  const out = new Set<string>();
  for (const k of snap.keys()) {
    const prefix = CHANGE_PREFIXES.find((p) => k.startsWith(p));
    if (prefix) out.add(k.slice(prefix.length));
  }
  return [...out].sort();
}

/** True when the tree has no tracked/untracked changes. */
export function isCleanSnapshot(snap: Snapshot): boolean {
  return changedPaths(snap).length === 0;
}
