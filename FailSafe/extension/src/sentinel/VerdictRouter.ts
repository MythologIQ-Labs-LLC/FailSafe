import { EventBus } from '../shared/EventBus';
import { Logger } from '../shared/Logger';
import { SentinelVerdict, SentinelEvent } from '../shared/types';
import { QorLogicManager } from '../qorelogic/QorLogicManager';

/**
 * VerdictRouter
 * 
 * Responsible for routing the final Sentinel verdict to the appropriate destinations:
 * - Event Bus (for UI/Logging)
 * - QorLogic (for Escalation/L3)
 * - Future: Blocking file operations, etc.
 */
export class VerdictRouter {
    private logger: Logger;
    private eventBus: EventBus;
    private qorelogic: QorLogicManager;

    constructor(
        eventBus: EventBus,
        qorelogic: QorLogicManager
    ) {
        this.eventBus = eventBus;
        this.qorelogic = qorelogic;
        this.logger = new Logger('VerdictRouter');
    }

    /**
     * Route a verdict to its destinations
     */
    async route(verdict: SentinelVerdict, _event?: SentinelEvent): Promise<void> {
        this.logger.debug('Routing verdict', { decision: verdict.decision, risk: verdict.riskGrade });

        // 1. Emit verdict event (Internal System)
        this.eventBus.emit('sentinel.verdict', verdict);

        // 2. Handle Escalations (QorLogic)
        if (verdict.decision === 'ESCALATE') {
            this.logger.info('Escalating verdict to L3', { filePath: verdict.artifactPath });

            try {
                await this.qorelogic.queueL3Approval({
                    filePath: verdict.artifactPath || 'unknown',
                    riskGrade: verdict.riskGrade,
                    agentDid: verdict.agentDid,
                    agentTrust: verdict.agentTrustAtVerdict,
                    sentinelSummary: verdict.summary,
                    flags: verdict.matchedPatterns
                });
            } catch (error) {
                this.logger.error('Failed to queue L3 approval', {
                    filePath: verdict.artifactPath,
                    error: error instanceof Error ? error.message : String(error)
                });
                // Emit failure event for monitoring
                this.eventBus.emit('sentinel.escalation_failed', {
                    verdict,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // 3. (Future) Enforcement Actions
        // e.g., if BLOCK, revert file change?
    }
}
