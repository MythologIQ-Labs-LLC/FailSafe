/**
 * VerdictEngine - Verdict Generation & Action Dispatch
 *
 * Combines heuristic results and LLM evaluation to produce
 * final verdicts and trigger appropriate actions.
 */

import * as crypto from 'crypto';
import {
    SentinelVerdict,
    SentinelEvent,
    VerdictDecision,
    HeuristicResult,
    LLMEvaluation,
    VerdictAction,
    RiskGrade
} from '../../shared/types';
import { TrustEngine } from '../../qorelogic/trust/TrustEngine';
import { PolicyEngine } from '../../qorelogic/policies/PolicyEngine';
import { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { ShadowGenomeManager } from '../../qorelogic/shadow/ShadowGenomeManager';
import { ArtifactHasher } from '../../governance/ArtifactHasher';

export class VerdictEngine {
    private trustEngine: TrustEngine;
    private policyEngine: PolicyEngine;
    private ledgerManager: LedgerManager;
    private shadowGenomeManager?: ShadowGenomeManager;
    private artifactHasher = new ArtifactHasher();

    constructor(
        trustEngine: TrustEngine,
        policyEngine: PolicyEngine,
        ledgerManager: LedgerManager,
        shadowGenomeManager?: ShadowGenomeManager
    ) {
        this.trustEngine = trustEngine;
        this.policyEngine = policyEngine;
        this.ledgerManager = ledgerManager;
        this.shadowGenomeManager = shadowGenomeManager;
    }

    /**
     * Generate a verdict from analysis results
     */
    async generateVerdict(
        event: SentinelEvent,
        filePath: string,
        heuristicResults: HeuristicResult[],
        llmEvaluation?: LLMEvaluation,
        forceDecision?: VerdictDecision,
        forceSummary?: string,
        // FX933: caller's already-read content; see computeArtifactHash.
        fileContent?: string
    ): Promise<SentinelVerdict> {
        // Determine risk grade
        const riskGrade = this.policyEngine.classifyRisk(filePath);

        // Calculate confidence
        const confidence = this.calculateConfidence(heuristicResults, llmEvaluation);

        // Get matched patterns
        const matchedPatterns = heuristicResults
            .filter(r => r.matched)
            .map(r => r.patternId);

        // Determine decision. FX297 FIX: callers with no heuristic evidence to
        // grade (e.g. a malformed event payload) must be able to force a
        // non-PASS decision instead of falling through determineDecision's
        // default-to-PASS-on-no-evidence branch.
        const decision = forceDecision ?? this.determineDecision(
            riskGrade,
            heuristicResults,
            llmEvaluation,
            confidence
        );

        // Generate summary
        const summary = forceSummary ?? this.generateSummary(decision, matchedPatterns, riskGrade);

        // Generate details
        const details = this.generateDetails(heuristicResults, llmEvaluation);

        // Get agent info (default to system agent for file watcher events)
        const payloadAgentDid = (event.payload as { agentDid?: unknown }).agentDid;
        const agentDid = typeof payloadAgentDid === 'string'
            ? payloadAgentDid
            : 'did:myth:system:watcher';
        const trustScore = this.trustEngine.getTrustScore(agentDid);
        const artifactHash = this.computeArtifactHash(filePath, fileContent);

        // Create verdict
        const verdict: SentinelVerdict = {
            id: crypto.randomUUID(),
            eventId: event.id,
            timestamp: new Date().toISOString(),
            decision,
            riskGrade,
            confidence,
            heuristicResults,
            llmEvaluation,
            agentDid,
            agentTrustAtVerdict: trustScore?.score || 0.35,
            artifactPath: filePath,
            artifactHash,
            summary,
            details,
            matchedPatterns,
            actions: []
        };

        // Execute actions
        verdict.actions = await this.executeActions(verdict);

        return verdict;
    }

    /**
     * FX933 (FailSafe#367 tranche 3a): hash the caller's already-read file
     * content -- never a second disk read here (this repo has been burned by
     * exactly that class of redundant re-read/re-parse before, see #233).
     * Stays undefined whenever the caller has no content to offer:
     * FILE_DELETED events, oversized-file skips, the malformed-path fallback
     * ('unknown'), and AGENT_CLAIM existence checks ('claim_manifest').
     */
    private computeArtifactHash(filePath: string, fileContent?: string): string | undefined {
        if (fileContent === undefined) return undefined;
        return this.artifactHasher.hashArtifact(filePath, Buffer.from(fileContent, 'utf8')).hash;
    }

    /**
     * Calculate overall confidence
     */
    private calculateConfidence(
        heuristicResults: HeuristicResult[],
        llmEvaluation?: LLMEvaluation
    ): number {
        // Base confidence from heuristic consistency
        const matchedCount = heuristicResults.filter(r => r.matched).length;
        const totalCount = heuristicResults.length;
        const heuristicConfidence = totalCount > 0 ? 1 - (matchedCount / totalCount) * 0.3 : 0.8;

        // Incorporate LLM confidence if available
        if (llmEvaluation) {
            return (heuristicConfidence * 0.6) + (llmEvaluation.confidence * 0.4);
        }

        return heuristicConfidence;
    }

    /**
     * Determine the final decision
     */
    private determineDecision(
        riskGrade: RiskGrade,
        heuristicResults: HeuristicResult[],
        llmEvaluation?: LLMEvaluation,
        confidence?: number
    ): VerdictDecision {
        const criticalMatches = heuristicResults.filter(
            r => r.matched && r.severity === 'critical'
        );
        const highMatches = heuristicResults.filter(
            r => r.matched && r.severity === 'high'
        );
        const mediumMatches = heuristicResults.filter(
            r => r.matched && r.severity === 'medium'
        );

        // Critical issues always block
        if (criticalMatches.length > 0) {
            // L3 requires human approval for critical
            if (riskGrade === 'L3') {
                return 'ESCALATE';
            }
            return 'BLOCK';
        }

        // L3 always escalates for human review
        if (riskGrade === 'L3') {
            return 'ESCALATE';
        }

        // High issues block or warn based on risk grade
        if (highMatches.length > 0) {
            if (riskGrade === 'L2') {
                return 'BLOCK';
            }
            return 'WARN';
        }

        // Medium issues warn
        if (mediumMatches.length > 0) {
            return 'WARN';
        }

        // Low confidence might need review
        if (confidence && confidence < 0.5) {
            return 'WARN';
        }

        return 'PASS';
    }

    /**
     * Generate a human-readable summary
     */
    private generateSummary(
        decision: VerdictDecision,
        matchedPatterns: string[],
        riskGrade: RiskGrade
    ): string {
        switch (decision) {
            case 'PASS':
                return `File passed verification (${riskGrade})`;

            case 'WARN':
                return `${matchedPatterns.length} issue(s) detected - review recommended`;

            case 'BLOCK':
                return `Blocked: ${matchedPatterns.length} critical/high issue(s) found`;

            case 'ESCALATE':
                return `${riskGrade} file requires human approval`;

            case 'QUARANTINE':
                return `Agent quarantined due to repeated violations`;
        }
    }

    /**
     * Generate detailed explanation
     */
    private generateDetails(
        heuristicResults: HeuristicResult[],
        llmEvaluation?: LLMEvaluation
    ): string {
        const lines: string[] = [];

        // Heuristic findings
        const matched = heuristicResults.filter(r => r.matched);
        if (matched.length > 0) {
            lines.push('Heuristic Findings:');
            for (const result of matched) {
                let line = `  - ${result.patternId} (${result.severity})`;
                if (result.location) {
                    line += ` at line ${result.location.line}`;
                }
                lines.push(line);
            }
        }

        // LLM evaluation
        if (llmEvaluation) {
            lines.push('');
            lines.push('LLM Analysis:');
            lines.push(`  Model: ${llmEvaluation.model}`);
            lines.push(`  Confidence: ${(llmEvaluation.confidence * 100).toFixed(0)}%`);
            if (llmEvaluation.response) {
                lines.push(`  Summary: ${llmEvaluation.response.substring(0, 200)}...`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Execute actions based on verdict
     */
    private async executeActions(verdict: SentinelVerdict): Promise<VerdictAction[]> {
        const actions: VerdictAction[] = [];

        // Always log to ledger
        try {
            const entry = await this.ledgerManager.appendEntry({
                eventType: verdict.decision === 'PASS' ? 'AUDIT_PASS' : 'AUDIT_FAIL',
                agentDid: verdict.agentDid,
                agentTrustAtAction: verdict.agentTrustAtVerdict,
                artifactPath: verdict.artifactPath,
                artifactHash: verdict.artifactHash,
                riskGrade: verdict.riskGrade,
                verificationMethod: 'sentinel_heuristic',
                verificationResult: verdict.decision,
                sentinelConfidence: verdict.confidence,
                payload: {
                    matchedPatterns: verdict.matchedPatterns,
                    summary: verdict.summary
                }
            });

            actions.push({
                type: 'LOG',
                status: 'completed',
                details: `Logged to ledger entry #${entry.id}`
            });

            verdict.ledgerEntryId = entry.id;
        } catch (error) {
            actions.push({
                type: 'LOG',
                status: 'failed',
                details: `Failed to log: ${error}`
            });
        }

        // Update trust if not a system agent
        if (!verdict.agentDid.includes(':system:')) {
            try {
                const outcome = verdict.decision === 'PASS' ? 'success' :
                               verdict.decision === 'QUARANTINE' ? 'violation' : 'failure';
                await this.trustEngine.updateTrust(verdict.agentDid, outcome);

                actions.push({
                    type: 'TRUST_UPDATE',
                    status: 'completed',
                    details: `Trust updated for ${verdict.agentDid}`
                });
            } catch (error) {
                actions.push({
                    type: 'TRUST_UPDATE',
                    status: 'failed',
                    details: `Failed to update trust: ${error}`
                });
            }
        }

        // Archive to Shadow Genome for non-PASS verdicts
        if (verdict.decision !== 'PASS' && this.shadowGenomeManager) {
            try {
                const inputVector = verdict.artifactPath || 'unknown';
                const entry = await this.shadowGenomeManager.archiveFailure({
                    verdict,
                    inputVector,
                    decisionRationale: verdict.summary,
                    causalVector: verdict.details
                });

                actions.push({
                    type: 'SHADOW_ARCHIVE',
                    status: 'completed',
                    details: `Archived to Shadow Genome entry #${entry.id}`
                });
            } catch (error) {
                actions.push({
                    type: 'SHADOW_ARCHIVE',
                    status: 'failed',
                    details: `Failed to archive: ${error}`
                });
            }
        }

        // Handle escalation
        if (verdict.decision === 'ESCALATE') {
            actions.push({
                type: 'L3_QUEUE',
                status: 'pending',
                details: 'Queued for L3 approval'
            });
        }

        // Handle quarantine
        if (verdict.decision === 'QUARANTINE') {
            try {
                await this.trustEngine.quarantineAgent(
                    verdict.agentDid,
                    verdict.summary,
                    48
                );

                actions.push({
                    type: 'QUARANTINE',
                    status: 'completed',
                    details: 'Agent quarantined for 48 hours'
                });
            } catch (error) {
                actions.push({
                    type: 'QUARANTINE',
                    status: 'failed',
                    details: `Failed to quarantine: ${error}`
                });
            }
        }

        return actions;
    }
}
