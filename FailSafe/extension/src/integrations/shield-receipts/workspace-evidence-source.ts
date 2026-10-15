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
 * would make the Seal-commit parent check vacuous.
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
import { createSafeGit } from '../agent-cli/git-safety';
import type { ShieldEvidenceSource } from './shield-evidence';

const SHA = /^[0-9a-f]{40}$/;
const SESSION = /^[A-Za-z0-9_-]+$/;
/** Windows reserved device names (NUL.key would read as an empty file). */
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/i;
const GATE_NAME = /^(audit|substantiate)\.(json|provenance)$/;
const REPO_PATH = /^[A-Za-z0-9_.\-/]+$/;
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

export function createWorkspaceEvidenceSource(root: string): { source: ShieldEvidenceSource; dispose(): void } {
  const git = createSafeGit(root);
  const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-shield-src-'));
  const env = scrubbedEnv(ownDir);
  const run = async (args: string[]): Promise<{ code: number | null; out: Buffer }> => {
    const r = await git.tryRun(root, ['-c', 'core.commitGraph=false', ...args], { env });
    return { code: r.code, out: r.stdout };
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
      const m = /^\d{6} (\w+) ([0-9a-f]{40})\t(.+)$/.exec(entry[0]);
      if (entry.length !== 1 || !m || m[3] !== rel || m[1] !== 'blob') throw new Error('unexpected tree entry');
      const blob = await run(['cat-file', 'blob', m[2]]);
      if (blob.code !== 0) throw new Error('the blob could not be read');
      return blob.out.toString('utf8');
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
      await fs.promises.writeFile(tmp, text, { encoding: 'utf8', flag: 'wx' });
      await fs.promises.rename(tmp, target);
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
