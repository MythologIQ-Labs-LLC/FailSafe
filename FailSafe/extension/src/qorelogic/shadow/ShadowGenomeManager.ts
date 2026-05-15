/**
 * ShadowGenomeManager - Failure Archival & Learning System
 *
 * Archives agent failures (verdicts where decision != PASS) with:
 * - Causal vectors identifying root causes
 * - Environmental context at time of failure
 * - Negative constraints for future avoidance
 * - Remediation tracking for learning cycles
 * - P0 Security Hardening (Phase 3):
 *   - DID hash derivation
 *   - Signature verification protocol
 *   - Persona assignment restriction
 *   - Schema versioning
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { IConfigProvider } from '../../core/interfaces';
import { LedgerManager } from '../ledger/LedgerManager';
import {
    ShadowGenomeEntry,
    FailureMode,
    RemediationStatus,
    SentinelVerdict,
    PersonaType
} from '../../shared/types';
import {
    verifySignature,
    SignedData,
    checkPersonaAssignmentRestriction
} from '../../shared/utils/security';
import {
    SchemaVersionManager,
    SHADOW_GENOME_V1_DDL,
    MigrationResult
} from './SchemaVersionManager';
import type { EventBus } from '../../shared/EventBus';

interface ArchiveRequest {
    verdict: SentinelVerdict;
    inputVector: string;
    decisionRationale?: string;
    environmentContext?: string;
    causalVector?: string;
}

export interface FailurePattern {
    failureMode: FailureMode;
    count: number;
    agentDids: string[];
    recentCauses: string[];
}

type ShadowGenomeRow = {
    id: number;
    created_at: string;
    updated_at: string | null;
    ledger_ref: number | null;
    agent_did: string;
    input_vector: string;
    decision_rationale: string | null;
    environment_context: string | null;
    failure_mode: FailureMode;
    causal_vector: string | null;
    negative_constraint: string | null;
    remediation_status: RemediationStatus;
    remediation_notes: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    did_hash?: string | null;
    signature?: string | null;
    signature_timestamp?: string | null;
    created_by?: string | null;
    updated_by?: string | null;
};

export class ShadowGenomeManager {
    private configProvider: IConfigProvider;
    private ledgerManager: LedgerManager;
    private db: Database.Database | undefined;
    private dbPath: string = '';
    private schemaVersionManager: SchemaVersionManager | undefined;
    private enableSecurityHardening: boolean = true;

    constructor(
        configProvider: IConfigProvider,
        ledgerManager: LedgerManager,
        private eventBus?: EventBus,
    ) {
        this.configProvider = configProvider;
        this.ledgerManager = ledgerManager;
    }

    async initialize(): Promise<void> {
        if (this.db) {
            try {
                this.db.close();
            } finally {
                this.db = undefined;
            }
        }

        const failsafeDir = this.configProvider.getFailSafeDir();
        this.dbPath = path.join(failsafeDir, 'ledger', 'shadow_genome.db');

        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        try {
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            
            // Initialize schema versioning system
            this.schemaVersionManager = new SchemaVersionManager(this.db);
            this.schemaVersionManager.initialize();

            // B200 fix: create shadow_genome BEFORE running migrations so
            // ALTER-COLUMN migrations (1.1.0 security columns, 1.2.0 audit
            // columns) succeed on first init. Previously initSchema() ran
            // AFTER migrate(), causing ALTER to fail silently against a
            // missing table — security columns appeared only on the second
            // session init. See B200 / META_LEDGER #313 carried-forward.
            this.initSchema();

            // Validate schema version on init
            this.schemaVersionManager.validateOnInit();

            // Apply pending migrations
            const migrationResults = this.schemaVersionManager.migrate();
            if (migrationResults.length > 0) {
                console.log(`Shadow Genome: Applied ${migrationResults.length} migration(s)`);
                migrationResults.forEach(result => {
                    if (result.success) {
                        console.log(`  - ${result.version}: ${result.direction}`);
                    } else {
                        console.error(`  - ${result.version} failed: ${result.error}`);
                    }
                });
            }
            
            // Log schema status
            const status = this.schemaVersionManager.getStatus();
            console.log(`Shadow Genome: Schema status - Version: ${status.currentVersion || 'none'}, ` +
                       `Latest: ${status.latestVersion}, Pending: ${status.pendingMigrations}, ` +
                       `Integrity: ${status.integrityValid ? 'valid' : 'invalid'}`);
            
        } catch (error) {
            console.error('Failed to initialize ShadowGenome DB - running in stub mode:', error);
            // Don't throw - allow extension to continue with degraded functionality
        }
    }

    private initSchema(): void {
        if (!this.db) { return; }

        // Use the versioned schema DDL
        this.db.exec(SHADOW_GENOME_V1_DDL);
    }

    /**
     * Archive a failed verdict to the Shadow Genome
     */
    async archiveFailure(request: ArchiveRequest): Promise<ShadowGenomeEntry> {
        if (!this.db) { throw new Error('ShadowGenome DB not initialized'); }

        const { verdict, inputVector, decisionRationale, environmentContext, causalVector } = request;

        // P0 Security: Validate agent persona before archiving
        if (this.enableSecurityHardening) {
            const personaValidation = this.validateAgentPersonaForArchive(verdict.agentDid);
            if (!personaValidation.valid) {
                throw new Error(`Persona validation failed: ${personaValidation.reason}`);
            }
        }

        // Determine failure mode from verdict patterns
        const failureMode = this.classifyFailureMode(verdict);

        // Generate negative constraint from failure analysis
        const negativeConstraint = this.generateNegativeConstraint(verdict, failureMode);

        // P0 Security: Derive DID hash
        let didHash: string | undefined;
        if (this.enableSecurityHardening) {
            didHash = this.deriveDIDHashFromAgent(verdict.agentDid);
        }

        // P0 Security: Verify signature if provided
        let signature: string | undefined;
        let signatureTimestamp: string | undefined;
        if (this.enableSecurityHardening && verdict.signature) {
            const signatureResult = this.verifyVerdictSignature(verdict);
            if (signatureResult.valid) {
                signature = verdict.signature;
                signatureTimestamp = new Date().toISOString();
            } else {
                console.warn(`Signature verification failed for ${verdict.agentDid}: ${signatureResult.error}`);
            }
        }

        const sql = `
        INSERT INTO shadow_genome (
            created_at, ledger_ref, agent_did, input_vector,
            decision_rationale, environment_context, failure_mode,
            causal_vector, negative_constraint, remediation_status,
            did_hash, signature, signature_timestamp
        ) VALUES (
            @createdAt, @ledgerRef, @agentDid, @inputVector,
            @decisionRationale, @environmentContext, @failureMode,
            @causalVector, @negativeConstraint, @remediationStatus,
            @didHash, @signature, @signatureTimestamp
        )`;

        const createdAt = new Date().toISOString();
        const info = this.db.prepare(sql).run({
            createdAt,
            ledgerRef: verdict.ledgerEntryId || null,
            agentDid: verdict.agentDid,
            inputVector,
            decisionRationale: decisionRationale || verdict.summary,
            environmentContext: environmentContext || null,
            failureMode,
            causalVector: causalVector || verdict.details,
            negativeConstraint,
            remediationStatus: 'UNRESOLVED',
            didHash: didHash || null,
            signature: signature || null,
            signatureTimestamp: signatureTimestamp || null
        });

        const entry: ShadowGenomeEntry = {
            schemaVersion: this.schemaVersionManager?.getCurrentVersion() || '1.0.0',
            id: Number(info.lastInsertRowid),
            createdAt,
            ledgerRef: verdict.ledgerEntryId,
            agentDid: verdict.agentDid,
            inputVector,
            decisionRationale: decisionRationale || verdict.summary,
            environmentContext,
            failureMode,
            causalVector: causalVector || verdict.details,
            negativeConstraint,
            remediationStatus: 'UNRESOLVED'
        };

        this.eventBus?.emit('genome.failureArchived', {
            failureMode: entry.failureMode,
            agentDid: entry.agentDid,
            entryId: entry.id,
        });

        return entry;
    }

    /**
     * Classify the failure mode from verdict patterns
     */
    private classifyFailureMode(verdict: SentinelVerdict): FailureMode {
        const patterns = verdict.matchedPatterns;

        // Map pattern categories to failure modes
        for (const pattern of patterns) {
            if (pattern.includes('injection') || pattern.includes('xss') || pattern.includes('sql')) {
                return 'INJECTION_VULNERABILITY';
            }
            if (pattern.includes('secret') || pattern.includes('api_key') || pattern.includes('credential')) {
                return 'SECRET_EXPOSURE';
            }
            if (pattern.includes('pii') || pattern.includes('personal')) {
                return 'PII_LEAK';
            }
            if (pattern.includes('complex') || pattern.includes('cyclomatic')) {
                return 'HIGH_COMPLEXITY';
            }
            if (pattern.includes('logic') || pattern.includes('spec')) {
                return 'LOGIC_ERROR';
            }
            if (pattern.includes('dependency') || pattern.includes('import')) {
                return 'DEPENDENCY_CONFLICT';
            }
        }

        // Check verdict decision for additional context
        if (verdict.decision === 'QUARANTINE') {
            return 'TRUST_VIOLATION';
        }

        // Check LLM evaluation if available
        if (verdict.llmEvaluation?.response) {
            const response = verdict.llmEvaluation.response.toLowerCase();
            if (response.includes('hallucin')) {
                return 'HALLUCINATION';
            }
            if (response.includes('spec') || response.includes('requirement')) {
                return 'SPEC_VIOLATION';
            }
        }

        return 'OTHER';
    }

    /**
     * Generate a negative constraint from failure analysis
     */
    private generateNegativeConstraint(verdict: SentinelVerdict, failureMode: FailureMode): string {
        const constraints: string[] = [];

        switch (failureMode) {
            case 'INJECTION_VULNERABILITY':
                constraints.push('AVOID: Unsanitized user input in SQL/command execution');
                constraints.push('REQUIRE: Input validation and parameterized queries');
                break;
            case 'SECRET_EXPOSURE':
                constraints.push('AVOID: Hardcoded secrets, API keys, or credentials');
                constraints.push('REQUIRE: Environment variables or secure vault access');
                break;
            case 'PII_LEAK':
                constraints.push('AVOID: Logging or exposing personally identifiable information');
                constraints.push('REQUIRE: PII masking and access controls');
                break;
            case 'HIGH_COMPLEXITY':
                constraints.push('AVOID: Functions exceeding complexity thresholds');
                constraints.push('REQUIRE: Code decomposition and single responsibility');
                break;
            case 'HALLUCINATION':
                constraints.push('AVOID: Generated code without grounding in codebase context');
                constraints.push('REQUIRE: Citation of existing patterns or explicit novelty declaration');
                break;
            case 'LOGIC_ERROR':
                constraints.push('AVOID: Unverified logical assumptions');
                constraints.push('REQUIRE: Test coverage for edge cases');
                break;
            case 'SPEC_VIOLATION':
                constraints.push('AVOID: Deviation from documented specifications');
                constraints.push('REQUIRE: Spec compliance verification before commit');
                break;
            case 'DEPENDENCY_CONFLICT':
                constraints.push('AVOID: Unvetted external dependencies');
                constraints.push('REQUIRE: Dependency audit and version pinning');
                break;
            case 'TRUST_VIOLATION':
                constraints.push('AVOID: Repeated failures within probationary period');
                constraints.push('REQUIRE: Human review for sensitive operations');
                break;
            default:
                constraints.push(`AVOID: ${verdict.summary}`);
        }

        return constraints.join('\n');
    }

    /**
     * Get entries by agent DID
     */
    async getEntriesByAgent(agentDid: string, limit: number = 50): Promise<ShadowGenomeEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare(
            'SELECT * FROM shadow_genome WHERE agent_did = ? ORDER BY id DESC LIMIT ?'
        ).all(agentDid, limit) as ShadowGenomeRow[];
        return rows.map(row => this.mapRowToEntry(row));
    }

    /**
     * Get entries by failure mode
     */
    async getEntriesByFailureMode(mode: FailureMode, limit: number = 50): Promise<ShadowGenomeEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare(
            'SELECT * FROM shadow_genome WHERE failure_mode = ? ORDER BY id DESC LIMIT ?'
        ).all(mode, limit) as ShadowGenomeRow[];
        return rows.map(row => this.mapRowToEntry(row));
    }

    /**
     * Get unresolved entries
     */
    async getUnresolvedEntries(limit: number = 100): Promise<ShadowGenomeEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare(
            'SELECT * FROM shadow_genome WHERE remediation_status = ? ORDER BY created_at ASC LIMIT ?'
        ).all('UNRESOLVED', limit) as ShadowGenomeRow[];
        return rows.map(row => this.mapRowToEntry(row));
    }

    /**
     * Update remediation status
     */
    async updateRemediationStatus(
        entryId: number,
        status: RemediationStatus,
        notes?: string,
        resolvedBy?: string
    ): Promise<void> {
        if (!this.db) { throw new Error('ShadowGenome DB not initialized'); }

        const now = new Date().toISOString();
        const isResolved = status === 'RESOLVED' || status === 'WONT_FIX' || status === 'SUPERSEDED';

        this.db.prepare(`
            UPDATE shadow_genome SET
                updated_at = @updatedAt,
                remediation_status = @status,
                remediation_notes = COALESCE(@notes, remediation_notes),
                resolved_at = CASE WHEN @isResolved THEN @resolvedAt ELSE resolved_at END,
                resolved_by = CASE WHEN @isResolved THEN @resolvedBy ELSE resolved_by END
            WHERE id = @id
        `).run({
            id: entryId,
            updatedAt: now,
            status,
            notes: notes || null,
            isResolved: isResolved ? 1 : 0,
            resolvedAt: now,
            resolvedBy: resolvedBy || null
        });
    }

    /**
     * Analyze failure patterns for learning
     */
    async analyzeFailurePatterns(): Promise<FailurePattern[]> {
        if (!this.db) { return []; }

        const rows = this.db.prepare(`
            SELECT
                failure_mode,
                COUNT(*) as count,
                GROUP_CONCAT(DISTINCT agent_did) as agent_dids,
                GROUP_CONCAT(causal_vector, '|||') as causes
            FROM shadow_genome
            WHERE remediation_status = 'UNRESOLVED'
            GROUP BY failure_mode
            ORDER BY count DESC
        `).all() as Array<{ failure_mode: FailureMode; count: number; agent_dids: string | null; causes: string | null }>;

        return rows.map(row => ({
            failureMode: row.failure_mode as FailureMode,
            count: row.count,
            agentDids: row.agent_dids ? row.agent_dids.split(',') : [],
            recentCauses: row.causes ? row.causes.split('|||').slice(0, 3) : []
        }));
    }

    /**
     * Analyze all failure patterns regardless of status (B183).
     * Returns patterns grouped by failure_mode AND remediation_status.
     */
    async analyzeAllPatterns(): Promise<(FailurePattern & { remediationStatus: RemediationStatus })[]> {
        if (!this.db) { return []; }

        const rows = this.db.prepare(`
            SELECT
                failure_mode,
                remediation_status,
                COUNT(*) as count,
                GROUP_CONCAT(DISTINCT agent_did) as agent_dids,
                GROUP_CONCAT(causal_vector, '|||') as causes
            FROM shadow_genome
            GROUP BY failure_mode, remediation_status
            ORDER BY count DESC
        `).all() as Array<{
            failure_mode: FailureMode;
            remediation_status: RemediationStatus;
            count: number;
            agent_dids: string | null;
            causes: string | null;
        }>;

        return rows.map(row => ({
            failureMode: row.failure_mode,
            count: row.count,
            agentDids: row.agent_dids ? row.agent_dids.split(',') : [],
            recentCauses: row.causes ? row.causes.split('|||').slice(0, 3) : [],
            remediationStatus: row.remediation_status,
        }));
    }

    /**
     * Get negative constraints for an agent (for learning injection)
     */
    async getNegativeConstraintsForAgent(agentDid: string): Promise<string[]> {
        if (!this.db) { return []; }

        const rows = this.db.prepare(`
            SELECT DISTINCT negative_constraint
            FROM shadow_genome
            WHERE agent_did = ? AND negative_constraint IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 10
        `).all(agentDid) as { negative_constraint: string }[];

        return rows.map(r => r.negative_constraint);
    }

    /**
     * Get total failure count
     */
    getEntryCount(): number {
        if (!this.db) { return 0; }
        const res = this.db.prepare('SELECT count(*) as c FROM shadow_genome').get() as { c: number };
        return res.c;
    }

    /**
     * P0 Security: Validate agent persona for archive operation
     */
    private validateAgentPersonaForArchive(agentDid: string): { valid: boolean; reason?: string } {
        try {
            // Extract persona from DID
            const persona = this.extractPersonaFromDID(agentDid);
            
            if (!persona) {
                return {
                    valid: false,
                    reason: `Invalid DID format: ${agentDid}`
                };
            }
            
            // Validate persona assignment restriction
            const restriction = checkPersonaAssignmentRestriction(agentDid, persona);
            
            if (!restriction.allowed) {
                return {
                    valid: false,
                    reason: restriction.reason
                };
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                reason: `Validation error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * P0 Security: Derive DID hash from agent DID
     */
    private deriveDIDHashFromAgent(agentDid: string): string {
        try {
            // Extract persona from DID
            const persona = this.extractPersonaFromDID(agentDid);
            
            if (!persona) {
                throw new Error(`Invalid DID format: ${agentDid}`);
            }
            
            // For DID hash derivation, we need the persona and a public key
            // Since we only have the DID, we'll derive a hash from the DID itself
            // In a real implementation, this would use the agent's registered public key
            const hash = crypto.createHash('sha256')
                .update(agentDid)
                .digest('hex')
                .substring(0, 32);
            
            return hash;
            
        } catch (error) {
            console.error('Failed to derive DID hash:', error);
            throw error;
        }
    }

    /**
     * P0 Security: Verify verdict signature
     */
    private verifyVerdictSignature(verdict: SentinelVerdict): { valid: boolean; error?: string } {
        try {
            if (!verdict.signature || !verdict.publicKey) {
                return { valid: false, error: 'Missing signature or public key' };
            }

            const signedPayload = { ...verdict };
            delete (signedPayload as Partial<SentinelVerdict>).signature;
            delete (signedPayload as Partial<SentinelVerdict>).signatureTimestamp;
            delete (signedPayload as Partial<SentinelVerdict>).publicKey;

            const signedData: SignedData = {
                data: JSON.stringify(signedPayload),
                signature: verdict.signature,
                publicKey: verdict.publicKey,
                timestamp: verdict.signatureTimestamp || verdict.timestamp
            };

            const result = verifySignature(signedData);
            if (!result.valid) {
                return { valid: false, error: result.error };
            }

            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                error: `Signature verification error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Extract persona from DID
     */
    private extractPersonaFromDID(did: string): PersonaType | null {
        const match = did.match(/^did:myth:(scrivener|sentinel|judge|overseer):[a-f0-9]+$/);
        return match ? (match[1] as PersonaType) : null;
    }

    /**
     * Get schema version status
     */
    getSchemaStatus(): {
        currentVersion: string | null;
        latestVersion: string;
        pendingMigrations: number;
        integrityValid: boolean;
    } | null {
        if (!this.schemaVersionManager) {
            return null;
        }
        return this.schemaVersionManager.getStatus();
    }

    /**
     * Migrate schema to latest version
     */
    migrateSchema(): MigrationResult[] {
        if (!this.schemaVersionManager) {
            throw new Error('Schema version manager not initialized');
        }
        return this.schemaVersionManager.migrate();
    }

    private mapRowToEntry(row: ShadowGenomeRow): ShadowGenomeEntry {
        return {
            schemaVersion: this.schemaVersionManager?.getCurrentVersion() || '1.0.0',
            id: row.id,
            createdAt: row.created_at,
            updatedAt: row.updated_at || undefined,
            ledgerRef: row.ledger_ref || undefined,
            agentDid: row.agent_did,
            inputVector: row.input_vector,
            decisionRationale: row.decision_rationale || undefined,
            environmentContext: row.environment_context || undefined,
            failureMode: row.failure_mode as FailureMode,
            causalVector: row.causal_vector || undefined,
            negativeConstraint: row.negative_constraint || undefined,
            remediationStatus: row.remediation_status as RemediationStatus,
            remediationNotes: row.remediation_notes || undefined,
            resolvedAt: row.resolved_at || undefined,
            resolvedBy: row.resolved_by || undefined
        };
    }

    close(): void {
        this.db?.close();
        this.db = undefined;
    }
}
