import * as crypto from 'crypto';
import { ConfigManager } from '../shared/ConfigManager';
import { Logger } from '../shared/Logger';
import { HeuristicResult, LLMEvaluation, SentinelEvent, SentinelVerdict, SentinelMode } from '../shared/types';
import { HeuristicEngine } from './engines/HeuristicEngine';
import { VerdictEngine } from './engines/VerdictEngine';
import { ExistenceEngine } from './engines/ExistenceEngine';
import { readFileContentSafe } from './utils/FileReader';
import { LLMClient } from './utils/LLMClient';

/**
 * VerdictArbiter
 *
 * Orchestrates the decision-making process for Sentinel.
 * - Coordinates Heuristics, LLM, and Existence checks.
 * - Determines when to escalate to LLM analysis.
 * - Produces the final SentinelVerdict.
 */
export class VerdictArbiter {
    private logger: Logger;
    private configManager: ConfigManager;
    private heuristicEngine: HeuristicEngine;
    private verdictEngine: VerdictEngine;
    private existenceEngine: ExistenceEngine;
    private llmClient: LLMClient;

    private llmAvailable: boolean = false;
    private currentMode: SentinelMode = 'heuristic';

    constructor(
        configManager: ConfigManager,
        heuristicEngine: HeuristicEngine,
        verdictEngine: VerdictEngine,
        existenceEngine: ExistenceEngine
    ) {
        this.configManager = configManager;
        this.heuristicEngine = heuristicEngine;
        this.verdictEngine = verdictEngine;
        this.existenceEngine = existenceEngine;
        this.logger = new Logger('VerdictArbiter');
        this.llmClient = new LLMClient(configManager);

        // Initialize mode from config
        const config = this.configManager.getConfig();
        this.currentMode = config.sentinel.mode;
    }

    public getMode(): SentinelMode {
        return this.currentMode;
    }

    public isLlmAvailable(): boolean {
        return this.llmAvailable;
    }

    /**
     * Check if LLM is available and update internal state
     */
    public async checkLLMAvailability(): Promise<boolean> {
        this.llmAvailable = await this.llmClient.checkAvailability();

        if (!this.llmAvailable) {
            this.logger.info('LLM not available, forcing heuristic fallback if needed');
            if (this.currentMode === 'llm-assisted') {
                this.currentMode = 'heuristic';
            }
        }
        return this.llmAvailable;
    }

    /**
     * Evaluate a Sentinel Event and produce a Verdict
     */
    public async evaluateEvent(event: SentinelEvent): Promise<SentinelVerdict> {
        // P0 FIX: AGENT_CLAIM events must route to validateClaim, not evaluateFileEvent
        if (event.type === 'AGENT_CLAIM') {
            const claim = event.payload as AgentClaim;
            return this.validateClaim(claim);
        }

        // All other events (FILE_CREATED, FILE_MODIFIED, etc.) go to file processing
        return this.evaluateFileEvent(event);
    }

    /**
     * Specific logic for File-related events
     */
    private async evaluateFileEvent(event: SentinelEvent): Promise<SentinelVerdict> {
        // P2 FIX: Runtime validation for payload.path
        const payload = event.payload as { path?: string };
        const filePath = payload?.path;

        if (!filePath || typeof filePath !== 'string') {
            this.logger.warn('Invalid event payload: missing or invalid path', { eventId: event.id });
            // FX297 FIX: zero heuristic results with no forced decision falls
            // through VerdictEngine.determineDecision's default branch to
            // PASS -- malformed/unverifiable input must never silently pass.
            // Force ESCALATE (queued for human review) rather than BLOCK,
            // since VerdictRouter does not yet enforce BLOCK for file events.
            return this.verdictEngine.generateVerdict(
                event,
                'unknown',
                [],
                undefined,
                'ESCALATE',
                'Malformed event payload: missing or invalid file path -- cannot verify, escalating for human review'
            );
        }

        this.logger.debug('Arbitrating event', { type: event.type, path: filePath });

        // Read file content (if exists and within size limit)
        let content: string | undefined;
        if (event.type !== 'FILE_DELETED') {
            const readResult = readFileContentSafe(filePath);
            if (readResult.skippedReason === 'file_too_large') {
                this.logger.warn('File too large, skipping content read', { filePath });
            }
            content = readResult.content;
        }

        // Run heuristic checks
        const heuristicResults = this.heuristicEngine.analyze(filePath, content);

        // Determine if LLM evaluation is needed
        let llmEvaluation;
        if (this.shouldInvokeLLM(heuristicResults)) {
            llmEvaluation = await this.invokeLLM(filePath, content, heuristicResults);
        }

        // Generate verdict. FX933: forward the content already read above so
        // VerdictEngine can populate artifactHash without a second disk read;
        // stays undefined for FILE_DELETED / oversized-skip / read_error, same
        // as `content` itself above.
        return this.verdictEngine.generateVerdict(
            event,
            filePath,
            heuristicResults,
            llmEvaluation,
            undefined,
            undefined,
            content
        );
    }

    /**
     * Validate an agent claim (Existence Check)
     */
    public async validateClaim(claim: AgentClaim): Promise<SentinelVerdict> {
         this.logger.info('Validating agent claim', { agentDid: claim.agentDid });

         const artifacts = claim.claimedArtifacts || [];
         const existenceResults = this.existenceEngine.validateClaim(artifacts);

         const verdict = await this.verdictEngine.generateVerdict(
             {
                 id: crypto.randomUUID(),
                 type: 'AGENT_CLAIM',
                 timestamp: new Date().toISOString(),
                 priority: 'high',
                 source: 'agent_message',
                 payload: claim
             },
             artifacts[0] || 'claim_manifest',
             existenceResults,
             undefined
         );
         return verdict;
    }

    /**
     * Determine if LLM evaluation should be invoked
     */
    private shouldInvokeLLM(heuristicResults: HeuristicResult[]): boolean {
        if (!this.llmAvailable) {
            return false;
        }

        if (this.currentMode === 'heuristic') {
            return false;
        }

        if (this.currentMode === 'llm-assisted') {
            return true;
        }

        // Hybrid mode: invoke on flags or low confidence
        const hasFlags = heuristicResults.some(r => r.matched && r.severity !== 'low');
        return hasFlags;
    }

    /**
     * Invoke LLM for deeper evaluation
     */
    private async invokeLLM(
        filePath: string,
        content: string | undefined,
        heuristicResults: HeuristicResult[]
    ): Promise<LLMEvaluation | undefined> {
        const config = this.configManager.getConfig();
        const model = config.sentinel.localModel;

        const prompt = this.llmClient.buildPrompt(filePath, content, heuristicResults);

        try {
            const result = await this.llmClient.callEndpoint(prompt);
            return {
                model,
                promptUsed: prompt,
                response: result.response,
                confidence: this.computeConfidence(heuristicResults, result.response),
                processingTime: result.totalDuration
            };
        } catch (error) {
            this.logger.warn('LLM evaluation failed', error);
            return undefined;
        }
    }

    private computeConfidence(
        heuristicResults: HeuristicResult[],
        response: string,
    ): number {
        const matched = heuristicResults.filter(r => r.matched);
        const allAgree = matched.length === 0
            || matched.every(r => r.severity === matched[0].severity);
        let confidence = allAgree ? 0.8 : 0.5;

        const hasStructuredVerdict = /\b(ALLOW|DENY|ESCALATE)\b/.test(response);
        if (hasStructuredVerdict) {
            confidence += 0.1;
        } else if (!response || response.trim().length < 10) {
            confidence -= 0.2;
        }

        return Math.max(0.3, Math.min(0.9, confidence));
    }
}

type AgentClaim = {
    agentDid: string;
    claimedArtifacts?: string[];
    [key: string]: unknown;
};
