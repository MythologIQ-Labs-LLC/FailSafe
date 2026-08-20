// File: extension/src/governance/IntentService.ts
import { randomUUID } from 'node:crypto';
import { Intent, IntentType, IntentScope, IntentMetadata, IntentStatus, IntentEvidence, IntentSchema } from './types/IntentTypes';
import { IntentStore } from './IntentStore';
import { IntentHistoryLog } from './IntentHistoryLog';
import { SessionManager } from './SessionManager';
import type { GovernanceMode } from './EnforcementEngine';

export type GovernanceModeGetter = () => GovernanceMode;

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
    await this.history.appendEntry({ intentId: intent.id, timestamp: now, event: 'CREATED', newStatus: 'PULSE', actor: params.metadata.author });
    await this.session.setActiveIntent(intent.id);
    return intent;
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
