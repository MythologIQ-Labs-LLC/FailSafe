/**
 * #532 (plan-532c LD8, B284): the workspace's HEAD commit, read from disk.
 *
 * Hub checkpoints record the HEAD of this workspace (they used to read `.git/HEAD` under the
 * extension process's working directory, which is another folder). A git spawn per checkpoint
 * costs about 40 ms on Windows (200 measured at 8.0 s) and every Sentinel verdict records two
 * checkpoints, so the HEAD is read from the repository files:
 *
 *   - walk up from the workspace root to the first `.git`, as git does; a directory is the git
 *     dir, a file `gitdir: <path>` (linked worktree, submodule) points at it, and the git dir's
 *     `commondir` names where the shared refs live;
 *   - `HEAD` is a full object name (detached) or `ref: <name>`, resolved from the loose ref or
 *     `packed-refs` (the `#` header and annotated-tag `^peeled` lines skipped), following nested
 *     `ref:` at most 5 deep.
 *
 * Refused without reading, giving "unknown": UNC and device paths (`\\server`, `//server`,
 * `\\?\`, `\\.\`) in `gitdir:`, `commondir` or any resolved path, including a path that
 * reaches one through a symbolic link or junction (each component is checked with lstat and
 * readlink before the path is read), and ref names that
 * `git check-ref-format` would reject or that resolve outside the common dir. Unborn, no
 * repository and malformed content are "unknown" too. A reftable repository (a `reftable`
 * directory or `extensions.refstorage` in the config) is the one layout the reader does not
 * handle; it uses the optional fallback (the trusted git runner) instead.
 *
 * The value is a record. Before any reset, the rollback checks it with git in the workspace
 * (plan-532c LD8a); a `gitdir:` pointer can lead this reader to another local repository.
 */

import * as fs from 'fs';
import * as path from 'path';
import { sourceShaOf } from '../../governance/architecture/ArchitectureIndexBootstrap';
import { defaultArchitectureGit } from '../../governance/architecture/ArchitectureIndexDiscovery';

export const UNKNOWN_HEAD = 'unknown';

const FULL_NAME = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const MAX_HEAD_BYTES = 4096;
const MAX_PACKED_BYTES = 64 * 1024 * 1024;
const MAX_REF_DEPTH = 5;
/** Racy-git rule: a packed-refs written this recently is re-read rather than cached. */
const RACY_MS = 2000;

/** File access the reader uses (injectable so tests can see which paths were read). */
export interface HeadIo {
  readText(p: string, maxBytes: number): string | null;
  stat(p: string): fs.Stats | null;
  /** Not following links; defaults to fs.lstatSync. */
  lstat?(p: string): fs.Stats | null;
  /** A link's target; defaults to fs.readlinkSync. */
  readlink?(p: string): string | null;
}

const realLstat = (p: string): fs.Stats | null => { try { return fs.lstatSync(p); } catch { return null; } };
const realReadlink = (p: string): string | null => { try { return fs.readlinkSync(p); } catch { return null; } };
const MAX_LINK_DEPTH = 5;

/**
 * #532 (review N4): an io that refuses any path reaching a UNC or device path through a symbolic
 * link or junction in one of its components, before the path is stat-ed or read. `refused` records
 * that a refusal happened, so the reader answers "unknown" rather than a partial answer.
 */
function guardedIo(io: HeadIo): HeadIo & { refused: boolean } {
  const lstat = io.lstat ? (p: string) => io.lstat!(p) : realLstat;
  const readlink = io.readlink ? (p: string) => io.readlink!(p) : realReadlink;
  const memo = new Map<string, boolean>();
  const unsafe = (p: string, depth: number): boolean => {
    if (isUncOrDevicePath(p)) return true;
    const parts: string[] = [];
    for (let q = path.resolve(p); ; q = path.dirname(q)) {
      parts.unshift(q);
      if (path.dirname(q) === q) break;
    }
    for (const q of parts) {
      const known = memo.get(q);
      if (known !== undefined) { if (known) return true; continue; }
      let bad = false;
      if (lstat(q)?.isSymbolicLink()) {
        const target = readlink(q);
        bad = target === null || isUncOrDevicePath(target)
          || depth >= MAX_LINK_DEPTH || unsafe(path.resolve(path.dirname(q), target), depth + 1);
      }
      memo.set(q, bad);
      if (bad) return true;
    }
    return false;
  };
  const guarded = {
    refused: false,
    readText(p: string, maxBytes: number) { if (unsafe(p, 0)) { guarded.refused = true; return null; } return io.readText(p, maxBytes); },
    stat(p: string) { if (unsafe(p, 0)) { guarded.refused = true; return null; } return io.stat(p); },
  };
  return guarded;
}

export const defaultHeadIo: HeadIo = {
  readText(p, maxBytes) {
    try {
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > maxBytes) return null;
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  },
  stat(p) {
    try { return fs.statSync(p); } catch { return null; }
  },
};

/** Used only for a layout the reader does not handle (reftable); full name or null. */
export type HeadFallback = (root: string) => string | null;

export const defaultHeadFallback: HeadFallback = (root) => sourceShaOf(root, defaultArchitectureGit).sourceSha;

export interface WorkspaceHeadOptions {
  io?: HeadIo;
  fallback?: HeadFallback;
  now?: () => number;
}

/** UNC (`\\server`, `//server`) and device (`\\?\`, `\\.\`) paths, in either separator style. */
export function isUncOrDevicePath(p: string): boolean {
  const s = p.trim();
  if (/^[\\/]{2}/.test(s)) return true;
  return process.platform === 'win32' && path.win32.parse(path.win32.resolve(s)).root.startsWith('\\\\');
}

/** A ref name `git check-ref-format` would accept, under `refs/`. */
export function isSafeRefName(name: string): boolean {
  if (!name.startsWith('refs/') || name.length > 1024) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name) || name.includes('..') || name.includes('//') || name.includes('@{')) return false;
  if (name.endsWith('/') || name.endsWith('.')) return false;
  return name.split('/').every((c) => c.length > 0 && !c.startsWith('.') && !c.endsWith('.lock'));
}

const isInside = (parent: string, child: string): boolean => {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
};

interface GitDirs { gitDir: string; commonDir: string }

/** The git dir and common dir for `root`, or null (no repository, or a refused path). */
function locateGitDirs(root: string, io: HeadIo): GitDirs | null {
  let dir = path.resolve(root);
  for (;;) {
    if (isUncOrDevicePath(dir)) return null;
    const dotGit = path.join(dir, '.git');
    const st = io.stat(dotGit);
    if (st?.isDirectory()) return withCommonDir(dotGit, io);
    if (st?.isFile()) {
      const text = io.readText(dotGit, MAX_HEAD_BYTES);
      const m = text ? /^gitdir:\s*(.+?)\s*$/m.exec(text) : null;
      if (!m || isUncOrDevicePath(m[1])) return null;
      const gitDir = path.resolve(dir, m[1]);
      if (isUncOrDevicePath(gitDir)) return null;
      return withCommonDir(gitDir, io);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function withCommonDir(gitDir: string, io: HeadIo): GitDirs | null {
  const text = io.readText(path.join(gitDir, 'commondir'), MAX_HEAD_BYTES);
  if (text === null) return { gitDir, commonDir: gitDir };
  const value = text.trim();
  if (!value || isUncOrDevicePath(value)) return null;
  const commonDir = path.resolve(gitDir, value);
  return isUncOrDevicePath(commonDir) ? null : { gitDir, commonDir };
}

function usesReftable(dirs: GitDirs, io: HeadIo): boolean {
  if (io.stat(path.join(dirs.commonDir, 'reftable'))?.isDirectory()) return true;
  const config = io.readText(path.join(dirs.commonDir, 'config'), 1024 * 1024) ?? '';
  return /^\s*refstorage\s*=\s*reftable\s*$/im.test(config);
}

interface PackedCache { key: string; refs: Map<string, string> }
const packedCache = new Map<string, PackedCache>();

function packedRefs(commonDir: string, io: HeadIo, now: number): Map<string, string> {
  const file = path.join(commonDir, 'packed-refs');
  const st = io.stat(file);
  if (!st || !st.isFile()) return new Map();
  const key = `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
  const cached = packedCache.get(file);
  if (cached && cached.key === key) return cached.refs;
  const text = io.readText(file, MAX_PACKED_BYTES) ?? '';
  const refs = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const m = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) (refs\/\S+)$/.exec(line);
    if (m) refs.set(m[2], m[1]);
  }
  if (now - st.mtimeMs >= RACY_MS) packedCache.set(file, { key, refs });
  else packedCache.delete(file);
  return refs;
}

/** Resolve `ref: <name>` content (or a full name) to a commit name, or null. */
function resolveRef(content: string, dirs: GitDirs, io: HeadIo, now: number, depth = 0): string | null {
  const text = content.trim();
  if (FULL_NAME.test(text)) return text;
  const m = /^ref:\s*(\S+)$/.exec(text);
  if (!m || depth >= MAX_REF_DEPTH || !isSafeRefName(m[1])) return null;
  const name = m[1];
  const loose = path.resolve(dirs.commonDir, ...name.split('/'));
  if (!isInside(dirs.commonDir, loose) || isUncOrDevicePath(loose)) return null;
  const looseText = io.readText(loose, MAX_HEAD_BYTES);
  if (looseText !== null) return resolveRef(looseText, dirs, io, now, depth + 1);
  return packedRefs(dirs.commonDir, io, now).get(name) ?? null;
}

export function readWorkspaceHead(root: string, options: WorkspaceHeadOptions = {}): string {
  const io = guardedIo(options.io ?? defaultHeadIo);
  const now = (options.now ?? Date.now)();
  try {
    const dirs = locateGitDirs(root, io);
    if (!dirs || io.refused) return UNKNOWN_HEAD;
    if (usesReftable(dirs, io)) {
      const viaGit = (options.fallback ?? defaultHeadFallback)(root);
      return viaGit && FULL_NAME.test(viaGit) ? viaGit : UNKNOWN_HEAD;
    }
    const head = io.readText(path.join(dirs.gitDir, 'HEAD'), MAX_HEAD_BYTES);
    if (head === null) return UNKNOWN_HEAD;
    const resolved = resolveRef(head, dirs, io, now);
    return resolved && !io.refused ? resolved : UNKNOWN_HEAD;
  } catch {
    return UNKNOWN_HEAD;
  }
}
