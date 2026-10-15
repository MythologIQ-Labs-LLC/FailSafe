/**
 * agent-run-promotion — the only path from a quarantined agent change set to the
 * workspace (#475, LD8).
 *
 * Promotion happens inside the command invocation that ran the agent, from the
 * bytes held in memory. Before applying: the bytes still hash to the captured
 * sha256, still pass patch validation, HEAD has not moved and the repository
 * snapshot equals the pre-run snapshot. The same bytes go to `git apply --check`
 * and then `git apply` through hardened git. Afterwards a temporary index
 * re-derives the tree's diff against HEAD; anything other than the applied bytes
 * is APPLY_MISMATCH (changes are left for the operator; no automatic revert).
 *
 * The audit copy on disk is write-only: it is never read back for review or apply.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DiffSummary } from './agent-cli-core';
import { createSafeGit, PINNED_DIFF, type SafeGit } from './git-safety';
import { sha256 } from './isolated-run';
import { validatePatch } from './patch-paths';
import { diffSnapshots, takeSnapshot, type Snapshot } from './workspace-snapshot';

export type PromotionStatus = 'APPLIED' | 'DISCARDED' | 'REFUSED' | 'APPLY_MISMATCH';

export interface PromotionResult { status: PromotionStatus; reason: string; details: string[] }

/** A change set held in memory for one command invocation. */
export interface QuarantinedChangeSet {
  receiptId: string;
  agent: string;
  root: string;
  baseHead: string;
  preSnapshot: Snapshot;
  patch: Buffer;
  patchSha256: string;
  stats: DiffSummary;
}

export const AUDIT_RETENTION = 20;

const refused = (reason: string, details: string[] = []): PromotionResult => ({ status: 'REFUSED', reason, details });

async function preApplyChecks(git: SafeGit, cs: QuarantinedChangeSet): Promise<PromotionResult | undefined> {
  if (sha256(cs.patch) !== cs.patchSha256) return refused('the change set no longer matches its captured hash');
  const numstat = (await git.run(cs.root, ['apply', '--numstat', '-z', '-'], { input: cs.patch })).toString('utf8');
  const summary = (await git.run(cs.root, ['apply', '--summary', '-'], { input: cs.patch })).toString('utf8');
  const problems = validatePatch(numstat, summary);
  if (problems.length) return refused('the change set failed validation', problems);
  const head = (await git.run(cs.root, ['rev-parse', 'HEAD'])).toString().trim();
  if (head !== cs.baseHead) return refused(`HEAD moved from ${cs.baseHead.slice(0, 12)} to ${head.slice(0, 12)} since the run`);
  const changed = diffSnapshots(cs.preSnapshot, await takeSnapshot(git, cs.root));
  if (changed.length) return refused('the workspace changed since the run', changed.slice(0, 50));
  const check = await git.tryRun(cs.root, ['apply', '--check', '-'], { input: cs.patch });
  if (check.code !== 0) return refused('git apply --check rejected the change set', [check.stderr.trim()]);
  return undefined;
}

/** Re-derive the working tree's diff against HEAD through a throwaway index. */
async function derivedDiff(git: SafeGit, root: string): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-idx-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
    await git.run(root, ['read-tree', 'HEAD'], { env });
    await git.run(root, ['add', '-A'], { env });
    return await git.run(root, ['diff', '--cached', ...PINNED_DIFF, 'HEAD'], { env });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Apply exactly the in-memory bytes, or refuse with a recorded reason. */
export async function applyQuarantined(cs: QuarantinedChangeSet): Promise<PromotionResult> {
  let git: SafeGit;
  try { git = createSafeGit(cs.root); } catch (e) { return refused(`cannot prepare git: ${String(e)}`); }
  try {
    const blocked = await preApplyChecks(git, cs);
    if (blocked) return blocked;
    const applied = await git.tryRun(cs.root, ['apply', '-'], { input: cs.patch });
    if (applied.code !== 0) return refused('git apply failed; nothing was applied', [applied.stderr.trim()]);
    const after = await derivedDiff(git, cs.root);
    if (!after.equals(cs.patch)) {
      return { status: 'APPLY_MISMATCH', reason: 'the workspace after apply does not match the reviewed change set; the changes are left uncommitted for you to inspect', details: [`expected sha256 ${cs.patchSha256}`, `found sha256 ${sha256(after)}`] };
    }
    return { status: 'APPLIED', reason: `applied ${cs.stats.files} file(s) exactly as reviewed`, details: [] };
  } catch (e) {
    return refused(e instanceof Error ? e.message : String(e));
  } finally {
    git.dispose();
  }
}

/** Write the audit copy (never read back) and keep only the newest `keep` runs. */
export function writeAuditCopy(baseDir: string, cs: QuarantinedChangeSet, record: Record<string, unknown>, keep = AUDIT_RETENTION): string {
  const dir = path.join(baseDir, cs.receiptId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'change-set.patch'), cs.patch);
  fs.writeFileSync(path.join(dir, 'record.json'), `${JSON.stringify({ ...record, patchSha256: cs.patchSha256, baseHead: cs.baseHead }, null, 2)}\n`);
  pruneAuditCopies(baseDir, keep);
  return dir;
}

export function pruneAuditCopies(baseDir: string, keep = AUDIT_RETENTION): void {
  const runs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ dir: path.join(baseDir, d.name), mtime: fs.statSync(path.join(baseDir, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of runs.slice(keep)) fs.rmSync(old.dir, { recursive: true, force: true });
}
