/**
 * workspace-evidence-source — the production ShieldEvidenceSource (#476).
 *
 * Git reads go through createSafeGit (hardened config, no hooks, no prompts)
 * with, on every call: `-c core.commitGraph=false`; GIT_NO_REPLACE_OBJECTS=1
 * (replace refs ignored); GIT_NO_LAZY_FETCH=1 (a partial clone never fetches a
 * missing object, so it reads as an error); GIT_GRAFT_FILE pointing at a path
 * that is never created inside this source's own temporary directory
 * (.git/info/grafts ignored); and GIT_DIR, GIT_WORK_TREE and the other
 * repository-redirecting variables removed from the inherited environment,
 * matched case-insensitively. dispose() removes both this source's temporary
 * directory and createSafeGit's.
 *
 * showAtCommit distinguishes an absent path (undefined) from an unreadable one
 * (a throw): a missing or corrupt object must never read as "no ledger", which
 * would make the Seal-commit parent check vacuous. Only a regular-file blob
 * (mode 100644 or 100755) is read; a symlink or submodule entry throws.
 *
 * Every git read first requires git 2.44 or later (older git ignores
 * GIT_NO_LAZY_FETCH) and a repository that is not a partial clone
 * (extensions.partialClone or a promisor remote); otherwise it throws, which
 * the verifier reports as Neutral evidence-source-error.
 *
 * ledgerHistoryContains (#476 N1) runs one git log -S over docs/META_LEDGER.md
 * history. The repository's own .git/config, .gitattributes and
 * .git/info/attributes are still read (only global and system config are
 * neutralized), so every option they could change is pinned: --no-textconv,
 * --diff-merges=separate, --root, --full-history, -c log.follow=false,
 * --no-renames, --no-ext-diff, --text, --no-color, --no-patch.
 *
 * Every git read has a timeout (gitTimeoutMs, default 30 s); a timed-out read
 * throws, and SafeGit kills the git child and what it started (B213).
 * The preflight result is cached per source, including a rejection, so a failed
 * or timed-out preflight leaves that source Neutral; a new source retries.
 *
 * Known limits: a path component is checked with lstat and then opened, so a
 * swap in between is not detected, and the workspace root itself is not
 * checked; a FIFO at a gate path on POSIX blocks the read; the environment
 * scrub is computed once, when the source is created; git itself is the
 * trusted absolute path from src/shared/git/trustedGit.ts (never a git found
 * in the workspace), but it still runs with the workspace as its cwd.
 *
 * Ceiling: the .git object store and refs are inside the workspace, so a
 * workspace writer can still rewrite history itself; these settings stop git
 * features that would silently change parentage, not a forged object store.
 *
 * File reads stay under .qor/gates, .qor/session/keys and
 * .failsafe/shield-receipts; every name and id is validated before any read,
 * and no path component below the workspace root may be a symlink or junction.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createSafeGit, type ScheduleTimeout } from '../agent-cli/git-safety';
import type { ShieldEvidenceSource } from './shield-evidence';

const SHA = /^[0-9a-f]{40}$/;
const SESSION = /^[A-Za-z0-9_-]+$/;
/** Windows reserved device names (NUL.key would read as an empty file). */
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/i;
const GATE_NAME = /^(audit|substantiate)\.(json|provenance)$/;
const REPO_PATH = /^[A-Za-z0-9_.\-/]+$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DEFAULT_GIT_TIMEOUT_MS = 30000;
const LEDGER = 'docs/META_LEDGER.md';
/** git log flags for ledgerHistoryContains; not configurable (#476 N1 LD10). */
const HISTORY_FLAGS = [
  '-c', 'log.follow=false', 'log', '--text', '--no-textconv', '--no-ext-diff', '--no-renames',
  '--diff-merges=separate', '--full-history', '--root', '--no-show-signature', '--no-color',
  '--max-count=1', '--no-patch', '--format=%H',
];
const REDIRECTING_ENV = new Set([
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_REPLACE_REF_BASE', 'GIT_SHALLOW_FILE', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
]);

function requireSession(id: string): void {
  if (typeof id !== 'string' || !SESSION.test(id) || DEVICE.test(id)) throw new Error('invalid session id');
}

function requireSha(sha: string): void {
  if (typeof sha !== 'string' || !SHA.test(sha)) throw new Error('invalid commit sha');
}

function within(base: string, ...parts: string[]): string {
  const p = path.join(base, ...parts);
  const rel = path.relative(base, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('path escapes its base directory');
  return p;
}

/** Walk every component of p below root; throw on a symlink or junction.
 *  Returns false when a component does not exist yet. */
async function noLinksBelow(root: string, p: string): Promise<boolean> {
  let cur = root;
  for (const part of path.relative(root, p).split(path.sep)) {
    cur = path.join(cur, part);
    let st: fs.Stats;
    try {
      st = await fs.promises.lstat(cur);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw e;
    }
    if (st.isSymbolicLink()) throw new Error('evidence path contains a link');
  }
  return true;
}

async function readInside(root: string, p: string): Promise<Buffer | undefined> {
  if (!(await noLinksBelow(root, p))) return undefined;
  try {
    return await fs.promises.readFile(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** Parse ledgerHistoryContains output: true for one or more 40-hex lines
 *  (duplicates, blank lines and a trailing newline allowed), false for empty
 *  output with exit 0; anything else throws. */
export function parseHistoryOutput(code: number | null, out: string): boolean {
  if (code !== 0) throw new Error('the ledger history could not be read');
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.every((l) => SHA.test(l))) throw new Error('unexpected ledger history output');
  return lines.length > 0;
}

/** True for `git version X.Y...` output with X.Y >= 2.44 (GIT_NO_LAZY_FETCH honoured). */
export function gitSupportsNoLazyFetch(versionOutput: string): boolean {
  const m = /^git version (\d+)\.(\d+)/.exec((versionOutput || '').trim());
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 2 || (major === 2 && minor >= 44);
}

const TRANSIENT_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Best-effort temp-file removal; a cleanup failure never masks the caller's error. */
async function removeQuietly(p: string): Promise<void> {
  try {
    await fs.promises.rm(p, { force: true });
  } catch {
    /* the original error is what the caller reports */
  }
}

/** Rename with up to 3 attempts 50 ms apart on Windows-style transient errors;
 *  the temp file is removed when the rename finally fails, and the rename
 *  error (not a cleanup error) is rethrown. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (attempt >= 3 || !TRANSIENT_RENAME.has(code)) {
        await removeQuietly(from);
        throw e;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

function scrubbedEnv(ownDir: string): Record<string, string> {
  const env: Record<string, string | undefined> = {
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_GRAFT_FILE: path.join(ownDir, 'no-grafts'),
  };
  for (const k of REDIRECTING_ENV) env[k] = undefined;
  for (const k of Object.keys(process.env)) {
    const u = k.toUpperCase();
    if (REDIRECTING_ENV.has(u) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(u)) env[k] = undefined;
  }
  return env as Record<string, string>;
}

export interface WorkspaceEvidenceOptions {
  /** Per-call git timeout, an integer from 1 to 30000 ms (default 30000). */
  gitTimeoutMs?: number;
  /** Test seam: arms each read's timeout (default setTimeout); no production caller passes it. */
  scheduleGitTimeout?: ScheduleTimeout;
}

export function createWorkspaceEvidenceSource(
  root: string, opts: WorkspaceEvidenceOptions = {},
): { source: ShieldEvidenceSource; dispose(): void } {
  // Only an absent option takes the default; null or any other non-integer throws.
  const timeoutMs = opts.gitTimeoutMs === undefined ? DEFAULT_GIT_TIMEOUT_MS : opts.gitTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_GIT_TIMEOUT_MS) {
    throw new Error('gitTimeoutMs must be an integer from 1 to 30000');
  }
  const git = createSafeGit(root);
  const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-shield-src-'));
  const env = scrubbedEnv(ownDir);
  const rawRun = async (args: string[]): Promise<{ code: number | null; out: Buffer }> => {
    const r = await git.tryRun(root, ['-c', 'core.commitGraph=false', ...args], { env, timeoutMs, scheduleTimeout: opts.scheduleGitTimeout });
    if (r.timedOut) throw new Error('git read timed out');
    return { code: r.code, out: r.stdout };
  };
  let ready: Promise<void> | undefined;
  const preflight = (): Promise<void> => (ready ??= (async () => {
    const v = await rawRun(['version']);
    if (v.code !== 0 || !gitSupportsNoLazyFetch(v.out.toString('utf8'))) throw new Error('git 2.44 or later is required');
    const partial = await rawRun(['config', '--get', 'extensions.partialClone']);
    if (partial.code === 0 && partial.out.toString('utf8').trim()) throw new Error('partial clones are not supported');
    const promisor = await rawRun(['config', '--get-regexp', '^remote\\..*\\.promisor$']);
    if (promisor.code === 0 && promisor.out.toString('utf8').trim()) throw new Error('promisor remotes are not supported');
  })());
  const run = async (args: string[]): Promise<{ code: number | null; out: Buffer }> => {
    await preflight();
    return rawRun(args);
  };
  const gates = path.join(root, '.qor', 'gates');
  const keys = path.join(root, '.qor', 'session', 'keys');
  const receipts = path.join(root, '.failsafe', 'shield-receipts');

  const source: ShieldEvidenceSource = {
    async headSha() {
      const r = await run(['rev-parse', '--verify', '--quiet', 'HEAD']);
      const sha = r.out.toString('utf8').trim();
      return r.code === 0 && SHA.test(sha) ? sha : undefined;
    },
    async remoteUrl() {
      const r = await run(['remote', 'get-url', 'origin']);
      const url = r.out.toString('utf8').trim();
      return r.code === 0 && url ? url : undefined;
    },
    async parents(sha) {
      requireSha(sha);
      const r = await run(['rev-list', '--parents', '-n', '1', sha]);
      const parts = r.out.toString('utf8').trim().split(/\s+/);
      if (r.code !== 0 || parts[0] !== sha || !parts.slice(1).every((p) => SHA.test(p))) return undefined;
      return parts.slice(1);
    },
    async isShallow() {
      const r = await run(['rev-parse', '--is-shallow-repository']);
      if (r.code !== 0) throw new Error('could not determine whether the repository is shallow');
      return r.out.toString('utf8').trim() === 'true';
    },
    async showAtCommit(sha, rel) {
      requireSha(sha);
      if (typeof rel !== 'string' || !REPO_PATH.test(rel) || rel.split('/').includes('..') || rel.startsWith('/')) {
        throw new Error('invalid repository path');
      }
      const tree = await run(['ls-tree', '-z', sha, '--', rel]);
      if (tree.code !== 0) throw new Error('could not list the commit tree');
      const entry = tree.out.toString('utf8').split('\0').filter(Boolean);
      if (entry.length === 0) return undefined;
      // Regular files only: a symlink (120000) or submodule (160000) entry throws.
      const m = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(entry[0]);
      if (entry.length !== 1 || !m || m[3] !== rel) throw new Error('unexpected tree entry');
      const blob = await run(['cat-file', 'blob', m[2]]);
      if (blob.code !== 0) throw new Error('the blob could not be read');
      return blob.out.toString('utf8');
    },
    async ledgerHistoryContains(sha, hex64) {
      requireSha(sha);
      if (typeof hex64 !== 'string' || !HEX64.test(hex64)) throw new Error('invalid history search value');
      const r = await run([...HISTORY_FLAGS, '-S', hex64, sha, '--', LEDGER]);
      return parseHistoryOutput(r.code, r.out.toString('utf8'));
    },
    async readGateFile(sessionId, name) {
      requireSession(sessionId);
      if (typeof name !== 'string' || !GATE_NAME.test(name)) throw new Error('invalid gate file name');
      return readInside(root, within(gates, sessionId, name));
    },
    async readQorSessionKey(sessionId) {
      requireSession(sessionId);
      return readInside(root, within(keys, `${sessionId}.key`));
    },
    async readReceipt(sha) {
      requireSha(sha);
      const b = await readInside(root, within(receipts, `${sha}.json`));
      return b?.toString('utf8');
    },
    async writeReceipt(sha, text) {
      requireSha(sha);
      const target = within(receipts, `${sha}.json`);
      await noLinksBelow(root, receipts);
      await fs.promises.mkdir(receipts, { recursive: true });
      if (!(await noLinksBelow(root, receipts))) throw new Error('receipt directory missing after create');
      const tmp = within(receipts, `.${sha}.${crypto.randomBytes(8).toString('hex')}.tmp`);
      try {
        await fs.promises.writeFile(tmp, text, { encoding: 'utf8', flag: 'wx' });
      } catch (e) {
        await removeQuietly(tmp);
        throw e;
      }
      await renameWithRetry(tmp, target);
    },
  };
  return {
    source,
    dispose() {
      git.dispose();
      fs.rmSync(ownDir, { recursive: true, force: true });
    },
  };
}
