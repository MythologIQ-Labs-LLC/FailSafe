// File: extension/src/governance/IntentService.ts
import { randomUUID } from 'node:crypto';
import {
  Intent, IntentType, IntentScope, IntentMetadata, IntentStatus, IntentEvidence, IntentSchema,
  IntentEdgeKind, IntentHistoryEntry, IntentEdgeDetailsSchema, IntentIdSchema,
  IntentReviewDetailsSchema, type IntentReviewDetails, IntentDecisionDetailsSchema, type IntentDecisionDetails,
} from './types/IntentTypes';
import { IntentStore } from './IntentStore';
import { IntentHistoryLog } from './IntentHistoryLog';
import { SessionManager } from './SessionManager';
import type { GovernanceMode } from './EnforcementEngine';
import { readEffectiveStatus, type EffectiveRead } from './intentDecision';

export type GovernanceModeGetter = () => GovernanceMode;

/** B340: the active intent as enforce mode sees it: `status` is the effective status, never the file's. */
export type EnforcedIntent = Intent & { statusReason?: string; statusCode?: string };

/** B340 (plan-b340 LD5): the refusal for a decision status written outside the confirmed commands. */
export const DECISION_COMMAND_ONLY =
  'In enforce mode an intent decision is recorded only through FailSafe: Approve or Veto the Active Intent (and a seal only through FailSafe: Seal the Active Intent).';

/** #480: an earlier CREATED entry whose provenance names an external reference. */
export interface ExternalRefImport {
  intentId: string;
  timestamp: string;
  provenance: Record<string, unknown>;
}

/** The intent history failed its chain check (or could not be read); nothing can be trusted. */
export type ExternalRefLookup =
  | { integrity: 'valid'; entries: ExternalRefImport[] }
  | { integrity: 'invalid' };

/** #532: one edge from the replay of LINKED / UNLINKED entries. */
export interface IntentEdge {
  edge: IntentEdgeKind;
  target: string;
  provenance: Record<string, unknown>;
  linkedAt: string;
  actor: string;
  entryHash: string | null;
}

export interface IntentSummary {
  id: string;
  purpose: string;
  type: string;
  status: IntentStatus;
  createdAt: string;
  /** The intent in active_intent.json; every other listed intent is archived and SEALED. */
  active: boolean;
}

/**
 * #532 (plan-532c LD5): the intent decision, the latest STATUS_CHANGED to PASS (approved for
 * implementation) or VETO (blocked) before the seal, unless a later status change superseded it.
 * A decision about the intent, never a review of the implementation.
 */
export interface IntentDecision {
  status: 'PASS' | 'VETO';
  actor: string;
  timestamp: string;
  entryHash: string | null;
}

/**
 * #532 B320 (plan-b320 LD5): one REVIEWED entry of an intent, the mirror of a sealed
 * delivery-review ledger row, from a history whose chain verified. The details are not parsed
 * here: deliveryReview parses them strictly and joins them to their row.
 */
export interface IntentReviewMirror {
  details: unknown;
  actor: string;
  timestamp: string;
  entryHash: string | null;
  /** Index in the whole history, so one mirror can be later than another. */
  position: number;
}

export interface IntentRecord {
  intent: Intent;
  active: boolean;
  sealed: boolean;
  created: IntentHistoryEntry | null;
  edges: IntentEdge[];
  decision: IntentDecision | null;
  /** #532 B320: the REVIEWED mirrors, in history order, up to the seal. */
  reviews: IntentReviewMirror[];
}

export type IntentListing = { integrity: 'valid'; intents: IntentSummary[] } | { integrity: 'invalid' };
export type IntentRecordLookup = { integrity: 'valid'; record: IntentRecord | null } | { integrity: 'invalid' };
export type IntentEdgeLookup = { integrity: 'valid'; edges: IntentEdge[] } | { integrity: 'invalid' };
export type EdgeWriteRefusal = 'integrity' | 'no-active-intent' | 'not-active' | 'sealed' | 'duplicate' | 'absent' | 'invalid';
export type EdgeWriteResult = { ok: true } | { ok: false; reason: EdgeWriteRefusal };

export interface LinkEdgeParams {
  intentId: string;
  edge: IntentEdgeKind;
  target: string;
  provenance: Record<string, unknown>;
  actor: string;
}

const edgeKey = (edge: string, target: string): string => `${edge}\u0000${target}`;
const isSealEntry = (e: IntentHistoryEntry): boolean =>
  e.event === 'SEALED' || (e.event === 'STATUS_CHANGED' && e.newStatus === 'SEALED');

/**
 * #532: the edges of one intent, replayed from its history: LINKED adds an edge, a later
 * UNLINKED for the same edge and target removes it. Edges are a set, so concurrent duplicate
 * LINKED entries collapse to the first one. Replay stops at the intent's seal; entries after it
 * are ignored. Entries whose details fail the schema are skipped.
 */
export function replayIntentEdges(entries: IntentHistoryEntry[], intentId: string): IntentEdge[] {
  const edges = new Map<string, IntentEdge>();
  for (const e of entries) {
    if (e.intentId !== intentId) continue;
    if (isSealEntry(e)) break;
    if (e.event !== 'LINKED' && e.event !== 'UNLINKED') continue;
    const parsed = IntentEdgeDetailsSchema.safeParse(e.details);
    if (!parsed.success) continue;
    const key = edgeKey(parsed.data.edge, parsed.data.target);
    if (e.event === 'UNLINKED') { edges.delete(key); continue; }
    if (!edges.has(key)) {
      edges.set(key, {
        edge: parsed.data.edge, target: parsed.data.target, provenance: parsed.data.provenance,
        linkedAt: e.timestamp, actor: e.actor, entryHash: e.entryHash ?? null,
      });
    }
  }
  return [...edges.values()];
}

/**
 * #532 (plan-532c LD5): replay one intent's STATUS_CHANGED entries up to its seal. PASS or VETO
 * sets the decision; any other later status (for example back to PULSE) clears it. Read-only.
 */
export function replayIntentDecision(entries: IntentHistoryEntry[], intentId: string): IntentDecision | null {
  let decision: IntentDecision | null = null;
  for (const e of entries) {
    if (e.intentId !== intentId) continue;
    if (isSealEntry(e)) break;
    if (e.event !== 'STATUS_CHANGED') continue;
    decision = e.newStatus === 'PASS' || e.newStatus === 'VETO'
      ? { status: e.newStatus, actor: e.actor, timestamp: e.timestamp, entryHash: e.entryHash ?? null }
      : null;
  }
  return decision;
}

/** #532 B320: replay one intent's REVIEWED entries up to its seal, in history order. Read-only. */
export function replayIntentReviews(entries: IntentHistoryEntry[], intentId: string): IntentReviewMirror[] {
  const reviews: IntentReviewMirror[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.intentId !== intentId) continue;
    if (isSealEntry(e)) break;
    if (e.event !== 'REVIEWED') continue;
    reviews.push({ details: e.details ?? null, actor: e.actor, timestamp: e.timestamp, entryHash: e.entryHash ?? null, position: i });
  }
  return reviews;
}

export class IntentService {
  private store: IntentStore;
  private history: IntentHistoryLog;
  private session: SessionManager;
  private getGovernanceMode: GovernanceModeGetter | null = null;
  private getLedger: (() => unknown) | null = null;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string, sessionManager: SessionManager) {
    this.workspaceRoot = workspaceRoot;
    this.store = new IntentStore(workspaceRoot);
    this.history = new IntentHistoryLog(this.store.getManifestDir());
    this.session = sessionManager;
  }

  setGovernanceModeGetter(getter: GovernanceModeGetter): void {
    this.getGovernanceMode = getter;
  }

  /** B340: the SOA ledger the effective status reads (main.ts wires it once the ledger exists). */
  setLedgerGetter(getter: () => unknown): void {
    this.getLedger = getter;
  }

  /** B340: every history entry and whether the chain verified (an unreadable history is empty and invalid). */
  async readHistory(): Promise<{ entries: IntentHistoryEntry[]; valid: boolean }> {
    try {
      const chain = await this.history.verifyChainIntegrity();
      return { entries: await this.history.loadAllEntries(), valid: chain.valid };
    } catch {
      return { entries: [], valid: false };
    }
  }

  /** B340 (plan-b340 LD3): the effective status of `intent` from the sealed decisions, whatever the mode. */
  async effectiveStatusOf(intent: Intent): Promise<EffectiveRead> {
    return readEffectiveStatus({
      workspaceRoot: this.workspaceRoot, intent, history: await this.readHistory(), ledger: this.getLedger?.(),
    });
  }

  /**
   * B340 (plan-b340 LD4): the active intent for enforcement and the enforce-mode displays. In enforce
   * mode (and when no mode getter is wired: fail closed) `status` is the effective status (blocked
   * reads VETO), with its reason; the file is read once, so the digest and the result come from the
   * same parsed object. In observe and assist modes the file intent is returned unchanged.
   */
  async getEnforcedActiveIntent(): Promise<EnforcedIntent | null> {
    const intent = await this.getActiveIntent();
    if (!intent) return null;
    const mode = this.getGovernanceMode ? this.getGovernanceMode() : 'enforce';
    if (mode !== 'enforce') return intent;
    const { effective } = await this.effectiveStatusOf(intent);
    return {
      ...intent, status: effective.status === 'blocked' ? 'VETO' : effective.status,
      statusReason: effective.reason, statusCode: effective.code,
    };
  }

  // D1: Runtime validation using Zod
  async getActiveIntent(): Promise<Intent | null> {
    const rawIntent = await this.store.readActiveIntent();
    if (!rawIntent) return null;
    try { return IntentSchema.parse(rawIntent); } 
    catch (e) { console.error('Intent validation failed:', e); return null; } // Failsafe fallback
  }

  async createIntent(params: {
    type: IntentType; purpose: string; scope: IntentScope;
    blueprint?: string; planId?: string; metadata: IntentMetadata;
    /** #480: written into the CREATED history entry's details (covered by the entry hash). */
    provenance?: Record<string, unknown>;
  }): Promise<Intent> {
    const active = await this.getActiveIntent();
    if (active && active.status !== 'SEALED') throw new Error(`Active Intent "${active.id}" must be SEALED.`);

    // B66: Require planId in enforce mode.
    // LD-4 (2026-08-19): the 'observe' fallback is an unwired-getter guard, NOT
    // a mode-resolution site — production wiring always sets the getter
    // (bootstrapGovernance). Flipping it to 'enforce' would make unwired
    // test/legacy constructions throw here without changing wired behavior.
    const mode = this.getGovernanceMode?.() ?? 'observe';
    if (mode === 'enforce' && !params.planId) {
      throw new Error('Intent creation requires a planId in enforce mode.');
    }

    const now = new Date().toISOString();
    const intent: Intent = {
      id: randomUUID(), type: params.type, createdAt: now, purpose: params.purpose,
      scope: params.scope, status: 'PULSE', blueprint: params.blueprint,
      planId: params.planId,
      metadata: params.metadata, updatedAt: now, schemaVersion: 2,
    };

    await this.store.saveActiveIntent(intent);
    await this.history.appendEntry({
      intentId: intent.id, timestamp: now, event: 'CREATED', newStatus: 'PULSE', actor: params.metadata.author,
      ...(params.provenance ? { details: { provenance: params.provenance } } : {}),
    });
    await this.session.setActiveIntent(intent.id);
    return intent;
  }

  /**
   * #480: CREATED entries whose provenance names `externalRef`. The history
   * chain is checked first; a broken chain, or a history that cannot be read
   * (a torn line makes loadAllEntries throw), is reported as invalid so the
   * caller refuses rather than trusting it. The chain is plain unkeyed SHA-256:
   * it detects edits that do not recompute it, not a writer that does.
   */
  async findCreatedByExternalRef(externalRef: string): Promise<ExternalRefLookup> {
    try {
      const chain = await this.history.verifyChainIntegrity();
      if (!chain.valid) return { integrity: 'invalid' };
      const entries = (await this.history.loadAllEntries()).flatMap((e): ExternalRefImport[] => {
        const provenance = e.details && typeof e.details === 'object' ? (e.details as Record<string, unknown>).provenance : undefined;
        if (e.event !== 'CREATED' || !provenance || typeof provenance !== 'object') return [];
        const p = provenance as Record<string, unknown>;
        return p.externalRef === externalRef ? [{ intentId: e.intentId, timestamp: e.timestamp, provenance: p }] : [];
      });
      return { integrity: 'valid', entries };
    } catch {
      return { integrity: 'invalid' };
    }
  }

  /** #532: every history entry, or null when the chain fails its check or cannot be read. */
  private async verifiedEntries(): Promise<IntentHistoryEntry[] | null> {
    try {
      const chain = await this.history.verifyChainIntegrity();
      return chain.valid ? await this.history.loadAllEntries() : null;
    } catch {
      return null;
    }
  }

  /** #532: an archived intent, or null when absent or unreadable. Only a uuid is ever used as a file name. */
  private archivedIntent(intentId: string): Intent | null {
    if (!IntentIdSchema.safeParse(intentId).success) return null;
    try {
      const parsed = IntentSchema.safeParse(this.store.getArchivedIntent(intentId));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * #532: the active intent plus every archived SEALED intent named by a CREATED history entry
   * (looked up with IntentStore.getArchivedIntent). A broken chain lists nothing.
   */
  async listIntents(): Promise<IntentListing> {
    const entries = await this.verifiedEntries();
    if (!entries) return { integrity: 'invalid' };
    const active = await this.getActiveIntent();
    const summary = (i: Intent, isActive: boolean): IntentSummary => ({
      id: i.id, purpose: i.purpose, type: i.type, status: i.status, createdAt: i.createdAt, active: isActive,
    });
    const intents: IntentSummary[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.event !== 'CREATED' || seen.has(e.intentId)) continue;
      seen.add(e.intentId);
      if (active && active.id === e.intentId) { intents.push(summary(active, true)); continue; }
      const archived = this.archivedIntent(e.intentId);
      if (archived && archived.status === 'SEALED') intents.push(summary(archived, false));
    }
    if (active && !seen.has(active.id)) intents.push(summary(active, true));
    return { integrity: 'valid', intents };
  }

  /** #532: one intent (active or archived) with its CREATED entry and replayed edges. */
  async getIntentRecord(intentId: string): Promise<IntentRecordLookup> {
    const entries = await this.verifiedEntries();
    if (!entries) return { integrity: 'invalid' };
    const active = await this.getActiveIntent();
    const isActive = !!active && active.id === intentId;
    const intent = isActive ? active : this.archivedIntent(intentId);
    if (!intent) return { integrity: 'valid', record: null };
    const created = entries.find((e) => e.intentId === intentId && e.event === 'CREATED') ?? null;
    return {
      integrity: 'valid',
      record: {
        intent, active: isActive, sealed: intent.status === 'SEALED', created,
        edges: replayIntentEdges(entries, intentId), decision: replayIntentDecision(entries, intentId),
        reviews: replayIntentReviews(entries, intentId),
      },
    };
  }

  async getEdges(intentId: string): Promise<IntentEdgeLookup> {
    const entries = await this.verifiedEntries();
    return entries ? { integrity: 'valid', edges: replayIntentEdges(entries, intentId) } : { integrity: 'invalid' };
  }

  /** #532: the checks every edge write shares; the verified entries and the CREATED hash, or a refusal. */
  private async edgeWriteContext(intentId: string): Promise<
    { ok: true; entries: IntentHistoryEntry[]; createdHash: string | null } | { ok: false; reason: EdgeWriteRefusal }
  > {
    const entries = await this.verifiedEntries();
    if (!entries) return { ok: false, reason: 'integrity' };
    const active = await this.getActiveIntent();
    if (!active) return { ok: false, reason: 'no-active-intent' };
    if (active.id !== intentId) return { ok: false, reason: 'not-active' };
    if (active.status === 'SEALED') return { ok: false, reason: 'sealed' };
    const created = entries.find((e) => e.intentId === intentId && e.event === 'CREATED');
    return { ok: true, entries, createdHash: created?.entryHash ?? null };
  }

  /**
   * #532: record an edge for the active, unsealed intent. The provenance gains the CREATED
   * entry's hash as the intent endpoint's source hash. Refused while the chain is broken, for a
   * duplicate, and for anything the edge schema rejects. Callers confirm with the operator first.
   */
  async linkEdge(params: LinkEdgeParams): Promise<EdgeWriteResult> {
    const ctx = await this.edgeWriteContext(params.intentId);
    if (!ctx.ok) return ctx;
    const details = IntentEdgeDetailsSchema.safeParse({
      edge: params.edge, target: params.target, provenance: { ...params.provenance, intentSourceHash: ctx.createdHash },
    });
    if (!details.success) return { ok: false, reason: 'invalid' };
    const present = replayIntentEdges(ctx.entries, params.intentId);
    if (present.some((e) => e.edge === params.edge && e.target === params.target)) return { ok: false, reason: 'duplicate' };
    await this.history.appendEntry({
      intentId: params.intentId, timestamp: new Date().toISOString(), event: 'LINKED', actor: params.actor, details: details.data,
    });
    return { ok: true };
  }

  /** #532: remove a present edge of the active, unsealed intent (an UNLINKED entry). */
  async unlinkEdge(params: Omit<LinkEdgeParams, 'provenance'>): Promise<EdgeWriteResult> {
    const ctx = await this.edgeWriteContext(params.intentId);
    if (!ctx.ok) return ctx;
    const present = replayIntentEdges(ctx.entries, params.intentId);
    if (!present.some((e) => e.edge === params.edge && e.target === params.target)) return { ok: false, reason: 'absent' };
    const details = IntentEdgeDetailsSchema.safeParse({
      edge: params.edge, target: params.target, provenance: { intentSourceHash: ctx.createdHash },
    });
    if (!details.success) return { ok: false, reason: 'invalid' };
    await this.history.appendEntry({
      intentId: params.intentId, timestamp: new Date().toISOString(), event: 'UNLINKED', actor: params.actor, details: details.data,
    });
    return { ok: true };
  }

  /**
   * #532 B320 (plan-b320 LD5): append the REVIEWED mirror of a sealed delivery-review ledger row
   * for the active, unsealed intent. Called only by recordDeliveryReview, after the operator
   * confirmed and the row was appended. Refused while the chain is broken, for an intent that is not
   * the active unsealed one, and for details the strict schema rejects.
   */
  async recordReview(params: { intentId: string; actor: string; details: IntentReviewDetails }): Promise<EdgeWriteResult> {
    const ctx = await this.edgeWriteContext(params.intentId);
    if (!ctx.ok) return ctx;
    const details = IntentReviewDetailsSchema.safeParse(params.details);
    if (!details.success) return { ok: false, reason: 'invalid' };
    await this.history.appendEntry({
      intentId: params.intentId, timestamp: new Date().toISOString(), event: 'REVIEWED', actor: params.actor, details: details.data,
    });
    return { ok: true };
  }

  /**
   * A low-level status write. B340 (plan-b340 LD5): in enforce mode a PASS, VETO or SEALED is
   * refused here, whatever the caller passes; a decision is recorded only by intentDecision after a
   * confirmed modal. In observe mode the write still works (enforcement never honours it).
   */
  async updateStatus(newStatus: IntentStatus, actor: string): Promise<void> {
    const active = await this.getActiveIntent();
    if (!active) throw new Error('No active Intent.');
    if (active.status === 'SEALED') throw new Error(`Intent "${active.id}" is SEALED.`);
    // LD-4: 'observe' fallback = unwired-getter guard (see createIntent above).
    const mode = this.getGovernanceMode?.() ?? 'observe';
    if (mode === 'enforce' && (newStatus === 'PASS' || newStatus === 'VETO' || newStatus === 'SEALED')) {
      throw new Error(DECISION_COMMAND_ONLY);
    }
    await this.writeStatus(active, newStatus, actor);
  }

  private async writeStatus(active: Intent, newStatus: IntentStatus, actor: string, details?: Record<string, unknown>): Promise<void> {
    const prevStatus = active.status;
    active.status = newStatus;
    active.updatedAt = new Date().toISOString();
    if (newStatus === 'SEALED') active.sealedAt = active.updatedAt;

    await this.store.saveActiveIntent(active);
    await this.history.appendEntry({
      intentId: active.id, timestamp: active.updatedAt, event: 'STATUS_CHANGED', previousStatus: prevStatus, newStatus, actor,
      ...(details ? { details } : {}),
    });
  }

  /**
   * B340 (plan-b340 LD2): append the STATUS_CHANGED mirror of a sealed intent-decision ledger row for the
   * active, unsealed intent and update the file status for display. Called only by intentDecision,
   * after the operator confirmed and the row was appended. Refused while the chain is broken, for an
   * intent that is not the active one, and for details the strict schema rejects.
   */
  async recordDecision(params: { intentId: string; actor: string; verdict: 'PASS' | 'VETO'; details: IntentDecisionDetails }): Promise<EdgeWriteResult> {
    const ctx = await this.edgeWriteContext(params.intentId);
    if (!ctx.ok) return ctx;
    const details = IntentDecisionDetailsSchema.safeParse(params.details);
    if (!details.success) return { ok: false, reason: 'invalid' };
    const active = await this.getActiveIntent();
    if (!active || active.id !== params.intentId) return { ok: false, reason: 'not-active' };
    await this.writeStatus(active, params.verdict, params.actor, details.data);
    return { ok: true };
  }

  async updateEvidence(evidence: Partial<IntentEvidence>, actor: string): Promise<void> {
    const active = await this.getActiveIntent();
    if (!active || active.status === 'SEALED') throw new Error('Cannot update evidence.');

    active.evidence = { ...active.evidence, ...evidence } as IntentEvidence;
    active.updatedAt = new Date().toISOString();

    await this.store.saveActiveIntent(active);
    await this.history.appendEntry({ intentId: active.id, timestamp: active.updatedAt, event: 'EVIDENCE_UPDATED', actor, details: evidence });
  }

  /**
   * Archive the active intent. B340 (plan-b340 LD6): the only production caller (intentDecision)
   * proves the effective status first, so the file status is not checked here, and every step is
   * skipped when already done, so an interrupted seal can be finished: the status write when the
   * file already says SEALED, the archive when it exists, the SEALED entry when one is recorded.
   */
  async sealIntent(actor: string): Promise<void> {
    const active = await this.getActiveIntent();
    if (!active) throw new Error('No active Intent.');

    if (active.status !== 'SEALED') await this.writeStatus(active, 'SEALED', actor);
    const sealed = (await this.getActiveIntent()) ?? active; // Reload sealed state
    let archived: Intent | null = null;
    try { archived = this.store.getArchivedIntent(active.id); } catch { archived = null; }
    if (!archived) await this.store.archiveIntent(sealed);

    const entries = (await this.readHistory()).entries;
    if (!entries.some((e) => e.intentId === active.id && e.event === 'SEALED')) {
      await this.history.appendEntry({ intentId: active.id, timestamp: new Date().toISOString(), event: 'SEALED', actor });
    }
    await this.store.deleteActiveIntent();
    await this.session.setActiveIntent(null);
  }
}
