/**
 * #532 (plan-532c LD7, B286): after FailSafe's governed commit, offer to link the commit it made
 * to the active intent as a `committed-under` edge.
 *
 * The target is the commit the governed commit bound to this run (its parent, tree, message and
 * branch tip were checked in commitPushOpenPr), never a re-read HEAD. The edge is prepared with
 * the same delivery functions as the Workspace > Delivery link, so the commit must be one of
 * HEAD's 50 most recent commits and resolve, and a duplicate is refused before any dialog. The
 * operator then approves a modal VS Code dialog built from server-side values (the shared
 * confirmer, one busy guard with the Console routes). Declined, busy, unwired or refused: nothing
 * is written. Nothing leaves the machine.
 */

import type { ArchitectureGit } from '../governance/architecture/ArchitectureIndexDiscovery';
import { changedFiles, COMMIT_NAME_RE } from '../governance/delivery/deliveryGit';
import {
  prepareDeliveryEdge, writeDeliveryEdge, type DeliveryContext, type DeliveryIntents,
} from '../governance/delivery/deliveryService';
import { deliveryLinkRequest, type ConfirmOperatorAction } from './operatorConfirmation';
import type { GovernedCommitLinkFn } from './governedCommitFlow';

export type GovernedLinkOutcome =
  | 'linked' | 'no-intent-service' | 'no-active-intent' | 'no-commit' | 'refused' | 'declined' | 'busy' | 'unwired' | 'failed';

export interface GovernedLinkRequest {
  /** The bound commit from commitPushOpenPr; undefined when it could not be bound. */
  commitSha: string | undefined;
  /** The governed action that made the commit (organize, initialize). */
  action: string;
  /** The paths FailSafe staged for the commit. */
  requestedPaths: string[];
}

export interface GovernedLinkResult {
  outcome: GovernedLinkOutcome;
  detail: string;
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Files of the commit that equal a requested path or lie under a requested directory. */
function withinRequested(files: string[], requested: string[]): number {
  const req = requested.map((r) => norm(r).replace(/\/+$/, '')).filter(Boolean);
  return files.filter((f) => { const n = norm(f); return req.some((r) => n === r || n.startsWith(`${r}/`)); }).length;
}

/** "Files in this commit: N; within the paths FailSafe staged: M" (and the already-staged line). */
function fileFacts(ctx: DeliveryContext, sha: string, requested: string[]): string[] {
  const changed = changedFiles(ctx.workspaceRoot, sha, ctx.git);
  if (!changed) return ['Files in this commit: unknown (git could not list them)'];
  const n = changed.files.length;
  const m = withinRequested(changed.files, requested);
  const facts = [`Files in this commit: ${n}${changed.truncated ? '+' : ''}; within the paths FailSafe staged: ${m}`];
  if (n > m) facts.push(`${n - m} file(s) outside those paths were already staged before FailSafe committed and are included.`);
  return facts;
}

export async function offerCommittedUnderLink(
  ctx: DeliveryContext, confirm: ConfirmOperatorAction | undefined, req: GovernedLinkRequest,
): Promise<GovernedLinkResult> {
  if (!req.commitSha || !COMMIT_NAME_RE.test(req.commitSha)) {
    return { outcome: 'no-commit', detail: 'the commit was not bound to this run, so it is not offered for linking' };
  }
  const active = await ctx.intents.getActiveIntent();
  if (!active || active.status === 'SEALED') return { outcome: 'no-active-intent', detail: 'there is no active intent to link the commit to' };
  const prepared = await prepareDeliveryEdge(ctx, 'link', { intentId: active.id, edge: 'committed-under', target: req.commitSha },
    { via: 'governed-commit', action: req.action });
  if (!prepared.ok) return { outcome: 'refused', detail: prepared.error };
  if (!confirm) return { outcome: 'unwired', detail: 'operator confirmation is not available; nothing was recorded' };
  const facts = [...prepared.facts, ...fileFacts(ctx, req.commitSha, req.requestedPaths)];
  const answer = await confirm(deliveryLinkRequest('link', 'committed-under', prepared.intent, facts, 'command'));
  if (answer !== 'approved') return { outcome: answer, detail: 'not confirmed in VS Code; nothing was recorded' };
  const written = await writeDeliveryEdge(ctx, prepared, 'user');
  return written.ok
    ? { outcome: 'linked', detail: `${req.commitSha} linked to "${prepared.intent.purpose}"` }
    : { outcome: 'refused', detail: `nothing was recorded (${written.reason})` };
}

export interface GovernedCommitLinkerDeps {
  workspaceRoot: string;
  getIntents: () => DeliveryIntents | null | undefined;
  getLedger: () => unknown;
  confirm: ConfirmOperatorAction | undefined;
  getIndexPathSetting?: () => string | undefined;
  /** One line per outcome (the output channel in production). */
  log: (line: string) => void;
  git?: ArchitectureGit;
}

/** The `linkCommit` callback runGovernedCommitFlow calls after a bound commit. */
export function governedCommitLinker(deps: GovernedCommitLinkerDeps): GovernedCommitLinkFn {
  return async (result, run) => {
    const intents = deps.getIntents();
    if (!intents) {
      deps.log(`[${run.action}] commit ${result.commitSha} not linked: the intent service is not available`);
      return;
    }
    const ctx: DeliveryContext = {
      workspaceRoot: deps.workspaceRoot, intents, ledger: deps.getLedger(), git: deps.git, indexPathSetting: deps.getIndexPathSetting?.(),
    };
    const out = await offerCommittedUnderLink(ctx, deps.confirm, { commitSha: result.commitSha, action: run.action, requestedPaths: run.paths });
    deps.log(out.outcome === 'linked'
      ? `[${run.action}] linked: ${out.detail}`
      : `[${run.action}] commit ${result.commitSha} not linked (${out.outcome}): ${out.detail}`);
  };
}
