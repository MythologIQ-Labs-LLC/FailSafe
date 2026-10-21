/**
 * #532 part B (plan-532b LD2-LD7): the delivery functions shared by the Console routes and the
 * `failsafe.delivery.assessActiveIntent` command.
 *
 * - deliveryCandidates: the registered architecture rows with a document path and HEAD's 50 most
 *   recent commits, the only targets a link may name.
 * - prepareDeliveryEdge: checks a link or unlink request against server state and computes what
 *   would be recorded (document hash, HEAD at link time, commit tree and branch) before the
 *   operator is asked. Request-supplied hashes are never read.
 * - writeDeliveryEdge: appends the LINKED / UNLINKED entry (after the operator confirmed).
 * - assessIntentDelivery: re-checks every edge, reads ledger evidence and applies assessDelivery.
 *
 * Read-only apart from writeDeliveryEdge; nothing here opens a network connection.
 *
 * plan-532c: every link records who made it (`via`: `workspace-delivery` or `governed-commit`,
 * LD6); the view carries the accepted intent's CREATED entry and the intent decision (LD2/LD5).
 *
 * plan-b320: the review step reads the operator-confirmed delivery reviews (deliveryReview.ts), and
 * the code step compares each linked commit's resolved tree with the tree recorded at link time.
 */

import * as fs from 'fs';
import { z } from 'zod';
import {
  discoverArchitectureIndex, resolveInsideWorkspace, type ArchitectureGit, type ArchitectureIndexSnapshot,
  type ArchitectureIndexState,
} from '../architecture/ArchitectureIndexDiscovery';
import { sha256, sourceShaOf } from '../architecture/ArchitectureIndexBootstrap';
import type {
  EdgeWriteResult, IntentEdge, IntentListing, IntentRecord, IntentRecordLookup, LinkEdgeParams,
} from '../IntentService';
import {
  IntentEdgeKindSchema, IntentIdSchema, type Intent, type IntentEdgeKind, type IntentReviewDetails, type IntentStatus,
} from '../types/IntentTypes';
import {
  assessDelivery, type ArchitectureEdgeCheck, type CodeEdgeCheck, type DeliveryAssessment, type EdgeChecks,
} from './deliveryAssessment';
import { changedFiles, COMMIT_NAME_RE, listRecentCommits, resolveCommit, type RecentCommits } from './deliveryGit';
import { readIntentReviews } from './deliveryReview';

/** The slice of IntentService the delivery functions use. */
export interface DeliveryIntents {
  getActiveIntent(): Promise<Intent | null>;
  listIntents(): Promise<IntentListing>;
  getIntentRecord(intentId: string): Promise<IntentRecordLookup>;
  linkEdge(params: LinkEdgeParams): Promise<EdgeWriteResult>;
  unlinkEdge(params: Omit<LinkEdgeParams, 'provenance'>): Promise<EdgeWriteResult>;
  /** plan-b320 LD5: the REVIEWED mirror; called only by recordDeliveryReview. */
  recordReview(params: { intentId: string; actor: string; details: IntentReviewDetails }): Promise<EdgeWriteResult>;
}

export interface DeliveryContext {
  workspaceRoot: string;
  intents: DeliveryIntents;
  /** The FailSafe LedgerManager (or null); read through its sealed reads (deliveryEvidence, deliveryReview). */
  ledger: unknown;
  git?: ArchitectureGit;
  indexPathSetting?: string;
  /** The clock a review's age is measured against (tests inject it). */
  now?: () => number;
}

export interface CandidateRow {
  id: string;
  domain: string;
  docPath: string;
  status: string;
}

export interface DeliveryCandidates {
  architecture: { state: ArchitectureIndexState; rows: CandidateRow[] };
  commits: RecentCommits;
}

export interface DeliveryRequest {
  intentId: string;
  edge: IntentEdgeKind;
  target: string;
}

export type EdgeAction = 'link' | 'unlink';

/** plan-532c LD6: what created an edge, recorded in its provenance as `via` (and `action`). */
export type EdgeOrigin =
  | { via: 'workspace-delivery' }
  | { via: 'governed-commit'; action: string };

interface ComputedEdge {
  provenance: Record<string, unknown>;
  /** Server-side values shown in the confirmation dialog, exactly what is recorded. */
  facts: string[];
}

export type PreparedEdge =
  | ({ ok: true; action: EdgeAction; intent: { id: string; purpose: string }; edge: IntentEdgeKind; target: string } & ComputedEdge)
  | { ok: false; status: number; error: string };

export type ReadyEdge = Extract<PreparedEdge, { ok: true }>;

export interface DeliveryIntentView {
  id: string;
  purpose: string;
  status: IntentStatus;
  active: boolean;
  sealed: boolean;
  /** The CREATED entry: who created the intent, when, and that entry's hash. */
  createdBy: string | null;
  createdAt: string | null;
  createdEntryHash: string | null;
  /** plan-532c LD5: the intent decision; approval for implementation is not a review. */
  decision: { status: 'PASS' | 'VETO'; actor: string; timestamp: string; entryHash: string | null } | null;
}

export type DeliveryView =
  | { integrity: 'invalid' }
  | { integrity: 'valid'; found: false }
  | {
    integrity: 'valid';
    found: true;
    intent: DeliveryIntentView;
    /** True only for the active, unsealed intent: links and unlinks are offered for it alone. */
    linkable: boolean;
    edges: IntentEdge[];
    assessment: DeliveryAssessment;
  };

/** Linked documents larger than this are not hashed (the architecture index reads at most this much). */
export const MAX_LINKED_DOC_BYTES = 2 * 1024 * 1024;

const RequestSchema = z.object({ intentId: IntentIdSchema, edge: IntentEdgeKindSchema, target: z.string().min(1).max(256) });

/** Validate a request body: only intentId, edge and target are read; any other field (a hash) is ignored. */
export function parseDeliveryRequest(body: unknown): DeliveryRequest | string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const parsed = RequestSchema.safeParse({ intentId: b.intentId, edge: b.edge, target: b.target });
  return parsed.success ? parsed.data
    : 'intentId must be an intent id, edge must be implements or committed-under, and target a non-empty string';
}

const snapshotOf = (ctx: DeliveryContext): ArchitectureIndexSnapshot =>
  discoverArchitectureIndex({ workspaceRoot: ctx.workspaceRoot, indexPathSetting: ctx.indexPathSetting, git: ctx.git });

/** Discovery states in which no registry can be read at all. */
const ARCHITECTURE_UNAVAILABLE: ReadonlySet<ArchitectureIndexState> = new Set(['no-git', 'not-a-repo', 'no-workspace', 'bad-index-path']);

export function deliveryCandidates(ctx: DeliveryContext): DeliveryCandidates {
  const snap = snapshotOf(ctx);
  const rows: CandidateRow[] = [];
  for (const r of snap.rows) if (r.docPath) rows.push({ id: r.id, domain: r.domain, docPath: r.docPath, status: r.status });
  return { architecture: { state: snap.state, rows }, commits: listRecentCommits(ctx.workspaceRoot, ctx.git) };
}

type DocHash = { ok: true; docSha256: string } | { ok: false; reason: string };

/** SHA-256 of a workspace document that resolves inside the workspace and is at most 2 MiB. */
function hashDocument(root: string, docPath: string): DocHash {
  const located = resolveInsideWorkspace(root, docPath);
  if (!located) return { ok: false, reason: 'the document is not in the workspace' };
  if (!located.inside) return { ok: false, reason: 'the document resolves outside the workspace' };
  try {
    const st = fs.statSync(located.abs);
    if (!st.isFile()) return { ok: false, reason: 'the path is not a file' };
    if (st.size > MAX_LINKED_DOC_BYTES) return { ok: false, reason: 'the document is over 2 MiB' };
    return { ok: true, docSha256: sha256(fs.readFileSync(located.abs)) };
  } catch {
    return { ok: false, reason: 'the document cannot be read' };
  }
}

const refuse = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
type Refusal = ReturnType<typeof refuse>;

/** The record behind a write: the active, unsealed intent, from a history whose chain verifies. */
async function writableRecord(ctx: DeliveryContext, intentId: string): Promise<IntentRecord | Refusal> {
  const lookup = await ctx.intents.getIntentRecord(intentId);
  if (lookup.integrity === 'invalid') {
    return refuse(409, 'The intent history failed its chain check, so nothing can be linked or unlinked.');
  }
  if (!lookup.record) return refuse(404, 'No such intent in this workspace.');
  if (!lookup.record.active) return refuse(409, 'Only the active intent can be linked; this intent is archived.');
  if (lookup.record.sealed) return refuse(409, 'This intent is sealed; its links are read-only.');
  return lookup.record;
}

function prepareImplements(ctx: DeliveryContext, target: string): ComputedEdge | Refusal {
  const snap = snapshotOf(ctx);
  const row = snap.rows.find((r) => r.id === target && r.docPath);
  if (!row || !row.docPath) return refuse(400, 'target is not a registered architecture document with a path in this workspace');
  const hash = hashDocument(ctx.workspaceRoot, row.docPath);
  if (!hash.ok) return refuse(422, `${row.docPath}: ${hash.reason}; nothing was linked.`);
  const head = sourceShaOf(ctx.workspaceRoot, ctx.git);
  const headText = head.sourceSha ?? (head.sourceShaReason === 'unborn' ? 'none (no commits yet)' : 'unavailable');
  return {
    // sourceSha is HEAD at link time: the commit checked out when the operator linked the document.
    provenance: {
      docPath: row.docPath, docSha256: hash.docSha256, sourceSha: head.sourceSha,
      ...(head.sourceShaReason ? { sourceShaReason: head.sourceShaReason } : {}), indexPath: snap.indexPath,
    },
    facts: [`Document: ${row.docPath} (registry row ${row.id})`, `Document SHA-256: ${hash.docSha256}`, `HEAD at link time: ${headText}`],
  };
}

function prepareCommit(ctx: DeliveryContext, target: string): ComputedEdge | Refusal {
  if (!COMMIT_NAME_RE.test(target)) return refuse(400, 'target must be a full commit name');
  const list = listRecentCommits(ctx.workspaceRoot, ctx.git);
  if (list.state === 'unborn') return refuse(409, 'This repository has no commits yet.');
  if (list.state === 'unavailable') return refuse(503, `Git cannot read this repository: ${list.detail}`);
  const pick = list.commits.find((c) => c.sha === target);
  if (!pick) return refuse(400, 'target is not HEAD or one of its 50 most recent commits');
  const resolved = resolveCommit(ctx.workspaceRoot, target, ctx.git);
  if (resolved.state === 'unavailable') return refuse(503, `Git cannot read this repository: ${resolved.detail}`);
  if (resolved.state === 'missing') return refuse(409, `${target}: ${resolved.reason}`);
  return {
    provenance: { sha: resolved.sha, tree: resolved.tree, branch: list.branch },
    facts: [`Commit: ${resolved.sha}`, `Subject: ${pick.subject}`, `Tree: ${resolved.tree}`, `Branch: ${list.branch ?? 'none (detached HEAD)'}`],
  };
}

/** How an edge origin reads in a dialog and in the view. */
export function originLabel(origin: { via?: unknown; action?: unknown }): string {
  if (origin.via === 'governed-commit') return `FailSafe ${typeof origin.action === 'string' ? origin.action : 'governed'} (governed commit)`;
  if (origin.via === 'workspace-delivery') return 'Workspace > Delivery (your pick)';
  return 'not recorded';
}

const originOf = (p: Record<string, unknown>) => ({
  via: typeof p.via === 'string' ? p.via : null, action: typeof p.action === 'string' ? p.action : null,
});

function edgeFacts(edge: IntentEdge): string[] {
  return edge.edge === 'implements'
    ? [`Document: ${String(edge.provenance.docPath ?? '')} (registry row ${edge.target})`, `Linked at: ${edge.linkedAt}`]
    : [`Commit: ${edge.target}`, `Linked at: ${edge.linkedAt}`];
}

/**
 * Check a link or unlink request against server state and compute what would be recorded. Every
 * value in `provenance` and `facts` comes from the server; the request names only the edge.
 */
export async function prepareDeliveryEdge(
  ctx: DeliveryContext, action: EdgeAction, req: DeliveryRequest, origin: EdgeOrigin = { via: 'workspace-delivery' },
): Promise<PreparedEdge> {
  const record = await writableRecord(ctx, req.intentId);
  if ('ok' in record) return record;
  const intent = { id: record.intent.id, purpose: record.intent.purpose };
  const present = record.edges.find((e) => e.edge === req.edge && e.target === req.target);
  if (action === 'unlink') {
    if (!present) return refuse(404, 'That link is not recorded for this intent.');
    return { ok: true, action, intent, edge: req.edge, target: req.target, provenance: {}, facts: edgeFacts(present) };
  }
  if (present) return refuse(409, 'That link is already recorded for this intent.');
  const computed = req.edge === 'implements' ? prepareImplements(ctx, req.target) : prepareCommit(ctx, req.target);
  if ('ok' in computed) return computed;
  return {
    ok: true, action, intent, edge: req.edge, target: req.target,
    provenance: { ...computed.provenance, ...origin },
    facts: [...computed.facts, `Made by: ${originLabel(origin)}`],
  };
}

/** Append the LINKED / UNLINKED entry for a prepared request (after the operator confirmed). */
export async function writeDeliveryEdge(ctx: DeliveryContext, prepared: ReadyEdge, actor: string): Promise<EdgeWriteResult> {
  const base = { intentId: prepared.intent.id, edge: prepared.edge, target: prepared.target, actor };
  return prepared.action === 'link'
    ? ctx.intents.linkEdge({ ...base, provenance: prepared.provenance })
    : ctx.intents.unlinkEdge(base);
}

function checkArchitectureEdge(ctx: DeliveryContext, snap: ArchitectureIndexSnapshot, e: IntentEdge): ArchitectureEdgeCheck {
  const p = e.provenance;
  const base = {
    target: e.target, docPath: String(p.docPath ?? ''), docSha256: String(p.docSha256 ?? ''),
    sourceSha: typeof p.sourceSha === 'string' ? p.sourceSha : null, ...originOf(p),
  };
  if (!snap.rows.some((r) => r.id === e.target && r.docPath === base.docPath)) {
    return { ...base, status: 'missing', reason: 'the row is no longer registered with that path' };
  }
  const hash = hashDocument(ctx.workspaceRoot, base.docPath);
  if (!hash.ok) return { ...base, status: 'missing', reason: hash.reason };
  if (hash.docSha256 !== base.docSha256) {
    return { ...base, status: 'stale', currentSha256: hash.docSha256, reason: 'the document changed since it was linked' };
  }
  return { ...base, status: 'recorded' };
}

function checkArchitecture(ctx: DeliveryContext, edges: IntentEdge[]): EdgeChecks<ArchitectureEdgeCheck> {
  if (!edges.length) return { state: 'checked', edges: [] };
  const snap = snapshotOf(ctx);
  if (ARCHITECTURE_UNAVAILABLE.has(snap.state)) {
    return { state: 'unavailable', reason: `The architecture index cannot be read (${snap.state}).` };
  }
  return { state: 'checked', edges: edges.map((e) => checkArchitectureEdge(ctx, snap, e)) };
}

function checkCode(ctx: DeliveryContext, edges: IntentEdge[]): EdgeChecks<CodeEdgeCheck> {
  if (!edges.length) return { state: 'checked', edges: [] };
  if (sourceShaOf(ctx.workspaceRoot, ctx.git).sourceShaReason === 'unavailable') {
    return { state: 'unavailable', reason: 'Git is unavailable, or this workspace is not a repository git can read.' };
  }
  const checks: CodeEdgeCheck[] = [];
  for (const e of edges) {
    const base = {
      sha: e.target, tree: String(e.provenance.tree ?? ''), branch: typeof e.provenance.branch === 'string' ? e.provenance.branch : null,
      ...originOf(e.provenance),
    };
    // resolveCommit re-validates the target as a full commit name before git sees it.
    const resolved = resolveCommit(ctx.workspaceRoot, e.target, ctx.git);
    if (resolved.state === 'unavailable') return { state: 'unavailable', reason: `Git cannot read this repository: ${resolved.detail}` };
    if (resolved.state === 'missing') { checks.push({ ...base, status: 'missing', reason: resolved.reason }); continue; }
    const files = changedFiles(ctx.workspaceRoot, e.target, ctx.git);
    // plan-b320 LD8: a commit name that now resolves to another tree (git replace, a rewritten object store) is not the commit that was linked.
    if (resolved.tree !== base.tree) {
      checks.push({ ...base, status: 'stale', currentTree: resolved.tree, reason: 'the commit now resolves to a different tree', files });
      continue;
    }
    checks.push({ ...base, status: 'recorded', files });
  }
  return { state: 'checked', edges: checks };
}

function createdProvenance(record: IntentRecord): Record<string, unknown> | null {
  const details = record.created?.details as Record<string, unknown> | undefined;
  const p = details?.provenance;
  return p && typeof p === 'object' ? p as Record<string, unknown> : null;
}

/** Re-check every edge of one intent, read its ledger evidence, and apply the assessment rule. */
export async function assessIntentDelivery(ctx: DeliveryContext, intentId: string): Promise<DeliveryView> {
  const lookup = await ctx.intents.getIntentRecord(intentId);
  if (lookup.integrity === 'invalid') return { integrity: 'invalid' };
  const record = lookup.record;
  if (!record) return { integrity: 'valid', found: false };
  const implementsEdges = record.edges.filter((e) => e.edge === 'implements');
  const commitEdges = record.edges.filter((e) => e.edge === 'committed-under');
  const reviews = await readIntentReviews(ctx, record, ctx.now ? ctx.now() : Date.now());
  const assessment = assessDelivery({
    intentId,
    issue: { provenance: createdProvenance(record), createdEntryHash: record.created?.entryHash ?? null },
    architecture: checkArchitecture(ctx, implementsEdges),
    code: checkCode(ctx, commitEdges),
    governance: reviews.evidence,
    decision: record.decision,
    review: reviews.assessment,
  });
  const i = record.intent;
  return {
    integrity: 'valid', found: true,
    intent: {
      id: i.id, purpose: i.purpose, status: i.status, active: record.active, sealed: record.sealed,
      createdBy: record.created?.actor ?? null, createdAt: record.created?.timestamp ?? null,
      createdEntryHash: record.created?.entryHash ?? null, decision: record.decision,
    },
    linkable: record.active && !record.sealed, edges: record.edges, assessment,
  };
}
