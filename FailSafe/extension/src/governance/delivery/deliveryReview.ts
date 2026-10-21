/**
 * #532 B320/B321 (plan-b320-delivery-review): an operator-confirmed review of the implementation,
 * bound to one linked commit of the active intent.
 *
 * A review is recorded only after the operator approves a bound modal VS Code dialog, as a pair:
 * a sealed DELIVERY_REVIEWED row in the FailSafe ledger (the `evaluated` edge of
 * INTEGRATION_SCENARIOS: it names the commit and tree it evaluated) and a REVIEWED mirror in the
 * intent history that names the row by id and entry hash. This module is the only writer of that
 * event type and of DELIVERY_REVIEW_DID (a static test pins it).
 *
 * Reading fails closed both ways (LD6):
 * - a PASS counts only as a valid pair: a sealed-valid row plus a mirror that matches it field
 *   for field. A PASS mirror without its row, or a PASS row without its mirror, counts for nothing;
 * - every VETO, and every review record that cannot be validated, is a blocking item: a standing
 *   VETO (a valid VETO pair, or a sealed-valid VETO row that is not part of a valid pair), a VETO
 *   mirror without a valid matching row, a row for this intent that fails its identity checks, any
 *   DELIVERY_REVIEWED row anywhere whose seal fails (it blocks every intent: its payload, including
 *   its intent id, cannot be trusted), a row naming this intent whose seal fails, and a break in the
 *   ledger range that holds this intent's reviews (the continuity walk);
 * - a blocking item clears only when a later valid PASS lists exactly its {kind, id, hash} in
 *   `supersedes`, which only the server computes and only the dialog shows. A trusted VETO (kind
 *   `veto`) also needs its commit to be the reviewed commit or an ancestor of it, or (#532 B344) a
 *   declared rework with that commit's diff (rebased) or its parent and a two-way majority of its
 *   non-bookkeeping paths (amended); both are re-checked here on
 *   every read.
 *
 * Completion needs a current covering PASS: the latest valid PASS, on a commit that equals or
 * descends from every linked commit, whose covered set, tree and evidence digest still match the
 * workspace and whose sealed timestamp is at most 30 days old and not in the future. Nothing here
 * is cached: every assessment re-reads the ledger and the intent history, so the result is the same
 * after a restart.
 *
 * Not authentication: the seal is tamper evidence under a secret any process running as the same
 * OS user may read, and the modal proves a person clicked, not who. Undetectable while #467
 * holds: deleting the newest ledger rows together with truncating their history mirrors (that can
 * revive an earlier PASS), and deleting every review row and every mirror of an intent.
 *
 * The exit from a blocking item is a later valid PASS whose dialog listed it. A sealed or archived
 * intent records nothing more, so a blocking item there (including a bad-seal row of any intent)
 * has no exit and its view stays failing (B341). A rotation retires a bad row; this intent's
 * earlier VETO mirrors then become "retired by rotation" items, which also need a naming PASS,
 * and its earlier PASS mirrors simply stop counting.
 */

import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import { withProposalLock } from '../architecture/ArchitectureIndexProposal';
import type { IntentReviewMirror, IntentRecord } from '../IntentService';
import {
  IntentIdSchema, IntentReviewDetailsSchema, ReviewCommitRefSchema, ReviewEvaluatesSchema, ReviewSupersededSchema,
  ReviewVerdictSchema, REWORK_ENTRY_LIMIT, ReworksSchema, type IntentReviewDetails, type ReviewBlockingKind,
  type ReviewSuperseded, type ReviewVerdict, type ReworkEntry,
} from '../types/IntentTypes';
import type { RotationHead, SealedLedgerRow } from '../../qorelogic/ledger/LedgerManager';
import { describeOperatorAuthentication } from '../../shared/types/operatorAuthentication';
import { reworkSectionLines, sanitizeDialogText } from '../../extension/operatorConfirmation';
import type { Ancestry, ChangedPath, ChangedPaths, CommitParents, CommitResolution, DiffIdentity } from './deliveryGit';
import { changedPaths, commitParents, commitSubject, diffIdentity, isAncestor, resolveCommit } from './deliveryGit';
import { findGovernanceEvidence, REVIEW_EVENT_TYPE, type EvidenceLedger, type GovernanceEvidence } from './deliveryEvidence';
import type { DeliveryContext } from './deliveryService';
import { isBookkeepingPath } from './reworkBookkeeping';

export const DELIVERY_REVIEW_DID = 'did:myth:failsafe:delivery-review';
export const DELIVERY_REVIEW_METHOD = 'operator-delivery-review';
/** The local overseer DID, as L3ApprovalService records it. */
export const LOCAL_OVERSEER_DID = 'did:myth:overseer:local';
export const REVIEW_MODAL_METHOD = 'vscode-modal-confirmation';
/** 30 days: the scenarios' proposed staleness age (INTEGRATION_SCENARIOS.md), inclusive. */
export const REVIEW_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const REVIEW_NOTE_LIMIT = 500;
/** #532 B344 (plan-b344 LD2/LD5): an amended rework over this many paths on either side cannot be shown in full. */
export const REWORK_PATH_LIMIT = 50;
/** A path longer than this is not shown, so it is refused. */
export const REWORK_PATH_CHARS = 4096;
/** The rework section of a confirmation dialog above this many characters is refused. */
export const REWORK_DIALOG_LIMIT = 8000;
export const REVIEW_CHANNELS = {
  console: 'console:/api/actions/delivery/review',
  command: 'command:failsafe.delivery.recordReview',
} as const;
export type ReviewChannel = keyof typeof REVIEW_CHANNELS;

const HASH64 = /^[0-9a-f]{64}$/;

const BindingSchema = z.object({
  intentId: IntentIdSchema,
  intentCreatedEntryHash: z.string().regex(HASH64),
  evaluates: ReviewEvaluatesSchema,
  covers: z.array(ReviewCommitRefSchema).max(1000),
  evidenceDigest: z.string().regex(HASH64),
  evidenceCount: z.number().int().nonnegative(),
}).strict();

const AuthenticationSchema = z.object({ method: z.string(), channel: z.string(), proves: z.string() }).strict();

/** The payload of a DELIVERY_REVIEWED row; anything else is not a review this module wrote. */
export const ReviewPayloadSchema = z.object({
  reviewId: z.string().uuid(),
  intentId: IntentIdSchema,
  verdict: ReviewVerdictSchema,
  binding: BindingSchema,
  supersedes: z.array(ReviewSupersededSchema).max(10000),
  note: z.string().max(REVIEW_NOTE_LIMIT),
  operationId: z.string().min(1).max(80),
  authentication: AuthenticationSchema,
  /** #532 B344: absent when the PASS declares no rework. */
  reworks: ReworksSchema.optional(),
}).strict();
export type ReviewPayload = z.infer<typeof ReviewPayloadSchema>;
export type ReviewBinding = z.infer<typeof BindingSchema>;

// ---------------------------------------------------------------- the ledger the review reads

/** The slice of LedgerManager a review reads and writes; anything less is `unavailable`. */
export interface ReviewLedger extends EvidenceLedger {
  appendEntry(request: {
    eventType: 'DELIVERY_REVIEWED'; agentDid: string; overseerDid: string; overseerDecision: string;
    verificationMethod: string; verificationResult: string; artifactHash: string; payload: Record<string, unknown>;
  }): Promise<{ id: number; entryHash: string; timestamp: string }>;
  getSealedEntriesByType(eventType: 'DELIVERY_REVIEWED'): Promise<SealedLedgerRow[]>;
  getSealedRange(fromId: number): Promise<SealedLedgerRow[]>;
  getRotationHead(): RotationHead | null;
}

export function usableReviewLedger(ledger: unknown): ReviewLedger | null {
  const l = ledger as Partial<ReviewLedger> | null | undefined;
  if (!l) return null;
  for (const fn of ['isAvailable', 'appendEntry', 'getSealedEntriesByType', 'getSealedRange', 'findSealedEntriesContaining', 'getRotationHead'] as const) {
    if (typeof l[fn] !== 'function') return null;
  }
  try { return l.isAvailable!() ? (l as ReviewLedger) : null; } catch { return null; }
}

// ---------------------------------------------------------------- the continuity walk

export interface ContinuityBreak {
  id: number;
  code: 'missing-range' | 'gap' | 'prev-link' | 'seal';
  /** The ledger ids the break covers (a missing run, or the two rows that do not link); part of its identity, so a widened gap is a new break. */
  range: [number, number];
  detail: string;
}

export interface Continuity {
  breaks: ContinuityBreak[];
  /** Set when a verified rotation accounts for the rows below the table's first row. */
  rotation: RotationHead | null;
}

/**
 * Where the walk starts: the lowest ledger id among this intent's review rows (sealed or not) and
 * the ids its mirrors name. Null when the intent has neither (nothing to walk).
 */
export function continuityStart(intentId: string, reviewRows: SealedLedgerRow[], mirrors: IntentReviewMirror[]): number | null {
  const ids: number[] = [];
  for (const r of reviewRows) if (r.payload && r.payload.intentId === intentId) ids.push(r.row.id);
  for (const m of mirrors) {
    const id = (m.details as { ledgerEntryId?: unknown } | null)?.ledgerEntryId;
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids.length ? Math.min(...ids) : null;
}

/**
 * The bounded continuity walk (plan-b320 LD6, audit should-fix 6): `rows` is every ledger row from
 * `start - 1` to the head, oldest first. Each row's seal must verify (v3 from `start` on; the row
 * before the first review may be a legacy row, checked under its own version), each id must be the
 * previous id + 1 and each prev_hash must name the previous row's entry hash, the same rules as
 * LedgerVerifier.verifyRows. Rows missing below the table's first row are a rotation only when a
 * verified rotation genesis (LedgerManager.getRotationHead) is that first row; otherwise they are a
 * possible deletion. A deletion after the newest row is not detectable here.
 */
export function walkContinuity(start: number, rows: SealedLedgerRow[], rotation: RotationHead | null): Continuity {
  const from = start - 1;
  const breaks: ContinuityBreak[] = [];
  let rotated: RotationHead | null = null;
  if (!rows.length) {
    breaks.push({ id: from, code: 'missing-range', range: [from, -1], detail: `no ledger row from #${from} onward exists, although this intent's review records name one (possible deletion)` });
    return { breaks, rotation: null };
  }
  const first = rows[0].row;
  if (first.id !== from) {
    if (rotation && rotation.genesisId === first.id && rotation.genesisId === rotation.headId + 1 && from <= rotation.headId) {
      rotated = rotation;
    } else {
      breaks.push({ id: from, code: 'missing-range', range: [from, first.id - 1], detail: `ledger rows #${from} to #${first.id - 1} are missing and no verified rotation accounts for them (possible deletion)` });
    }
  }
  rows.forEach(({ row, seal }, i) => {
    const legacyAllowed = i === 0 && row.id === from;
    if (!seal.ok) breaks.push({ id: row.id, code: 'seal', range: [row.id, row.id], detail: `ledger entry #${row.id} fails its seal (${seal.code ?? 'unknown'})` });
    else if (!legacyAllowed && seal.version !== 'v3') breaks.push({ id: row.id, code: 'seal', range: [row.id, row.id], detail: `ledger entry #${row.id} is not v3-sealed` });
    if (i === 0) return;
    const prev = rows[i - 1].row;
    if (row.id !== prev.id + 1) breaks.push({ id: row.id, code: 'gap', range: [prev.id + 1, row.id - 1], detail: `ledger rows #${prev.id + 1} to #${row.id - 1} are missing (possible deletion)` });
    else if (row.prev_hash !== prev.entry_hash) breaks.push({ id: row.id, code: 'prev-link', range: [prev.id, row.id], detail: `ledger entry #${row.id} does not link to #${prev.id} (possible deletion or edit)` });
  });
  return { breaks, rotation: rotated };
}

// ---------------------------------------------------------------- validity and blocking items

export interface BlockingItem {
  kind: ReviewBlockingKind;
  id: number;
  hash: string;
  label: string;
  verdict: ReviewVerdict | null;
  /** The commit the record names; trusted only for kind `veto` (a sealed-valid row). */
  commitSha: string | null;
  commitTrusted: boolean;
  timestamp: string | null;
  note: string | null;
  /** A superseding PASS must follow this ledger id, or this history position for a mirror-only item. */
  after: { ledgerId: number | null; historyPosition: number | null };
}

export interface ReviewRecordView {
  reviewId: string;
  verdict: ReviewVerdict;
  entryId: number;
  entryHash: string;
  timestamp: string;
  commitSha: string;
  tree: string;
  branch: string | null;
  covers: Array<{ commitSha: string; edgeEntryHash: string }>;
  evidenceDigest: string;
  evidenceCount: number;
  supersedes: ReviewSuperseded[];
  note: string;
  reviewerDid: string;
  authentication: { method: string; channel: string; proves: string };
  operationId: string;
  mirrorEntryHash: string | null;
  historyPosition: number;
  /** #532 B344: the VETOs this PASS supersedes by a declared rework (absent when none). */
  reworks?: ReworkEntry[];
}

export interface PassCurrency {
  review: ReviewRecordView;
  current: boolean;
  staleReasons: string[];
}

export interface LinkedCommit {
  commitSha: string;
  edgeEntryHash: string | null;
  tree: string;
}

export interface ReviewGit {
  resolve(sha: string): CommitResolution;
  ancestry(ancestor: string, descendant: string): Ancestry;
  /** #532 B344 (plan-b344 LD6): the reads behind a rework relation. */
  diffId(sha: string): DiffIdentity;
  parents(sha: string): CommitParents;
  paths(sha: string): ChangedPaths;
}

export interface ReviewAssessInput {
  intentId: string;
  createdEntryHash: string | null;
  reviewRows: SealedLedgerRow[];
  mirrors: IntentReviewMirror[];
  evidence: Extract<GovernanceEvidence, { state: 'ok' }>;
  continuity: Continuity | null;
  linked: LinkedCommit[];
  git: ReviewGit;
  now: number;
}

export type ReviewAssessment =
  | { state: 'unavailable'; cause: 'ledger-unavailable' | 'git-unavailable'; reason: string }
  | {
    state: 'checked';
    blocking: BlockingItem[];
    cleared: Array<BlockingItem & { clearedBy: string; clearedNote?: string }>;
    reviews: ReviewRecordView[];
    latestPass: PassCurrency | null;
  };

class GitUnavailable extends Error {}

const canon = (v: unknown): string => JSON.stringify(v);
/**
 * #532 B344 review fold: JSON with every object's keys sorted (arrays keep their order), so two
 * values compare equal whatever order their keys were built or parsed in.
 */
export function sortedJson(v: unknown): string {
  return JSON.stringify(v, (_key, value: unknown) => (value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value));
}
const sameRefs = (a: Array<{ commitSha: string; edgeEntryHash: string }>, b: Array<{ commitSha: string; edgeEntryHash: string }>): boolean =>
  canon([...a].sort((x, y) => x.commitSha.localeCompare(y.commitSha))) === canon([...b].sort((x, y) => x.commitSha.localeCompare(y.commitSha)));

/** The checks that make a sealed DELIVERY_REVIEWED row a review of this intent; a reason when one fails. */
function rowProblem(r: SealedLedgerRow, intentId: string, createdEntryHash: string | null): string | null {
  if (r.seal.version !== 'v3') return 'it is not v3-sealed';
  if (r.row.agent_did !== DELIVERY_REVIEW_DID) return 'it was not written by the delivery review';
  const parsed = ReviewPayloadSchema.safeParse(r.payload);
  if (!parsed.success) return 'its payload is not a delivery review';
  const p = parsed.data;
  if (p.intentId !== intentId || p.binding.intentId !== intentId) return 'it names another intent';
  if (!createdEntryHash || p.binding.intentCreatedEntryHash !== createdEntryHash) return "it is bound to another intent's CREATED entry";
  if (r.row.overseer_did !== LOCAL_OVERSEER_DID) return 'its reviewer is not the local overseer';
  if (p.authentication.method !== REVIEW_MODAL_METHOD) return 'it was not confirmed in a modal VS Code dialog';
  if (r.row.overseer_decision !== p.verdict || r.row.verification_result !== p.verdict) return 'its columns disagree with its verdict';
  if (r.row.verification_method !== DELIVERY_REVIEW_METHOD) return 'its verification method is not the delivery review';
  if (r.row.artifact_hash !== p.binding.evaluates.tree) return 'its artifact hash is not the reviewed tree';
  return null;
}

function viewOf(r: SealedLedgerRow, p: ReviewPayload, m: { mirror: IntentReviewMirror } | null): ReviewRecordView {
  return {
    reviewId: p.reviewId, verdict: p.verdict, entryId: r.row.id, entryHash: r.row.entry_hash, timestamp: r.row.timestamp,
    commitSha: p.binding.evaluates.commitSha, tree: p.binding.evaluates.tree, branch: p.binding.evaluates.branch,
    covers: p.binding.covers, evidenceDigest: p.binding.evidenceDigest, evidenceCount: p.binding.evidenceCount,
    supersedes: p.supersedes, note: p.note, reviewerDid: String(r.row.overseer_did), authentication: p.authentication,
    operationId: p.operationId, mirrorEntryHash: m?.mirror.entryHash ?? null, historyPosition: m?.mirror.position ?? -1,
    ...(p.reworks ? { reworks: p.reworks } : {}),
  };
}

/** A mirror matches its row when it names the row and repeats what the row bound, field for field. */
function mirrorMatches(d: IntentReviewDetails, r: SealedLedgerRow, p: ReviewPayload): boolean {
  return d.reviewId === p.reviewId && d.ledgerEntryId === r.row.id && d.ledgerEntryHash === r.row.entry_hash
    && d.verdict === p.verdict && d.operationId === p.operationId && d.evidenceDigest === p.binding.evidenceDigest
    && canon(d.evaluates) === canon(p.binding.evaluates) && canon(d.covers) === canon(p.binding.covers)
    && canon(d.supersedes) === canon(p.supersedes) && canon(d.reworks ?? null) === canon(p.reworks ?? null);
}

const payloadCommit = (payload: Record<string, unknown> | null): string | null => {
  const sha = (payload?.binding as { evaluates?: { commitSha?: unknown } } | undefined)?.evaluates?.commitSha;
  return typeof sha === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(sha) ? sha : null;
};
const payloadVerdict = (payload: Record<string, unknown> | null): ReviewVerdict | null =>
  payload?.verdict === 'PASS' || payload?.verdict === 'VETO' ? payload.verdict : null;

/** The identity a continuity break set is cleared by: every break, by id, code and the row range it covers. */
export function continuityHash(breaks: ContinuityBreak[]): string {
  return createHash('sha256').update(canon(breaks.map((b) => [b.id, b.code, b.range]))).digest('hex');
}

/** The identity an unverifiable-evidence set is cleared by: every row, by id and entry hash. */
export function evidenceSetHash(rows: Array<{ entryId: number; entryHash: string }>): string {
  return createHash('sha256').update(canon(rows.map((r) => [r.entryId, r.entryHash]))).digest('hex');
}

/**
 * Validity, blocking items, supersession and currency (plan-b320 LD6). Pure apart from the injected
 * git reads; a git read that cannot answer makes the whole review step `unavailable`.
 */
export function assessReviews(input: ReviewAssessInput): ReviewAssessment {
  try {
    return assessReviewsOrThrow(input);
  } catch (error) {
    if (error instanceof GitUnavailable) {
      return {
        state: 'unavailable', cause: 'git-unavailable',
        reason: 'Git could not answer whether one commit descends from another, or what a declared rework changed, so the review cannot be assessed.',
      };
    }
    throw error;
  }
}

function ancestorOrEqual(git: ReviewGit, ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return true;
  const resolvedA = git.resolve(ancestor);
  const resolvedD = git.resolve(descendant);
  if (resolvedA.state === 'unavailable' || resolvedD.state === 'unavailable') throw new GitUnavailable();
  if (resolvedA.state === 'missing' || resolvedD.state === 'missing') return false;
  const answer = git.ancestry(ancestor, descendant);
  if (answer === 'unavailable') throw new GitUnavailable();
  return answer === 'ancestor';
}

// ---------------------------------------------------------------- #532 B344: declared rework

type ReworkEvidence = ReworkEntry['evidence'];
type RelationResult =
  | { ok: true; relation: ReworkEntry['relation']; evidence: ReworkEvidence }
  | { ok: false; status: number; code: RefusalCode; detail: string };

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * #532 B344 (plan-b344 LD2 rules 4-6): whether R is V rebased (equal diff identities) or V amended
 * (the same single parent and a two-way path majority: R changes more than half of V's paths, and
 * at least half of R's paths are V's, neither side counting bookkeeping files; a V that changed only
 * bookkeeping files has no amended rework), with the evidence the row records. The caller has
 * resolved both commits. A git read that cannot answer throws GitUnavailable; it is never read as
 * "unrelated".
 */
function reworkRelation(git: ReviewGit, v: string, r: string): RelationResult {
  const no = (status: number, code: RefusalCode, detail: string): RelationResult => ({ ok: false, status, code, detail });
  // Rule 4: unreachable at record time (rules 2 and 3 imply it); a guard for the read path.
  if (r === v || ancestorOrEqual(git, v, r)) return no(400, 'rework-unnecessary', `${v} is ${r} or an ancestor of it, so no rework is needed`);
  const parentsOf = (sha: string): string[] => {
    const out = git.parents(sha);
    if (out.state === 'unavailable') throw new GitUnavailable();
    return out.parents;
  };
  const pv = parentsOf(v);
  const pr = parentsOf(r);
  for (const [sha, parents] of [[v, pv], [r, pr]] as const) {
    if (parents.length !== 1) {
      return no(409, 'rework-merge', `${sha} has ${parents.length} parents; a rework relation needs exactly one (a root commit has none, a merge has two or more)`);
    }
  }
  const idOf = (sha: string): string | null => {
    const out = git.diffId(sha);
    if (out.state === 'unavailable') throw new GitUnavailable();
    return out.state === 'ok' ? out.id : null;
  };
  const dv = idOf(v);
  const dr = idOf(r);
  const pathsOf = (sha: string): ChangedPath[] => {
    const out = git.paths(sha);
    if (out.state === 'unavailable') throw new GitUnavailable();
    return out.paths;
  };
  const cv = pathsOf(v);
  const cr = pathsOf(r);
  const base = { vetoParent: pv[0], reworkParent: pr[0], vetoDiffId: dv, reworkDiffId: dr, vetoPathCount: cv.length, reworkPathCount: cr.length };
  if (dv !== null && dv === dr) return { ok: true, relation: 'rebased', evidence: { ...base, shared: [], onlyInVeto: [], onlyInRework: [] } };
  if (pv[0] !== pr[0]) {
    return no(409, 'rework-unrelated',
      `their diffs differ, and ${r} has parent ${pr[0]} while ${v} has parent ${pv[0]}; an amended rework has the same parent as the commit it replaces`);
  }
  if (cv.length > REWORK_PATH_LIMIT || cr.length > REWORK_PATH_LIMIT) {
    return no(409, 'rework-too-many-paths',
      `${v} changes ${cv.length} paths and ${r} changes ${cr.length}; a rework of more than ${REWORK_PATH_LIMIT} paths on either side cannot be shown in full, so it is refused. Record this delivery under a new intent`);
  }
  const unshowable = [...cv, ...cr].find((p) => !p.showable || p.path.length > REWORK_PATH_CHARS);
  if (unshowable) {
    return no(409, 'rework-path-unshowable', unshowable.showable
      ? `a changed path is ${unshowable.path.length} characters, over the ${REWORK_PATH_CHARS} the dialog shows, so the rework cannot be shown exactly`
      : 'a changed path is not UTF-8, so the rework cannot be shown exactly');
  }
  const inV = new Map(cv.map((p) => [p.path, p.status]));
  const inR = new Map(cr.map((p) => [p.path, p.status]));
  const shared = cv.filter((p) => inR.has(p.path)).map((p) => ({ path: p.path, vetoStatus: p.status, reworkStatus: inR.get(p.path)! })).sort(byPath);
  const onlyInVeto = cv.filter((p) => !inR.has(p.path)).map((p) => ({ path: p.path, status: p.status })).sort(byPath);
  const onlyInRework = cr.filter((p) => !inV.has(p.path)).map((p) => ({ path: p.path, status: p.status })).sort(byPath);
  // Review fold (owner ruling 2026-10-21): bookkeeping files are left out of both halves of the majority.
  const counted = (p: { path: string }): boolean => !isBookkeepingPath(p.path);
  const nv = cv.filter(counted).length;
  const nr = cr.filter(counted).length;
  const ns = shared.filter(counted).length;
  if (nv === 0) {
    return no(409, 'rework-unrelated',
      `the vetoed commit ${v} changed only bookkeeping files (${cv.map((p) => p.path).join(', ')}), which an amended rework does not count, so nothing ties ${r} to it`);
  }
  if (!(2 * ns > nv)) {
    return no(409, 'rework-unrelated',
      `they share ${ns} of the ${nv} non-bookkeeping paths ${v} changed (bookkeeping files are not counted), and an amended rework must change more than half of them (the V half fails)`);
  }
  if (!(2 * ns >= nr)) {
    return no(409, 'rework-unrelated',
      `they share ${ns} of the ${nr} non-bookkeeping paths ${r} changed (bookkeeping files are not counted), and at least half of an amended rework must be the vetoed commit's paths (the R half fails)`);
  }
  return { ok: true, relation: 'amended', evidence: { ...base, shared, onlyInVeto, onlyInRework } };
}

export const REWORK_PRUNED_NOTE = 'rework verified when recorded; the vetoed commit is no longer in this repository';

/**
 * #532 B344 (plan-b344 LD4): whether `pass` clears the trusted VETO `b` by a declared rework. The
 * caller runs the ancestry rule first: ancestorOrEqual resolves V and throws GitUnavailable when git
 * cannot answer, so here V is `found` or `missing`, and `missing` means git reported it missing.
 * - V and R resolve: the relation is recomputed and must give the recorded kind and evidence.
 * - R missing: the VETO stands.
 * - V missing (B376): R's parent and its diff identity (rebased) or complete path list (amended)
 *   must equal the record; the V half is the sealed record's, and the cleared item says so.
 * Any git read that cannot answer throws GitUnavailable (the step is `unavailable`).
 */
function reworkClears(git: ReviewGit, b: BlockingItem, pass: ReviewRecordView): { note?: string } | null {
  const entry = pass.reworks?.find((e) => e.vetoEntryId === b.id && e.vetoEntryHash === b.hash);
  if (!entry || entry.vetoCommit !== b.commitSha) return null;
  if (!ancestorOrEqual(git, entry.reworkCommit, pass.commitSha)) return null;
  const v = git.resolve(entry.vetoCommit);
  const r = git.resolve(entry.reworkCommit);
  if (v.state === 'unavailable' || r.state === 'unavailable') throw new GitUnavailable();
  if (r.state === 'missing') return null;
  if (v.state === 'found') {
    const again = reworkRelation(git, entry.vetoCommit, entry.reworkCommit);
    return again.ok && again.relation === entry.relation && sortedJson(again.evidence) === sortedJson(entry.evidence) ? {} : null;
  }
  const parents = git.parents(entry.reworkCommit);
  if (parents.state === 'unavailable') throw new GitUnavailable();
  if (parents.parents.length !== 1 || parents.parents[0] !== entry.evidence.reworkParent) return null;
  if (entry.relation === 'rebased') {
    const id = git.diffId(entry.reworkCommit);
    if (id.state === 'unavailable') throw new GitUnavailable();
    if (id.state !== 'ok' || id.id !== entry.evidence.reworkDiffId) return null;
  } else {
    const paths = git.paths(entry.reworkCommit);
    if (paths.state === 'unavailable') throw new GitUnavailable();
    const now = paths.paths.map((p) => ({ path: p.path, status: p.status })).sort(byPath);
    const recorded = [...entry.evidence.shared.map((s) => ({ path: s.path, status: s.reworkStatus })), ...entry.evidence.onlyInRework].sort(byPath);
    if (sortedJson(now) !== sortedJson(recorded)) return null;
  }
  return { note: REWORK_PRUNED_NOTE };
}

function assessReviewsOrThrow(input: ReviewAssessInput): ReviewAssessment {
  const { intentId, createdEntryHash, git } = input;
  const blocking: BlockingItem[] = [];
  const item = (b: Omit<BlockingItem, 'note' | 'timestamp'> & { note?: string | null; timestamp?: string | null }): void => {
    blocking.push({ note: null, timestamp: null, ...b });
  };

  // Rows: (d) any review row whose seal fails blocks every intent; rows for this intent that fail identity are (c).
  const validRows = new Map<number, { r: SealedLedgerRow; p: ReviewPayload }>();
  for (const r of input.reviewRows) {
    if (!r.seal.ok) {
      item({
        kind: 'bad-seal', id: r.row.id, hash: r.row.entry_hash, verdict: payloadVerdict(r.payload), commitSha: payloadCommit(r.payload), commitTrusted: false,
        label: `Review record unverifiable: ledger entry #${r.row.id} fails its seal (${r.seal.code ?? 'unknown'}); what it says cannot be trusted, so it blocks every intent until a PASS names it.`,
        after: { ledgerId: r.row.id, historyPosition: null }, timestamp: r.row.timestamp,
      });
      continue;
    }
    const named = r.payload?.intentId;
    if (typeof named !== 'string') {
      item({
        kind: 'unverifiable-row', id: r.row.id, hash: r.row.entry_hash, verdict: null, commitSha: null, commitTrusted: false,
        label: `Review record unverifiable: ledger entry #${r.row.id} names no intent, so it blocks every intent until a PASS names it.`,
        after: { ledgerId: r.row.id, historyPosition: null }, timestamp: r.row.timestamp,
      });
      continue;
    }
    if (named !== intentId) continue;
    const problem = rowProblem(r, intentId, createdEntryHash);
    if (problem) {
      item({
        kind: 'unverifiable-row', id: r.row.id, hash: r.row.entry_hash, verdict: payloadVerdict(r.payload), commitSha: payloadCommit(r.payload), commitTrusted: false,
        label: `Review record unverifiable: ledger entry #${r.row.id} names this intent, but ${problem}.`,
        after: { ledgerId: r.row.id, historyPosition: null }, timestamp: r.row.timestamp,
      });
      continue;
    }
    validRows.set(r.row.id, { r, p: ReviewPayloadSchema.parse(r.payload) });
  }

  // Evidence rows naming this intent whose seal fails (or whose payload cannot be read): one item for
  // the whole set, like the continuity walk, so a regenerated secret over thousands of rows is still
  // one item a PASS can name. A changed set is a new item.
  const bad = [...input.evidence.unverifiable].sort((a, b) => a.entryId - b.entryId);
  if (bad.length) {
    const first = bad[0];
    item({
      kind: 'unverifiable-evidence', id: first.entryId, hash: evidenceSetHash(bad), verdict: null, commitSha: null, commitTrusted: false,
      label: `Evidence unverifiable: ${bad.length} ledger entr${bad.length === 1 ? 'y names' : 'ies name'} this intent but cannot be trusted (first: #${first.entryId} ${first.eventType}, ${first.reason}).`,
      after: { ledgerId: bad[bad.length - 1].entryId, historyPosition: null },
    });
  }

  // Pairs: a sealed-valid row plus a mirror that matches it.
  const paired = new Set<number>();
  const pairs: ReviewRecordView[] = [];
  const rotation = input.continuity?.rotation ?? null;
  for (const m of input.mirrors) {
    const parsed = IntentReviewDetailsSchema.safeParse(m.details);
    const claimedId = (m.details as { ledgerEntryId?: unknown } | null)?.ledgerEntryId;
    const mirrorId = typeof claimedId === 'number' && Number.isInteger(claimedId) && claimedId >= 0 ? claimedId : 0;
    const hash = m.entryHash ?? `history-${m.position}`;
    if (!parsed.success) {
      item({
        kind: 'unverifiable-mirror', id: mirrorId, hash, verdict: null, commitSha: null, commitTrusted: false,
        label: `Review record unverifiable: the intent history entry at position ${m.position} is a REVIEWED entry FailSafe cannot read.`,
        after: { ledgerId: null, historyPosition: m.position }, timestamp: m.timestamp,
      });
      continue;
    }
    const d = parsed.data;
    const v = validRows.get(d.ledgerEntryId);
    if (v && !paired.has(d.ledgerEntryId) && mirrorMatches(d, v.r, v.p)) {
      paired.add(d.ledgerEntryId);
      pairs.push(viewOf(v.r, v.p, { mirror: m }));
      continue;
    }
    if (d.verdict !== 'VETO') continue; // a PASS mirror without its valid row counts for nothing
    const retired = rotation && d.ledgerEntryId <= rotation.headId;
    item({
      kind: 'unverifiable-mirror', id: d.ledgerEntryId, hash, verdict: 'VETO', commitSha: d.evaluates.commitSha, commitTrusted: false,
      label: retired
        ? `Review record unverifiable: the VETO mirrored at history position ${m.position} names ledger entry #${d.ledgerEntryId}, retired by rotation (${rotation!.retiredFile}).`
        : `Review record unverifiable: the VETO mirrored at history position ${m.position} has no matching sealed ledger entry #${d.ledgerEntryId}.`,
      after: { ledgerId: null, historyPosition: m.position }, timestamp: m.timestamp,
    });
  }

  // (a) standing VETOs: every sealed-valid VETO row, paired or not (an orphan VETO blocks too).
  for (const { r, p } of validRows.values()) {
    if (p.verdict !== 'VETO') continue;
    const orphan = !paired.has(r.row.id);
    item({
      kind: 'veto', id: r.row.id, hash: r.row.entry_hash, verdict: 'VETO', commitSha: p.binding.evaluates.commitSha, commitTrusted: true,
      label: `Rejected by review: VETO on ${p.binding.evaluates.commitSha} at ${r.row.timestamp} (ledger entry #${r.row.id})${orphan ? ', not part of a valid pair with its intent-history mirror' : ''}.`,
      after: { ledgerId: r.row.id, historyPosition: null }, timestamp: r.row.timestamp, note: p.note,
    });
  }

  // (e) continuity: one item for the whole break set.
  const breaks = input.continuity?.breaks ?? [];
  if (breaks.length) {
    item({
      kind: 'continuity', id: breaks[0].id, hash: continuityHash(breaks), verdict: null, commitSha: null, commitTrusted: false,
      label: `Ledger continuity broken: ${breaks.slice(0, 3).map((b) => b.detail).join('; ')}${breaks.length > 3 ? `; and ${breaks.length - 3} more` : ''}.`,
      after: { ledgerId: null, historyPosition: null },
    });
  }

  // Supersession: a later valid PASS that names the item (and, for a trusted VETO, descends from its
  // commit or declares a rework of it that re-verifies).
  const passes = pairs.filter((x) => x.verdict === 'PASS').sort((a, b) => a.entryId - b.entryId);
  const remaining: BlockingItem[] = [];
  const cleared: Array<BlockingItem & { clearedBy: string; clearedNote?: string }> = [];
  for (const b of blocking) {
    let clearedNote: string | undefined;
    const by = passes.find((pass) => {
      if (!pass.supersedes.some((s) => s.kind === b.kind && s.id === b.id && s.hash === b.hash)) return false;
      if (b.after.ledgerId !== null && pass.entryId <= b.after.ledgerId) return false;
      if (b.after.historyPosition !== null && pass.historyPosition <= b.after.historyPosition) return false;
      if (b.kind !== 'veto') return true;
      if (!b.commitSha) return false;
      // Ancestry runs before rework: ancestorOrEqual resolves V and throws when git cannot answer,
      // so reworkClears never mistakes an unavailable read of V for V missing (B376).
      if (ancestorOrEqual(git, b.commitSha, pass.commitSha)) return true;
      const rework = reworkClears(git, b, pass);
      clearedNote = rework?.note;
      return rework !== null;
    });
    if (by) cleared.push({ ...b, clearedBy: by.reviewId, ...(clearedNote ? { clearedNote } : {}) }); else remaining.push(b);
  }

  // Currency of the latest valid PASS.
  const latest = passes.length ? passes[passes.length - 1] : null;
  let latestPass: PassCurrency | null = null;
  if (latest) {
    const reasons: string[] = [];
    const linkedRefs = input.linked.map((l) => ({ commitSha: l.commitSha, edgeEntryHash: l.edgeEntryHash ?? '' }));
    if (!sameRefs(latest.covers, linkedRefs)) reasons.push('the linked commits changed since the review');
    const resolved = git.resolve(latest.commitSha);
    if (resolved.state === 'unavailable') throw new GitUnavailable();
    if (resolved.state === 'missing') reasons.push('the reviewed commit is no longer in this repository');
    else if (resolved.tree !== latest.tree) reasons.push('the reviewed commit now resolves to a different tree');
    if (resolved.state === 'found') {
      for (const l of input.linked) {
        if (!ancestorOrEqual(git, l.commitSha, latest.commitSha)) { reasons.push(`linked commit ${l.commitSha} is not part of the reviewed commit's history`); break; }
      }
    }
    if (latest.evidenceDigest !== input.evidence.digest) reasons.push('new governance evidence was recorded since the review');
    const at = Date.parse(latest.timestamp);
    if (!Number.isFinite(at) || at > input.now) reasons.push('the review is dated in the future');
    else if (input.now - at > REVIEW_MAX_AGE_MS) reasons.push('the review is more than 30 days old');
    latestPass = { review: latest, current: reasons.length === 0, staleReasons: reasons };
  }

  return { state: 'checked', blocking: remaining, cleared, reviews: pairs, latestPass };
}

// ---------------------------------------------------------------- reading one intent's reviews

export interface ReviewRead {
  assessment: ReviewAssessment;
  /** The evidence the review step read, so the governance step and a binding use the same set. */
  evidence: GovernanceEvidence;
}

function reviewGit(ctx: DeliveryContext): ReviewGit {
  const resolved = new Map<string, CommitResolution>();
  const ancestry = new Map<string, Ancestry>();
  const memo = <T>(read: (root: string, sha: string, git: DeliveryContext['git']) => T): ((sha: string) => T) => {
    const seen = new Map<string, T>();
    return (sha) => {
      if (!seen.has(sha)) seen.set(sha, read(ctx.workspaceRoot, sha, ctx.git));
      return seen.get(sha)!;
    };
  };
  return {
    diffId: memo(diffIdentity),
    parents: memo(commitParents),
    paths: memo(changedPaths),
    resolve: (sha) => {
      if (!resolved.has(sha)) resolved.set(sha, resolveCommit(ctx.workspaceRoot, sha, ctx.git));
      return resolved.get(sha)!;
    },
    ancestry: (a, d) => {
      const key = `${a}..${d}`;
      if (!ancestry.has(key)) ancestry.set(key, isAncestor(ctx.workspaceRoot, a, d, ctx.git));
      return ancestry.get(key)!;
    },
  };
}

export const linkedCommitsOf = (record: IntentRecord): LinkedCommit[] =>
  record.edges.filter((e) => e.edge === 'committed-under').map((e) => ({
    commitSha: e.target, edgeEntryHash: e.entryHash, tree: String(e.provenance.tree ?? ''),
  }));

const LEDGER_UNAVAILABLE = 'The FailSafe ledger is unavailable, so reviews cannot be read or recorded.';

/** Read everything a review assessment needs for one intent (the same reads a binding uses). */
export async function readIntentReviews(ctx: DeliveryContext, record: IntentRecord, now: number = Date.now()): Promise<ReviewRead> {
  const evidence = await findGovernanceEvidence(ctx.ledger, record.intent.id);
  const ledger = usableReviewLedger(ctx.ledger);
  if (!ledger || evidence.state === 'unavailable') {
    return { evidence, assessment: { state: 'unavailable', cause: 'ledger-unavailable', reason: LEDGER_UNAVAILABLE } };
  }
  let reviewRows: SealedLedgerRow[];
  let continuity: Continuity | null = null;
  try {
    reviewRows = await ledger.getSealedEntriesByType(REVIEW_EVENT_TYPE);
    const start = continuityStart(record.intent.id, reviewRows, record.reviews);
    if (start !== null) continuity = walkContinuity(start, await ledger.getSealedRange(start - 1), ledger.getRotationHead());
  } catch {
    return { evidence, assessment: { state: 'unavailable', cause: 'ledger-unavailable', reason: 'The FailSafe ledger could not be read, so reviews cannot be assessed.' } };
  }
  const assessment = assessReviews({
    intentId: record.intent.id, createdEntryHash: record.created?.entryHash ?? null, reviewRows, mirrors: record.reviews,
    evidence, continuity, linked: linkedCommitsOf(record), git: reviewGit(ctx), now,
  });
  return { evidence, assessment };
}

// ---------------------------------------------------------------- building and recording a review

/** #532 B344: the operator's declaration that a linked commit is the rework of a VETO. */
export interface ReworkDeclaration {
  vetoEntryId: number;
  reworkCommit: string;
}

export interface ReviewRequest {
  intentId: string;
  verdict: ReviewVerdict;
  commitSha: string;
  note: string;
  /** #532 B344: declared reworks; without them the ancestry rule applies unchanged. */
  reworks?: ReworkDeclaration[];
}

const RequestSchema = z.object({
  intentId: IntentIdSchema,
  verdict: ReviewVerdictSchema,
  commitSha: z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/),
  note: z.string().max(4000).optional(),
  reworks: z.array(z.object({
    vetoEntryId: z.number().int().positive(),
    reworkCommit: z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/),
  }).strict()).min(1).max(REWORK_ENTRY_LIMIT).optional(),
});

/**
 * Only intentId, verdict, commitSha, note and (#532 B344) reworks are read; a tree, digest,
 * `supersedes` or rework evidence in the request is ignored, because the server computes them.
 */
export function parseReviewRequest(body: unknown): ReviewRequest | string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const parsed = RequestSchema.safeParse({ intentId: b.intentId, verdict: b.verdict, commitSha: b.commitSha, note: b.note, reworks: b.reworks });
  if (!parsed.success) {
    return 'intentId must be an intent id, verdict PASS or VETO, commitSha a full commit name, note at most 4000 characters, '
      + `and reworks, when given, 1 to ${REWORK_ENTRY_LIMIT} {vetoEntryId, reworkCommit} pairs`;
  }
  const { reworks, ...rest } = parsed.data;
  return { ...rest, note: rest.note ?? '', ...(reworks ? { reworks } : {}) };
}

export interface ReviewPlan {
  intent: { id: string; purpose: string };
  verdict: ReviewVerdict;
  commit: { sha: string; subject: string | null; tree: string; branch: string | null };
  linked: Array<{ commitSha: string; edgeEntryHash: string }>;
  binding: ReviewBinding;
  supersedes: ReviewSuperseded[];
  /** Every item `supersedes` names, as the dialog shows it. */
  superseded: BlockingItem[];
  /** The note as the dialog shows it and the row records it. */
  note: string;
  reviewerDid: string;
  /** #532 B344: each VETO superseded by a declared, verified rework (shown first in the dialog). */
  reworks: ReworkEntry[];
}

/** #532 B344 (plan-b344 terms): the specific reason a review was refused. */
export type RefusalCode =
  | 'veto-not-ancestor'
  | 'rework-unknown-veto' | 'rework-unnecessary' | 'rework-duplicate'
  | 'rework-not-linked' | 'rework-not-in-history'
  | 'rework-veto-missing' | 'rework-merge'
  | 'rework-unrelated'
  | 'rework-too-many-paths' | 'rework-path-unshowable' | 'rework-dialog-too-large';

export type ReviewRefusal = { ok: false; status: number; error: string; code?: RefusalCode; veto?: { entryId: number; commitSha: string } };
const refuse = (status: number, error: string, code?: RefusalCode): ReviewRefusal => ({ ok: false, status, error, ...(code ? { code } : {}) });
const GIT_REWORK_UNAVAILABLE = 'Git could not read what the vetoed commit or its declared rework changed; nothing was recorded.';

/**
 * Check a review request against server state and compute everything the dialog shows and the
 * row records (plan-b320 LD2). Refusals come before any dialog.
 */
export async function buildReviewPlan(
  ctx: DeliveryContext, req: ReviewRequest, now: number = Date.now(),
): Promise<{ ok: true; plan: ReviewPlan } | ReviewRefusal> {
  const lookup = await ctx.intents.getIntentRecord(req.intentId);
  if (lookup.integrity === 'invalid') return refuse(409, 'The intent history failed its chain check, so no review can be recorded.');
  const record = lookup.record;
  if (!record) return refuse(404, 'No such intent in this workspace.');
  if (!record.active) return refuse(409, 'Only the active intent can be reviewed; this intent is archived.');
  if (record.sealed) return refuse(409, 'This intent is sealed; its reviews are read-only.');
  const createdHash = record.created?.entryHash ?? null;
  if (!createdHash) return refuse(409, 'The intent has no CREATED entry hash, so a review cannot be bound to it.');
  if (!usableReviewLedger(ctx.ledger)) return refuse(503, LEDGER_UNAVAILABLE + ' Nothing was recorded.');

  const linked = linkedCommitsOf(record);
  const edge = linked.find((l) => l.commitSha === req.commitSha);
  if (!edge) return refuse(400, 'That commit is not linked to this intent; link it in Workspace > Delivery first.');
  if (!edge.edgeEntryHash) return refuse(409, 'That link has no intent-history entry hash, so a review cannot be bound to it.');
  const resolved = resolveCommit(ctx.workspaceRoot, req.commitSha, ctx.git);
  if (resolved.state === 'unavailable') return refuse(503, `Git cannot read this repository: ${resolved.detail}`);
  if (resolved.state === 'missing') return refuse(409, `${req.commitSha}: ${resolved.reason}; nothing was recorded.`);
  if (resolved.tree !== edge.tree) return refuse(409, `${req.commitSha} now resolves to tree ${resolved.tree}, not the tree ${edge.tree} recorded when it was linked; nothing was recorded.`);

  const git = reviewGit(ctx);
  // #532 B344: the declaration's own structure is checked before coverage, so these codes are reachable.
  const declared = req.reworks ?? [];
  if (declared.length && req.verdict !== 'PASS') return refuse(400, 'Only a PASS can declare a rework; nothing was recorded.');
  const seen = new Set<number>();
  for (const d of declared) {
    if (seen.has(d.vetoEntryId)) {
      return refuse(400, `The VETO in ledger entry #${d.vetoEntryId} is declared more than once; declare each VETO once. Nothing was recorded.`, 'rework-duplicate');
    }
    seen.add(d.vetoEntryId);
    if (!linked.some((l) => l.commitSha === d.reworkCommit)) {
      return refuse(409, `The declared rework ${d.reworkCommit} is not linked to this intent; link it in Workspace > Delivery first. Nothing was recorded.`, 'rework-not-linked');
    }
    const r = git.resolve(d.reworkCommit);
    if (r.state === 'unavailable') return refuse(503, `Git cannot read this repository: ${r.detail}`);
    if (r.state === 'missing') return refuse(409, `The declared rework ${d.reworkCommit}: ${r.reason}; nothing was recorded.`);
    let inHistory: boolean;
    try { inHistory = ancestorOrEqual(git, d.reworkCommit, req.commitSha); } catch { return refuse(503, 'Git could not answer whether the declared rework is part of the reviewed commit; nothing was recorded.'); }
    if (!inHistory) {
      return refuse(409, `The declared rework ${d.reworkCommit} is not ${req.commitSha} or an ancestor of it; a rework must be part of the reviewed commit's history. Nothing was recorded.`, 'rework-not-in-history');
    }
  }
  if (req.verdict === 'PASS') {
    for (const l of linked) {
      if (l.commitSha === req.commitSha) continue;
      let covers: boolean;
      try { covers = ancestorOrEqual(git, l.commitSha, req.commitSha); } catch { return refuse(503, 'Git could not answer whether the linked commits are part of the reviewed commit; nothing was recorded.'); }
      if (!covers) return refuse(409, `Linked commit ${l.commitSha} is not part of ${req.commitSha}'s history. A PASS must be on a commit that contains every linked commit; review the newest one.`);
    }
  }

  const read = await readIntentReviews(ctx, record, now);
  if (read.assessment.state === 'unavailable') return refuse(503, `${read.assessment.reason} Nothing was recorded.`);
  if (read.evidence.state !== 'ok') return refuse(503, LEDGER_UNAVAILABLE + ' Nothing was recorded.');
  const blocking = req.verdict === 'PASS' ? read.assessment.blocking : [];
  // #532 B344: each declaration names an uncleared trusted VETO of this intent, by ledger id (no hash is read from the request).
  for (const d of declared) {
    if (!blocking.some((b) => b.kind === 'veto' && b.commitTrusted && !!b.commitSha && b.id === d.vetoEntryId)) {
      return refuse(400, `Ledger entry #${d.vetoEntryId} is not a VETO blocking this delivery (it is unknown, already cleared, or not a trusted VETO), so no rework can supersede it. Nothing was recorded.`, 'rework-unknown-veto');
    }
  }
  const reworks: ReworkEntry[] = [];
  for (const b of blocking) {
    if (b.kind !== 'veto' || !b.commitSha) continue;
    let ok: boolean;
    try { ok = ancestorOrEqual(git, b.commitSha, req.commitSha); } catch { return refuse(503, 'Git could not answer whether the vetoed commit is part of the reviewed commit; nothing was recorded.'); }
    const d = declared.find((x) => x.vetoEntryId === b.id);
    if (ok) {
      if (d) {
        return refuse(400, `The VETO in ledger entry #${b.id} is on ${b.commitSha}, which is ${req.commitSha} or an ancestor of it, so this PASS supersedes it without a rework; remove the declaration. Nothing was recorded.`, 'rework-unnecessary');
      }
      continue;
    }
    if (!d) {
      return {
        ...refuse(409, `The VETO in ledger entry #${b.id} is on ${b.commitSha}, which is not ${req.commitSha} or an ancestor of it. ` +
          'A PASS supersedes only a VETO on the reviewed commit or one of its ancestors; that VETO stands. Nothing was recorded.', 'veto-not-ancestor'),
        veto: { entryId: b.id, commitSha: b.commitSha },
      };
    }
    const v = git.resolve(b.commitSha);
    if (v.state === 'unavailable') return refuse(503, GIT_REWORK_UNAVAILABLE);
    if (v.state === 'missing') {
      return refuse(409, `The vetoed commit ${b.commitSha} (ledger entry #${b.id}) is no longer in this repository, so git cannot show that ${d.reworkCommit} reworks it. That VETO stands. Nothing was recorded.`, 'rework-veto-missing');
    }
    let relation: RelationResult;
    try { relation = reworkRelation(git, b.commitSha, d.reworkCommit); } catch (error) {
      if (error instanceof GitUnavailable) return refuse(503, GIT_REWORK_UNAVAILABLE);
      throw error;
    }
    if (!relation.ok) {
      return refuse(relation.status, `The VETO in ledger entry #${b.id} on ${b.commitSha} is not reworked by ${d.reworkCommit}: ${relation.detail}. That VETO stands. Nothing was recorded.`, relation.code);
    }
    reworks.push({ vetoEntryId: b.id, vetoEntryHash: b.hash, vetoCommit: b.commitSha, reworkCommit: d.reworkCommit, relation: relation.relation, evidence: relation.evidence });
  }
  const section = reworkSectionLines(reworks).join('\n').length;
  if (section > REWORK_DIALOG_LIMIT) {
    return refuse(409, `The rework section of the confirmation dialog would be ${section} characters, over the ${REWORK_DIALOG_LIMIT} it can show in full, so it is refused. Record this delivery under a new intent. Nothing was recorded.`, 'rework-dialog-too-large');
  }
  const covers = linked.map((l) => ({ commitSha: l.commitSha, edgeEntryHash: l.edgeEntryHash as string }));
  const supersedes = blocking.map((b) => ({ kind: b.kind, id: b.id, hash: b.hash }));
  const binding: ReviewBinding = {
    intentId: record.intent.id, intentCreatedEntryHash: createdHash,
    evaluates: { commitSha: req.commitSha, tree: resolved.tree, branch: edgeBranch(record, req.commitSha), edgeEntryHash: edge.edgeEntryHash },
    covers, evidenceDigest: read.evidence.digest, evidenceCount: read.evidence.total,
  };
  const note = sanitizeDialogText(req.note, REVIEW_NOTE_LIMIT);
  const unrecordable = recordProblem(record.intent.id, req.verdict, binding, supersedes, note, reworks);
  if (unrecordable) return refuse(409, `This review cannot be recorded: ${unrecordable}. Nothing was shown or recorded.`);
  return {
    ok: true,
    plan: {
      intent: { id: record.intent.id, purpose: record.intent.purpose }, verdict: req.verdict,
      commit: { sha: req.commitSha, subject: commitSubject(ctx.workspaceRoot, req.commitSha, ctx.git), tree: resolved.tree, branch: binding.evaluates.branch },
      linked: covers, binding, supersedes, superseded: blocking, note, reviewerDid: LOCAL_OVERSEER_DID, reworks,
    },
  };
}

/**
 * Review fold 1: what the row and its mirror would hold must pass both schemas before any dialog,
 * so an over-limit review (more linked commits or superseded items than a record can hold) is
 * refused up front and never written as a row whose payload a later read rejects.
 */
export function recordProblem(
  intentId: string, verdict: ReviewVerdict, binding: ReviewBinding, supersedes: ReviewSuperseded[], note: string,
  reworks: ReworkEntry[] = [],
): string | null {
  const placeholderId = '00000000-0000-4000-8000-000000000000';
  const withReworks = reworks.length ? { reworks } : {};
  const payload = ReviewPayloadSchema.safeParse({
    reviewId: placeholderId, intentId, verdict, binding, supersedes, note, operationId: 'op_check',
    authentication: { method: REVIEW_MODAL_METHOD, channel: REVIEW_CHANNELS.console, proves: 'check' }, ...withReworks,
  });
  const mirror = IntentReviewDetailsSchema.safeParse({
    reviewId: placeholderId, verdict, evaluates: binding.evaluates, covers: binding.covers, evidenceDigest: binding.evidenceDigest,
    supersedes, ledgerEntryId: 1, ledgerEntryHash: '0'.repeat(64), operationId: 'op_check', ...withReworks,
  });
  const issue = !payload.success ? payload.error.issues[0] : !mirror.success ? mirror.error.issues[0] : null;
  if (!issue) return null;
  const where = issue.path.join('.') || 'the record';
  if (where.startsWith('covers') || where.startsWith('binding.covers')) return `it would cover ${binding.covers.length} linked commits, more than a review can record (1000)`;
  if (where.startsWith('supersedes')) return `it would supersede ${supersedes.length} items, more than a review can record (10000)`;
  return `${where} is not recordable (${issue.message})`;
}

function edgeBranch(record: IntentRecord, sha: string): string | null {
  const e = record.edges.find((x) => x.edge === 'committed-under' && x.target === sha);
  const b = e?.provenance.branch;
  return typeof b === 'string' && b.length <= 256 ? b : null;
}

/** What must be unchanged between the dialog and the write (everything the row binds). */
const bound = (p: ReviewPlan): string => canon({ verdict: p.verdict, binding: p.binding, supersedes: p.supersedes, note: p.note, reworks: p.reworks });

export interface RecordedReview {
  status: number;
  body: Record<string, unknown>;
}

export interface RecordHooks {
  /** Test seam: runs after the rebuild under the lock and before the ledger append. */
  beforeAppend?: () => Promise<void>;
  now?: () => number;
}

/**
 * Record a confirmed review (plan-b320 LD3). Under the per-workspace review lock the plan is rebuilt
 * from server state; any difference from what the dialog showed answers 409 and writes nothing.
 * Then the sealed row, then its mirror. A disabled ledger (a stub entry, or id 0) answers 503 and
 * writes no mirror; a mirror that cannot be appended answers 500 naming the row (the row then reads
 * as an orphan: a VETO still blocks, a PASS counts for nothing).
 */
export async function recordDeliveryReview(
  ctx: DeliveryContext, request: ReviewRequest, shown: ReviewPlan, confirmation: { operationId: string; channel: ReviewChannel },
  hooks: RecordHooks = {},
): Promise<RecordedReview> {
  return withProposalLock(`delivery-review:${ctx.workspaceRoot}`, async () => {
    const again = await buildReviewPlan(ctx, request, hooks.now ? hooks.now() : Date.now());
    if (!again.ok) {
      return { status: again.status, body: { ok: false, error: again.error, ...(again.code ? { code: again.code } : {}), ...(again.veto ? { veto: again.veto } : {}) } };
    }
    if (bound(again.plan) !== bound(shown)) {
      return { status: 409, body: { ok: false, stale: true, error: 'The delivery changed while you were confirming (a link, new evidence or another review); nothing was recorded. Review again.' } };
    }
    await hooks.beforeAppend?.();
    const ledger = usableReviewLedger(ctx.ledger);
    if (!ledger) return { status: 503, body: { ok: false, error: LEDGER_UNAVAILABLE + ' Nothing was recorded.' } };
    const plan = again.plan;
    const reviewId = randomUUID();
    const authentication = { ...describeOperatorAuthentication({ method: REVIEW_MODAL_METHOD, channel: REVIEW_CHANNELS[confirmation.channel] }) };
    const payload: ReviewPayload = {
      reviewId, intentId: plan.intent.id, verdict: plan.verdict, binding: plan.binding, supersedes: plan.supersedes,
      note: plan.note, operationId: confirmation.operationId, authentication, ...(plan.reworks.length ? { reworks: plan.reworks } : {}),
    };
    const entry = await ledger.appendEntry({
      eventType: 'DELIVERY_REVIEWED', agentDid: DELIVERY_REVIEW_DID, overseerDid: LOCAL_OVERSEER_DID,
      overseerDecision: plan.verdict, verificationMethod: DELIVERY_REVIEW_METHOD, verificationResult: plan.verdict,
      artifactHash: plan.binding.evaluates.tree, payload: payload as unknown as Record<string, unknown>,
    });
    if (!entry || entry.id === 0 || entry.entryHash === 'STUB_DISABLED' || !HASH64.test(String(entry.entryHash))) {
      return { status: 503, body: { ok: false, error: 'The FailSafe ledger is disabled, so the review was not recorded.' } };
    }
    const details: IntentReviewDetails = {
      reviewId, verdict: plan.verdict, evaluates: plan.binding.evaluates, covers: plan.binding.covers,
      evidenceDigest: plan.binding.evidenceDigest, supersedes: plan.supersedes, ledgerEntryId: entry.id,
      ledgerEntryHash: entry.entryHash, operationId: confirmation.operationId, ...(plan.reworks.length ? { reworks: plan.reworks } : {}),
    };
    const mirrored = await ctx.intents.recordReview({ intentId: plan.intent.id, actor: 'user', details });
    if (!mirrored.ok) {
      return {
        status: 500,
        body: {
          ok: false, ledgerEntryId: entry.id, refused: mirrored.reason,
          error: `The review was sealed as ledger entry #${entry.id}, but its intent-history mirror could not be written (${mirrored.reason}). ` +
            (plan.verdict === 'VETO' ? 'The VETO still blocks.' : 'The PASS does not count without its mirror; record it again.'),
        },
      };
    }
    return {
      status: 200,
      body: { ok: true, reviewId, verdict: plan.verdict, commitSha: plan.commit.sha, ledgerEntryId: entry.id, ledgerEntryHash: entry.entryHash, supersedes: plan.supersedes },
    };
  });
}
