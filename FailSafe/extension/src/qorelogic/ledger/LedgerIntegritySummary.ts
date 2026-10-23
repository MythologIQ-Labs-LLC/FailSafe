/**
 * LedgerIntegritySummary - one reading of a LedgerVerification for export
 * (#538 lane C, #473 residual).
 *
 * A compliance export states the ledger's integrity as `intact`,
 * `partial-seal`, `failed` or `unavailable`, never a boolean: verifyChain()
 * reads true for a partially sealed ledger. A ledger that cannot be read,
 * throws, or returns a malformed report is `unavailable` with the reason,
 * never a guess. The release gate reads the same weaker properties.
 */

import type { AnchorStatus, LedgerFailure, LedgerVerification } from './LedgerVerifier';

export type LedgerIntegrityStatus = 'intact' | 'partial-seal' | 'failed' | 'unavailable';

export interface LedgerIntegritySummary {
    status: LedgerIntegrityStatus;
    reason: string;
    verifiedAt: string;
    sealScope: LedgerVerification['sealScope'] | null;
    rows: number | null;
    coverage: LedgerVerification['coverage'] | null;
    anchor: LedgerVerification['anchor'] | null;
    rotation: LedgerVerification['rotation'];
    weakerProperties: string[];
    failures: LedgerFailure[];
    failureCount: number;
    failuresTruncated: boolean;
}

/** What the summary needs from a ledger; a LedgerManager satisfies it. */
export interface IntegritySource {
    verifyLedger?: () => Promise<unknown>;
    isAvailable?: () => boolean;
    getDisabledReason?: () => string | undefined;
}

export const MAX_REPORTED_FAILURES = 50;
const MAX_CODE = 64;
const MAX_DETAIL = 500;
const COVERAGE_KEYS = ['v1Rows', 'v2Rows', 'v3Rows', 'frozenLegacyRows', 'unfrozenLegacyRows'] as const;
/** Every AnchorStatus; anything else is a malformed report, never a pass. */
const ANCHOR_STATUSES: ReadonlySet<string> = new Set<AnchorStatus>([
    'verified', 'established-now', 'established-late', 'unanchored', 'ledger-mismatch', 'head-missing', 'unavailable',
]);

/** Every property weaker than "fully v3-sealed, anchored, bound" (#473 LD9). */
export function weakerProperties(report: LedgerVerification): string[] {
    const weaker: string[] = [];
    const { v1Rows, v2Rows, unfrozenLegacyRows } = report.coverage;
    if (report.sealScope !== 'full') {
        weaker.push(`ledger seal scope ${report.sealScope}, not full-column v3`);
    }
    if (v1Rows + v2Rows > 0) {
        weaker.push(`${v1Rows} v1 and ${v2Rows} v2 legacy row(s) authenticate only part of each row; their integrity before activation is INCONCLUSIVE`);
    }
    if (unfrozenLegacyRows > 0) {
        weaker.push(`${unfrozenLegacyRows} legacy row(s) are not covered by an activation receipt`);
    }
    if (report.anchor.status === 'unanchored') {
        weaker.push('anchor never established');
    } else if (report.anchor.status === 'established-late') {
        weaker.push(`anchor established late at id ${report.anchor.establishedAtId}; earlier rows are INCONCLUSIVE for truncation`);
    }
    if (report.anchor.unanchoredTail > 0) {
        weaker.push(`${report.anchor.unanchoredTail} row(s) not yet anchored`);
    }
    if (!report.anchor.workspaceBound) {
        weaker.push('ledger not bound to a workspace');
    }
    if (report.rotation && !report.rotation.retiredVerificationOk) {
        weaker.push(`ROTATED FROM FAILED LEDGER (${report.rotation.retiredFile})`);
    }
    return weaker;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function normalizeFailure(raw: unknown): LedgerFailure {
    const f = isObject(raw) ? raw : {};
    const id = typeof f.id === 'number' && Number.isInteger(f.id) ? f.id : null;
    const code = typeof f.code === 'string' && f.code.length > 0 && f.code.length <= MAX_CODE ? f.code : 'malformed';
    const detail = typeof f.detail === 'string' ? f.detail : (isObject(raw) ? '' : String(raw));
    return { id, code: code as LedgerFailure['code'], detail: detail.slice(0, MAX_DETAIL) };
}

/** Reject green anchor metadata that no actual anchored verifier could emit. */
function anchorMetadataWellShaped(anchor: Record<string, unknown>): boolean {
    if (['verified', 'established-now', 'established-late'].includes(String(anchor.status))) {
        return typeof anchor.headId === 'number'
            && typeof anchor.establishedAtId === 'number'
            && anchor.establishedAtId <= anchor.headId
            && typeof anchor.establishedAt === 'string'
            && anchor.establishedAt.trim().length > 0;
    }
    if (anchor.status === 'unanchored') {
        return anchor.headId === null && anchor.establishedAtId === null && anchor.establishedAt === null;
    }
    return true; // Broken anchor statuses are handled separately by the verifier.
}

/** Strictly check fields needed to describe an intact, anchored ledger. */
function wellShaped(report: Record<string, unknown>): boolean {
    const coverage = report.coverage;
    const anchor = report.anchor;
    const scope = report.sealScope;
    const rotation = report.rotation;
    const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
    const idOrNull = (v: unknown): boolean => v === null || nonnegative(v);
    if (!nonnegative(report.rows) || !['full', 'frozen-legacy', 'partial', 'none'].includes(String(scope))) return false;
    if (!isObject(coverage) || !COVERAGE_KEYS.every((k) => nonnegative(coverage[k]))) return false;
    if (!isObject(anchor) || typeof anchor.status !== 'string' || !ANCHOR_STATUSES.has(anchor.status)) return false;
    if (typeof anchor.workspaceBound !== 'boolean' || !nonnegative(anchor.unanchoredTail)) return false;
    if (!idOrNull(anchor.headId) || !idOrNull(anchor.establishedAtId)) return false;
    if (!(anchor.establishedAt === null || typeof anchor.establishedAt === 'string')) return false;
    if (!anchorMetadataWellShaped(anchor)) return false;
    if (rotation !== undefined && rotation !== null) {
        if (!isObject(rotation) || typeof rotation.retiredFile !== 'string' || typeof rotation.retiredVerificationOk !== 'boolean') return false;
    }
    // A successful verification cannot report a known failed anchor. Source
    // verification reports these statuses with failures; reject contradictions.
    if (report.ok === true && ['head-missing', 'ledger-mismatch', 'unavailable'].includes(String(anchor.status))) return false;
    // Every verified row must contribute exactly one seal version. Frozen and
    // unfrozen counts partition only legacy rows, not new v3 entries.
    const legacy = (coverage.v1Rows as number) + (coverage.v2Rows as number);
    if (legacy + (coverage.v3Rows as number) !== report.rows) return false;
    if ((coverage.frozenLegacyRows as number) + (coverage.unfrozenLegacyRows as number) !== legacy) return false;
    if (report.ok === true && scope === 'full' && legacy !== 0) return false;
    return true;
}

function summary(status: LedgerIntegrityStatus, reason: string, now: Date, extra: Partial<LedgerIntegritySummary> = {}): LedgerIntegritySummary {
    return {
        status, reason, verifiedAt: now.toISOString(),
        sealScope: null, rows: null, coverage: null, anchor: null, rotation: null,
        weakerProperties: [], failures: [], failureCount: 0, failuresTruncated: false,
        ...extra,
    };
}

function reportFields(report: Record<string, unknown>, shaped: boolean): Partial<LedgerIntegritySummary> {
    if (!shaped) return {};
    const r = report as unknown as LedgerVerification;
    return { sealScope: r.sealScope ?? null, rows: typeof r.rows === 'number' ? r.rows : null, coverage: r.coverage, anchor: r.anchor, rotation: r.rotation ?? null };
}

/** Read the ledger's integrity for export. Never throws. */
export async function summarizeLedgerIntegrity(ledger: IntegritySource | null | undefined, now: Date = new Date()): Promise<LedgerIntegritySummary> {
    if (!ledger || typeof ledger.verifyLedger !== 'function') return summary('unavailable', 'Ledger not wired.', now);
    if (typeof ledger.isAvailable !== 'function') return summary('unavailable', 'The ledger does not report availability.', now);
    let report: unknown;
    try {
        if (!ledger.isAvailable()) {
            const why = typeof ledger.getDisabledReason === 'function' ? ledger.getDisabledReason() : undefined;
            return summary('unavailable', why ?? 'Ledger unavailable.', now);
        }
        report = await ledger.verifyLedger();
    } catch (error) {
        return summary('unavailable', `Ledger verification error: ${message(error)}`, now);
    }
    if (!isObject(report) || typeof report.ok !== 'boolean' || !Array.isArray(report.failures)) {
        return summary('unavailable', 'Ledger verification returned a malformed report.', now);
    }
    const all = report.failures.map(normalizeFailure);
    const listed = { failures: all.slice(0, MAX_REPORTED_FAILURES), failureCount: all.length, failuresTruncated: all.length > MAX_REPORTED_FAILURES };
    if (all.length === 1 && all[0].code === 'no-database') {
        return summary('unavailable', all[0].detail || 'Ledger DB not initialized', now, listed);
    }
    const shaped = wellShaped(report);
    if (report.ok !== true || all.length > 0) {
        const first = all[0];
        const where = first ? `${first.code}${first.id !== null ? ` at id ${first.id}` : ''}` : 'unknown';
        return summary('failed', `Ledger verification failed: ${all.length} failure(s); first ${where}.`, now, { ...reportFields(report, shaped), ...listed });
    }
    if (!shaped) return summary('unavailable', 'Ledger verification returned a malformed report.', now);
    const verified = report as unknown as LedgerVerification;
    let weaker: string[];
    try {
        weaker = weakerProperties(verified);
    } catch (error) {
        return summary('unavailable', `Ledger verification returned a malformed report: ${message(error)}`, now);
    }
    const fields = { ...reportFields(report, true), ...listed, weakerProperties: weaker };
    if (weaker.length > 0) return summary('partial-seal', `PARTIAL SEAL: ${weaker.join('; ')}.`, now, fields);
    return summary('intact', `Ledger chain intact: all ${verified.rows} rows sealed v3 (every column), anchored at id ${verified.anchor.headId}.`, now, fields);
}
