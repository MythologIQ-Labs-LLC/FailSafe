/**
 * L3ApprovalService - Manages the L3 approval queue and decision processing.
 * Concerns: queue management, decision processing, evaluation routing, risk mapping.
 */

import * as crypto from 'crypto';
import { IStateStore, IConfigProvider } from '../core/interfaces';
import { EventBus } from '../shared/EventBus';
import { Logger } from '../shared/Logger';
import { L3ApprovalRequest, RiskGrade } from '../shared/types';
import { LedgerManager } from './ledger/LedgerManager';
import { TrustEngine } from './trust/TrustEngine';
import { CortexEvent, RoutingDecision } from '../governance/EvaluationRouter';

/** B-INT-2: minimal preflight-mediator surface injected into the service.
 *  Declared locally (not a hard import of PreflightToL3Mediator) so the
 *  qorelogic layer has no dependency on the bicameral integration layer. */
export interface PreflightMediatorLike {
    onTier3Queued(approvalId: string, targetPath: string): Promise<void>;
}

export class L3ApprovalService {
    private readonly logger: Logger;
    private l3Queue: L3ApprovalRequest[] = [];
    /** B-INT-2: optional bicameral preflight mediator. Absent → tier-3
     *  queueing is unchanged; set by bootstrapBicameral when wired. */
    private preflightMediator: PreflightMediatorLike | null = null;

    constructor(
        private readonly stateStore: IStateStore,
        private readonly configProvider: IConfigProvider,
        private readonly ledgerManager: LedgerManager,
        private readonly trustEngine: TrustEngine,
        private readonly eventBus: EventBus,
        private readonly overseerId: string = 'did:myth:overseer:local',
    ) {
        this.logger = new Logger('L3ApprovalService');
    }

    /** Load persisted L3 queue from state store. */
    loadQueue(): void {
        this.l3Queue = this.stateStore.get<L3ApprovalRequest[]>('l3Queue', []);
    }

    /**
     * Re-read the state store and replace the in-memory queue cache.
     * Side-effect-bounded: no watchers, no events, no persisted writes.
     * Called by hub snapshot consumers prior to rebuild (B192 remediation).
     */
    refreshFromWorkspace(): void {
        this.loadQueue();
    }

    /** Remove expired items from the L3 queue based on SLA deadline. */
    private lastPruneAt = 0;

    private pruneExpired(): L3ApprovalRequest[] {
        const now = Date.now();
        if (now - this.lastPruneAt < 5000) return [];
        this.lastPruneAt = now;

        const expired: L3ApprovalRequest[] = [];
        this.l3Queue = this.l3Queue.filter(r => {
            const deadline = new Date(r.slaDeadline).getTime();
            if (Number.isNaN(deadline) || deadline < now) {
                r.state = 'EXPIRED';
                r.decidedAt = new Date().toISOString();
                expired.push(r);
                return false;
            }
            return true;
        });
        return expired;
    }

    /** Get a copy of the current L3 approval queue (auto-prunes expired). */
    getQueue(): L3ApprovalRequest[] {
        const expired = this.pruneExpired();
        if (expired.length > 0) {
            void this.persistL3Queue();
            for (const item of expired) {
                this.eventBus.emit('qorelogic.l3Decided', {
                    request: item, decision: 'EXPIRED',
                });
            }
        }
        return [...this.l3Queue];
    }

    /** Add an item to the L3 approval queue. */
    async queueL3Approval(
        request: Omit<L3ApprovalRequest, 'id' | 'state' | 'queuedAt' | 'slaDeadline'>
    ): Promise<string> {
        const config = this.configProvider.getConfig();
        const slaSecs = config.qorelogic.l3SLA;

        const id = crypto.randomUUID();
        const now = new Date();
        const slaDeadline = new Date(now.getTime() + slaSecs * 1000);

        const fullRequest: L3ApprovalRequest = {
            ...request,
            id,
            state: 'QUEUED',
            queuedAt: now.toISOString(),
            slaDeadline: slaDeadline.toISOString()
        };

        this.l3Queue.push(fullRequest);
        await this.persistL3Queue();

        await this.ledgerManager.appendEntry({
            eventType: 'L3_QUEUED',
            agentDid: request.agentDid,
            agentTrustAtAction: request.agentTrust,
            artifactPath: request.filePath,
            riskGrade: request.riskGrade,
            payload: { sentinelSummary: request.sentinelSummary, flags: request.flags }
        });

        this.eventBus.emit('qorelogic.l3Queued', fullRequest);
        this.logger.info('L3 approval queued', { id, filePath: request.filePath });

        return id;
    }

    /**
     * Process an L3 decision (approve/reject).
     */
    async processL3Decision(
        requestId: string,
        decision: 'APPROVED' | 'REJECTED',
        conditions?: string[]
    ): Promise<void> {
        const index = this.l3Queue.findIndex(r => r.id === requestId);
        if (index === -1) {
            throw new Error(`L3 request not found: ${requestId}`);
        }

        const request = this.l3Queue[index];
        const overseerDid = this.overseerId;

        this.applyDecisionToRequest(request, decision, overseerDid, conditions);

        await this.recordDecisionLedgerEntry(request, decision, overseerDid, conditions);

        await this.updateTrustForDecision(request.agentDid, decision);

        this.l3Queue.splice(index, 1);
        await this.persistL3Queue();

        this.eventBus.emit('qorelogic.l3Decided', { request, decision });
        this.logger.info('L3 decision processed', { requestId, decision });
    }

    /**
     * B-INT-2: register the bicameral preflight mediator. Optional — when
     * unset, tier-3 queueing proceeds without a preflight check.
     */
    setPreflightMediator(mediator: PreflightMediatorLike | null): void {
        this.preflightMediator = mediator;
    }

    /**
     * B-INT-2: attach bicameral preflight evidence onto a queued L3 entry.
     * Mutates the live in-memory `l3Queue` entry in place (mirrors the
     * `decideL3` findIndex→mutate→persist pattern) then persists. MUST NOT
     * call loadQueue()/refreshFromWorkspace() — those reassign `l3Queue`
     * from the store and would clobber concurrent in-memory mutations.
     * No-op (no throw, no persist) when the id is not found. Idempotent.
     */
    async attachPreflightEvidence(
        approvalId: string,
        preflightMeta: Record<string, unknown>,
        flag: string,
    ): Promise<void> {
        const index = this.l3Queue.findIndex(r => r.id === approvalId);
        if (index === -1) return;

        const entry = this.l3Queue[index];
        entry.meta = { ...entry.meta, preflight: preflightMeta };
        if (!entry.flags.includes(flag)) {
            entry.flags = [...entry.flags, flag];
        }

        await this.persistL3Queue();
        this.logger.info('L3 preflight evidence attached', { approvalId });
    }

    /**
     * Process an evaluation routing decision.
     */
    async processEvaluationDecision(
        decision: RoutingDecision,
        event: CortexEvent
    ): Promise<void> {
        const mappedRisk = this.mapRiskToLegacy(decision.triage.risk);

        if (decision.writeLedger) {
            await this.ledgerManager.appendEntry({
                eventType: 'EVALUATION_ROUTED',
                agentDid: (event.payload?.intentId as string) || 'system',
                artifactPath: event.payload?.targetPath as string,
                riskGrade: mappedRisk,
                payload: { tier: decision.tier, triage: decision.triage }
            });
        }

        if (decision.tier === 3) {
            const targetPath = event.payload?.targetPath as string;
            try {
                const queuedId = await this.queueL3Approval({
                    agentDid: (event.payload?.intentId as string) || 'system',
                    agentTrust: decision.triage.confidence === 'high' ? 0.9 : 0.7,
                    filePath: targetPath,
                    riskGrade: mappedRisk,
                    sentinelSummary: `Tier 3 evaluation: ${decision.triage.risk} risk, ${decision.triage.novelty} novelty`,
                    flags: decision.requiredActions
                });
                // B-INT-2: fire preflight non-blocking (RD-1) — the L3 entry
                // is already queued and visible; the conflict line appears on
                // the next hub rebuild once preflight returns.
                if (this.preflightMediator && targetPath) {
                    void this.preflightMediator
                        .onTier3Queued(queuedId, targetPath)
                        .catch(() => undefined);
                }
            } catch (error) {
                this.logger.error('Failed to queue L3 approval from evaluation', {
                    filePath: targetPath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * Map EvaluationRouter risk grades to legacy RiskGrade format.
     */
    mapRiskToLegacy(risk: RoutingDecision['triage']['risk']): RiskGrade {
        switch (risk) {
            case 'R0':
            case 'R1':
                return 'L1';
            case 'R2':
                return 'L2';
            case 'R3':
                return 'L3';
            default:
                return 'L1';
        }
    }

    /** Persist the L3 queue to workspace state. */
    private async persistL3Queue(): Promise<void> {
        await this.stateStore.update('l3Queue', this.l3Queue);
    }

    private applyDecisionToRequest(
        request: L3ApprovalRequest,
        decision: 'APPROVED' | 'REJECTED',
        overseerDid: string,
        conditions?: string[]
    ): void {
        const hasConditions = decision === 'APPROVED' && conditions?.length;
        request.state = hasConditions ? 'APPROVED_WITH_CONDITIONS' : decision;
        request.decidedAt = new Date().toISOString();
        request.overseerDid = overseerDid;
        request.decision = decision;
        request.conditions = conditions;
    }

    private async recordDecisionLedgerEntry(
        request: L3ApprovalRequest,
        decision: 'APPROVED' | 'REJECTED',
        overseerDid: string,
        conditions?: string[]
    ): Promise<void> {
        await this.ledgerManager.appendEntry({
            eventType: decision === 'APPROVED' ? 'L3_APPROVED' : 'L3_REJECTED',
            agentDid: request.agentDid,
            agentTrustAtAction: request.agentTrust,
            artifactPath: request.filePath,
            riskGrade: request.riskGrade,
            overseerDid,
            overseerDecision: decision,
            payload: { conditions }
        });
    }

    private async updateTrustForDecision(
        agentDid: string,
        decision: 'APPROVED' | 'REJECTED'
    ): Promise<void> {
        const outcome = decision === 'APPROVED' ? 'success' : 'failure';
        await this.trustEngine.updateTrust(agentDid, outcome);
    }
}
