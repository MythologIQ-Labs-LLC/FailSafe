/**
 * LedgerWriter - every write to soa_ledger (#473).
 *
 * Appends run in one IMMEDIATE transaction: the previous row is read from the
 * database (never from memory, so two windows serialize instead of forking),
 * the row is inserted with a placeholder, read back and sealed as SQLite
 * stored it. The activation receipt and table-level rotation live here too.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import {
    GENESIS_DID, GENESIS_PREV_HASH, SEAL_DID, SoaLedgerRow, V3_SCHEMA_VERSION, parseSignature, sealV3,
} from './LedgerSeal';
import { HeadAnchorRecord, checkGenesis, legacyDigest, verifyRows } from './LedgerVerifier';

export const RESERVED_DIDS: readonly string[] = [GENESIS_DID, SEAL_DID];

/** Data columns of a new row; id, prev_hash and the seal are assigned here. */
export interface V3Fields {
    timestamp: string;
    eventType: string;
    agentDid: string;
    agentTrustAtAction?: number | null;
    modelVersion?: string | null;
    artifactPath?: string | null;
    artifactHash?: string | null;
    riskGrade?: string | null;
    verificationMethod?: string | null;
    verificationResult?: string | null;
    sentinelConfidence?: number | null;
    overseerDid?: string | null;
    overseerDecision?: string | null;
    gdprTrigger?: boolean;
    payload?: unknown;
}

const INSERT_SQL = `
    INSERT INTO soa_ledger (
        id, timestamp, event_type, agent_did, agent_trust_at_action,
        model_version, artifact_path, artifact_hash, risk_grade,
        verification_method, verification_result, sentinel_confidence,
        overseer_did, overseer_decision, gdpr_trigger, payload,
        entry_hash, prev_hash, signature, schema_version, extension_version
    ) VALUES (
        @id, @timestamp, @eventType, @agentDid, @agentTrustAtAction,
        @modelVersion, @artifactPath, @artifactHash, @riskGrade,
        @verificationMethod, @verificationResult, @sentinelConfidence,
        @overseerDid, @overseerDecision, @gdprTrigger, @payload,
        @placeholder, @prevHash, 'pending', @schemaVersion, ''
    )`;

export function readAllRows(db: Database.Database): SoaLedgerRow[] {
    return db.prepare('SELECT * FROM soa_ledger ORDER BY id ASC').all() as SoaLedgerRow[];
}

export function readHead(db: Database.Database): { id: number; entry_hash: string } | undefined {
    return db.prepare('SELECT id, entry_hash FROM soa_ledger ORDER BY id DESC LIMIT 1').get() as { id: number; entry_hash: string } | undefined;
}

export function readFirst(db: Database.Database): SoaLedgerRow | undefined {
    return db.prepare('SELECT * FROM soa_ledger ORDER BY id ASC LIMIT 1').get() as SoaLedgerRow | undefined;
}

/** Insert and seal one row; the caller owns the transaction. */
function insertSealed(db: Database.Database, secret: string, id: number, prevHash: string, fields: V3Fields): SoaLedgerRow {
    db.prepare(INSERT_SQL).run({
        id,
        timestamp: fields.timestamp,
        eventType: fields.eventType,
        agentDid: fields.agentDid,
        agentTrustAtAction: fields.agentTrustAtAction ?? null,
        modelVersion: fields.modelVersion ?? null,
        artifactPath: fields.artifactPath ?? null,
        artifactHash: fields.artifactHash ?? null,
        riskGrade: fields.riskGrade ?? null,
        verificationMethod: fields.verificationMethod ?? null,
        verificationResult: fields.verificationResult ?? null,
        sentinelConfidence: fields.sentinelConfidence ?? null,
        overseerDid: fields.overseerDid ?? null,
        overseerDecision: fields.overseerDecision ?? null,
        gdprTrigger: fields.gdprTrigger ? 1 : 0,
        payload: fields.payload === undefined || fields.payload === null ? null : JSON.stringify(fields.payload),
        placeholder: `pending:${crypto.randomUUID()}`,
        prevHash,
        schemaVersion: V3_SCHEMA_VERSION,
    });
    // Seal what SQLite stored (NaN becomes NULL, -0 becomes 0), not the request.
    const stored = db.prepare('SELECT * FROM soa_ledger WHERE id = ?').get(id) as SoaLedgerRow;
    const seal = sealV3(stored, secret);
    db.prepare('UPDATE soa_ledger SET entry_hash = ?, signature = ? WHERE id = ?').run(seal.entryHash, seal.signature, id);
    return { ...stored, entry_hash: seal.entryHash, signature: seal.signature };
}

/** LD3: append one v3 row linked to the database head. */
export function appendV3(db: Database.Database, secret: string, fields: V3Fields): SoaLedgerRow {
    return db.transaction(() => {
        const head = readHead(db);
        return insertSealed(db, secret, head ? head.id + 1 : 1, head ? head.entry_hash : GENESIS_PREV_HASH, fields);
    }).immediate();
}

function genesisFields(payload: Record<string, unknown>): V3Fields {
    return { timestamp: new Date().toISOString(), eventType: 'SYSTEM_EVENT', agentDid: GENESIS_DID, payload };
}

/** Write a v3 genesis into an empty table; returns undefined if rows exist. */
export function writeGenesis(db: Database.Database, secret: string): SoaLedgerRow | undefined {
    return db.transaction(() => {
        if (readHead(db)) { return undefined; }
        return insertSealed(db, secret, 1, GENESIS_PREV_HASH, genesisFields({ message: 'SOA Ledger initialized' }));
    }).immediate();
}

export type ActivationResult =
    | { status: 'activated'; receipt: SoaLedgerRow }
    | { status: 'skipped' }
    | { status: 'refused'; reason: string };

/**
 * LD7: append the one activation receipt of a legacy ledger. Refused when the
 * record already names an activation; skipped when a v3 row already exists.
 */
export function activate(db: Database.Database, secret: string, record: HeadAnchorRecord | null): ActivationResult {
    if (record && record.activation !== null) { return { status: 'refused', reason: 'this genesis was already activated' }; }
    return db.transaction((): ActivationResult => {
        const rows = db.prepare('SELECT * FROM soa_ledger ORDER BY id ASC').all() as SoaLedgerRow[];
        if (rows.length === 0) { return { status: 'refused', reason: 'empty ledger' }; }
        if (checkGenesis(rows[0])) { return { status: 'refused', reason: 'first row is not a valid genesis' }; }
        if (rows.some((row) => parseSignature(row.signature)?.version === 'v3')) { return { status: 'skipped' }; }
        const head = rows[rows.length - 1];
        const prior = verifyRows(rows, secret);
        const receipt = insertSealed(db, secret, head.id + 1, head.entry_hash, {
            timestamp: new Date().toISOString(),
            eventType: 'SYSTEM_EVENT',
            agentDid: SEAL_DID,
            payload: {
                action: 'LEDGER_SEAL_V3_ACTIVATED',
                priorHead: { id: head.id, entryHash: head.entry_hash },
                priorCoverage: { v1Rows: prior.coverage.v1Rows, v2Rows: prior.coverage.v2Rows },
                priorVerification: { ok: prior.ok, failureCount: prior.failures.length },
                legacyDigest: legacyDigest(rows),
            },
        });
        return { status: 'activated', receipt };
    }).immediate();
}

export interface RotationInput {
    ledgerPath: string;
    reason: string;
    supersededBinding: string | null;
    retiredVerification: { ok: boolean; failureCount: number };
    now?: Date;
    /** Test seam: runs between the copy (step 1) and the swap (step 2). */
    beforeSwap?: () => void;
}

export function retiredFileName(now: Date): string {
    return `soa_ledger.retired-${now.toISOString().replace(/:/g, '-')}.db`;
}

/** Head (max id, entry_hash) and count of a soa_ledger table in a given schema. */
function tableShape(db: Database.Database, schema: 'main' | 'retired'): { count: number; id: number | null; hash: string | null } {
    const count = (db.prepare(`SELECT count(*) AS c FROM ${schema}.soa_ledger`).get() as { c: number }).c;
    const head = db.prepare(`SELECT id, entry_hash FROM ${schema}.soa_ledger ORDER BY id DESC LIMIT 1`).get() as { id: number; entry_hash: string } | undefined;
    return { count, id: head?.id ?? null, hash: head?.entry_hash ?? null };
}

/**
 * LD13 steps 0-2: copy soa_ledger into a retired file beside the ledger, then
 * swap in a rotation genesis on the same open handle. Other tables and every
 * cached handle are untouched. Step 3 (anchor and binding) is the caller's.
 */
export function rotateTable(db: Database.Database, secret: string, input: RotationInput): { genesis: SoaLedgerRow; retiredFile: string } {
    const retiredFile = retiredFileName(input.now ?? new Date());
    const retiredPath = path.join(path.dirname(input.ledgerPath), retiredFile);
    if (fs.existsSync(retiredPath)) { throw new Error(`Retired ledger ${retiredFile} already exists`); }
    const first = readFirst(db);
    if (!first) { throw new Error('Cannot rotate an empty ledger'); }
    const createSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'soa_ledger'").get() as { sql: string }).sql;
    if (!/^CREATE TABLE ("?)soa_ledger\1\s*\(/.test(createSql)) { throw new Error('Unexpected soa_ledger schema text'); }
    db.prepare('ATTACH DATABASE ? AS retired').run(retiredPath);
    let copy: ReturnType<typeof tableShape>;
    try {
        // prepare() accepts exactly one statement, so schema text from the file cannot smuggle a second one.
        db.prepare(createSql.replace(/^CREATE TABLE ("?)soa_ledger\1/, 'CREATE TABLE retired.soa_ledger')).run();
        db.exec('INSERT INTO retired.soa_ledger SELECT * FROM main.soa_ledger');
        copy = tableShape(db, 'retired');
    } finally {
        db.exec('DETACH DATABASE retired');
    }
    input.beforeSwap?.();
    // A cross-file transaction is not atomic in WAL mode, so step 2 re-checks.
    const genesis = db.transaction(() => {
        const now = tableShape(db, 'main');
        if (now.count !== copy.count || now.id !== copy.id || now.hash !== copy.hash) {
            throw new Error('soa_ledger changed during rotation; nothing was deleted');
        }
        db.exec('DELETE FROM soa_ledger');
        return insertSealed(db, secret, (copy.id ?? 0) + 1, GENESIS_PREV_HASH, genesisFields({
            message: 'SOA Ledger rotated',
            retired: {
                file: retiredFile,
                genesisHash: first.entry_hash,
                headId: copy.id,
                headHash: copy.hash,
                verificationOk: input.retiredVerification.ok,
                failureCount: input.retiredVerification.failureCount,
            },
            supersededBinding: input.supersededBinding,
            reason: input.reason,
        }));
    }).immediate();
    return { genesis, retiredFile };
}

/** LD12 row 5: is this first row a rotation genesis whose retired file is still beside the ledger? */
export function rotationEvidence(first: SoaLedgerRow, ledgerPath: string): { supersededBinding: string | null } | null {
    if (first.agent_did !== GENESIS_DID || parseSignature(first.signature)?.version !== 'v3' || !first.payload) { return null; }
    let payload: { retired?: { file?: unknown; headId?: unknown; headHash?: unknown }; supersededBinding?: unknown };
    try { payload = JSON.parse(first.payload); } catch { return null; }
    const retired = payload.retired;
    if (!retired || typeof retired.file !== 'string' || path.basename(retired.file) !== retired.file) { return null; }
    const retiredPath = path.join(path.dirname(ledgerPath), retired.file);
    if (!fs.existsSync(retiredPath)) { return null; }
    let head: { id: number; entry_hash: string } | undefined;
    const retiredDb = new Database(retiredPath, { readonly: true, fileMustExist: true });
    try {
        head = retiredDb.prepare('SELECT id, entry_hash FROM soa_ledger ORDER BY id DESC LIMIT 1').get() as { id: number; entry_hash: string } | undefined;
    } finally {
        retiredDb.close();
    }
    if (!head || head.id !== retired.headId || head.entry_hash !== retired.headHash) { return null; }
    return { supersededBinding: typeof payload.supersededBinding === 'string' ? payload.supersededBinding : null };
}
