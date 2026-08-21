/**
 * SchemaVersionManager - Shadow Genome Schema Versioning System
 *
 * Provides:
 * - Schema version tracking (schema_version table DDL)
 * - Version check on initialization
 * - Migration framework for schema updates
 * - Rollback support
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export type MigrationDirection = 'up' | 'down';

export interface SchemaVersion {
    id: number;
    version: string;
    applied_at: string;
    checksum: string;
    description: string;
}

export interface Migration {
    version: string;
    description: string;
    up: (db: Database.Database) => void;
    down: (db: Database.Database) => void;
    checksum: string;
}

export interface MigrationResult {
    success: boolean;
    version: string;
    direction: MigrationDirection;
    error?: string;
}

/**
 * Thrown by validateOnInit() specifically when the database's recorded
 * schema version is newer than this runtime's latest known migration
 * (a forward-written schema from a newer FailSafe version). Distinct from
 * a generic integrity-check failure so callers can tell "database is from
 * the future" apart from "database is corrupted."
 */
export class UnsupportedShadowGenomeSchemaError extends Error {
    constructor(
        public readonly currentVersion: string,
        public readonly latestVersion: string
    ) {
        super(
            `Shadow Genome schema version ${currentVersion} is newer than ` +
            `supported version ${latestVersion}. Please upgrade FailSafe extension.`
        );
        this.name = 'UnsupportedShadowGenomeSchemaError';
    }
}

type SchemaVersionRow = {
    id: number;
    version: string;
    applied_at: string;
    checksum: string;
    description: string;
};

// =============================================================================
// SCHEMA VERSION TABLE DDL
// =============================================================================

/**
 * DDL for the schema_version table
 * Tracks all applied migrations with checksums for integrity
 */
export const SCHEMA_VERSION_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    checksum TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_version_applied ON schema_version(applied_at);
`;

/**
 * DDL for the shadow_genome table (Version 1.0.0)
 * Base schema for failure archival (security fields added in v1.1.0)
 */
export const SHADOW_GENOME_V1_DDL = `
CREATE TABLE IF NOT EXISTS shadow_genome (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    ledger_ref INTEGER,
    agent_did TEXT NOT NULL,
    input_vector TEXT NOT NULL,
    decision_rationale TEXT,
    environment_context TEXT,
    failure_mode TEXT NOT NULL CHECK (failure_mode IN (
        'HALLUCINATION',
        'INJECTION_VULNERABILITY',
        'LOGIC_ERROR',
        'SPEC_VIOLATION',
        'HIGH_COMPLEXITY',
        'SECRET_EXPOSURE',
        'PII_LEAK',
        'DEPENDENCY_CONFLICT',
        'TRUST_VIOLATION',
        'OTHER'
    )),
    causal_vector TEXT,
    negative_constraint TEXT,
    remediation_status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (remediation_status IN (
        'UNRESOLVED',
        'IN_PROGRESS',
        'RESOLVED',
        'WONT_FIX',
        'SUPERSEDED'
    )),
    remediation_notes TEXT,
    resolved_at TEXT,
    resolved_by TEXT,
    
    FOREIGN KEY (ledger_ref) REFERENCES soa_ledger(id)
);

CREATE INDEX IF NOT EXISTS idx_shadow_agent ON shadow_genome(agent_did);
CREATE INDEX IF NOT EXISTS idx_shadow_failure_mode ON shadow_genome(failure_mode);
CREATE INDEX IF NOT EXISTS idx_shadow_status ON shadow_genome(remediation_status);
CREATE INDEX IF NOT EXISTS idx_shadow_created ON shadow_genome(created_at);
`;

/** Whitelist of allowed table names for schema introspection */
const ALLOWED_TABLES = new Set(['shadow_genome', 'schema_version', 'soa_ledger']);

const hasColumn = (db: Database.Database, table: string, column: string): boolean => {
    if (!ALLOWED_TABLES.has(table)) {
        throw new Error(`Invalid table name: ${table}. Only whitelisted tables are allowed.`);
    }
    const columns = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
    return columns.some((c) => c.name === column);
};

// =============================================================================
// MIGRATIONS
// =============================================================================

/**
 * Migration registry for Shadow Genome schema
 * All migrations must be registered here
 */
export const MIGRATIONS: Migration[] = [
    {
        version: '1.0.0',
        description: 'Initial schema - base shadow_genome table',
        up: (_db: Database.Database) => {
            // Base schema is created by SHADOW_GENOME_V1_DDL
            // This migration is primarily for tracking purposes
        },
        down: (db: Database.Database) => {
            db.exec('DROP TABLE IF EXISTS shadow_genome;');
        },
        checksum: 'a1b2c3d4e5f6' // Placeholder - should be computed from SQL
    },
    {
        version: '1.1.0',
        description: 'Add security fields (did_hash, signature, signature_timestamp)',
        up: (db: Database.Database) => {
            if (!hasColumn(db, 'shadow_genome', 'did_hash')) {
                db.exec('ALTER TABLE shadow_genome ADD COLUMN did_hash TEXT;');
            }
            if (!hasColumn(db, 'shadow_genome', 'signature')) {
                db.exec('ALTER TABLE shadow_genome ADD COLUMN signature TEXT;');
            }
            if (!hasColumn(db, 'shadow_genome', 'signature_timestamp')) {
                db.exec('ALTER TABLE shadow_genome ADD COLUMN signature_timestamp TEXT;');
            }
            db.exec('CREATE INDEX IF NOT EXISTS idx_shadow_did_hash ON shadow_genome(did_hash);');
        },
        down: (db: Database.Database) => {
            // SQLite doesn't support DROP COLUMN directly
            // Need to recreate table without the columns
            db.exec(`
                CREATE TABLE shadow_genome_temp AS
                SELECT id, created_at, updated_at, ledger_ref, agent_did,
                       input_vector, decision_rationale, environment_context,
                       failure_mode, causal_vector, negative_constraint,
                       remediation_status, remediation_notes, resolved_at, resolved_by
                FROM shadow_genome;
                
                DROP TABLE shadow_genome;
                ALTER TABLE shadow_genome_temp RENAME TO shadow_genome;
                
                CREATE INDEX idx_shadow_agent ON shadow_genome(agent_did);
                CREATE INDEX idx_shadow_failure_mode ON shadow_genome(failure_mode);
                CREATE INDEX idx_shadow_status ON shadow_genome(remediation_status);
                CREATE INDEX idx_shadow_created ON shadow_genome(created_at);
            `);
        },
        checksum: 'b2c3d4e5f6a1' // Placeholder
    },
    {
        version: '1.2.0',
        description: 'Add audit trail columns (created_by, updated_by)',
        up: (db: Database.Database) => {
            db.exec(`
                ALTER TABLE shadow_genome ADD COLUMN created_by TEXT;
                ALTER TABLE shadow_genome ADD COLUMN updated_by TEXT;
            `);
        },
        down: (db: Database.Database) => {
            db.exec(`
                CREATE TABLE shadow_genome_temp AS
                SELECT id, created_at, updated_at, ledger_ref, agent_did,
                       input_vector, decision_rationale, environment_context,
                       failure_mode, causal_vector, negative_constraint,
                       remediation_status, remediation_notes, resolved_at, resolved_by,
                       did_hash, signature, signature_timestamp
                FROM shadow_genome;
                
                DROP TABLE shadow_genome;
                ALTER TABLE shadow_genome_temp RENAME TO shadow_genome;
                
                CREATE INDEX idx_shadow_agent ON shadow_genome(agent_did);
                CREATE INDEX idx_shadow_failure_mode ON shadow_genome(failure_mode);
                CREATE INDEX idx_shadow_status ON shadow_genome(remediation_status);
                CREATE INDEX idx_shadow_created ON shadow_genome(created_at);
                CREATE INDEX idx_shadow_did_hash ON shadow_genome(did_hash);
            `);
        },
        checksum: 'c3d4e5f6a1b2' // Placeholder
    }
];

// =============================================================================
// SCHEMA VERSION MANAGER CLASS
// =============================================================================

export class SchemaVersionManager {
    private db: Database.Database;
    private currentVersion: string = '1.0.0';
    
    constructor(db: Database.Database) {
        this.db = db;
    }
    
    /**
     * Initialize the schema versioning system
     * Creates schema_version table if it doesn't exist
     */
    initialize(): void {
        this.db.exec(SCHEMA_VERSION_DDL);
    }
    
    /**
     * Check the current schema version
     * @returns The current version or null if no migrations applied
     */
    getCurrentVersion(): string | null {
        const row = this.db
            .prepare('SELECT version FROM schema_version ORDER BY id DESC LIMIT 1')
            .get() as { version: string } | undefined;
        
        return row?.version || null;
    }
    
    /**
     * Get all applied migrations
     * @returns Array of applied schema versions
     */
    getAppliedMigrations(): SchemaVersion[] {
        const rows = this.db
            .prepare('SELECT * FROM schema_version ORDER BY id ASC')
            .all() as SchemaVersionRow[];
        
        return rows.map(row => ({
            id: row.id,
            version: row.version,
            applied_at: row.applied_at,
            checksum: row.checksum,
            description: row.description
        }));
    }
    
    /**
     * Get pending migrations
     * @returns Array of migrations that haven't been applied
     */
    getPendingMigrations(): Migration[] {
        const appliedVersions = new Set(
            this.getAppliedMigrations().map(m => m.version)
        );
        
        return MIGRATIONS.filter(m => !appliedVersions.has(m.version));
    }
    
    /**
     * Verify migration integrity by checking checksums
     * @returns true if all checksums match, false otherwise
     */
    verifyMigrationIntegrity(): boolean {
        const applied = this.getAppliedMigrations();
        
        for (const appliedMigration of applied) {
            const migration = MIGRATIONS.find(m => m.version === appliedMigration.version);
            
            if (!migration) {
                console.error(`Migration ${appliedMigration.version} not found in registry`);
                return false;
            }
            
            if (migration.checksum !== appliedMigration.checksum) {
                console.error(
                    `Checksum mismatch for ${appliedMigration.version}: ` +
                    `expected ${migration.checksum}, got ${appliedMigration.checksum}`
                );
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Apply a single migration
     * @param migration - The migration to apply
     * @returns Migration result
     */
    private applyMigration(migration: Migration): MigrationResult {
        try {
            // Start transaction
            const transaction = this.db.transaction(() => {
                // Apply migration
                migration.up(this.db);
                
                // Record migration
                this.db.prepare(`
                    INSERT INTO schema_version (version, checksum, description)
                    VALUES (@version, @checksum, @description)
                `).run({
                    version: migration.version,
                    checksum: migration.checksum,
                    description: migration.description
                });
            });
            
            transaction();
            
            return {
                success: true,
                version: migration.version,
                direction: 'up'
            };
            
        } catch (error) {
            return {
                success: false,
                version: migration.version,
                direction: 'up',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    
    /**
     * Rollback a single migration
     * @param migration - The migration to rollback
     * @returns Migration result
     */
    private rollbackMigration(migration: Migration): MigrationResult {
        try {
            // Start transaction
            const transaction = this.db.transaction(() => {
                // Apply rollback
                migration.down(this.db);
                
                // Remove migration record
                this.db.prepare('DELETE FROM schema_version WHERE version = @version')
                    .run({ version: migration.version });
            });
            
            transaction();
            
            return {
                success: true,
                version: migration.version,
                direction: 'down'
            };
            
        } catch (error) {
            return {
                success: false,
                version: migration.version,
                direction: 'down',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    
    /**
     * Migrate to the latest version
     * @returns Array of migration results
     */
    migrate(): MigrationResult[] {
        const results: MigrationResult[] = [];
        const pending = this.getPendingMigrations();
        
        for (const migration of pending) {
            const result = this.applyMigration(migration);
            results.push(result);
            
            if (!result.success) {
                console.error(`Migration failed: ${result.version} - ${result.error}`);
                break; // Stop on first failure
            }
            
            console.log(`Migration applied: ${migration.version} - ${migration.description}`);
        }
        
        return results;
    }
    
    /**
     * Rollback to a specific version
     * @param targetVersion - The version to rollback to
     * @returns Array of migration results
     */
    rollback(targetVersion: string): MigrationResult[] {
        const results: MigrationResult[] = [];
        const applied = this.getAppliedMigrations();
        
        // Find migrations to rollback (in reverse order)
        const toRollback = applied
            .filter(m => m.version > targetVersion)
            .reverse();
        
        for (const appliedMigration of toRollback) {
            const migration = MIGRATIONS.find(m => m.version === appliedMigration.version);
            
            if (!migration) {
                results.push({
                    success: false,
                    version: appliedMigration.version,
                    direction: 'down',
                    error: 'Migration not found in registry'
                });
                continue;
            }
            
            const result = this.rollbackMigration(migration);
            results.push(result);
            
            if (!result.success) {
                console.error(`Rollback failed: ${result.version} - ${result.error}`);
                break;
            }
            
            console.log(`Migration rolled back: ${migration.version}`);
        }
        
        return results;
    }
    
    /**
     * Validate schema version on initialization
     * Throws an error if schema is incompatible
     */
    validateOnInit(): void {
        const currentVersion = this.getCurrentVersion();
        
        if (!currentVersion) {
            // No migrations applied - fresh install
            console.log('Shadow Genome: Fresh installation detected');
            return;
        }
        
        // Check version newness BEFORE the integrity/checksum sweep below.
        // A forward-written database (applied migrations from a newer
        // FailSafe release than this runtime knows about) will always fail
        // verifyMigrationIntegrity(), because that check requires every
        // applied version to be present in the *local* MIGRATIONS registry
        // — which by definition it is not yet, for a migration from the
        // future. Without this ordering, a perfectly honest "please
        // upgrade" case was being reported as "Database may be corrupted,"
        // which is both scarier and less actionable than the truth.
        const latestVersion = MIGRATIONS[MIGRATIONS.length - 1].version;

        if (currentVersion > latestVersion) {
            throw new UnsupportedShadowGenomeSchemaError(currentVersion, latestVersion);
        }

        // Verify migration integrity
        if (!this.verifyMigrationIntegrity()) {
            throw new Error(
                'Shadow Genome schema integrity check failed. ' +
                'Migration checksums do not match. Database may be corrupted.'
            );
        }

        console.log(`Shadow Genome: Schema version ${currentVersion} validated`);
    }
    
    /**
     * Get schema status information
     * @returns Object with schema status
     */
    getStatus(): {
        currentVersion: string | null;
        latestVersion: string;
        pendingMigrations: number;
        integrityValid: boolean;
    } {
        return {
            currentVersion: this.getCurrentVersion(),
            latestVersion: MIGRATIONS[MIGRATIONS.length - 1].version,
            pendingMigrations: this.getPendingMigrations().length,
            integrityValid: this.verifyMigrationIntegrity()
        };
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Compute checksum for SQL content
 * @param sql - The SQL content to checksum
 * @returns Hex string checksum
 */
export function computeChecksum(sql: string): string {
    return crypto.createHash('sha256').update(sql).digest('hex').substring(0, 12);
}

/**
 * Create a new migration object
 * @param version - Migration version
 * @param description - Migration description
 * @param up - Up migration SQL/function
 * @param down - Down migration SQL/function
 * @returns Migration object
 */
export function createMigration(
    version: string,
    description: string,
    up: string | ((db: Database.Database) => void),
    down: string | ((db: Database.Database) => void)
): Migration {
    const upSql = typeof up === 'string' ? up : '';
    const downSql = typeof down === 'string' ? down : '';
    const combinedSql = `${upSql}${downSql}`;
    
    return {
        version,
        description,
        up: typeof up === 'string' ? (db: Database.Database) => db.exec(up) : up,
        down: typeof down === 'string' ? (db: Database.Database) => db.exec(down) : down,
        checksum: computeChecksum(combinedSql)
    };
}
