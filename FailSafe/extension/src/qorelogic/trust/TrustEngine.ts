/**
 * TrustEngine - Agent Reputation & Trust Scoring
 *
 * Implements Lewicki-Bunker trust model:
 * - CBT (0.0-0.5): Calculus-Based Trust (probationary)
 * - KBT (0.5-0.8): Knowledge-Based Trust (standard)
 * - IBT (0.8-1.0): Identification-Based Trust (trusted)
 */

import Database from 'better-sqlite3';
import { LedgerManager } from '../ledger/LedgerManager';
import {
    TrustScore,
    TrustUpdate,
    AgentIdentity,
} from '../../shared/types';
import { extractPersonaFromDID } from '../../shared/utils/security';
import { EventBus } from '../../shared/EventBus';
import { FailSafeEventType } from '../../shared/types/events';
import {
    AgentRow, mapRowToAgent, loadAgentFromDb,
    persistAgent, withOptimisticRetry, registerOrGetAgent,
} from './TrustPersistence';
export { OptimisticLockError } from './TrustPersistence';
import {
    TRUST_CONFIG, determineStage,
    isProbationary, calculateInfluenceWeight,
} from './TrustCalculator';

export class TrustEngine {
    private agents: Map<string, AgentIdentity> = new Map();
    private db: Database.Database | undefined;
    private mutationDisposable: { dispose: () => void } | null = null;

    constructor(
        private readonly ledgerManager: LedgerManager,
        private readonly eventBus?: EventBus,
        private readonly mutationBus?: import('../../shared/WorkspaceMutationBus').WorkspaceMutationBus,
    ) {
        if (this.eventBus) {
            this.eventBus.on("qorelogic.trustUpdated" as FailSafeEventType, () => this.refreshFromDb());
            this.eventBus.on("qorelogic.agentQuarantined" as FailSafeEventType, () => this.refreshFromDb());
            this.eventBus.on("qorelogic.agentReleased" as FailSafeEventType, () => this.refreshFromDb());
        }
    }

    async initialize(): Promise<void> {
        if (!this.ledgerManager.isAvailable()) return;
        this.db = this.ledgerManager.getDatabase();
        this.refreshFromDb();
        // B192 remediation: subscribe to external SQLite db mutations
        // (FailSafe Pro coexistence). In-process EventBus subscriptions above
        // catch our OWN writes; mutationBus catches external writers.
        if (this.mutationBus) {
            const dbPath = this.ledgerManager.getLedgerPath();
            if (dbPath) {
                this.mutationDisposable = this.mutationBus.registerWatcher(
                    dbPath,
                    () => this.refreshFromDb(),
                );
            }
        }
    }

    /** Release the mutation-bus subscription. Called by extension deactivate. */
    dispose(): void {
        if (this.mutationDisposable) {
            try { this.mutationDisposable.dispose(); } catch { /* already gone */ }
            this.mutationDisposable = null;
        }
    }

    refreshFromDb(): void {
        if (!this.db) return;
        try {
            const rows = this.db.prepare('SELECT * FROM agent_trust').all() as AgentRow[];
            this.agents.clear();
            for (const row of rows) {
                this.agents.set(row.did, mapRowToAgent(row));
            }
        } catch { /* non-fatal — keep existing cache */ }
    }

    async registerAgent(persona: string, publicKey: string, didOverride?: string): Promise<AgentIdentity> {
        return withOptimisticRetry(async () => registerOrGetAgent(this.getDb(), this.agents, TRUST_CONFIG, persona, publicKey, didOverride));
    }

    getAgent(did: string): AgentIdentity | undefined {
        return this.agents.get(did);
    }

    async getAllAgents(): Promise<AgentIdentity[]> {
        return Array.from(this.agents.values());
    }

    getTrustScore(did: string): TrustScore | undefined {
        const agent = this.agents.get(did);
        if (!agent) {
            return undefined;
        }

        return {
            did,
            score: agent.trustScore,
            stage: agent.trustStage,
            influenceWeight: calculateInfluenceWeight(agent, TRUST_CONFIG),
            isProbationary: isProbationary(agent, TRUST_CONFIG),
            verificationsCompleted: agent.verificationsCompleted || 0,
            lastUpdated: agent.updatedAt || agent.createdAt
        };
    }

    async updateTrust(
        did: string,
        outcome: 'success' | 'failure' | 'violation'
    ): Promise<TrustUpdate> {
        return withOptimisticRetry(async () => {
            let agent = loadAgentFromDb(this.getDb(), did) || this.agents.get(did);

            // Auto-register unknown agents with default trust
            if (!agent) {
                const inferredPersona = extractPersonaFromDID(did) || 'scrivener';
                agent = await this.registerAgent(inferredPersona, 'auto-registered', did);
            }

            const previousScore = agent.trustScore;
            const previousStage = agent.trustStage;

            // Calculate new score
            let delta: number;
            switch (outcome) {
                case 'success':
                    delta = TRUST_CONFIG.successDelta;
                    agent.verificationsCompleted = (agent.verificationsCompleted || 0) + 1;
                    break;
                case 'failure':
                    delta = TRUST_CONFIG.failureDelta;
                    break;
                case 'violation':
                    delta = TRUST_CONFIG.violationPenalty;
                    // Force demotion on violation
                    if (agent.trustStage === 'IBT') {
                        agent.trustScore = Math.min(agent.trustScore, 0.79);
                    } else if (agent.trustStage === 'KBT') {
                        agent.trustScore = Math.min(agent.trustScore, 0.49);
                    }
                    break;
            }

            // Apply delta
            agent.trustScore = Math.max(0, Math.min(1, agent.trustScore + delta));

            // Apply probation floor
            if (isProbationary(agent, TRUST_CONFIG) && agent.trustScore < TRUST_CONFIG.probationFloor) {
                agent.trustScore = TRUST_CONFIG.probationFloor;
            }

            // Update stage
            agent.trustStage = determineStage(agent.trustScore, TRUST_CONFIG);
            persistAgent(this.getDb(), agent);
            this.agents.set(agent.did, agent);

            const update: TrustUpdate = {
                did,
                previousScore,
                newScore: agent.trustScore,
                previousStage,
                newStage: agent.trustStage,
                reason: outcome,
                timestamp: new Date().toISOString()
            };

            // Log to ledger
            await this.ledgerManager.appendEntry({
                eventType: 'TRUST_UPDATE',
                agentDid: did,
                agentTrustAtAction: agent.trustScore,
                payload: {
                    previousScore,
                    newScore: agent.trustScore,
                    previousStage,
                    newStage: agent.trustStage,
                    reason: outcome
                }
            });

            this.eventBus?.emit("qorelogic.trustUpdated" as FailSafeEventType, {
                did, previousScore, newScore: agent.trustScore,
                previousStage, newStage: agent.trustStage, reason: outcome,
            });

            return update;
        });
    }

    async quarantineAgent(did: string, reason: string, durationHours: number = 48): Promise<void> {
        await withOptimisticRetry(async () => {
            const agent = loadAgentFromDb(this.getDb(), did) || this.agents.get(did);
            if (!agent) {
                throw new Error(`Agent not found: ${did}`);
            }

            agent.isQuarantined = true;
            persistAgent(this.getDb(), agent);
            this.agents.set(agent.did, agent);

            await this.ledgerManager.appendEntry({
                eventType: 'QUARANTINE_START',
                agentDid: did,
                agentTrustAtAction: agent.trustScore,
                payload: { reason, durationHours }
            });

            this.eventBus?.emit("qorelogic.agentQuarantined" as FailSafeEventType, {
                did, reason, durationHours,
            });
        });
    }

    async releaseFromQuarantine(did: string): Promise<void> {
        await withOptimisticRetry(async () => {
            const agent = loadAgentFromDb(this.getDb(), did) || this.agents.get(did);
            if (!agent) {
                throw new Error(`Agent not found: ${did}`);
            }

            agent.isQuarantined = false;
            persistAgent(this.getDb(), agent);
            this.agents.set(agent.did, agent);

            await this.ledgerManager.appendEntry({
                eventType: 'QUARANTINE_END',
                agentDid: did,
                agentTrustAtAction: agent.trustScore,
                payload: {}
            });

            this.eventBus?.emit("qorelogic.agentReleased" as FailSafeEventType, { did });
        });
    }

    private getDb(): Database.Database {
        return this.db || this.ledgerManager.getDatabase();
    }
}
