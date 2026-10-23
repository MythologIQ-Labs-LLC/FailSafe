/**
 * B340 (plan-b340-enforce-approval LD2, LD3, LD6): the operator-confirmed intent decision.
 *
 * In enforce mode the status that enforcement, Seal and the enforce-mode displays act on is the
 * *effective* status, derived here and never taken from the `status` field of the agent-writable
 * active_intent.json. A decision is a pair, written only after the operator approves a bound modal
 * VS Code dialog (intentDecisionCommand):
 *   - a v3-sealed INTENT_DECIDED row in the SOA ledger (this module is its only writer), and
 *   - its intent-history mirror, a STATUS_CHANGED entry naming the row by id and entry hash.
 *
 * effectiveIntentStatus decides from one verified ledger snapshot (LedgerManager.verifiedSnapshot:
 * the report and exactly the rows it verified), so an index or a WHERE query cannot show it other
 * rows than the report covers. Valid rows are ordered by sealed row id; each row binds through at
 * most one mirror (the first, and never one that names a lower id than the previous bound mirror).
 * A PASS counts only when the latest valid row is that PASS with its bound mirror, no VETO line
 * follows the mirror, the whole ledger verifies (report.ok) under a live head anchor that covers the
 * row and was established before it, no unanchored VETO is latched at or above it, and the intent
 * still has the approved content (intent-content/v1). Everything else reads PULSE, VETO, SEALED or
 * blocked (a decision row that fails validation), and every one of those blocks a governed write.
 *
 * Not authentication (B372): the seal and the head anchor are tamper evidence under secrets any
 * process running as the same OS user can read or rewrite, and the modal proves a person clicked,
 * not who. The unanchored-VETO latch lives in this process only. A memo hit (the ledger unchanged
 * since the last snapshot, by data_version, row count and head) reuses the verified snapshot and does
 * not re-read the anchor from SecretStorage; verifyLedger callers (the release gate) always do.
 */

import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { z } from 'zod';
import type { IntentService } from './IntentService';
import {
  IntentDecisionDetailsSchema, IntentIdSchema, type Intent, type IntentHistoryEntry, type IntentStatus,
} from './types/IntentTypes';
import { LIVE, workspaceKey } from '../qorelogic/ledger/LedgerAnchor';
import type { LedgerSnapshot, SealedLedgerRow } from '../qorelogic/ledger/LedgerManager';
import { describeOperatorAuthentication } from '../shared/types/operatorAuthentication';
import { sanitizeDialogText, type IntentDecisionFacts, type IntentScopeFacts, type IntentSealFacts } from '../extension/operatorConfirmation';

export const INTENT_DECIDED = 'INTENT_DECIDED' as const;
export const INTENT_DECISION_DID = 'did:myth:failsafe:intent-decision';
export const INTENT_DECISION_METHOD = 'operator-intent-decision';
export const INTENT_DECISION_OVERSEER_DID = 'did:myth:overseer:local';
export const INTENT_DECISION_MODAL_METHOD = 'vscode-modal-confirmation';
export const INTENT_DECISION_CHANNELS = {
  decide: 'command:failsafe.intent.decide',
  seal: 'command:failsafe.intent.seal',
} as const;
/** The approved-content digest version; a PASS under another version does not count. */
export const INTENT_CONTENT_VERSION = 1;
/** Fields of an intent that may change without invalidating its approval. */
export const INTENT_MUTABLE_FIELDS = ['status', 'updatedAt', 'sealedAt', 'evidence'] as const;
export const INTENT_NOTE_LIMIT = 500;
export const SCOPE_LIST_LIMIT = 20;
/** Control, format (bidi included), surrogate, private-use and unassigned characters, and the line and paragraph separators. */
const NOTE_UNSHOWABLE = /[\p{C}\p{Zl}\p{Zp}]/u;
export const NOTE_UNSHOWABLE_REFUSAL = 'the note contains a control, format or line-separator character, which the dialog cannot show as recorded (note-unshowable)';

const HASH64 = /^[0-9a-f]{64}$/;

const DecisionPayloadSchema = z.object({
  decisionId: z.string().uuid(),
  intentId: IntentIdSchema,
  intentCreatedEntryHash: z.string().regex(HASH64),
  workspace: z.string().min(1).max(200),
  verdict: z.enum(['PASS', 'VETO', 'SEALED']),
  digestVersion: z.number().int().positive(),
  contentDigest: z.string().regex(HASH64),
  note: z.string().max(INTENT_NOTE_LIMIT),
  operationId: z.string().min(1).max(80),
  authentication: z.object({ method: z.string(), channel: z.string(), proves: z.string() }).strict(),
}).strict();
export type DecisionPayload = z.infer<typeof DecisionPayloadSchema>;
export type DecisionVerdict = 'PASS' | 'VETO';

// ---------------------------------------------------------------- approved content

/** JSON with object keys sorted at every level (arrays keep their order; undefined members are dropped). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** intent-content/v1: sha256 over the canonical intent without INTENT_MUTABLE_FIELDS. */
export function intentContentDigest(intent: Intent): string {
  const copy: Record<string, unknown> = { ...(intent as unknown as Record<string, unknown>) };
  for (const field of INTENT_MUTABLE_FIELDS) delete copy[field];
  delete copy.statusReason;
  delete copy.statusCode;
  return createHash('sha256').update(`intent-content/v${INTENT_CONTENT_VERSION}\n${canonicalJson(copy)}`).digest('hex');
}

/** The scope the approval grants, as the dialog states it; warnings cover every entry, shown or not. */
export function scopeFacts(workspaceRoot: string, files: string[]): IntentScopeFacts {
  const root = path.resolve(workspaceRoot);
  const warnings: IntentScopeFacts['warnings'] = [];
  files.forEach((entry, i) => {
    const relative = path.relative(root, path.resolve(root, entry));
    const kind = relative === '' ? 'root' : relative.startsWith('..') || path.isAbsolute(relative) ? 'outside' : null;
    if (kind) warnings.push({ position: i + 1, entry: sanitizeDialogText(entry, 120), kind });
  });
  return {
    count: files.length,
    shown: files.slice(0, SCOPE_LIST_LIMIT).map((f) => sanitizeDialogText(f, 160)),
    more: Math.max(0, files.length - SCOPE_LIST_LIMIT),
    warnings,
  };
}

// ---------------------------------------------------------------- effective status

export type EffectiveCode =
  | 'approved' | 'not-approved' | 'vetoed' | 'sealed' | 'bad-decision-row' | 'unbound-approval'
  | 'ledger-unavailable' | 'ledger-unverified' | 'not-anchored' | 'unanchored-approval' | 'before-anchor'
  | 'unanchored-veto' | 'content-changed';

export interface EffectiveStatus {
  /** `blocked` acts like a VETO: a decision row for this intent failed validation. */
  status: IntentStatus | 'blocked';
  code: EffectiveCode;
  reason: string;
  decisionRowId: number | null;
}

export interface LatchedVeto { id: number; hash: string }

export interface EffectiveInput {
  intentId: string;
  contentDigest: string;
  /** workspaceKey(workspaceRoot) */
  workspace: string;
  /** Every history entry, and whether the chain verified (mirrors bind only when it did). */
  history: { entries: IntentHistoryEntry[]; valid: boolean };
  snapshot: LedgerSnapshot | null;
  latch: ReadonlyArray<LatchedVeto>;
}

const result = (status: EffectiveStatus['status'], code: EffectiveCode, reason: string, decisionRowId: number | null = null): EffectiveStatus =>
  ({ status, code, reason, decisionRowId });

/** Pure: the effective status of one intent (plan-b340 LD3). */
export function effectiveIntentStatus(input: EffectiveInput): EffectiveStatus {
  const { intentId } = input;
  const entries = input.history.entries;
  const created = entries.find((e) => e.intentId === intentId && e.event === 'CREATED');
  const createdHash = created?.entryHash ?? null;
  const vetoLineAfter = (position: number) => entries.some((e, i) =>
    i > position && e.intentId === intentId && e.event === 'STATUS_CHANGED' && e.newStatus === 'VETO');

  if (!input.snapshot) {
    return vetoLineAfter(-1)
      ? result('VETO', 'vetoed', 'The intent history records a VETO; the FailSafe ledger is unavailable.')
      : result('PULSE', 'ledger-unavailable', 'The FailSafe ledger is unavailable, so no approval can be verified.');
  }

  // Rows of this intent, each valid or not (read only from the verified snapshot).
  const valid: Array<{ r: SealedLedgerRow; p: DecisionPayload }> = [];
  let bad: SealedLedgerRow | null = null;
  for (const r of input.snapshot.rows) {
    if (r.row.event_type !== INTENT_DECIDED || !r.payload || r.payload.intentId !== intentId) continue;
    const parsed = DecisionPayloadSchema.safeParse(r.payload);
    const ok = r.seal.ok && r.seal.version === 'v3' && r.row.agent_did === INTENT_DECISION_DID && parsed.success
      && parsed.data.intentCreatedEntryHash === createdHash && parsed.data.workspace === input.workspace
      && r.row.overseer_decision === parsed.data.verdict;
    if (!ok || !parsed.success) { if (!bad) bad = r; continue; }
    valid.push({ r, p: parsed.data });
  }
  const sealed = valid.find((v) => v.p.verdict === 'SEALED');
  if (sealed) return result('SEALED', 'sealed', `Sealed (ledger entry #${sealed.r.row.id}).`, sealed.r.row.id);
  if (bad) {
    return result('blocked', 'bad-decision-row',
      `Ledger entry #${bad.row.id} records a decision on this intent that cannot be validated (seal, agent, intent or workspace); it blocks until the ledger is rotated.`, bad.row.id);
  }

  // Ordering by sealed row id; each row binds through at most one mirror, in increasing row order.
  valid.sort((a, b) => a.r.row.id - b.r.row.id);
  const byId = new Map(valid.map((v) => [v.r.row.id, v]));
  const bound = new Map<number, number>();
  let lastBound = 0;
  if (input.history.valid) {
    entries.forEach((e, i) => {
      if (e.intentId !== intentId || e.event !== 'STATUS_CHANGED') return;
      const d = IntentDecisionDetailsSchema.safeParse(e.details);
      if (!d.success) return;
      const v = byId.get(d.data.ledgerEntryId);
      if (!v) return;
      if (v.r.row.entry_hash !== d.data.ledgerEntryHash || v.p.decisionId !== d.data.decisionId || e.newStatus !== v.p.verdict
        || v.p.operationId !== d.data.operationId || v.p.digestVersion !== d.data.digestVersion || v.p.contentDigest !== d.data.contentDigest) return;
      if (bound.has(v.r.row.id) || v.r.row.id <= lastBound) return; // duplicate or out of order: not a decision
      bound.set(v.r.row.id, i);
      lastBound = v.r.row.id;
    });
  }

  const latest = valid.length ? valid[valid.length - 1] : null;
  if (!latest) {
    return vetoLineAfter(-1)
      ? result('VETO', 'vetoed', 'The intent history records a VETO and no later confirmed approval.')
      : result('PULSE', 'not-approved', 'Not approved: no confirmed decision is recorded for this intent.');
  }
  const id = latest.r.row.id;
  if (latest.p.verdict === 'VETO') return result('VETO', 'vetoed', `Vetoed (ledger entry #${id}).`, id);
  const position = bound.get(id);
  if (position === undefined) {
    return result('PULSE', 'unbound-approval', `Approval #${id} has no matching intent-history record, so it does not count; record the decision again.`, id);
  }
  if (vetoLineAfter(position)) return result('VETO', 'vetoed', 'The intent history records a VETO after the latest approval.', id);
  const report = input.snapshot.report;
  if (!report.ok) {
    const f = report.failures[0];
    return result('PULSE', 'ledger-unverified',
      `The FailSafe ledger fails verification (${f ? `${f.code}${f.id !== null ? ` at #${f.id}` : ''}` : 'unknown'}); no approval counts until the ledger is rotated.`, id);
  }
  if (!LIVE.includes(report.anchor.status)) {
    return result('PULSE', 'not-anchored', `The ledger head anchor is ${report.anchor.status}; no approval counts until the head is anchored.`, id);
  }
  const head = report.anchor.headId;
  if (typeof head !== 'number' || id > head) {
    return result('PULSE', 'unanchored-approval', `Approval #${id} is not yet covered by the ledger head anchor; it counts after the next anchored ledger write.`, id);
  }
  const established = report.anchor.establishedAtId;
  if (typeof established !== 'number' || id <= established) {
    return result('PULSE', 'before-anchor', `Approval #${id} predates the ledger head anchor (established at #${established ?? 'unknown'}); approve the intent again.`, id);
  }
  if (input.latch.some((l) => l.id >= id)) {
    return result('PULSE', 'unanchored-veto', 'A later VETO in this session was never anchored; approve the intent again.', id);
  }
  if (latest.p.digestVersion !== INTENT_CONTENT_VERSION || latest.p.contentDigest !== input.contentDigest) {
    return result('PULSE', 'content-changed', 'The intent changed after approval (scope, purpose, plan or blueprint); approve it again.', id);
  }
  return result('PASS', 'approved', `Approved for implementation (ledger entry #${id}).`, id);
}

// ---------------------------------------------------------------- the ledger, the memo and the latch

/** The slice of LedgerManager the effective status reads: nothing else is called (E22s). */
interface SnapshotLedger {
  verifiedSnapshot(timeoutMs?: number): Promise<LedgerSnapshot>;
  getDatabase(): {
    pragma(source: string, options?: { simple?: boolean }): unknown;
    prepare(sql: string): { get(...params: unknown[]): unknown };
  };
}

/** What recording also needs. */
export interface DecisionLedger extends SnapshotLedger {
  isAvailable(): boolean;
  flushAnchor(timeoutMs?: number): Promise<boolean>;
  appendEntry(request: {
    eventType: typeof INTENT_DECIDED; agentDid: string; overseerDid: string; overseerDecision: string;
    verificationMethod: string; verificationResult: string; artifactHash: string; payload: Record<string, unknown>;
  }): Promise<{ id: number; entryHash: string; timestamp: string }>;
}

function snapshotLedger(ledger: unknown): SnapshotLedger | null {
  const l = ledger as Partial<SnapshotLedger> | null | undefined;
  return l && typeof l.verifiedSnapshot === 'function' && typeof l.getDatabase === 'function' ? l as SnapshotLedger : null;
}

export function usableDecisionLedger(ledger: unknown): DecisionLedger | null {
  const l = ledger as Partial<DecisionLedger> | null | undefined;
  if (!l || !snapshotLedger(l)) return null;
  for (const fn of ['isAvailable', 'flushAnchor', 'appendEntry'] as const) if (typeof l[fn] !== 'function') return null;
  try { return l.isAvailable!() ? l as DecisionLedger : null; } catch { return null; }
}

/** True for a valid intent-decision record: decisions are not governance evidence (deliveryEvidence, LD7). */
export function isIntentDecisionRecord(r: SealedLedgerRow): boolean {
  return r.row.event_type === INTENT_DECIDED && r.seal.ok && r.row.agent_did === INTENT_DECISION_DID;
}

/** One writer at a time per workspace (the rebuild, append and mirror run under it). */
const locks = new Map<string, Promise<void>>();
async function withDecisionLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
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

/** The verified snapshot, paired with its verdict, per ledger object (plan-b340 LD3 cost). */
const memos = new WeakMap<object, { key: string; snapshot: LedgerSnapshot }>();
/** Per workspace (workspaceKey): VETO rows whose anchor store failed this session (LD2 step 3). */
const latches = new Map<string, LatchedVeto[]>();

async function snapshotOf(ledger: unknown): Promise<LedgerSnapshot | null> {
  const l = snapshotLedger(ledger);
  if (!l) return null;
  let key: string;
  try {
    const db = l.getDatabase();
    // data_version moves whenever another connection commits; this connection's appends move the count and head.
    const version = db.pragma('data_version', { simple: true });
    const count = db.prepare('SELECT COUNT(*) AS n FROM soa_ledger').get() as { n: number } | undefined;
    const head = db.prepare('SELECT id, entry_hash FROM soa_ledger ORDER BY id DESC LIMIT 1').get() as { id: number; entry_hash: string } | undefined;
    key = `${String(version)}:${count?.n ?? 0}:${head?.id ?? 0}:${head?.entry_hash ?? ''}`;
  } catch {
    return null;
  }
  const memo = memos.get(l);
  if (memo && memo.key === key) return memo.snapshot;
  let snapshot: LedgerSnapshot;
  try { snapshot = await l.verifiedSnapshot(); } catch { return null; }
  memos.set(l, { key, snapshot });
  return snapshot;
}

function clearAnchoredLatches(wkey: string, snapshot: LedgerSnapshot | null): LatchedVeto[] {
  const latch = latches.get(wkey) ?? [];
  if (!snapshot || !latch.length) return latch;
  const head = snapshot.report.anchor.headId;
  const kept = latch.filter((l) => !(typeof head === 'number' && head >= l.id
    && snapshot.rows.some((r) => r.row.id === l.id && r.row.entry_hash === l.hash)));
  if (kept.length) latches.set(wkey, kept); else latches.delete(wkey);
  return kept;
}

export interface EffectiveRead {
  effective: EffectiveStatus;
  /** The verified snapshot the decision used (the memoised object on a memo hit). */
  snapshot: LedgerSnapshot | null;
}

/** The effective status of `intent` (IntentService.effectiveStatusOf calls this). */
export async function readEffectiveStatus(args: {
  workspaceRoot: string; intent: Intent; history: { entries: IntentHistoryEntry[]; valid: boolean }; ledger: unknown;
}): Promise<EffectiveRead> {
  const snapshot = await snapshotOf(args.ledger);
  const wkey = workspaceKey(args.workspaceRoot);
  const latch = clearAnchoredLatches(wkey, snapshot);
  const effective = effectiveIntentStatus({
    intentId: args.intent.id, contentDigest: intentContentDigest(args.intent), workspace: wkey,
    history: args.history, snapshot, latch,
  });
  return { effective, snapshot };
}

// ---------------------------------------------------------------- plans and records

export interface IntentDecisionContext {
  workspaceRoot: string;
  intents: IntentService;
  ledger: unknown;
  /** The delivery review step, shown read-only in the seal dialog. */
  reviewState?: (intentId: string) => Promise<string>;
  hooks?: { beforeComplete?: () => Promise<void> };
}

export interface DecisionRequest { verdict: DecisionVerdict; note: string }

export type Refusal = { ok: false; status: number; error: string };
const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error });

export const LEDGER_UNAVAILABLE_DECISION = 'The FailSafe ledger is unavailable, so the decision cannot be recorded. Nothing was recorded.';

export function parseDecisionRequest(input: { verdict: unknown; note: unknown }): DecisionRequest | string {
  if (input.verdict !== 'PASS' && input.verdict !== 'VETO') return 'the verdict must be PASS or VETO';
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') return 'the note must be text';
  // The dialog trims the note and replaces the characters below, so the note is trimmed here and a note holding one
  // of them is refused: what is recorded is exactly what the dialog shows.
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > INTENT_NOTE_LIMIT) return `the note is longer than ${INTENT_NOTE_LIMIT} characters`;
  if (NOTE_UNSHOWABLE.test(note)) return NOTE_UNSHOWABLE_REFUSAL;
  return { verdict: input.verdict, note };
}

interface DecisionBase {
  intent: Intent;
  createdEntryHash: string;
  effective: EffectiveStatus;
  history: { entries: IntentHistoryEntry[]; valid: boolean };
}

async function decisionBase(ctx: IntentDecisionContext, missing: string): Promise<{ ok: true; base: DecisionBase } | Refusal> {
  const intent = await ctx.intents.getActiveIntent();
  if (!intent) return refuse(409, missing);
  if (!usableDecisionLedger(ctx.ledger)) return refuse(503, LEDGER_UNAVAILABLE_DECISION);
  const history = await ctx.intents.readHistory();
  if (!history.valid) return refuse(409, 'The intent history fails its chain check, so nothing can be recorded for this intent. Nothing was recorded.');
  const created = history.entries.find((e) => e.intentId === intent.id && e.event === 'CREATED');
  if (!created?.entryHash) return refuse(409, 'The active intent has no CREATED history entry, so a decision cannot be bound to it. Nothing was recorded.');
  const { effective } = await readEffectiveStatus({ workspaceRoot: ctx.workspaceRoot, intent, history, ledger: ctx.ledger });
  return { ok: true, base: { intent, createdEntryHash: created.entryHash, effective, history } };
}

const intentFacts = (b: DecisionBase) => ({
  id: b.intent.id, purpose: b.intent.purpose, type: b.intent.type, planId: b.intent.planId ?? null,
  riskGrade: b.intent.scope.riskGrade, createdEntryHash: b.createdEntryHash,
});

/** The decision plan from server state (what the dialog shows and the record binds). */
export async function buildDecisionPlan(ctx: IntentDecisionContext, request: DecisionRequest): Promise<{ ok: true; plan: IntentDecisionFacts } | Refusal> {
  const built = await decisionBase(ctx, 'There is no active intent to decide. Nothing was recorded.');
  if (!built.ok) return built;
  const b = built.base;
  if (b.effective.status === 'SEALED' || b.intent.status === 'SEALED') return refuse(409, 'The active intent is sealed; nothing more can be recorded for it. Nothing was recorded.');
  return {
    ok: true,
    plan: {
      verdict: request.verdict, note: request.note, intent: intentFacts(b),
      scope: scopeFacts(ctx.workspaceRoot, b.intent.scope.files),
      effective: { status: b.effective.status, reason: b.effective.reason },
      digest: { version: INTENT_CONTENT_VERSION, value: intentContentDigest(b.intent) },
    },
  };
}

export interface RecordedDecision { status: number; body: Record<string, unknown> }

/** Append, then confirm from the re-read anchor record that the row is covered (a resolved flush proves nothing). */
async function anchored(ledger: DecisionLedger, entry: { id: number; entryHash: string }): Promise<boolean> {
  try {
    await ledger.flushAnchor();
    const snap = await ledger.verifiedSnapshot();
    const head = snap.report.anchor.headId;
    return typeof head === 'number' && head >= entry.id && snap.rows.some((r) => r.row.id === entry.id && r.row.entry_hash === entry.entryHash);
  } catch {
    return false;
  }
}

function payloadFor(ctx: IntentDecisionContext, facts: { intent: { id: string; createdEntryHash: string }; digest: { version: number; value: string } },
  verdict: DecisionPayload['verdict'], note: string, operationId: string, channel: string): DecisionPayload {
  return {
    decisionId: randomUUID(), intentId: facts.intent.id, intentCreatedEntryHash: facts.intent.createdEntryHash,
    workspace: workspaceKey(ctx.workspaceRoot), verdict, digestVersion: facts.digest.version, contentDigest: facts.digest.value,
    note, operationId, authentication: { ...describeOperatorAuthentication({ method: INTENT_DECISION_MODAL_METHOD, channel }) },
  };
}

async function appendDecision(ledger: DecisionLedger, payload: DecisionPayload): Promise<{ id: number; entryHash: string } | null> {
  const entry = await ledger.appendEntry({
    eventType: INTENT_DECIDED, agentDid: INTENT_DECISION_DID, overseerDid: INTENT_DECISION_OVERSEER_DID,
    overseerDecision: payload.verdict, verificationMethod: INTENT_DECISION_METHOD, verificationResult: payload.verdict,
    artifactHash: payload.contentDigest, payload: payload as unknown as Record<string, unknown>,
  });
  if (!entry || entry.id === 0 || entry.entryHash === 'STUB_DISABLED' || !HASH64.test(String(entry.entryHash))) return null;
  return entry;
}

/** plan-b340 LD2: record a confirmed PASS or VETO (the row, the anchor check, then the mirror). */
export async function recordIntentDecision(
  ctx: IntentDecisionContext, request: DecisionRequest, shown: IntentDecisionFacts, confirmation: { operationId: string },
): Promise<RecordedDecision> {
  return withDecisionLock(`intent-decision:${ctx.workspaceRoot}`, async () => {
    const again = await buildDecisionPlan(ctx, request);
    if (!again.ok) return { status: again.status, body: { ok: false, error: again.error } };
    if (canonicalJson(again.plan) !== canonicalJson(shown)) {
      return { status: 409, body: { ok: false, stale: true, error: 'The intent or its status changed while you were confirming; nothing was recorded. Decide again.' } };
    }
    const ledger = usableDecisionLedger(ctx.ledger);
    if (!ledger) return { status: 503, body: { ok: false, error: LEDGER_UNAVAILABLE_DECISION } };
    const payload = payloadFor(ctx, again.plan, request.verdict, request.note, confirmation.operationId, INTENT_DECISION_CHANNELS.decide);
    const entry = await appendDecision(ledger, payload);
    if (!entry) return { status: 503, body: { ok: false, error: 'The FailSafe ledger is disabled, so the decision was not recorded.' } };
    const covered = await anchored(ledger, entry);
    if (!covered && request.verdict === 'VETO') {
      const wkey = workspaceKey(ctx.workspaceRoot);
      latches.set(wkey, [...(latches.get(wkey) ?? []), { id: entry.id, hash: entry.entryHash }]);
    }
    const mirrored = await ctx.intents.recordDecision({
      intentId: payload.intentId, actor: 'user', verdict: request.verdict,
      details: {
        decisionId: payload.decisionId, ledgerEntryId: entry.id, ledgerEntryHash: entry.entryHash,
        operationId: payload.operationId, digestVersion: payload.digestVersion, contentDigest: payload.contentDigest,
      },
    });
    if (!mirrored.ok) {
      return {
        status: 500,
        body: {
          ok: false, ledgerEntryId: entry.id, refused: mirrored.reason,
          error: `The ${request.verdict} was sealed as ledger entry #${entry.id}, but its intent-history mirror could not be written (${mirrored.reason}). ` +
            (request.verdict === 'VETO' ? 'The VETO still blocks.' : 'The PASS does not count without its mirror; decide again.'),
        },
      };
    }
    if (!covered) {
      return {
        status: 500,
        body: {
          ok: false, ledgerEntryId: entry.id, unanchored: true,
          error: request.verdict === 'VETO'
            ? `The VETO is recorded as ledger entry #${entry.id} and blocks, but it is not yet tamper-evident: the ledger head anchor could not be stored.`
            : `The PASS is recorded as ledger entry #${entry.id} but does not count until the ledger head anchor covers it (the anchor could not be stored); it counts after the next anchored ledger write.`,
        },
      };
    }
    return { status: 200, body: { ok: true, decisionId: payload.decisionId, verdict: request.verdict, ledgerEntryId: entry.id, ledgerEntryHash: entry.entryHash } };
  });
}

/** The seal (or finish-sealing) plan; refused unless the effective status is PASS or already SEALED. */
export async function buildSealPlan(ctx: IntentDecisionContext): Promise<{ ok: true; plan: IntentSealFacts } | Refusal> {
  const built = await decisionBase(ctx, 'There is no active intent to seal. Nothing was recorded.');
  if (!built.ok) return built;
  const b = built.base;
  const e = b.effective;
  if (e.status !== 'PASS' && e.status !== 'SEALED') {
    return refuse(409, `The active intent is not approved (${e.status}: ${e.reason}), so it cannot be sealed. Nothing was recorded.`);
  }
  let review = 'not read';
  if (ctx.reviewState) {
    try { review = await ctx.reviewState(b.intent.id); } catch { review = 'unavailable'; }
  }
  return {
    ok: true,
    plan: {
      kind: e.status === 'SEALED' ? 'finish' : 'seal', intent: intentFacts(b), decisionRowId: e.decisionRowId,
      digest: { version: INTENT_CONTENT_VERSION, value: intentContentDigest(b.intent) }, review,
    },
  };
}

/** plan-b340 LD6: the sealed SEALED row (unless it already exists), then the idempotent seal. */
export async function recordIntentSeal(ctx: IntentDecisionContext, shown: IntentSealFacts, confirmation: { operationId: string }): Promise<RecordedDecision> {
  return withDecisionLock(`intent-decision:${ctx.workspaceRoot}`, async () => {
    const again = await buildSealPlan(ctx);
    if (!again.ok) return { status: again.status, body: { ok: false, error: again.error } };
    if (canonicalJson(again.plan) !== canonicalJson(shown)) {
      return { status: 409, body: { ok: false, stale: true, error: 'The intent or its status changed while you were confirming; nothing was recorded. Seal again.' } };
    }
    let rowId = again.plan.decisionRowId;
    if (again.plan.kind === 'seal') {
      const ledger = usableDecisionLedger(ctx.ledger);
      if (!ledger) return { status: 503, body: { ok: false, error: LEDGER_UNAVAILABLE_DECISION } };
      const payload = payloadFor(ctx, again.plan, 'SEALED', '', confirmation.operationId, INTENT_DECISION_CHANNELS.seal);
      const entry = await appendDecision(ledger, payload);
      if (!entry) return { status: 503, body: { ok: false, error: 'The FailSafe ledger is disabled, so the seal was not recorded.' } };
      await anchored(ledger, entry);
      rowId = entry.id;
    }
    try {
      await ctx.hooks?.beforeComplete?.();
      await ctx.intents.sealIntent('user');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 500,
        body: { ok: false, ledgerEntryId: rowId, error: `The seal is recorded as ledger entry #${rowId}, but archiving the intent did not finish (${message}). Run FailSafe: Seal the Active Intent again to finish.` },
      };
    }
    return { status: 200, body: { ok: true, ledgerEntryId: rowId, finished: again.plan.kind === 'finish' } };
  });
}
