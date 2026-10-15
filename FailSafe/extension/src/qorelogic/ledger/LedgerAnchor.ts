/**
 * LedgerAnchor - SecretStorage anchors for soa_ledger (#473).
 *
 * Two records, neither derived from configuration:
 * - head anchor (ledgerAnchor:g:<genesis entry_hash>): the newest head this
 *   extension proved, so truncation, rollback and transplant are detected;
 * - workspace binding (ledgerAnchor:w:<sha256(workspace root)>): the genesis
 *   this workspace's ledger must have, so repointing ledgerPath is detected.
 *
 * Every proof is made against the STORED record, re-read before each store.
 * The writer only advances an existing record; records are created only by
 * initialize (LD12) and rotation (LD13), each create-if-absent, and every
 * SecretStorage call (creates at initialize and the ledgerSecret read/write in
 * LedgerManager included) is bounded by STORE_TIMEOUT_MS, so verifyLedger
 * takes at most about three bounds (flush, then two reads). The binding is never rewritten by initialize except when
 * finishing an interrupted rotation (LD12 row 5). Verification itself is pure
 * and does not latch; a failed pre-store proof latches the writer for the
 * session. Rotation rebinds this window only: another open window keeps the
 * retired genesis in its cache and its verifyChain reports false until it
 * reloads.
 */

import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { ISecretStore } from '../../core/interfaces';
import { SEAL_DID, SoaLedgerRow, parseSignature, sha256 } from './LedgerSeal';
import {
    AnchorContext, AnchorStatus, HeadAnchorRecord, LedgerFailure, WorkspaceBinding, checkGenesis, checkRowSeal, verifyRows,
} from './LedgerVerifier';
import { activate, readAllRows, readFirst, rotationEvidence, writeGenesis } from './LedgerWriter';

export const GENESIS_KEY_PREFIX = 'ledgerAnchor:g:';
export const WORKSPACE_KEY_PREFIX = 'ledgerAnchor:w:';
/** Bound on every SecretStorage call so a hung keychain cannot hang initialize or the gate. */
export const STORE_TIMEOUT_MS = 2000;

export function genesisKey(genesisHash: string): string {
    return GENESIS_KEY_PREFIX + genesisHash;
}

/** realpath.native resolves case, 8.3 names and junctions on win32; lower-case only there. */
export function normalizeRoot(root: string): string {
    let resolved: string;
    try { resolved = fs.realpathSync.native(root); } catch { resolved = path.resolve(root); }
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function workspaceKey(root: string): string {
    return WORKSPACE_KEY_PREFIX + sha256(normalizeRoot(root));
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SecretStorage timed out')), ms);
        promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}

async function readJson<T>(store: ISecretStore, key: string, ms: number): Promise<T | null> {
    const raw = await withTimeout(store.get(key), ms);
    return raw === undefined || raw === null ? null : JSON.parse(raw) as T;
}

const LIVE: readonly AnchorStatus[] = ['verified', 'established-now', 'established-late'];

/**
 * LD11 proof of a stored record against the database: same genesis (and the
 * binding's), the anchored head present with its hash, and every row after it
 * up to candidateHeadId sealed and linked.
 */
export function checkAgainstDb(
    db: Database.Database, secret: string, record: HeadAnchorRecord, binding: WorkspaceBinding | null, candidateHeadId?: number,
): LedgerFailure[] {
    const first = readFirst(db);
    if (!first) { return [{ id: null, code: 'empty-ledger', detail: 'the ledger has no rows' }]; }
    if (record.genesisHash !== first.entry_hash || (binding && binding.genesisHash !== first.entry_hash)) {
        return [{ id: first.id, code: 'anchor-ledger-mismatch', detail: 'the ledger does not have the anchored genesis' }];
    }
    // A matching entry_hash string proves nothing on its own: the row must also carry its seal.
    const firstSeal = checkRowSeal(first, secret).failure;
    if (firstSeal) { return [firstSeal]; }
    const head = db.prepare('SELECT * FROM soa_ledger WHERE id = ?').get(record.headId) as SoaLedgerRow | undefined;
    if (!head || head.entry_hash !== record.headHash) {
        return [{ id: record.headId, code: 'anchor-head-missing', detail: 'the anchored head row is missing or replaced' }];
    }
    const headSeal = checkRowSeal(head, secret).failure;
    if (headSeal) { return [headSeal]; }
    if (candidateHeadId === undefined || candidateHeadId <= record.headId) { return []; }
    const tail = db.prepare('SELECT * FROM soa_ledger WHERE id > ? AND id <= ? ORDER BY id ASC').all(record.headId, candidateHeadId) as SoaLedgerRow[];
    let prev = head;
    for (const row of tail) {
        const { failure } = checkRowSeal(row, secret);
        if (failure) { return [failure]; }
        if (row.prev_hash !== prev.entry_hash) { return [{ id: row.id, code: 'prev-link', detail: 'tail does not link to the anchored head' }]; }
        prev = row;
    }
    return [];
}

function failureStatus(failures: LedgerFailure[]): AnchorStatus {
    return failures.some((f) => f.code === 'anchor-ledger-mismatch') ? 'ledger-mismatch' : 'head-missing';
}

export interface LedgerAnchorDeps {
    store: ISecretStore;
    db: Database.Database;
    /** A getter, so the secret never sits on an enumerable field. */
    secret: () => string;
    ledgerPath: string;
    workspaceRoot: string | undefined;
    timeoutMs?: number;
}

export class LedgerAnchor {
    private record: HeadAnchorRecord | null = null;
    private binding: WorkspaceBinding | null = null;
    private status: AnchorStatus = 'unanchored';
    private readonly wKey: string | null;
    private readonly ms: number;
    /** A stored binding this session proved superseded by a sealed rotation genesis (LD13). */
    private superseded: string | null = null;
    private queued: { id: number; hash: string } | null = null;
    private running: Promise<void> | null = null;

    constructor(private readonly deps: LedgerAnchorDeps) {
        this.wKey = deps.workspaceRoot ? workspaceKey(deps.workspaceRoot) : null;
        this.ms = deps.timeoutMs ?? STORE_TIMEOUT_MS;
    }

    context(): AnchorContext {
        return { record: this.record, binding: this.binding, workspaceBound: this.binding !== null, sessionStatus: this.status };
    }

    /** Genesis this workspace is currently bound to (LD13 supersededBinding). */
    boundGenesis(): string | null {
        return this.binding?.genesisHash ?? null;
    }

    /** LD12: initialize decision table. */
    async initialize(): Promise<void> {
        const { db, store } = this.deps;
        const secret = this.deps.secret();
        const first = readFirst(db);
        let record: HeadAnchorRecord | null;
        try {
            this.binding = this.wKey ? await readJson<WorkspaceBinding>(store, this.wKey, this.ms) : null;
            record = first ? await readJson<HeadAnchorRecord>(store, genesisKey(first.entry_hash), this.ms) : null;
        } catch {
            this.status = 'unavailable';                                     // row 1
            if (!first) { writeGenesis(db, secret); }
            return;
        }
        if (!first) {                                                        // rows 2 and 3
            const genesis = writeGenesis(db, secret) as SoaLedgerRow;
            if (this.binding) { this.status = 'ledger-mismatch'; return; }
            await this.create(genesis, genesis, null, false, 'established-now');
            return;
        }
        if (checkGenesis(first)) { return; }                                 // row 4: verify reports genesis-invalid
        if (this.binding && this.binding.genesisHash !== first.entry_hash) {
            // Row 5 trusts the rotation genesis payload only once every row verifies.
            const sealed = verifyRows(readAllRows(db), secret).ok;
            const evidence = sealed ? rotationEvidence(first, this.deps.ledgerPath) : null;
            if (evidence && evidence.supersededBinding === this.binding.genesisHash) {
                await this.finishRotation(first, record);                    // row 5
            } else {
                this.status = 'ledger-mismatch';                             // row 6
            }
            return;
        }
        if (record) { await this.adopt(record); return; }                    // row 7
        const rows = readAllRows(db);
        if (!rows.some((row) => parseSignature(row.signature)?.version === 'v3')) {
            const result = activate(db, secret, null);                       // row 8
            if (result.status === 'activated') {
                const r = result.receipt;
                await this.create(first, r, { receiptId: r.id, receiptHash: r.entry_hash }, false, 'verified');
            } else if (result.status === 'skipped') {
                const again = await this.readRecord(first.entry_hash);
                if (again) { await this.adopt(again); }
            }
            return;
        }
        await this.createLate(first, rows);                                  // row 9
    }

    /** Re-read both records for verifyLedger; a read failure reports unavailable for this call. */
    async reload(): Promise<AnchorContext> {
        const first = readFirst(this.deps.db);
        try {
            const binding = this.wKey ? await readJson<WorkspaceBinding>(this.deps.store, this.wKey, this.ms) : null;
            const record = first ? await readJson<HeadAnchorRecord>(this.deps.store, genesisKey(first.entry_hash), this.ms) : null;
            if (binding && binding.genesisHash !== this.superseded) { this.binding = binding; }
            if (record) { this.record = record; }
        } catch {
            return { ...this.context(), sessionStatus: 'unavailable' };
        }
        return this.context();
    }

    /** Queue an advance after a committed append. Never creates a record. */
    onAppended(row: SoaLedgerRow): void {
        if (!this.record || !LIVE.includes(this.status)) { return; }
        this.queued = { id: row.id, hash: row.entry_hash };
        if (!this.running) {
            this.running = this.drain().finally(() => { this.running = null; });
        }
    }

    /** Resolves true when no store is pending, false when timeoutMs elapsed first. */
    async flush(timeoutMs = STORE_TIMEOUT_MS): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (this.running) {
            const left = deadline - Date.now();
            if (left <= 0) { return false; }
            try { await withTimeout(this.running, left); } catch { return false; }
        }
        return true;
    }

    /** LD13 step 3: anchor the rotation genesis, then rebind this workspace. */
    async completeRotation(genesis: SoaLedgerRow): Promise<void> {
        this.record = null;
        this.status = 'unanchored';
        this.superseded = this.binding?.genesisHash ?? null;
        this.binding = null;   // the superseded binding must not fail proofs of the new genesis
        await this.create(genesis, genesis, null, false, 'established-now', true);
    }

    private async drain(): Promise<void> {
        while (this.queued) {
            const candidate = this.queued;
            this.queued = null;
            // A store that cannot run (database closed, keychain error) leaves the tail unanchored.
            try { await this.storeOne(candidate); } catch { /* reported as unanchoredTail */ }
        }
    }

    private async storeOne(candidate: { id: number; hash: string }): Promise<void> {
        if (!this.record || !LIVE.includes(this.status)) { return; }
        const key = genesisKey(this.record.genesisHash);
        let stored: HeadAnchorRecord | null;
        try { stored = await readJson<HeadAnchorRecord>(this.deps.store, key, this.ms); } catch { return; }
        if (!stored) { return; }
        // Prove the STORED record, not the cache: another window may have advanced it.
        const failures = checkAgainstDb(this.deps.db, this.deps.secret(), stored, this.binding, candidate.id);
        if (failures.length > 0) { this.record = stored; this.status = failureStatus(failures); return; }
        if (stored.headId >= candidate.id) { this.record = stored; return; }
        const next: HeadAnchorRecord = { ...stored, headId: candidate.id, headHash: candidate.hash };
        try {
            await withTimeout(this.deps.store.store(key, JSON.stringify(next)), this.ms);
            this.record = next;
        } catch {
            this.record = stored;
        }
    }

    private async readRecord(genesisHash: string): Promise<HeadAnchorRecord | null> {
        try { return await readJson<HeadAnchorRecord>(this.deps.store, genesisKey(genesisHash), this.ms); } catch { return null; }
    }

    /** Row 7: prove an existing record; bind only on success. */
    private async adopt(record: HeadAnchorRecord): Promise<void> {
        this.record = record;
        const failures = checkAgainstDb(this.deps.db, this.deps.secret(), record, this.binding);
        if (failures.length > 0) { this.status = failureStatus(failures); return; }
        this.status = record.establishedLate ? 'established-late' : 'verified';
        await this.bind(record.genesisHash, false);
    }

    /** Rows 5 and 9 create late records; refuse when the rows themselves do not verify. */
    private async createLate(first: SoaLedgerRow, rows: SoaLedgerRow[], rebind = false): Promise<boolean> {
        if (!verifyRows(rows, this.deps.secret()).ok) { return false; }
        const head = rows[rows.length - 1];
        const firstV3 = rows.find((row) => parseSignature(row.signature)?.version === 'v3');
        const activation = firstV3 && firstV3.agent_did === SEAL_DID ? { receiptId: firstV3.id, receiptHash: firstV3.entry_hash } : null;
        await this.create(first, head, activation, true, 'established-late', rebind);
        return true;
    }

    /** Row 5: finish an interrupted rotation, then rebind. */
    private async finishRotation(first: SoaLedgerRow, record: HeadAnchorRecord | null): Promise<void> {
        if (record) {
            this.record = record;
            this.superseded = this.binding?.genesisHash ?? null;
            this.binding = null;   // superseded by this rotation; stays stored until the rebind below
            const failures = checkAgainstDb(this.deps.db, this.deps.secret(), record, null);
            if (failures.length > 0) { this.status = 'head-missing'; return; }
            this.status = record.establishedLate ? 'established-late' : 'verified';
            await this.bind(first.entry_hash, true);
            return;
        }
        const prior = this.binding;
        this.superseded = prior?.genesisHash ?? null;
        this.binding = null;   // the binding being superseded must not fail the proof of the new genesis
        if (!await this.createLate(first, readAllRows(this.deps.db), true)) { this.binding = prior; this.superseded = null; }
    }

    /**
     * Create-if-absent. The binding is attempted whenever the subject passed
     * its checks, even when the head-anchor create fails, so an emptied or
     * repointed ledger still meets a binding at the next initialize.
     */
    private async create(
        genesis: SoaLedgerRow, subject: SoaLedgerRow, activation: HeadAnchorRecord['activation'],
        late: boolean, okStatus: AnchorStatus, rebind = false,
    ): Promise<void> {
        const key = genesisKey(genesis.entry_hash);
        let existing: HeadAnchorRecord | null;
        try {
            existing = await readJson<HeadAnchorRecord>(this.deps.store, key, this.ms);
        } catch {
            this.status = 'unanchored';   // cannot tell absent from unreadable: create nothing
            return;
        }
        if (existing) { await this.adopt(existing); return; }
        const record: HeadAnchorRecord = {
            v: 1, genesisHash: genesis.entry_hash, headId: subject.id, headHash: subject.entry_hash, activation,
            establishedAt: subject.timestamp, establishedAtId: subject.id, establishedLate: late,
        };
        try {
            await withTimeout(this.deps.store.store(key, JSON.stringify(record)), this.ms);
            this.record = record;
            this.status = okStatus;
        } catch {
            this.status = 'unanchored';
        }
        await this.bind(genesis.entry_hash, rebind);
    }

    private async bind(genesisHash: string, rebind: boolean): Promise<void> {
        if (!this.wKey || (this.binding && !rebind)) { return; }
        const binding: WorkspaceBinding = { genesisHash, boundAt: new Date().toISOString() };
        try {
            await withTimeout(this.deps.store.store(this.wKey, JSON.stringify(binding)), this.ms);
            this.binding = binding;
        } catch { /* unbound: the gate warns */ }
    }
}
