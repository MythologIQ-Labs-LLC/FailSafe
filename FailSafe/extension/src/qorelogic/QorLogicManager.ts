/**
 * QorLogicManager - Governance Content & Framework Coordinator
 *
 * Manages:
 * - SOA Ledger (audit trail)
 * - Trust Engine (reputation scoring)
 * - Policy Engine (risk grading, citation rules)
 * - L3 Approval Queue (delegated to L3ApprovalService)
 * - Shadow Genome (failure archival)
 */

import { IStateStore, IConfigProvider } from '../core/interfaces';
import { EventBus } from '../shared/EventBus';
import { Logger } from '../shared/Logger';
import {
    L3ApprovalRequest,
    AgentIdentity,
    SentinelVerdict,
    ShadowGenomeEntry,
    FailureMode
} from '../shared/types';
import { LedgerManager } from './ledger/LedgerManager';
import { TrustEngine } from './trust/TrustEngine';
import { PolicyEngine } from './policies/PolicyEngine';
import { ShadowGenomeManager } from './shadow/ShadowGenomeManager';
import { CortexEvent, RoutingDecision } from '../governance/EvaluationRouter';
import { L3ApprovalService } from './L3ApprovalService';

export class QorLogicManager {
    private stateStore: IStateStore;
    private ledgerManager: LedgerManager;
    private trustEngine: TrustEngine;
    private policyEngine: PolicyEngine;
    private shadowGenomeManager: ShadowGenomeManager;
    private eventBus: EventBus;
    private logger: Logger;
    private l3ApprovalService: L3ApprovalService;

    constructor(
        stateStore: IStateStore,
        configProvider: IConfigProvider,
        ledgerManager: LedgerManager,
        trustEngine: TrustEngine,
        policyEngine: PolicyEngine,
        shadowGenomeManager: ShadowGenomeManager,
        eventBus: EventBus,
        overseerId?: string,
    ) {
        this.stateStore = stateStore;
        this.ledgerManager = ledgerManager;
        this.trustEngine = trustEngine;
        this.policyEngine = policyEngine;
        this.shadowGenomeManager = shadowGenomeManager;
        this.eventBus = eventBus;
        this.logger = new Logger('Qor-Logic');
        this.l3ApprovalService = new L3ApprovalService(
            stateStore, configProvider, ledgerManager, trustEngine, eventBus, overseerId
        );
    }

    async initialize(): Promise<void> {
        this.logger.info('Initializing Qor-Logic manager...');
        this.l3ApprovalService.loadQueue();
        this.logger.info('Qor-Logic manager initialized');
    }

    /**
     * Get the ledger manager instance
     */
    getLedgerManager(): LedgerManager {
        return this.ledgerManager;
    }

    /**
     * Get the trust engine instance
     */
    getTrustEngine(): TrustEngine {
        return this.trustEngine;
    }

    /**
     * Get the policy engine instance
     */
    getPolicyEngine(): PolicyEngine {
        return this.policyEngine;
    }

    /**
     * Get the L3 approval queue
     */
    getL3Queue(): L3ApprovalRequest[] {
        return this.l3ApprovalService.getQueue();
    }

    /** Phase 60 §2 (B192): refresh L3 queue cache from persisted state before hub snapshot reads. */
    refreshL3Queue(): void {
        this.l3ApprovalService.refreshFromWorkspace();
    }

    /**
     * Add an item to the L3 approval queue
     */
    async queueL3Approval(
        request: Omit<L3ApprovalRequest, 'id' | 'state' | 'queuedAt' | 'slaDeadline'>
    ): Promise<string> {
        return this.l3ApprovalService.queueL3Approval(request);
    }

    /**
     * Process an evaluation routing decision
     */
    async processEvaluationDecision(
        decision: RoutingDecision,
        event: CortexEvent
    ): Promise<void> {
        return this.l3ApprovalService.processEvaluationDecision(decision, event);
    }

    /**
     * Process an L3 decision (approve/reject)
     */
    async processL3Decision(
        requestId: string,
        decision: 'APPROVED' | 'REJECTED',
        conditions?: string[]
    ): Promise<void> {
        return this.l3ApprovalService.processL3Decision(requestId, decision, conditions);
    }

    /**
     * Register a new agent
     */
    async registerAgent(persona: string, publicKey: string): Promise<AgentIdentity> {
        const identity = await this.trustEngine.registerAgent(persona, publicKey);

        await this.ledgerManager.appendEntry({
            eventType: 'SYSTEM_EVENT',
            agentDid: identity.did,
            agentTrustAtAction: identity.trustScore,
            payload: { action: 'AGENT_REGISTERED', persona }
        });

        return identity;
    }

    // =========================================================================
    // SHADOW GENOME (Failure Archival)
    // =========================================================================

    /**
     * Get the shadow genome manager instance
     */
    getShadowGenomeManager(): ShadowGenomeManager {
        return this.shadowGenomeManager;
    }

    /**
     * Archive a failed verdict to the Shadow Genome
     */
    async archiveFailedVerdict(
        verdict: SentinelVerdict,
        inputVector: string,
        environmentContext?: string
    ): Promise<ShadowGenomeEntry | null> {
        // Only archive non-PASS verdicts
        if (verdict.decision === 'PASS') {
            return null;
        }

        try {
            const entry = await this.shadowGenomeManager.archiveFailure({
                verdict,
                inputVector,
                decisionRationale: verdict.summary,
                environmentContext,
                causalVector: verdict.details
            });

            this.logger.info('Archived failure to Shadow Genome', {
                entryId: entry.id,
                failureMode: entry.failureMode,
                agentDid: verdict.agentDid
            });

            return entry;
        } catch (error) {
            this.logger.error('Failed to archive to Shadow Genome', { error });
            return null;
        }
    }

    /**
     * Get negative constraints for an agent (for learning injection)
     */
    async getAgentNegativeConstraints(agentDid: string): Promise<string[]> {
        return this.shadowGenomeManager.getNegativeConstraintsForAgent(agentDid);
    }

    /**
     * Get failure patterns across all agents (for systemic learning)
     */
    async getFailurePatterns(): Promise<{
        failureMode: FailureMode;
        count: number;
        agentDids: string[];
        recentCauses: string[];
    }[]> {
        return this.shadowGenomeManager.analyzeFailurePatterns();
    }

    /**
     * Get failure history for an agent
     */
    async getAgentFailureHistory(agentDid: string, limit: number = 20): Promise<ShadowGenomeEntry[]> {
        return this.shadowGenomeManager.getEntriesByAgent(agentDid, limit);
    }

    dispose(): void {
        this.shadowGenomeManager.close();
    }
}
