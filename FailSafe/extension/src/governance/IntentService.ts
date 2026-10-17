// File: extension/src/governance/IntentService.ts
import { randomUUID } from 'node:crypto';
import {
  Intent, IntentType, IntentScope, IntentMetadata, IntentStatus, IntentEvidence, IntentSchema,
  IntentEdgeKind, IntentHistoryEntry, IntentEdgeDetailsSchema, IntentIdSchema,
} from './types/IntentTypes';
import { IntentStore } from './IntentStore';
import { IntentHistoryLog } from './IntentHistoryLog';
import { SessionManager } from './SessionManager';
import type { GovernanceMode } from './EnforcementEngine';

export type GovernanceModeGetter = () => GovernanceMode;

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

export interface IntentRecord {
  intent: Intent;
  active: boolean;
  sealed: boolean;
  created: IntentHistoryEntry | null;
  edges: IntentEdge[];
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

export class IntentService {
  private store: IntentStore;
  private history: IntentHistoryLog;
  private session: SessionManager;
  private getGovernanceMode: GovernanceModeGetter | null = null;

  constructor(workspaceRoot: string, sessionManager: SessionManager) {
    this.store = new IntentStore(workspaceRoot);
    this.history = new IntentHistoryLog(this.store.getManifestDir());
    this.session = sessionManager;
  }

  setGovernanceModeGetter(getter: GovernanceModeGetter): void {
    this.getGovernanceMode = getter;
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
      record: { intent, active: isActive, sealed: intent.status === 'SEALED', created, edges: replayIntentEdges(entries, intentId) },
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

  async updateStatus(newStatus: IntentStatus, actor: string, auditVerified?: boolean): Promise<void> {
    const active = await this.getActiveIntent();
    if (!active) throw new Error('No active Intent.');
    if (active.status === 'SEALED') throw new Error(`Intent "${active.id}" is SEALED.`);
    // B67: PASS status requires audit sign-off in enforce mode.
    // LD-4: 'observe' fallback = unwired-getter guard (see createIntent above).
    const mode = this.getGovernanceMode?.() ?? 'observe';
    if (newStatus === 'PASS' && mode === 'enforce' && !auditVerified) {
      throw new Error('Intent cannot reach PASS without audit sign-off in enforce mode.');
    }

    const prevStatus = active.status;
    active.status = newStatus;
    active.updatedAt = new Date().toISOString();
    if (newStatus === 'SEALED') active.sealedAt = active.updatedAt;

    await this.store.saveActiveIntent(active);
    await this.history.appendEntry({ intentId: active.id, timestamp: active.updatedAt, event: 'STATUS_CHANGED', previousStatus: prevStatus, newStatus, actor });
  }

  async updateEvidence(evidence: Partial<IntentEvidence>, actor: string): Promise<void> {
    const active = await this.getActiveIntent();
    if (!active || active.status === 'SEALED') throw new Error('Cannot update evidence.');

    active.evidence = { ...active.evidence, ...evidence } as IntentEvidence;
    active.updatedAt = new Date().toISOString();

    await this.store.saveActiveIntent(active);
    await this.history.appendEntry({ intentId: active.id, timestamp: active.updatedAt, event: 'EVIDENCE_UPDATED', actor, details: evidence });
  }

  async sealIntent(actor: string): Promise<void> {
    const active = await this.getActiveIntent();
    if (!active) throw new Error('No active Intent.');
    if (active.status !== 'PASS') throw new Error(`Status must be PASS (current: ${active.status}).`);

    await this.updateStatus('SEALED', actor); 
    const sealed = await this.getActiveIntent(); // Reload sealed state
    if (sealed) await this.store.archiveIntent(sealed);
    
    await this.history.appendEntry({ intentId: active.id, timestamp: new Date().toISOString(), event: 'SEALED', actor });
    await this.store.deleteActiveIntent();
    await this.session.setActiveIntent(null);
  }
}
