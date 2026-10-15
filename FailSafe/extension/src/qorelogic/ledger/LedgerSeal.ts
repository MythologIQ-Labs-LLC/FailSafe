/**
 * LedgerSeal - versioned seal formats for soa_ledger rows (#473).
 *
 * v1 (<= v6.0.5) and v2 (v6.0.6) hash a JSON object of a subset of the
 * columns and HMAC the bare hash. Both are kept byte-for-byte so legacy rows
 * keep verifying under their own version; they are never re-signed.
 *
 * v3 hashes every data column, typed, in a fixed order, and HMACs a
 * domain-tagged hash, so a v3 MAC can never be mistaken for a v1/v2 MAC.
 */

import * as crypto from 'crypto';

export type SealVersion = 'v1' | 'v2' | 'v3';

/** A soa_ledger row exactly as better-sqlite3 returns it after migration 2. */
export interface SoaLedgerRow {
    id: number;
    timestamp: string;
    event_type: string;
    agent_did: string;
    agent_trust_at_action: number | null;
    model_version: string | null;
    artifact_path: string | null;
    artifact_hash: string | null;
    risk_grade: string | null;
    verification_method: string | null;
    verification_result: string | null;
    sentinel_confidence: number | null;
    overseer_did: string | null;
    overseer_decision: string | null;
    gdpr_trigger: number | null;
    payload: string | null;
    entry_hash: string;
    prev_hash: string;
    signature: string;
    schema_version: number | null;
    extension_version: string | null;
}

/** Every data column a v3 seal binds, in canonical order. */
export const V3_COLUMNS = [
    'id', 'timestamp', 'event_type', 'agent_did', 'agent_trust_at_action',
    'model_version', 'artifact_path', 'artifact_hash', 'risk_grade',
    'verification_method', 'verification_result', 'sentinel_confidence',
    'overseer_did', 'overseer_decision', 'gdpr_trigger', 'payload',
    'prev_hash', 'schema_version', 'extension_version',
] as const;

/** Columns that hold the seal itself. */
export const SEAL_COLUMNS = ['entry_hash', 'signature'] as const;

/** The 11 audit columns v2 added to the v1 subset. */
export const AUDIT_COLUMNS = [
    'agent_trust_at_action', 'model_version', 'artifact_path', 'artifact_hash',
    'risk_grade', 'verification_method', 'verification_result',
    'sentinel_confidence', 'overseer_did', 'overseer_decision', 'gdpr_trigger',
] as const;

const V1_COLUMNS = ['timestamp', 'event_type', 'agent_did', 'payload', 'prev_hash'] as const;

export const COVERED_COLUMNS: Record<SealVersion, readonly string[]> = {
    v1: V1_COLUMNS,
    v2: [...V1_COLUMNS, ...AUDIT_COLUMNS],
    v3: V3_COLUMNS,
};

export const GENESIS_DID = 'did:myth:system:genesis';
export const SEAL_DID = 'did:myth:system:ledger-seal';
export const V3_SCHEMA_VERSION = 3;

const V3_TAG = 'soa-ledger/v3\n';

export function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

export const GENESIS_PREV_HASH = sha256('GENESIS');

function hmac(secret: string, data: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/** Versions are parsed, never inferred: anything unrecognised is null. */
export function parseSignature(signature: string): { version: SealVersion; mac: string } | null {
    if (typeof signature !== 'string') { return null; }
    if (/^[0-9a-f]{64}$/.test(signature)) { return { version: 'v1', mac: signature }; }
    const m = /^(v2|v3):([0-9a-f]{64})$/.exec(signature);
    return m ? { version: m[1] as SealVersion, mac: m[2] } : null;
}

function cell(column: string, value: unknown): string {
    if (value === null) { return 'z'; }
    if (typeof value === 'number') { return `n:${String(value)}`; }
    if (typeof value === 'string') { return `s:${value}`; }
    if (Buffer.isBuffer(value)) { return `b:${value.toString('hex')}`; }
    throw new TypeError(`soa_ledger column ${column} holds an unsealable ${typeof value}`);
}

/** The exact string a v3 entry hash is computed over. */
export function canonicalV3(row: SoaLedgerRow): string {
    const record = row as unknown as Record<string, unknown>;
    return V3_TAG + JSON.stringify(V3_COLUMNS.map((column) => cell(column, record[column])));
}

export function v3EntryHash(row: SoaLedgerRow): string {
    return sha256(canonicalV3(row));
}

export function v3Mac(secret: string, entryHash: string): string {
    return hmac(secret, V3_TAG + entryHash);
}

export function sealV3(row: SoaLedgerRow, secret: string): { entryHash: string; signature: string } {
    const entryHash = v3EntryHash(row);
    return { entryHash, signature: `v3:${v3Mac(secret, entryHash)}` };
}

/**
 * The v1/v2 hash payloads, unchanged from LedgerManager.verifyChain at
 * ba353468. Throws SyntaxError when the stored payload is not JSON.
 */
export function legacyEntryHash(row: SoaLedgerRow, version: 'v1' | 'v2'): string {
    const payloadValue: unknown = row.payload ? JSON.parse(row.payload) : undefined;
    const v2 = version === 'v2';
    const hashPayload = {
        timestamp: row.timestamp,
        eventType: row.event_type,
        agentDid: row.agent_did,
        ...(v2 ? {
            agentTrustAtAction: row.agent_trust_at_action,
            modelVersion: row.model_version,
            artifactPath: row.artifact_path,
            artifactHash: row.artifact_hash,
            riskGrade: row.risk_grade,
            verificationMethod: row.verification_method,
            verificationResult: row.verification_result,
            sentinelConfidence: row.sentinel_confidence,
            overseerDid: row.overseer_did,
            overseerDecision: row.overseer_decision,
            gdprTrigger: row.gdpr_trigger,
        } : {}),
        payload: v2 ? (payloadValue ?? null) : payloadValue,
        prevHash: row.prev_hash,
    };
    return sha256(JSON.stringify(hashPayload));
}

export function legacyMac(secret: string, entryHash: string): string {
    return hmac(secret, entryHash);
}
