/**
 * LedgerVerifier - pure verification of soa_ledger rows (#473).
 *
 * Every row is verified under the version its signature declares; an
 * unrecognised version is a failure, never a fallback. The anchor records
 * passed in are checked against the rows on every call, so a deletion or
 * rollback is reported by the next verification, not only by the next append
 * or initialize.
 */

import {
    AUDIT_COLUMNS, COVERED_COLUMNS, GENESIS_DID, GENESIS_PREV_HASH, SEAL_COLUMNS, SEAL_DID,
    SealVersion, SoaLedgerRow, V3_COLUMNS, canonicalV3, legacyEntryHash, legacyMac,
    parseSignature, sha256, v3EntryHash, v3Mac,
} from './LedgerSeal';

export type AnchorStatus =
    | 'verified' | 'established-now' | 'established-late' | 'unanchored'
    | 'ledger-mismatch' | 'head-missing' | 'unavailable';

export type FailureCode =
    | 'empty-ledger' | 'genesis-invalid' | 'genesis-audit-columns' | 'unknown-version'
    | 'hash-mismatch' | 'signature-mismatch' | 'prev-link' | 'payload-json'
    | 'duplicate-entry' | 'unsealed-column' | 'receipt-prior-head'
    | 'legacy-digest-mismatch' | 'duplicate-receipt' | 'receipt-missing'
    | 'anchor-ledger-mismatch' | 'anchor-head-missing' | 'anchor-unavailable'
    | 'secret-missing' | 'no-database';

export interface LedgerFailure {
    id: number | null;
    code: FailureCode;
    detail: string;
}

/** Head anchor, stored in SecretStorage under ledgerAnchor:g:<genesisHash>. */
export interface HeadAnchorRecord {
    v: 1;
    genesisHash: string;
    headId: number;
    headHash: string;
    activation: { receiptId: number; receiptHash: string } | null;
    establishedAt: string;
    establishedAtId: number;
    establishedLate: boolean;
}

/** Workspace binding, stored under ledgerAnchor:w:<sha256(root)>. */
export interface WorkspaceBinding {
    genesisHash: string;
    boundAt: string;
}

export interface AnchorContext {
    record: HeadAnchorRecord | null;
    binding: WorkspaceBinding | null;
    workspaceBound: boolean;
    /** Outcome of initialize, or a latched failure for this session. */
    sessionStatus: AnchorStatus;
}

export const UNANCHORED_CONTEXT: AnchorContext = {
    record: null, binding: null, workspaceBound: false, sessionStatus: 'unanchored',
};

export type SealScope = 'full' | 'frozen-legacy' | 'partial' | 'none';

export interface LedgerVerification {
    ok: boolean;
    sealScope: SealScope;
    rows: number;
    coverage: { v1Rows: number; v2Rows: number; v3Rows: number; frozenLegacyRows: number; unfrozenLegacyRows: number };
    anchor: {
        status: AnchorStatus;
        workspaceBound: boolean;
        headId: number | null;
        unanchoredTail: number;
        establishedAt: string | null;
        establishedAtId: number | null;
    };
    /** Set when the first row is a rotation genesis (LD13). */
    rotation: { retiredFile: string; retiredVerificationOk: boolean } | null;
    failures: LedgerFailure[];
}

export interface EntryVerification {
    id: number;
    ok: boolean;
    version: SealVersion | null;
    coveredColumns: readonly string[];
    anchored: boolean;
}

const ROW_COLUMNS = new Set<string>([...V3_COLUMNS, ...SEAL_COLUMNS]);
const NULLABLE_AUDIT = AUDIT_COLUMNS.filter((c) => c !== 'gdpr_trigger');

/** Verify one row's seal under its declared version. */
export function checkRowSeal(row: SoaLedgerRow, secret: string): { version: SealVersion | null; failure: LedgerFailure | null } {
    const parsed = parseSignature(row.signature);
    if (!parsed) {
        return { version: null, failure: { id: row.id, code: 'unknown-version', detail: 'signature carries no recognised seal version' } };
    }
    if (row.payload) {
        try { JSON.parse(row.payload); } catch {
            return { version: parsed.version, failure: { id: row.id, code: 'payload-json', detail: 'payload is not JSON' } };
        }
    }
    let expectedHash: string;
    try {
        expectedHash = parsed.version === 'v3' ? v3EntryHash(row) : legacyEntryHash(row, parsed.version);
    } catch (error) {
        return { version: parsed.version, failure: { id: row.id, code: 'hash-mismatch', detail: String(error) } };
    }
    if (row.entry_hash !== expectedHash) {
        return { version: parsed.version, failure: { id: row.id, code: 'hash-mismatch', detail: `${parsed.version} entry hash does not match the row` } };
    }
    const expectedMac = parsed.version === 'v3' ? v3Mac(secret, expectedHash) : legacyMac(secret, expectedHash);
    if (parsed.mac !== expectedMac) {
        return { version: parsed.version, failure: { id: row.id, code: 'signature-mismatch', detail: `${parsed.version} signature does not match` } };
    }
    return { version: parsed.version, failure: null };
}

/** LD5: the first row must be a genesis; a v1 genesis must match its construction. */
export function checkGenesis(row: SoaLedgerRow): LedgerFailure | null {
    if (row.prev_hash !== GENESIS_PREV_HASH || row.agent_did !== GENESIS_DID || row.event_type !== 'SYSTEM_EVENT') {
        return { id: row.id, code: 'genesis-invalid', detail: 'first row is not a genesis entry' };
    }
    if (parseSignature(row.signature)?.version === 'v1') {
        const record = row as unknown as Record<string, unknown>;
        const set = NULLABLE_AUDIT.filter((c) => record[c] !== null);
        if (set.length > 0 || row.gdpr_trigger !== 0) {
            return { id: row.id, code: 'genesis-audit-columns', detail: `v1 genesis carries audit values (${[...set, ...(row.gdpr_trigger !== 0 ? ['gdpr_trigger'] : [])].join(', ')})` };
        }
    }
    return null;
}

/** sha256 over the v3 canonical encoding of the given rows, in order. */
export function legacyDigest(rows: SoaLedgerRow[]): string {
    return sha256(rows.map((row) => canonicalV3(row)).join('\n'));
}

function parsePayload(row: SoaLedgerRow): Record<string, unknown> | null {
    if (!row.payload) { return null; }
    try {
        const value = JSON.parse(row.payload) as unknown;
        return value && typeof value === 'object' ? value as Record<string, unknown> : null;
    } catch { return null; }
}

function checkReceipt(rows: SoaLedgerRow[], versions: (SealVersion | null)[], fail: (f: LedgerFailure) => void): number {
    const firstV3 = versions.indexOf('v3');
    const sealRows = rows.filter((row) => row.agent_did === SEAL_DID);
    for (const extra of sealRows.slice(1)) {
        fail({ id: extra.id, code: 'duplicate-receipt', detail: 'a second activation receipt' });
    }
    const receipt = firstV3 >= 0 && rows[firstV3].agent_did === SEAL_DID ? rows[firstV3] : null;
    if (!receipt) {
        if (sealRows.length > 0) {
            fail({ id: sealRows[0].id, code: 'receipt-prior-head', detail: 'activation receipt is not the first v3 row' });
        }
        return 0;
    }
    const payload = parsePayload(receipt);
    const priorHead = payload?.priorHead as { id?: unknown; entryHash?: unknown } | undefined;
    const prior = firstV3 > 0 ? rows[firstV3 - 1] : undefined;
    if (!prior || !priorHead || prior.id !== priorHead.id || prior.entry_hash !== priorHead.entryHash || receipt.id !== prior.id + 1) {
        fail({ id: receipt.id, code: 'receipt-prior-head', detail: 'receipt does not follow the head it names' });
        return 0;
    }
    let digest = '';
    try { digest = legacyDigest(rows.slice(0, firstV3)); } catch { digest = ''; }
    if (digest !== payload?.legacyDigest) {
        fail({ id: receipt.id, code: 'legacy-digest-mismatch', detail: 'legacy rows changed after activation' });
        return 0;
    }
    return firstV3;
}

function checkAnchor(rows: SoaLedgerRow[], ctx: AnchorContext, fail: (f: LedgerFailure) => void): void {
    const genesis = rows[0];
    if (ctx.binding && ctx.binding.genesisHash !== genesis.entry_hash) {
        fail({ id: genesis.id, code: 'anchor-ledger-mismatch', detail: 'this workspace is bound to a different ledger' });
    }
    const record = ctx.record;
    if (record) {
        if (record.genesisHash !== genesis.entry_hash) {
            fail({ id: genesis.id, code: 'anchor-ledger-mismatch', detail: 'anchor names a different genesis' });
        }
        const head = rows.find((row) => row.id === record.headId);
        if (!head || head.entry_hash !== record.headHash) {
            fail({ id: record.headId, code: 'anchor-head-missing', detail: 'the anchored head row is missing or replaced' });
        }
        if (record.activation) {
            const r = rows.find((row) => row.id === record.activation?.receiptId);
            if (!r || r.entry_hash !== record.activation.receiptHash) {
                fail({ id: record.activation.receiptId, code: 'receipt-missing', detail: 'the anchored activation receipt is missing or replaced' });
            }
        }
    }
}

function sessionFailure(status: AnchorStatus): LedgerFailure | null {
    if (status === 'unavailable') { return { id: null, code: 'anchor-unavailable', detail: 'anchor records could not be read' }; }
    if (status === 'ledger-mismatch') { return { id: null, code: 'anchor-ledger-mismatch', detail: 'latched: ledger does not match its binding' }; }
    if (status === 'head-missing') { return { id: null, code: 'anchor-head-missing', detail: 'latched: anchored head was missing' }; }
    return null;
}

function reportStatus(failures: LedgerFailure[], ctx: AnchorContext): AnchorStatus {
    const has = (code: FailureCode) => failures.some((f) => f.code === code);
    if (has('anchor-unavailable')) { return 'unavailable'; }
    if (has('anchor-ledger-mismatch')) { return 'ledger-mismatch'; }
    if (has('anchor-head-missing')) { return 'head-missing'; }
    if (!ctx.record) { return 'unanchored'; }
    if (ctx.record.establishedLate) { return 'established-late'; }
    return ctx.sessionStatus === 'established-now' ? 'established-now' : 'verified';
}

/** Verify every row, the receipt and the anchor records. Pure. */
export function verifyRows(rows: SoaLedgerRow[], secret: string | undefined, ctx: AnchorContext = UNANCHORED_CONTEXT): LedgerVerification {
    const failures: LedgerFailure[] = [];
    const fail = (f: LedgerFailure) => {
        if (!failures.some((x) => x.code === f.code && x.id === f.id)) { failures.push(f); }
    };
    if (!secret) { fail({ id: null, code: 'secret-missing', detail: 'ledger secret is not loaded' }); }
    const versions: (SealVersion | null)[] = [];
    const seen = new Set<string>();
    rows.forEach((row, i) => {
        const columns = Object.keys(row);
        if (columns.length !== ROW_COLUMNS.size || columns.some((c) => !ROW_COLUMNS.has(c))) {
            fail({ id: row.id, code: 'unsealed-column', detail: `row columns differ from the sealed set: ${columns.join(',')}` });
        }
        const { version, failure } = checkRowSeal(row, secret ?? '');
        versions.push(version);
        if (failure && secret) { fail(failure); }
        if (seen.has(row.entry_hash)) { fail({ id: row.id, code: 'duplicate-entry', detail: 'entry hash repeats' }); }
        seen.add(row.entry_hash);
        if (i > 0 && row.prev_hash !== rows[i - 1].entry_hash) {
            fail({ id: row.id, code: 'prev-link', detail: 'prev_hash does not name the previous row' });
        }
    });
    let frozen = 0;
    if (rows.length === 0) {
        fail({ id: null, code: 'empty-ledger', detail: 'the ledger has no rows' });
    } else {
        const genesis = checkGenesis(rows[0]);
        if (genesis) { fail(genesis); }
        frozen = checkReceipt(rows, versions, fail);
        checkAnchor(rows, ctx, fail);
    }
    const latched = sessionFailure(ctx.sessionStatus);
    if (latched && !failures.some((f) => f.code === latched.code)) { failures.push(latched); }

    const count = (v: SealVersion) => versions.filter((x) => x === v).length;
    const legacy = count('v1') + count('v2');
    const ok = failures.length === 0;
    const sealScope: SealScope = !ok ? 'none' : legacy === 0 ? 'full' : frozen === legacy ? 'frozen-legacy' : 'partial';
    const record = ctx.record;
    const retired = rows.length > 0 ? parsePayload(rows[0])?.retired as { file?: unknown; verificationOk?: unknown } | undefined : undefined;
    return {
        ok,
        sealScope,
        rows: rows.length,
        coverage: { v1Rows: count('v1'), v2Rows: count('v2'), v3Rows: count('v3'), frozenLegacyRows: frozen, unfrozenLegacyRows: legacy - frozen },
        anchor: {
            status: reportStatus(failures, ctx),
            workspaceBound: ctx.workspaceBound,
            headId: record ? record.headId : null,
            unanchoredTail: record ? rows.filter((row) => row.id > record.headId).length : rows.length,
            establishedAt: record ? record.establishedAt : null,
            establishedAtId: record ? record.establishedAtId : null,
        },
        rotation: retired ? { retiredFile: String(retired.file), retiredVerificationOk: retired.verificationOk === true } : null,
        failures,
    };
}

export function entryVerification(report: LedgerVerification, rows: SoaLedgerRow[], id: number): EntryVerification {
    const row = rows.find((r) => r.id === id);
    const version = row ? parseSignature(row.signature)?.version ?? null : null;
    return {
        id,
        ok: !!row && report.ok && !report.failures.some((f) => f.id === id),
        version,
        coveredColumns: version ? COVERED_COLUMNS[version] : [],
        anchored: report.anchor.headId !== null && id <= report.anchor.headId,
    };
}
