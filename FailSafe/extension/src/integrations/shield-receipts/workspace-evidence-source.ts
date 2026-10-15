/**
 * workspace-evidence-source — the production ShieldEvidenceSource (#476).
 *
 * Git reads go through createSafeGit (hardened config, no hooks, no prompts)
 * with, on every call: `-c core.commitGraph=false`; GIT_NO_REPLACE_OBJECTS=1
 * (replace refs ignored); GIT_GRAFT_FILE pointing at a path that is never
 * created inside this source's own temporary directory (.git/info/grafts
 * ignored); and GIT_DIR, GIT_WORK_TREE and the other repository-redirecting
 * variables removed from the inherited environment. dispose() removes both
 * this source's temporary directory and createSafeGit's.
 *
 * Ceiling: the .git object store and refs are inside the workspace, so a
 * workspace writer can still rewrite history itself; these settings stop git
 * features that would silently change parentage, not a forged object store.
 *
 * File reads stay under .qor/gates, .qor/session/keys and
 * .failsafe/shield-receipts; every name and id is validated before any read.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createSafeGit } from '../agent-cli/git-safety';
import type { ShieldEvidenceSource } from './shield-evidence';

const SHA = /^[0-9a-f]{40}$/;
const SESSION = /^[A-Za-z0-9_-]+$/;
const GATE_NAME = /^(audit|substantiate)\.(json|provenance)$/;
const REDIRECTING_ENV = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_REPLACE_REF_BASE', 'GIT_SHALLOW_FILE', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
];

function requireSession(id: string): void {
  if (typeof id !== 'string' || !SESSION.test(id)) throw new Error('invalid session id');
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

async function readOrUndefined(p: string): Promise<Buffer | undefined> {
  try {
    return await fs.promises.readFile(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

export function createWorkspaceEvidenceSource(root: string): { source: ShieldEvidenceSource; dispose(): void } {
  const git = createSafeGit(root);
  const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-shield-src-'));
  const env: Record<string, string> = { GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: path.join(ownDir, 'no-grafts') };
  for (const k of REDIRECTING_ENV) (env as Record<string, string | undefined>)[k] = undefined;
  for (const k of Object.keys(process.env)) if (/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(k)) (env as Record<string, string | undefined>)[k] = undefined;

  const run = async (args: string[]): Promise<{ code: number | null; out: string }> => {
    const r = await git.tryRun(root, ['-c', 'core.commitGraph=false', ...args], { env });
    return { code: r.code, out: r.stdout.toString('utf8') };
  };
  const gates = path.join(root, '.qor', 'gates');
  const keys = path.join(root, '.qor', 'session', 'keys');
  const receipts = path.join(root, '.failsafe', 'shield-receipts');

  const source: ShieldEvidenceSource = {
    async headSha() {
      const r = await run(['rev-parse', '--verify', '--quiet', 'HEAD']);
      const sha = r.out.trim();
      return r.code === 0 && SHA.test(sha) ? sha : undefined;
    },
    async remoteUrl() {
      const r = await run(['remote', 'get-url', 'origin']);
      return r.code === 0 && r.out.trim() ? r.out.trim() : undefined;
    },
    async parents(sha) {
      requireSha(sha);
      const r = await run(['rev-list', '--parents', '-n', '1', sha]);
      const parts = r.out.trim().split(/\s+/);
      if (r.code !== 0 || parts[0] !== sha || !parts.slice(1).every((p) => SHA.test(p))) return undefined;
      return parts.slice(1);
    },
    async isShallow() {
      const r = await run(['rev-parse', '--is-shallow-repository']);
      if (r.code !== 0) throw new Error('could not determine whether the repository is shallow');
      return r.out.trim() === 'true';
    },
    async showAtCommit(sha, rel) {
      requireSha(sha);
      if (typeof rel !== 'string' || !/^[A-Za-z0-9_.\-/]+$/.test(rel) || rel.split('/').includes('..') || rel.startsWith('/')) {
        throw new Error('invalid repository path');
      }
      const r = await run(['cat-file', 'blob', `${sha}:${rel}`]);
      return r.code === 0 ? r.out : undefined;
    },
    async readGateFile(sessionId, name) {
      requireSession(sessionId);
      if (typeof name !== 'string' || !GATE_NAME.test(name)) throw new Error('invalid gate file name');
      return readOrUndefined(within(gates, sessionId, name));
    },
    async readQorSessionKey(sessionId) {
      requireSession(sessionId);
      return readOrUndefined(within(keys, `${sessionId}.key`));
    },
    async readReceipt(sha) {
      requireSha(sha);
      const b = await readOrUndefined(within(receipts, `${sha}.json`));
      return b?.toString('utf8');
    },
    async writeReceipt(sha, text) {
      requireSha(sha);
      const target = within(receipts, `${sha}.json`);
      await fs.promises.mkdir(receipts, { recursive: true });
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmp, text, 'utf8');
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
