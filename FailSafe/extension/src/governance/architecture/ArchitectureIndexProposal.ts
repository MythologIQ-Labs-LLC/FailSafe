/**
 * Architecture proposals with authority checks (#531 slice 2, plan-531b LD5-LD8).
 *
 * planArchitectureProposal turns a propose request and a discovery snapshot into a server-built
 * operation, or a refusal. Authority is `canonical` only:
 *   - a canonical registration must name every canonical row of its domain key in `supersedes`;
 *   - authority domains (a canonical registration, any supersession) must use the intake charset,
 *     with no byte-exact exception, and while any canonical row in the index has a domain outside
 *     it, canonical registrations and supersessions are refused (a key comparison cannot see
 *     look-alikes, so FailSafe refuses rather than guess);
 *   - a domain with a bad-status row, or (for a supersession) a duplicated id, is ambiguous.
 * pendingAuthority finds an earlier canonical proposal for the same domain key, or a supersession of
 * the same row, that is in the L3 queue (not REJECTED or EXPIRED) or approved in the ledger and not
 * yet reflected in the index. withProposalLock serializes the re-check, the append and the queueing.
 *
 * Nothing here edits the index; an approved proposal is applied by hand.
 */

import * as fs from "fs";
import type { L3ApprovalRequest } from "../../shared/types/l3-approval";
import { sanitizeDialogText, ARCHITECTURE_PATH_LIMIT, type ArchitectureSupersessionFacts } from "../../extension/operatorConfirmation";
import {
  MAX_DOC_BYTES, resolveInsideWorkspace, type ArchitectureGit, type ArchitectureIndexSnapshot, type SnapshotRow,
} from "./ArchitectureIndexDiscovery";
import {
  appendArchitectureProposal, ARCHITECTURE_AGENT_DID, sha256, sourceShaOf, type ArchitectureLedger,
} from "./ArchitectureIndexBootstrap";
import {
  domainIntakeProblem, domainKey, hiddenCharacterProblem, INTAKE_CHARSET, nonAsciiCodePoints, REGISTRY_STATUSES, renderDomainForReview,
} from "./architectureIndexCore";
import { documentState, rowRef, type AuthorityRowRef } from "./architectureAuthority";

export const ARCHITECTURE_KINDS: ReadonlySet<string> = new Set(["architecture-doc-proposal", "architecture-doc-supersede"]);
export const PATH_RECORD_LIMIT = ARCHITECTURE_PATH_LIMIT;
const REGISTER_STATUSES: ReadonlySet<string> = new Set(["canonical", "proposed", "descriptive", "historical"]);
const PROPOSABLE: ReadonlySet<string> = new Set(["present", "present-with-problems"]);
const MAX_SUPERSEDES = 50;
const CHARSET_TEXT = "A-Z, a-z, 0-9, space and . _ / & ( ) -";

export interface ProposalOperation {
  action: "register" | "supersede";
  kind: "architecture-doc-proposal" | "architecture-doc-supersede";
  path: string;
  docSha256: string;
  domain: string | null;
  domainSource: "request" | "index";
  status: string | null;
  supersedes: string[];
  supersededBy: string | null;
  supersededRowId: string | null;
  /** register: the domain key's canonical rows; supersede: the superseded row (when registered). */
  existingAuthority: AuthorityRowRef[];
  successor: AuthorityRowRef | null;
  supersession: boolean;
  sourceSha: string | null;
  sourceShaReason?: "unborn" | "unavailable";
  indexPath: string;
  indexSha256: string | null;
  suggestions: string[];
}

export interface Refusal {
  status: number;
  body: Record<string, unknown>;
}

export type ProposalPlan = { op: ProposalOperation; refuse?: undefined } | { refuse: Refusal; op?: undefined };

export interface ProposalContext {
  workspaceRoot: string;
  git?: ArchitectureGit;
}

const refuse = (status: number, body: Record<string, unknown>): ProposalPlan => ({ refuse: { status, body: { ok: false, ...body } } });
const bad = (error: string, extra: Record<string, unknown> = {}): ProposalPlan => refuse(400, { error, ...extra });
const isString = (x: unknown): x is string => typeof x === "string";

function duplicatedIds(snap: ArchitectureIndexSnapshot): Set<string> {
  return new Set(snap.problems.filter((p) => p.code === "duplicate-id").flatMap((p) => p.ids ?? []));
}

/** A domain FailSafe cannot compare safely: outside the intake charset, or with hidden characters (review B2). */
const unsafeDomain = (domain: string): boolean => !INTAKE_CHARSET.test(domain) || hiddenCharacterProblem(domain) !== null;
/** An empty domain cell ('' or '-') on a canonical row: authority for no named domain (review531b fold 6). */
const emptyDomain = (domain: string): boolean => domain.trim() === "" || domain.trim() === "-";

/** 409 while a registry row has the wrong cell count: it is not parsed, so it could hide a canonical row (review B1). */
function badRowRefusal(snap: ArchitectureIndexSnapshot): ProposalPlan | null {
  const lines = snap.problems.filter((p) => p.code === "bad-row" && typeof p.line === "number").map((p) => p.line as number);
  if (!lines.length) return null;
  return refuse(409, {
    conflict: "ambiguous-authority", reason: "bad-row", lines, rows: [], exits: ["fix-row"],
    error: `The registry rows at line(s) ${lines.join(", ")} cannot be read (the wrong number of cells, or no leading |), so they could ` +
      "hold a canonical document. Fix those rows in the index first; until then canonical registrations and supersessions are refused " +
      "(descriptive, proposed and historical registrations are still accepted).",
  });
}

/** 409 for an index FailSafe cannot read authority from without guessing. */
function ambiguous(
  root: string, reason: "empty-domain" | "non-ascii-domain" | "hidden-character-domain" | "bad-status" | "duplicate-id", rows: SnapshotRow[],
): ProposalPlan {
  const refs = rows.map((r) => rowRef(root, r));
  const list = rows.map((r) => `${renderDomainForReview(r.id)} (line ${r.line}, "${renderDomainForReview(r.domain)}", ${r.status})`).join("; ");
  if (reason === "empty-domain") {
    return refuse(409, {
      conflict: "ambiguous-authority", reason, rows: refs, exits: ["give-domain", "change-status-from-canonical"],
      error: `These canonical rows have no domain: ${list}. FailSafe cannot tell which domain they hold authority for, so it refuses ` +
        "canonical registrations and supersessions until you give each a domain in the index or change its status from canonical. FailSafe never edits the index.",
    });
  }
  if (reason === "hidden-character-domain") {
    return refuse(409, {
      conflict: "ambiguous-authority", reason, rows: refs, exits: ["rename-domain-to-ascii", "change-status-from-canonical"],
      error: `These canonical rows have a domain with hidden characters (${rows.map((r) => hiddenCharacterProblem(r.domain)).join("; ")}): ${list}. ` +
        "FailSafe cannot tell such a domain from a visible one, so it refuses canonical registrations and supersessions until you " +
        "either rename each such domain in the index to plain ASCII without hidden characters or change its status from canonical. FailSafe never edits the index.",
    });
  }
  if (reason === "non-ascii-domain") {
    return refuse(409, {
      conflict: "ambiguous-authority", reason, rows: refs, exits: ["rename-domain-to-ascii", "change-status-from-canonical"],
      error: `These canonical rows have a domain with characters outside ${CHARSET_TEXT}: ${list}. FailSafe compares domains as ` +
        "written and cannot tell a look-alike from another domain, so it refuses canonical registrations and supersessions until " +
        "you either rename each such domain in the index to plain ASCII or change its status from canonical. FailSafe never edits the index.",
    });
  }
  if (reason === "bad-status") {
    return refuse(409, {
      conflict: "ambiguous-authority", reason, rows: refs,
      error: `These rows have a status that is not one of ${REGISTRY_STATUSES.join(", ")}: ${list}. Fix the status in the index by hand first.`,
    });
  }
  return refuse(409, {
    conflict: "ambiguous-authority", reason, rows: refs,
    error: `These rows share an id, so a supersession cannot say which one it replaces: ${list}. Give each row its own id in the index first.`,
  });
}

function hashOf(abs: string): string {
  return sha256(fs.readFileSync(abs));
}

/** 400 for a document FailSafe could not re-hash before recording (over 2 MiB), instead of a permanent stale 409 (review N1). */
function tooLargeRefusal(abs: string, docPath: string, rows: AuthorityRowRef[]): ProposalPlan | null {
  let size: number;
  try {
    size = fs.statSync(abs).size;
  } catch {
    // The document vanished between discovery and now (review531b fold 5): stale, not a generic 500.
    return refuse(409, { stale: "document", error: `${docPath} changed while FailSafe was reading it; nothing was recorded. Propose again.` });
  }
  const large = [...(size > MAX_DOC_BYTES ? [docPath] : []),
    ...rows.filter((r) => r.docState === "too-large").map((r) => r.docPath ?? r.id)];
  if (!large.length) return null;
  return bad(`${large.join(", ")}: document too large to hash for freshness (over 2 MiB); FailSafe cannot check it has not changed ` +
    "before recording, so it does not propose it.", { tooLarge: large });
}

function common(snap: ArchitectureIndexSnapshot, ctx: ProposalContext) {
  const source = sourceShaOf(ctx.workspaceRoot, ctx.git);
  return {
    sourceSha: source.sourceSha, ...(source.sourceShaReason ? { sourceShaReason: source.sourceShaReason } : {}),
    indexPath: snap.indexPath, indexSha256: snap.indexSha256,
  };
}

function planRegister(snap: ArchitectureIndexSnapshot, b: Record<string, unknown>, docPath: string, ctx: ProposalContext): ProposalPlan {
  const root = ctx.workspaceRoot;
  if (typeof b.status !== "string" || !REGISTER_STATUSES.has(b.status)) return bad("status must be canonical, proposed, descriptive or historical");
  if (typeof b.domain !== "string") return bad("domain is required");
  let supersedes: string[] = [];
  if (b.supersedes !== undefined) {
    const list = b.supersedes;
    if (!Array.isArray(list) || !list.every(isString) || list.length > MAX_SUPERSEDES || new Set(list).size !== list.length) {
      return bad("supersedes must be a list of distinct registry row ids");
    }
    supersedes = list;
  }
  const status = b.status;
  if (supersedes.length && status !== "canonical") return bad("supersedes is only for a canonical registration");
  if (!PROPOSABLE.has(snap.state)) return refuse(409, { state: snap.state });
  const candidate = snap.candidates.find((c) => c.path === docPath);
  if (!candidate) return bad("path is not an unregistered architecture document in this workspace");
  const located = resolveInsideWorkspace(root, docPath);
  if (!located || !located.inside) return bad("path does not resolve inside the workspace");

  const domain = b.domain;
  const authority = status === "canonical";
  const intake = domainIntakeProblem(domain, [...new Set(snap.rows.map((r) => r.domain))], { authority });
  if (intake) return bad(`The domain was refused: ${intake}.`, { intake });

  const key = domainKey(domain);
  const domainRows = snap.rows.filter((r) => domainKey(r.domain) === key);
  const canonicalRows = domainRows.filter((r) => r.status === "canonical");
  if (authority) {
    if (supersedes.length && !canonicalRows.length) return bad(`supersedes names rows, but "${key}" has no canonical row`);
    for (const id of supersedes) {
      if (!canonicalRows.some((r) => r.id === id)) return bad(`supersedes names ${renderDomainForReview(id)}, which is not a canonical row of "${key}"`);
      const hiddenId = hiddenCharacterProblem(id);
      if (hiddenId) return bad(`supersedes names row id ${renderDomainForReview(id)}, which has ${hiddenId}; give the row a plain id in the index first`);
    }
    const unreadable = badRowRefusal(snap);
    if (unreadable) return unreadable;
    const blank = snap.rows.filter((r) => r.status === "canonical" && emptyDomain(r.domain));
    if (blank.length) return ambiguous(root, "empty-domain", blank);
    const unsafe = snap.rows.filter((r) => r.status === "canonical" && unsafeDomain(r.domain));
    if (unsafe.length) return ambiguous(root, unsafe.some((r) => !INTAKE_CHARSET.test(r.domain)) ? "non-ascii-domain" : "hidden-character-domain", unsafe);
    const badStatus = domainRows.filter((r) => !REGISTRY_STATUSES.includes(r.status));
    if (badStatus.length) return ambiguous(root, "bad-status", badStatus);
    if (supersedes.length) {
      const dup = duplicatedIds(snap);
      const involved = domainRows.filter((r) => dup.has(r.id));
      if (involved.length) return ambiguous(root, "duplicate-id", involved);
    }
    const missing = canonicalRows.map((r) => r.id).filter((id) => !supersedes.includes(id));
    if (canonicalRows.length && missing.length) {
      return refuse(409, {
        conflict: "canonical-exists", domain, existing: canonicalRows.map((r) => rowRef(root, r)), missing,
        alternatives: ["use-existing", "register-descriptive", "supersede"],
        error: `"${renderDomainForReview(key)}" already has a canonical document (${canonicalRows.map((r) => `${renderDomainForReview(r.id)} at line ${r.line}`).join(", ")}). ` +
          "Use the existing document, register this one as descriptive, or propose superseding every canonical row.",
      });
    }
  }
  const supersession = supersedes.length > 0;
  const existingAuthority = canonicalRows.map((r) => rowRef(root, r));
  const tooLarge = tooLargeRefusal(located.abs, docPath, supersession ? existingAuthority : []);
  if (tooLarge) return tooLarge;
  return {
    op: {
      action: "register", kind: supersession ? "architecture-doc-supersede" : "architecture-doc-proposal", path: docPath,
      docSha256: hashOf(located.abs), domain, domainSource: "request", status, supersedes, supersededBy: null, supersededRowId: null,
      existingAuthority, successor: null, supersession,
      ...common(snap, ctx), suggestions: candidate.suggestions,
    },
  };
}

function planSupersede(snap: ArchitectureIndexSnapshot, b: Record<string, unknown>, docPath: string, ctx: ProposalContext): ProposalPlan {
  const root = ctx.workspaceRoot;
  if (!PROPOSABLE.has(snap.state)) return refuse(409, { state: snap.state });
  const candidate = snap.candidates.find((c) => c.path === docPath);
  const row = snap.rows.find((r) => r.docPath === docPath) ?? null;
  if (!candidate && !row) return bad("path is not an architecture document in this workspace");
  const next = snap.rows.find((r) => r.id === b.supersededBy && r.docPath);
  if (!next || next.docPath === docPath) return bad("supersededBy must name another registered row id");
  const located = resolveInsideWorkspace(root, docPath);
  if (!located || !located.inside) return bad("path does not resolve inside the workspace");
  for (const r of [row, next]) {
    if (!r) continue;
    const hiddenId = hiddenCharacterProblem(r.id);
    if (hiddenId) {
      return bad(`Row id ${renderDomainForReview(r.id)} has ${hiddenId}; a supersession needs plain row ids. Fix the id in the index first.`,
        { intake: "hidden-character-id" });
    }
    if (!INTAKE_CHARSET.test(r.domain)) {
      return bad(`The domain of ${r.id} uses characters outside ${CHARSET_TEXT} (${nonAsciiCodePoints(r.domain).join(", ")}); ` +
        "a supersession needs plain ASCII domains. Rename the domain in the index first.", { intake: "non-ascii-domain" });
    }
    const hiddenDomain = hiddenCharacterProblem(r.domain);
    if (hiddenDomain) {
      return bad(`The domain of ${r.id} has ${hiddenDomain}; a supersession needs domains without hidden characters. ` +
        "Rename the domain in the index first.", { intake: "hidden-character-domain" });
    }
  }
  const unreadable = badRowRefusal(snap);
  if (unreadable) return unreadable;
  const blank = snap.rows.filter((r) => r.status === "canonical" && emptyDomain(r.domain));
  if (blank.length) return ambiguous(root, "empty-domain", blank);
  const unsafe = snap.rows.filter((r) => r.status === "canonical" && unsafeDomain(r.domain));
  if (unsafe.length) return ambiguous(root, unsafe.some((r) => !INTAKE_CHARSET.test(r.domain)) ? "non-ascii-domain" : "hidden-character-domain", unsafe);
  const keys = new Set([next, ...(row ? [row] : [])].map((r) => domainKey(r.domain)));
  const keyRows = snap.rows.filter((r) => keys.has(domainKey(r.domain)));
  const badStatus = keyRows.filter((r) => !REGISTRY_STATUSES.includes(r.status));
  if (badStatus.length) return ambiguous(root, "bad-status", badStatus);
  const dup = duplicatedIds(snap);
  const involved = keyRows.filter((r) => dup.has(r.id));
  if (involved.length) return ambiguous(root, "duplicate-id", involved);
  const existingAuthority = row ? [rowRef(root, row)] : [];
  const successor = rowRef(root, next);
  const tooLarge = tooLargeRefusal(located.abs, docPath, [...existingAuthority, successor]);
  if (tooLarge) return tooLarge;
  return {
    op: {
      action: "supersede", kind: "architecture-doc-supersede", path: docPath, docSha256: hashOf(located.abs),
      domain: row ? row.domain : null, domainSource: "index", status: null, supersedes: row ? [row.id] : [],
      supersededBy: next.id, supersededRowId: row ? row.id : null, existingAuthority,
      successor, supersession: true, ...common(snap, ctx), suggestions: candidate?.suggestions ?? [],
    },
  };
}

/** A server-built operation for a propose request, or the refusal to answer with. */
export function planArchitectureProposal(snap: ArchitectureIndexSnapshot, body: unknown, ctx: ProposalContext): ProposalPlan {
  const b = (body ?? {}) as Record<string, unknown>;
  const action = b.action === "register" || b.action === "supersede" ? b.action : null;
  if (!action) return bad("action must be register or supersede");
  const docPath = typeof b.path === "string" ? b.path : "";
  if (docPath.length > PATH_RECORD_LIMIT) return bad(`path is longer than ${PATH_RECORD_LIMIT} characters`);
  if (sanitizeDialogText(docPath, PATH_RECORD_LIMIT) !== docPath) return bad("path has characters a dialog cannot show as they are");
  return action === "register" ? planRegister(snap, b, docPath, ctx) : planSupersede(snap, b, docPath, ctx);
}

// ---------------------------------------------------------------- pending authority

export interface PendingTarget {
  action: string;
  status: string | null;
  domain: string | null;
  supersedes: string[];
  path: string;
}

export interface ApprovedProposal {
  entryId: number;
  payload: Record<string, unknown>;
}

export interface PendingResult {
  pending: string[];
  /** Approved and not yet in the index: whether its row is missing, and which superseded ids are still canonical. */
  approvedNotInIndex: Array<{ entryId: number; path: string; missingRow: boolean; stillCanonical: string[] }>;
}

interface Claim {
  canonicalKey: string | null;
  ids: Set<string>;
  paths: Set<string>;
}

type RowLike = Pick<SnapshotRow, "id" | "docPath" | "status" | "domain">;

/** What a proposal claims: a canonical domain key, and the rows (by id and path) it supersedes. */
function claimOf(meta: Record<string, unknown>, rows: RowLike[]): Claim {
  const canonicalKey = meta.status === "canonical" && typeof meta.domain === "string" ? domainKey(meta.domain) : null;
  const ids = new Set<string>([
    ...(Array.isArray(meta.supersedes) ? meta.supersedes.filter(isString) : []),
    ...(typeof meta.supersededRowId === "string" ? [meta.supersededRowId] : []),
  ]);
  const paths = new Set<string>();
  if (meta.action === "supersede" && typeof meta.path === "string") paths.add(meta.path);
  for (const r of rows) if (r.docPath && ids.has(r.id)) paths.add(r.docPath);
  return { canonicalKey, ids, paths };
}

const overlaps = (a: Set<string>, b: Set<string>): boolean => [...a].some((x) => b.has(x));

function matches(target: Claim, claim: Claim): boolean {
  return (target.canonicalKey !== null && target.canonicalKey === claim.canonicalKey)
    || overlaps(target.ids, claim.ids) || overlaps(target.paths, claim.paths);
}

/** What the index still lacks for an approved proposal: its row (a registration), and the superseded rows still canonical. */
function unapplied(payload: Record<string, unknown>, rows: RowLike[]): { missingRow: boolean; stillCanonical: string[] } {
  const missingRow = payload.action !== "supersede" && !rows.some((r) => r.docPath === payload.path);
  const claim = claimOf(payload, []);
  const stillCanonical = [...new Set(rows.filter((r) => r.status === "canonical"
    && (claim.ids.has(r.id) || (payload.action === "supersede" && r.docPath === payload.path))).map((r) => r.id))];
  return { missingRow, stillCanonical };
}

/** Earlier proposals that hold the same authority: open in the queue, or approved and not in the index. */
export function pendingAuthority(
  target: PendingTarget,
  sources: { queue: Array<Pick<L3ApprovalRequest, "id" | "state" | "kind" | "meta">>; approved: ApprovedProposal[]; snapshot: { rows: RowLike[] } },
): PendingResult {
  const rows = sources.snapshot.rows;
  const t = claimOf({ ...target, supersededRowId: undefined }, rows);
  if (target.action === "supersede") t.paths.add(target.path);
  if (t.canonicalKey === null && !t.ids.size && !t.paths.size) return { pending: [], approvedNotInIndex: [] };
  const pending = sources.queue
    .filter((q) => q.kind !== undefined && ARCHITECTURE_KINDS.has(q.kind) && q.state !== "REJECTED" && q.state !== "EXPIRED")
    .filter((q) => matches(t, claimOf(q.meta ?? {}, rows)))
    .map((q) => q.id);
  const approvedNotInIndex = sources.approved
    .filter((a) => matches(t, claimOf(a.payload, rows)))
    .map((a) => ({ entryId: a.entryId, path: String(a.payload.path ?? ""), ...unapplied(a.payload, rows) }))
    .filter((a) => a.missingRow || a.stillCanonical.length > 0);
  return { pending, approvedNotInIndex };
}

/** The 409 for pending authority, with the hand-edit guidance; null when nothing is pending. */
export function pendingRefusal(target: PendingTarget, result: PendingResult): Refusal | null {
  if (!result.pending.length && !result.approvedNotInIndex.length) return null;
  const parts: string[] = [];
  if (result.pending.length) {
    parts.push(`An earlier architecture proposal (${result.pending.join(", ")}) for the same authority is waiting for an L3 decision; decide it first.`);
  }
  for (const a of result.approvedNotInIndex) {
    let text = `Approval of ledger entry #${a.entryId} is not in the index yet.`;
    if (a.missingRow) text += ` Add a row for ${a.path} to the index by hand (any status) to apply or set it aside.`;
    if (a.stillCanonical.length) {
      text += ` To apply it, change ${a.stillCanonical.map(renderDomainForReview).join(", ")} from canonical in the index by hand (for example to superseded).`;
    }
    parts.push(`${text} FailSafe never edits the index.`);
  }
  return {
    status: 409,
    body: { ok: false, conflict: "pending-authority", domain: target.domain, pending: result.pending, approvedNotInIndex: result.approvedNotInIndex, error: parts.join(" ") },
  };
}

/** The ledger reads pending authority needs; null when the ledger cannot answer them. */
export interface ArchitectureLedgerReader {
  getEntriesByType(eventType: string, limit: number): Promise<Array<{ id: number; eventType: string; agentDid: string; payload: Record<string, unknown> }>>;
  getEntryById(id: number): Promise<{ id: number; eventType: string; agentDid: string; payload: Record<string, unknown> } | null>;
}

export function ledgerReader(ledger: unknown): ArchitectureLedgerReader | null {
  const l = ledger as Partial<ArchitectureLedgerReader> | null | undefined;
  return l && typeof l.getEntriesByType === "function" && typeof l.getEntryById === "function" ? (l as ArchitectureLedgerReader) : null;
}

/** Every architecture PROPOSAL an L3_APPROVED entry names (no limit: SQLite LIMIT -1). */
export async function loadApprovedProposals(reader: ArchitectureLedgerReader): Promise<ApprovedProposal[]> {
  const approvals = await reader.getEntriesByType("L3_APPROVED", -1);
  const out: ApprovedProposal[] = [];
  const seen = new Set<number>();
  for (const a of approvals) {
    if (a.agentDid !== ARCHITECTURE_AGENT_DID) continue;
    const source = a.payload?.sourceLedgerEntryId;
    if (typeof source !== "number" || seen.has(source)) continue;
    seen.add(source);
    const proposal = await reader.getEntryById(source);
    if (!proposal || proposal.eventType !== "PROPOSAL" || !ARCHITECTURE_KINDS.has(String(proposal.payload?.kind))) continue;
    out.push({ entryId: source, payload: proposal.payload });
  }
  return out;
}

const locks = new Map<string, Promise<void>>();

/**
 * Run `fn` alone for this workspace: re-check, append and queue cannot interleave with another
 * proposal's. The lock is released in `finally`, so a throw never wedges later proposals.
 */
export async function withProposalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => mine);
  locks.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

// ---------------------------------------------------------------- freshness and recording

export type Staleness = "state" | "index" | "document" | "head";

/** What changed since the operation was built, checked in this order; null when nothing did. */
export function freshnessProblem(op: ProposalOperation, snap: ArchitectureIndexSnapshot, ctx: ProposalContext): Staleness | null {
  if (!PROPOSABLE.has(snap.state)) return "state";
  if (snap.indexSha256 !== op.indexSha256) return "index";
  const docs: Array<[string | null, string | null]> = [[op.path, op.docSha256],
    ...[...op.existingAuthority, ...(op.successor ? [op.successor] : [])].map((r): [string | null, string | null] => [r.docPath, r.docSha256])];
  for (const [docPath, recorded] of docs) {
    if (!docPath || recorded === null) continue;
    if (documentState(ctx.workspaceRoot, docPath, true).docSha256 !== recorded) return "document";
  }
  if (sourceShaOf(ctx.workspaceRoot, ctx.git).sourceSha !== op.sourceSha) return "head";
  return null;
}

export interface ConfirmationRecord {
  operationId?: string;
  authentication?: Record<string, unknown>;
}

export function proposalPayload(op: ProposalOperation, confirmation: ConfirmationRecord = {}): Record<string, unknown> {
  return {
    kind: op.kind, path: op.path, action: op.action, supersededBy: op.supersededBy, sourceSha: op.sourceSha,
    ...(op.sourceShaReason ? { sourceShaReason: op.sourceShaReason } : {}), docSha256: op.docSha256, suggestions: op.suggestions,
    domain: op.domain, status: op.status, supersedes: op.supersedes, supersededRowId: op.supersededRowId,
    existingAuthority: op.existingAuthority, indexSha256: op.indexSha256,
    ...(op.successor ? { successor: op.successor } : {}),
    ...(confirmation.operationId ? { operationId: confirmation.operationId, authentication: confirmation.authentication } : {}),
  };
}

/** The L3 summary: the authority facts first (the L3 dialog caps it at 200 characters), then the path. */
export function proposalSummary(op: ProposalOperation): string {
  const tail = "Approval records the decision only; it does not edit the index.";
  if (op.action === "register") {
    const over = op.supersedes.length ? `, superseding ${op.supersedes.map(renderDomainForReview).join(", ")}` : "";
    return `Architecture authority: ${op.status} for "${renderDomainForReview(op.domain ?? "")}"${over}. Register ${op.path}. ${tail}`;
  }
  const domain = op.domain !== null ? ` ("${renderDomainForReview(op.domain)}")` : "";
  const from = op.supersededRowId !== null ? renderDomainForReview(op.supersededRowId) : "an unregistered document";
  return `Architecture authority: supersede ${from}${domain} with ${renderDomainForReview(op.supersededBy ?? "")}. Path ${op.path}. ${tail}`;
}

/** The facts the supersession dialog shows. */
export function supersessionFacts(op: ProposalOperation): ArchitectureSupersessionFacts {
  const facts = (r: AuthorityRowRef) => ({ id: renderDomainForReview(r.id), docPath: r.docPath, line: r.line, docSha256: r.docSha256 });
  return {
    action: op.action, domainShown: op.domain === null ? null : renderDomainForReview(op.domain), domainSource: op.domainSource,
    status: op.status, path: op.path, docSha256: op.docSha256, replaced: op.existingAuthority.map(facts),
    successor: op.successor ? facts(op.successor) : null, sourceSha: op.sourceSha, sourceShaReason: op.sourceShaReason,
    indexPath: op.indexPath, indexSha256: op.indexSha256,
  };
}

export type QueueL3 = (request: Omit<L3ApprovalRequest, "id" | "state" | "queuedAt" | "slaDeadline">) => Promise<string>;

/** Append the PROPOSAL entry, then queue one L3 item linked to it by id. */
export async function recordArchitectureProposal(
  op: ProposalOperation, ledger: ArchitectureLedger, queueL3Approval: QueueL3, confirmation: ConfirmationRecord = {},
): Promise<Refusal> {
  const payload = proposalPayload(op, confirmation);
  const record = await appendArchitectureProposal(ledger, op.path, op.docSha256, payload);
  if (record === "unavailable") return { status: 503, body: { ok: false, ledger: "unavailable", error: "The FailSafe ledger is unavailable; nothing was queued." } };
  if (record === "failed") return { status: 500, body: { ok: false, ledger: "failed", error: "The proposal could not be recorded; nothing was queued." } };
  const approvalId = await queueL3Approval({
    filePath: op.path, riskGrade: "L3", agentDid: ARCHITECTURE_AGENT_DID, agentTrust: 0, sentinelSummary: proposalSummary(op),
    flags: ["architecture-index"], kind: op.kind, meta: { ...payload, proposalEntryId: record.entryId }, sourceLedgerEntryId: record.entryId,
  });
  return { status: 202, body: { ok: true, approvalId, ledgerEntryId: record.entryId, kind: op.kind, path: op.path } };
}
