/**
 * LedgerManager - SOA Ledger (Merkle-Chained Audit Trail)
 *
 * Manages the append-only, cryptographically-signed audit log
 * backed by SQLite.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { ISecretStore, IConfigProvider } from '../../core/interfaces';
import { LedgerEntry, LedgerEventType, RiskGrade } from '../../shared/types';
import { LedgerSchemaManager } from './LedgerSchemaManager';

type LedgerRow = {
    id: number;
    timestamp: string;
    event_type: LedgerEventType;
    agent_did: string;
    agent_trust_at_action: number | null;
    model_version: string | null;
    artifact_path: string | null;
    artifact_hash: string | null;
    risk_grade: RiskGrade | null;
    verification_method: string | null;
    verification_result: string | null;
    sentinel_confidence: number | null;
    overseer_did: string | null;
    overseer_decision: string | null;
    gdpr_trigger: number;
    payload: string | null;
    entry_hash: string;
    prev_hash: string;
    signature: string;
};

interface LedgerAppendRequest {
    eventType: LedgerEventType;
    agentDid: string;
    agentTrustAtAction?: number;
    modelVersion?: string;
    artifactPath?: string;
    artifactHash?: string;
    riskGrade?: RiskGrade;
    verificationMethod?: string;
    verificationResult?: string;
    sentinelConfidence?: number;
    overseerDid?: string;
    overseerDecision?: string;
    gdprTrigger?: boolean;
    payload?: Record<string, unknown>;
}

export class LedgerManager {
    private secretStore: ISecretStore;
    private configProvider: IConfigProvider;
    private ledgerPath: string = '';
    private db: Database.Database | undefined;
    private lastHash: string = 'GENESIS_HASH_PLACEHOLDER';
    private cachedSecret: string | undefined;
    private isDisabled: boolean = false;

    constructor(secretStore: ISecretStore, configProvider: IConfigProvider) {
        this.secretStore = secretStore;
        this.configProvider = configProvider;
    }

    async initialize(): Promise<void> {
        if (this.db) {
            try {
                this.db.close();
            } finally {
                this.db = undefined;
            }
        }

        // Initialize secret from secure storage (M1.5.3 Fix)
        // Note: secrets.get is async, so we must load it here first
        this.cachedSecret = await this.secretStore.get('ledgerSecret');
        if (!this.cachedSecret) {
            this.cachedSecret = await this.generateSecret();
        }

        this.ledgerPath = this.configProvider.getLedgerPath();
        const ledgerDir = path.dirname(this.ledgerPath);

        if (!fs.existsSync(ledgerDir)) {
            fs.mkdirSync(ledgerDir, { recursive: true });
        }

        try {
            this.db = new Database(this.ledgerPath);
            this.db.pragma('journal_mode = WAL');
            this.initSchema();
            // B77: Run schema migrations after base schema init
            const schemaManager = new LedgerSchemaManager(this.db);
            schemaManager.migrate();
            this.loadLastHash();
        } catch (error) {
            console.error('Failed to initialize Ledger DB - running in stub mode:', error);
            this.isDisabled = true;
            this.db = undefined;
            // Don't throw - allow extension to continue with degraded functionality
        }
    }


    private initSchema(): void {
        if (!this.db) { return; }

        const schema = `
        CREATE TABLE IF NOT EXISTS soa_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            event_type TEXT NOT NULL,
            agent_did TEXT NOT NULL,
            agent_trust_at_action REAL,
            model_version TEXT,
            artifact_path TEXT,
            artifact_hash TEXT,
            risk_grade TEXT,
            verification_method TEXT,
            verification_result TEXT,
            sentinel_confidence REAL,
            overseer_did TEXT,
            overseer_decision TEXT,
            gdpr_trigger INTEGER DEFAULT 0,
            payload TEXT,
            entry_hash TEXT NOT NULL UNIQUE,
            prev_hash TEXT NOT NULL,
            signature TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_soa_timestamp ON soa_ledger(timestamp);
        CREATE INDEX IF NOT EXISTS idx_soa_agent ON soa_ledger(agent_did);
        CREATE INDEX IF NOT EXISTS idx_soa_artifact ON soa_ledger(artifact_path);
        CREATE INDEX IF NOT EXISTS idx_soa_event_type ON soa_ledger(event_type);
        CREATE TABLE IF NOT EXISTS agent_trust (
            did TEXT PRIMARY KEY,
            persona TEXT NOT NULL,
            public_key TEXT NOT NULL,
            trust_score REAL NOT NULL,
            trust_stage TEXT NOT NULL,
            is_quarantined INTEGER NOT NULL DEFAULT 0,
            verifications_completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_agent_trust_persona ON agent_trust(persona);
        `;

        this.db.exec(schema);
        this.ensureAgentTrustVersionColumn();

        // Check if genesis block is needed
        const count = this.db.prepare('SELECT count(*) as c FROM soa_ledger').get() as { c: number };
        if (count.c === 0) {
            this.createGenesisEntry();
        }
    }

    private ensureAgentTrustVersionColumn(): void {
        if (!this.db) { return; }
        const columns = this.db.prepare("PRAGMA table_info('agent_trust')").all() as { name: string }[];
        const hasVersion = columns.some((column) => column.name === 'version');
        if (!hasVersion) {
            this.db.exec("ALTER TABLE agent_trust ADD COLUMN version INTEGER NOT NULL DEFAULT 0");
        }
    }

    private createGenesisEntry(): void {
        if (!this.db) { return; }

        const genesisSql = `
        INSERT INTO soa_ledger (
            timestamp, event_type, agent_did, payload,
            entry_hash, prev_hash, signature
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?
        )`;

        const timestamp = new Date().toISOString();
        const payloadObject = { message: 'SOA Ledger initialized' };
        const payload = JSON.stringify(payloadObject);
        const prevHash = this.calculateHash('GENESIS');

        const hashPayload = {
            timestamp,
            eventType: 'SYSTEM_EVENT',
            agentDid: 'did:myth:system:genesis',
            payload: payloadObject,
            prevHash
        };

        const entryHash = this.calculateHash(JSON.stringify(hashPayload));
        const signature = this.sign(entryHash);

        this.db.prepare(genesisSql).run(
            timestamp,
            'SYSTEM_EVENT',
            'did:myth:system:genesis',
            payload,
            entryHash,
            prevHash,
            signature
        );

        this.lastHash = entryHash;
    }

    private loadLastHash(): void {
        if (!this.db) { return; }
        const last = this.db.prepare('SELECT entry_hash FROM soa_ledger ORDER BY id DESC LIMIT 1').get() as { entry_hash: string } | undefined;
        if (last) {
            this.lastHash = last.entry_hash;
        }
    }

    /**
     * Append a new entry to the ledger
     */
    async appendEntry(request: LedgerAppendRequest): Promise<LedgerEntry> {
        if (this.isDisabled || !this.db) {
            // Return a stub entry instead of throwing
            return {
                id: 0,
                timestamp: new Date().toISOString(),
                eventType: request.eventType,
                agentDid: request.agentDid,
                agentTrustAtAction: request.agentTrustAtAction || 0,
                gdprTrigger: request.gdprTrigger || false,
                payload: request.payload || {},
                entryHash: 'STUB_DISABLED',
                prevHash: this.lastHash,
                signature: 'STUB_DISABLED'
            };
        }

        const timestamp = new Date().toISOString();
        const prevHash = this.lastHash;
        
        // Calculate hash
        const hashPayload = {
            timestamp,
            eventType: request.eventType,
            agentDid: request.agentDid,
            payload: request.payload,
            prevHash
        };
        
        const entryHash = this.calculateHash(JSON.stringify(hashPayload));
        const signature = this.sign(entryHash);

        const sql = `
        INSERT INTO soa_ledger (
            timestamp, event_type, agent_did, agent_trust_at_action,
            model_version, artifact_path, artifact_hash, risk_grade,
            verification_method, verification_result, sentinel_confidence,
            overseer_did, overseer_decision, gdpr_trigger, payload,
            entry_hash, prev_hash, signature
        ) VALUES (
            @timestamp, @eventType, @agentDid, @agentTrustAtAction,
            @modelVersion, @artifactPath, @artifactHash, @riskGrade,
            @verificationMethod, @verificationResult, @sentinelConfidence,
            @overseerDid, @overseerDecision, @gdprTrigger, @payload,
            @entryHash, @prevHash, @signature
        )`;

        const info = this.db.prepare(sql).run({
            timestamp,
            eventType: request.eventType,
            agentDid: request.agentDid,
            agentTrustAtAction: request.agentTrustAtAction || null,
            modelVersion: request.modelVersion || null,
            artifactPath: request.artifactPath || null,
            artifactHash: request.artifactHash || null,
            riskGrade: request.riskGrade || null,
            verificationMethod: request.verificationMethod || null,
            verificationResult: request.verificationResult || null,
            sentinelConfidence: request.sentinelConfidence || null,
            overseerDid: request.overseerDid || null,
            overseerDecision: request.overseerDecision || null,
            gdprTrigger: request.gdprTrigger ? 1 : 0,
            payload: request.payload ? JSON.stringify(request.payload) : null,
            entryHash,
            prevHash,
            signature
        });

        this.lastHash = entryHash;

        return {
            id: Number(info.lastInsertRowid),
            timestamp,
            eventType: request.eventType,
            agentDid: request.agentDid,
            agentTrustAtAction: request.agentTrustAtAction || 0,
            entryHash,
            prevHash,
            signature,
            payload: request.payload || {},
            gdprTrigger: !!request.gdprTrigger
        } as LedgerEntry;
    }

    /**
     * Get recent entries
     */
    async getRecentEntries(limit: number = 50): Promise<LedgerEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger ORDER BY id DESC LIMIT ?').all(limit) as LedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    /**
     * Get entries by event type
     */
    async getEntriesByType(eventType: LedgerEventType, limit: number = 50): Promise<LedgerEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger WHERE event_type = ? ORDER BY id DESC LIMIT ?').all(eventType, limit) as LedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    /**
     * Get entries by agent
     */
    async getEntriesByAgent(agentDid: string, limit: number = 50): Promise<LedgerEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger WHERE agent_did = ? ORDER BY id DESC LIMIT ?').all(agentDid, limit) as LedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    /**
     * Gap 4: Get a single entry by ID for verdict replay
     */
    async getEntryById(entryId: number): Promise<LedgerEntry | null> {
        if (!this.db) { return null; }
        const row = this.db.prepare('SELECT * FROM soa_ledger WHERE id = ?').get(entryId) as LedgerRow | undefined;
        return row ? this.mapRowToEntry(row) : null;
    }

    private mapRowToEntry(row: LedgerRow): LedgerEntry {
        return {
            id: row.id,
            timestamp: row.timestamp,
            eventType: row.event_type as LedgerEventType,
            agentDid: row.agent_did,
            agentTrustAtAction: row.agent_trust_at_action ?? 0,
            modelVersion: row.model_version ?? undefined,
            artifactPath: row.artifact_path ?? undefined,
            artifactHash: row.artifact_hash ?? undefined,
            riskGrade: row.risk_grade ?? undefined,
            verificationMethod: row.verification_method ?? undefined,
            verificationResult: row.verification_result ?? undefined,
            sentinelConfidence: row.sentinel_confidence ?? undefined,
            overseerDid: row.overseer_did ?? undefined,
            overseerDecision: row.overseer_decision ?? undefined,
            gdprTrigger: row.gdpr_trigger === 1,
            payload: row.payload ? JSON.parse(row.payload) as Record<string, unknown> : {},
            entryHash: row.entry_hash,
            prevHash: row.prev_hash,
            signature: row.signature
        };
    }

    private calculateHash(data: string): string {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private sign(hash: string): string {
        if (!this.cachedSecret) {
            throw new Error('Ledger secret not initialized');
        }
        return crypto.createHmac('sha256', this.cachedSecret).update(hash).digest('hex');
    }

    private async generateSecret(): Promise<string> {
        const secret = crypto.randomBytes(32).toString('hex');
        await this.secretStore.store('ledgerSecret', secret);
        return secret;
    }

    /**
     * Verify the integrity of the hash chain
     */
    verifyChain(): boolean {
        if (!this.db) { return false; }

        const rows = this.db.prepare('SELECT * FROM soa_ledger ORDER BY id ASC').all() as LedgerRow[];
        if (rows.length === 0) { return true; }

        if (!this.cachedSecret) {
            console.error('Ledger secret missing; cannot verify signatures');
            return false;
        }
        const secret = this.cachedSecret;

        for (let i = 0; i < rows.length; i++) {
            const current = rows[i];

            let payloadValue: unknown = undefined;
            if (current.payload) {
                try {
                    payloadValue = JSON.parse(current.payload);
                } catch (error) {
                    console.error(`Invalid payload JSON at ID ${current.id}`, error);
                    return false;
                }
            }

            const hashPayload = {
                timestamp: current.timestamp,
                eventType: current.event_type,
                agentDid: current.agent_did,
                payload: payloadValue,
                prevHash: current.prev_hash
            };

            const expectedHash = this.calculateHash(JSON.stringify(hashPayload));
            if (current.entry_hash !== expectedHash) {
                console.error(`Chain broken at ID ${current.id}: entryHash mismatch`);
                return false;
            }

            const expectedSignature = crypto.createHmac('sha256', secret).update(expectedHash).digest('hex');
            if (current.signature !== expectedSignature) {
                console.error(`Chain broken at ID ${current.id}: signature mismatch`);
                return false;
            }

            if (i > 0) {
                const previous = rows[i - 1];
                if (current.prev_hash !== previous.entry_hash) {
                    console.error(`Chain broken at ID ${current.id}: prevHash mismatch`);
                    return false;
                }
            }
        }

        return true;
    }

    getEntryCount(): number {
        if (!this.db) { return 0; }
        const res = this.db.prepare('SELECT count(*) as c FROM soa_ledger').get() as { c: number };
        return res.c;
    }
    
    close(): void {
        this.db?.close();
        this.db = undefined;
    }

    getDatabase(): Database.Database {
        if (!this.db) {
            throw new Error('Ledger DB not initialized');
        }
        return this.db;
    }

    /** Public accessor for the SQLite db file path. Returns the configured
     *  ledger path (set from `configProvider.getLedgerPath()` at initialize
     *  time; empty string before initialize). Used by WorkspaceMutationBus
     *  subscribers (HubSnapshotService chain-validity refresh, TrustEngine
     *  external-mutation refresh) to resolve the watch target. B192
     *  remediation (audit cycle 1 F2). */
    getLedgerPath(): string {
        return this.ledgerPath;
    }

    isAvailable(): boolean {
        return !this.isDisabled && !!this.db;
    }
}
