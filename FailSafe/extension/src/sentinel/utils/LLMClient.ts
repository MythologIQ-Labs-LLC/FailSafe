/**
 * LLMClient - Encapsulates all LLM communication logic for Sentinel
 *
 * Handles availability checks, prompt construction, and HTTP calls to the
 * LLM server (Ollama). #538 (B273): every call re-reads the endpoint and
 * applies the destination policy; a host that is not this machine needs a
 * user-setting endpoint and the operator's approval for this operation, and
 * the request goes only to the target the policy approved.
 */

import type { IConfigProvider } from '../../core/interfaces/IConfigProvider';
import { Logger } from '../../shared/Logger';
import type { HeuristicResult } from '../../shared/types';
import type { AddressClass } from '../../shared/net/addressPolicy';
import { decideLlmDestination, type LlmEgressOperation, type LlmTarget } from './llmDestinationPolicy';
import type { LlmEgressAuthorizer } from './llmEgressAuthorizer';
import { createLlmHttp, type LlmHttpFn } from './llmTransport';

export interface LlmClientOptions {
    /** What this client sends; approvals are per operation. Default: Sentinel file analysis. */
    operation?: LlmEgressOperation;
    /** Absent (tests, headless, the ACP proxy): every non-loopback destination is refused. */
    authorizer?: LlmEgressAuthorizer;
    http?: LlmHttpFn;
}

interface Approved { target: LlmTarget; addresses: AddressClass }

export class LLMClient {
    private readonly logger: Logger;
    private readonly operation: LlmEgressOperation;
    private readonly authorizer: LlmEgressAuthorizer | undefined;
    private readonly http: LlmHttpFn;

    constructor(
        private readonly configProvider: IConfigProvider,
        options: LlmClientOptions = {},
    ) {
        this.logger = new Logger('LLMClient');
        this.operation = options.operation ?? 'sentinel-file-analysis';
        this.authorizer = options.authorizer;
        this.http = options.http ?? createLlmHttp();
    }

    /**
     * Check if the LLM server is reachable at the configured endpoint.
     * Returns true if the server responds with an OK status. Never prompts
     * unless `ask` is set (a user action, not activation).
     */
    async checkAvailability(options: { ask?: boolean } = {}): Promise<boolean> {
        const approved = await this.destination(options.ask === true);
        if (!approved) {
            return false;
        }
        try {
            const response = await this.http({ ...approved, path: '/api/tags', method: 'GET', timeoutMs: 2000 });
            const available = response.status >= 200 && response.status < 300;
            if (available) {
                this.logger.info('LLM available at ' + approved.target.origin);
            }
            return available;
        } catch {
            return false;
        }
    }

    /**
     * Ask the operator to approve the current endpoint when it needs it.
     * Sends nothing; false for loopback, refused or already-declined endpoints.
     */
    async requestAuthorization(): Promise<boolean> {
        try {
            const config = this.configProvider.getConfig();
            const decision = decideLlmDestination(config.sentinel.ollamaEndpoint, config.sentinel.ollamaEndpointSource);
            if (decision.kind !== 'needs-authorization' || !this.authorizer) {
                return false;
            }
            return await this.authorizer.authorize(
                { origin: decision.target.origin, operation: this.operation, model: config.sentinel.localModel },
                { ask: true },
            );
        } catch {
            return false;
        }
    }

    /**
     * Build the analysis prompt for the LLM from file and heuristic data.
     */
    buildPrompt(
        filePath: string,
        content: string | undefined,
        heuristicResults: HeuristicResult[]
    ): string {
        const matchedFlags = heuristicResults
            .filter(r => r.matched)
            .map(r => r.patternId)
            .join(', ');

        return `Analyze this code for security vulnerabilities, logic errors, and best practices violations.

File: ${filePath}
Heuristic Flags: ${matchedFlags}

Code:
\`\`\`
${content?.substring(0, 2000) || 'File not readable'}
\`\`\`

Respond with:
1. Risk assessment (L1/L2/L3)
2. Issues found (if any)
3. Confidence (0-1)`;
    }

    /**
     * Send a prompt to the LLM endpoint and return the raw response text.
     * Throws on a refused destination, network or timeout errors. Never
     * prompts: a destination that needs approval must already have one.
     */
    async callEndpoint(prompt: string, timeoutMs = 5000): Promise<{ response: string; totalDuration: number }> {
        const approved = await this.destination(false);
        if (!approved) {
            throw new Error('LLM destination refused');
        }
        const model = this.configProvider.getConfig().sentinel.localModel;

        const httpResponse = await this.http({
            ...approved,
            path: '/api/generate',
            method: 'POST',
            body: JSON.stringify({
                model,
                prompt,
                stream: false
            }),
            timeoutMs,
        });

        if (httpResponse.status < 200 || httpResponse.status >= 300) {
            throw new Error(`LLM endpoint returned ${httpResponse.status}`);
        }

        const result = JSON.parse(httpResponse.body) as {
            response?: string;
            total_duration?: number;
        };

        return {
            response: result.response || '',
            totalDuration: result.total_duration || 0
        };
    }

    /** The target this call may use, re-read from the configuration every time; null when refused. */
    private async destination(ask: boolean): Promise<Approved | null> {
        let origin: string | undefined;
        try {
            const config = this.configProvider.getConfig();
            const decision = decideLlmDestination(config.sentinel.ollamaEndpoint, config.sentinel.ollamaEndpointSource);
            if (decision.kind === 'refused') {
                this.logger.warn('LLM destination refused', { operation: this.operation, reason: decision.reason });
                return null;
            }
            origin = decision.target.origin;
            if (decision.kind === 'loopback') {
                return { target: decision.target, addresses: 'loopback' };
            }
            const allowed = !!this.authorizer && await this.authorizer.authorize(
                { origin, operation: this.operation, model: config.sentinel.localModel },
                { ask },
            );
            if (!allowed) {
                this.logger.warn('LLM destination refused', { operation: this.operation, origin, reason: 'not approved for this operation' });
                return null;
            }
            return { target: decision.target, addresses: 'public' };
        } catch (error) {
            this.logger.warn('LLM destination refused', { operation: this.operation, origin, reason: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
}
