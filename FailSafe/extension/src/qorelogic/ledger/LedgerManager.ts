/**
 * LedgerManager - SOA Ledger (Merkle-Chained Audit Trail)
 *
 * Manages the append-only, cryptographically-signed audit log
 * backed by SQLite. New rows are sealed v3 over every column (LedgerSeal);
 * legacy v1/v2 rows are verified under their own version and never re-signed
 * (LedgerVerifier); the head is anchored in SecretStorage (LedgerAnchor).
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { ISecretStore, IConfigProvider } from '../../core/interfaces';
import { LedgerEntry, LedgerEventType, RiskGrade } from '../../shared/types';
import { LedgerSchemaManager } from './LedgerSchemaManager';
import { SoaLedgerRow } from './LedgerSeal';
import { EntryVerification, LedgerVerification, UNANCHORED_CONTEXT, entryVerification, verifyRows } from './LedgerVerifier';
import { RESERVED_DIDS, appendV3, readAllRows, rotateTable } from './LedgerWriter';
import { LedgerAnchor, STORE_TIMEOUT_MS, withTimeout } from './LedgerAnchor';

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
    private disabledReason: string | undefined;
    private anchor: LedgerAnchor | undefined;

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
                this.anchor = undefined;
            }
        }

        // Initialize secret from secure storage (M1.5.3 Fix)
        // Note: secrets.get is async, so we must load it here first
        // #473: bounded like every other SecretStorage call. A failed or timed-out read or store
        // runs the ledger in stub mode instead of failing activation (plan-v607-final-integration
        // LD9). A secret is generated only when the read answered with none: minting one after a
        // failed read would make every existing row fail verification.
        try {
            this.cachedSecret = await withTimeout(this.secretStore.get('ledgerSecret'), STORE_TIMEOUT_MS);
            if (!this.cachedSecret) {
                this.cachedSecret = await this.generateSecret();
            }
        } catch (error) {
            this.cachedSecret = undefined;
            this.isDisabled = true;
            const reason = error instanceof Error ? error.message : String(error);
            this.disabledReason = `ledger secret unavailable: ${reason}`;
            console.warn(`FailSafe: the ledger secret could not be read or stored (${reason}); running the ledger in stub mode.`);
            return;
        }

        this.ledgerPath = this.configProvider.getLedgerPath();
        const ledgerDir = path.dirname(this.ledgerPath);

        if (!fs.existsSync(ledgerDir)) {
            fs.mkdirSync(ledgerDir, { recursive: true });
        }

        try {
            this.db = new Database(this.ledgerPath);
            this.db.pragma('journal_mode = WAL');
            // A second window's IMMEDIATE append blocks this thread for up to 5 s.
            this.db.pragma('busy_timeout = 5000');
            this.initSchema();
            // B77: Run schema migrations after base schema init
            const schemaManager = new LedgerSchemaManager(this.db);
            schemaManager.migrate();
            // #473 LD12: the genesis is written by the anchor, after migrate()
            this.anchor = new LedgerAnchor({
                store: this.secretStore,
                db: this.db,
                secret: () => this.requireSecret(),
                ledgerPath: this.ledgerPath,
                workspaceRoot: this.configProvider.getWorkspaceRoot?.(),
            });
            await this.anchor.initialize();
            this.loadLastHash();
        } catch (error) {
            console.error('Failed to initialize Ledger DB - running in stub mode:', error);
            this.isDisabled = true;
            this.disabledReason = `ledger database unavailable: ${error instanceof Error ? error.message : String(error)}`;
            try { this.db?.close(); } catch { /* already closed */ }
            this.db = undefined;
            this.anchor = undefined;
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
    }

    private ensureAgentTrustVersionColumn(): void {
        if (!this.db) { return; }
        const columns = this.db.prepare("PRAGMA table_info('agent_trust')").all() as { name: string }[];
        const hasVersion = columns.some((column) => column.name === 'version');
        if (!hasVersion) {
            this.db.exec("ALTER TABLE agent_trust ADD COLUMN version INTEGER NOT NULL DEFAULT 0");
        }
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
        if (RESERVED_DIDS.includes(request.agentDid)) {
            throw new TypeError(`agentDid ${request.agentDid} is reserved for the ledger itself`);
        }

        // #473 v3: one IMMEDIATE transaction, prev from the DB head, every column sealed.
        const row = appendV3(this.db, this.requireSecret(), {
            timestamp: new Date().toISOString(),
            eventType: request.eventType,
            agentDid: request.agentDid,
            agentTrustAtAction: request.agentTrustAtAction,
            modelVersion: request.modelVersion,
            artifactPath: request.artifactPath,
            artifactHash: request.artifactHash,
            riskGrade: request.riskGrade,
            verificationMethod: request.verificationMethod,
            verificationResult: request.verificationResult,
            sentinelConfidence: request.sentinelConfidence,
            overseerDid: request.overseerDid,
            overseerDecision: request.overseerDecision,
            gdprTrigger: request.gdprTrigger,
            payload: request.payload,
        });

        this.lastHash = row.entry_hash;
        this.anchor?.onAppended(row);

        return {
            id: row.id,
            timestamp: row.timestamp,
            eventType: request.eventType,
            agentDid: request.agentDid,
            agentTrustAtAction: request.agentTrustAtAction || 0,
            entryHash: row.entry_hash,
            prevHash: row.prev_hash,
            signature: row.signature,
            payload: request.payload || {},
            gdprTrigger: !!request.gdprTrigger
        } as LedgerEntry;
    }

    /**
     * Get recent entries
     */
    async getRecentEntries(limit: number = 50): Promise<LedgerEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger ORDER BY id DESC LIMIT ?').all(limit) as SoaLedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    /**
     * Get entries by event type
     */
    async getEntriesByType(eventType: LedgerEventType, limit: number = 50): Promise<LedgerEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger WHERE event_type = ? ORDER BY id DESC LIMIT ?').all(eventType, limit) as SoaLedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    /**
     * Get entries by agent
     */
    async getEntriesByAgent(agentDid: string, limit: number = 50): Promise<LedgerEntry[]> {
        if (!this.db) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger WHERE agent_did = ? ORDER BY id DESC LIMIT ?').all(agentDid, limit) as SoaLedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    /**
     * Gap 4: Get a single entry by ID for verdict replay
     */
    async getEntryById(entryId: number): Promise<LedgerEntry | null> {
        if (!this.db) { return null; }
        const row = this.db.prepare('SELECT * FROM soa_ledger WHERE id = ?').get(entryId) as SoaLedgerRow | undefined;
        return row ? this.mapRowToEntry(row) : null;
    }

    /**
     * #532 part B: newest-first entries whose JSON payload text contains `value`. A prefilter
     * only: callers match the parsed payload exactly. A full page (`limit` rows) may hide more.
     */
    async findEntriesContaining(value: string, limit: number = 200): Promise<LedgerEntry[]> {
        if (!this.db || !value) { return []; }
        const rows = this.db.prepare('SELECT * FROM soa_ledger WHERE instr(payload, ?) > 0 ORDER BY id DESC LIMIT ?').all(value, limit) as SoaLedgerRow[];
        return rows.map(this.mapRowToEntry);
    }

    private mapRowToEntry(row: SoaLedgerRow): LedgerEntry {
        return {
            id: row.id,
            timestamp: row.timestamp,
            eventType: row.event_type as LedgerEventType,
            agentDid: row.agent_did,
            agentTrustAtAction: row.agent_trust_at_action ?? 0,
            modelVersion: row.model_version ?? undefined,
            artifactPath: row.artifact_path ?? undefined,
            artifactHash: row.artifact_hash ?? undefined,
            riskGrade: (row.risk_grade ?? undefined) as RiskGrade | undefined,
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

    private requireSecret(): string {
        if (!this.cachedSecret) {
            throw new Error('Ledger secret not initialized');
        }
        return this.cachedSecret;
    }

    private async generateSecret(): Promise<string> {
        const secret = crypto.randomBytes(32).toString('hex');
        await withTimeout(this.secretStore.store('ledgerSecret', secret), STORE_TIMEOUT_MS);
        return secret;
    }

    /**
     * Verify every row under its own seal version, the chain links, the
     * activation receipt and the cached anchor records. True only when nothing
     * failed; partial (legacy) coverage is reported by verifyLedger.
     */
    verifyChain(): boolean {
        if (!this.db) { return false; }
        return verifyRows(readAllRows(this.db), this.cachedSecret, this.anchor?.context() ?? UNANCHORED_CONTEXT).ok;
    }

    /** Full report against freshly re-read anchor records (#473 LD8). */
    async verifyLedger(timeoutMs: number = STORE_TIMEOUT_MS): Promise<LedgerVerification> {
        if (!this.db || !this.anchor) {
            const empty = verifyRows([], this.cachedSecret);
            return { ...empty, ok: false, sealScope: 'none', failures: [{ id: null, code: 'no-database', detail: 'Ledger DB not initialized' }] };
        }
        await this.anchor.flush(timeoutMs);
        const context = await this.anchor.reload();
        return verifyRows(readAllRows(this.db), this.cachedSecret, context);
    }

    async verifyEntry(entryId: number): Promise<EntryVerification> {
        const report = await this.verifyLedger();
        return entryVerification(report, this.db ? readAllRows(this.db) : [], entryId);
    }

    /** Resolves true once queued anchor stores have landed (false on timeout). */
    async flushAnchor(timeoutMs: number = STORE_TIMEOUT_MS): Promise<boolean> {
        return this.anchor ? this.anchor.flush(timeoutMs) : true;
    }

    /**
     * #473 LD13: retire the current soa_ledger rows into a file beside the
     * ledger and start a new ledger on the same open handle. Never repairs.
     */
    async startNewLedger(reason: string, options: { beforeSwap?: () => void; now?: Date } = {}): Promise<{ retiredFile: string; genesisId: number }> {
        if (!this.db || !this.anchor) {
            throw new Error('Ledger DB not initialized');
        }
        await this.anchor.flush();
        const report = await this.verifyLedger();
        const { genesis, retiredFile } = rotateTable(this.db, this.requireSecret(), {
            ledgerPath: this.ledgerPath,
            reason,
            supersededBinding: this.anchor.boundGenesis(),
            retiredVerification: { ok: report.ok, failureCount: report.failures.length },
            beforeSwap: options.beforeSwap,
            now: options.now,
        });
        this.lastHash = genesis.entry_hash;
        await this.anchor.completeRotation(genesis);
        return { retiredFile, genesisId: genesis.id };
    }

    getEntryCount(): number {
        if (!this.db) { return 0; }
        const res = this.db.prepare('SELECT count(*) as c FROM soa_ledger').get() as { c: number };
        return res.c;
    }

    close(): void {
        this.db?.close();
        this.db = undefined;
        this.anchor = undefined;
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

    /** Why the ledger runs in stub mode, or undefined when it is available or not yet initialized. */
    getDisabledReason(): string | undefined {
        return this.isDisabled ? this.disabledReason : undefined;
    }
}
