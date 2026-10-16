/**
 * SecurityReplayGuard - Prevents replay attacks on governance calls: each
 * request carries a nonce (generateNonce) that is accepted once
 * (consumeNonce), and replayed or expired nonces are rejected.
 *
 * v6.0.8 (#472): nonces.json is the authority, shared by every FailSafe
 * process on the workspace. Issuing, consuming and cleanup are each one
 * transaction under the cross-process lock on a fresh read (nonceStore.ts).
 * A consumption is accepted only by the process that creates the nonce's
 * marker file (nonceMarkers.ts), so even two processes that both believe they
 * hold the lock cannot both accept a nonce. Every failure fails closed: a busy
 * store refuses this call; a store that cannot be read or written refuses
 * every call until reload.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../shared/Logger";
import { NonceChange, NonceFile, NonceRecord, NonceStoreBusyError, NonceStoreSeams } from "./nonceStore";
import { MARKER_GRACE_MS, MarkerSeams, NonceMarkerDirError, NonceMarkers, NonceMarkerTakenError } from "./nonceMarkers";

export type { NonceRecord } from "./nonceStore";
export { createSignedRequest, processSignedRequest } from "./signedRequest";

export interface NonceValidationResult {
  valid: boolean;
  reason?: "not_found" | "expired" | "already_used" | "invalid_format" | "persistence_error";
  record?: NonceRecord;
}

/** @internal Fault-injection and clock seams for tests; production passes none. */
export type ReplayGuardSeams = Omit<NonceStoreSeams, "renameSync"> & MarkerSeams & {
  /** The lock's monotonic clock. */
  now?: () => number;
  /** The wall clock used for issue times and expiry (default Date.now). */
  clock?: () => number;
};

export interface ReplayGuardOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
  /** How long a change waits for the store lock (default 3000 ms). */
  lockTimeoutMs?: number;
  /** Rename hook (kept from v6.0.7, where tests used it). */
  renameSync?: (from: string, to: string) => void;
  /** @internal Test seams. */
  seams?: ReplayGuardSeams;
}

const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 5000;
const CONSUMED_RETENTION_MS = MARKER_GRACE_MS;
const NONCE_FORMAT = /^[0-9a-f]{64}$/;
const isNonce = (nonce: unknown): nonce is string => typeof nonce === "string" && NONCE_FORMAT.test(nonce);
const short = (nonce: unknown): string => String(nonce).substring(0, 8) + "...";

export class SecurityReplayGuard {
  private readonly file: NonceFile;
  private readonly markers: NonceMarkers;
  private readonly clock: () => number;
  private readonly logger = new Logger("SecurityReplayGuard");
  private nonces: Map<string, NonceRecord> = new Map();
  private readonly defaultTtlMs: number;
  private cleanupInterval?: NodeJS.Timeout;
  private storeHealthy = true;
  private disabledBy: NonceMarkerDirError | null = null;

  constructor(rootOrSecurityDir: string, options: ReplayGuardOptions = {}) {
    const normalizedInput = path.resolve(rootOrSecurityDir);
    const looksLikeSecurityDir =
      path.basename(normalizedInput) === "security" &&
      path.basename(path.dirname(normalizedInput)) === ".failsafe";
    const storeDir = looksLikeSecurityDir
      ? normalizedInput
      : path.join(normalizedInput, ".failsafe", "security");
    const seams = options.seams ?? {};
    this.file = new NonceFile(
      path.join(storeDir, "nonces.json"),
      { timeoutMs: options.lockTimeoutMs ?? LOCK_TIMEOUT_MS, staleMs: LOCK_STALE_MS, now: seams.now },
      { renameSync: options.renameSync, writeSync: seams.writeSync, fsyncSync: seams.fsyncSync, openTemp: seams.openTemp },
    );
    this.markers = new NonceMarkers(path.join(storeDir, "nonces.consumed"), { openMarker: seams.openMarker });
    this.clock = seams.clock ?? Date.now;
    this.defaultTtlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default

    if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });

    try { // Load existing nonces
      this.readStore();
      this.logger.info(`Loaded ${this.nonces.size} nonces from store`);
    } catch (error) {
      this.logger.error("Nonce store unreadable: refusing replay authorization", error);
    }
    const cleanupMs = options.cleanupIntervalMs || 60 * 1000; // 1 minute
    this.cleanupInterval = setInterval(() => this.runScheduledCleanup(), cleanupMs);
  }

  /** Generate a new nonce; throws, issuing nothing, when it cannot be stored durably. */
  generateNonce(metadata?: Record<string, unknown>, ttlMs?: number): string {
    this.requireHealthyStore();
    const nonce = crypto.randomBytes(32).toString("hex");
    const now = this.clock();
    const ttl = ttlMs || this.defaultTtlMs;
    const record: NonceRecord = { nonce, createdAt: now, expiresAt: now + ttl, metadata };
    this.transact((records) => { records.set(nonce, record); return { changed: true, result: undefined }; });
    this.logger.debug("Generated nonce", { nonce: short(nonce), ttl });
    return nonce;
  }

  /** Validate a nonce without consuming it, against a fresh read of the store and its marker. */
  validateNonce(nonce: string): NonceValidationResult {
    if (!this.storeHealthy) return { valid: false, reason: "persistence_error" };
    if (!isNonce(nonce)) return { valid: false, reason: "invalid_format" };
    try {
      this.readStore();
      return this.check(nonce, this.nonces.get(nonce));
    } catch (error) {
      this.failed(error);
      return { valid: false, reason: "persistence_error" };
    }
  }

  /** Validate and consume in one locked transaction; only the creator of the nonce's marker accepts. */
  consumeNonce(nonce: string, consumedBy?: string): NonceValidationResult {
    let outcome: NonceValidationResult = { valid: false, reason: "persistence_error" };
    if (this.storeHealthy && !isNonce(nonce)) outcome = { valid: false, reason: "invalid_format" };
    else if (this.storeHealthy) {
      try {
        outcome = this.transact((records) => {
          const found = this.check(nonce, records.get(nonce));
          if (!found.valid) return { changed: false, result: found };
          const record: NonceRecord = { ...found.record!, consumedAt: this.clock(), consumedBy };
          records.set(nonce, record);
          return { changed: true, result: { valid: true, record }, commit: () => this.markers.create(nonce, record.expiresAt) };
        });
      } catch (error) {
        if (error instanceof NonceMarkerTakenError) outcome = { valid: false, reason: "already_used" };
        else this.logger.error("Refusing nonce consumption: the store could not be updated", error);
      }
    }
    if (outcome.valid) this.logger.debug("Consumed nonce", { nonce: short(nonce), consumedBy });
    else this.logger.warn("Nonce validation failed", { nonce: short(nonce), reason: outcome.reason });
    return outcome;
  }

  /** Check if a nonce exists (regardless of state) */
  hasNonce(nonce: string): boolean {
    this.refreshQuietly();
    return this.nonces.has(nonce);
  }

  /** Get statistics about the nonce store */
  getStats(): { total: number; active: number; expired: number; consumed: number } {
    this.refreshQuietly();
    const stats = { total: this.nonces.size, active: 0, expired: 0, consumed: 0 };
    for (const record of this.nonces.values()) {
      if (record.consumedAt) stats.consumed++;
      else if (this.expired(record)) stats.expired++;
      else stats.active++;
    }
    return stats;
  }

  /** Remove expired and consumed nonces, and markers an hour past their expiry */
  cleanup(): number {
    const now = this.clock();
    const removed = this.transact((records) => {
      let count = 0;
      for (const [nonce, record] of records.entries()) {
        // Remove if expired or consumed more than 1 hour ago
        if (this.expired(record) || (record.consumedAt && now - record.consumedAt > CONSUMED_RETENTION_MS)) {
          records.delete(nonce);
          count++;
        }
      }
      return { changed: count > 0, result: count };
    });
    try { this.markers.sweep(now); } catch (error) { this.logger.warn("Nonce marker cleanup failed", error); }
    if (removed > 0) this.logger.debug(`Cleaned up ${removed} nonces`);
    return removed;
  }

  /** Interval entry point: a failure must not escape the timer; the store stays fail-closed. */
  private runScheduledCleanup(): void {
    try { this.cleanup(); } catch (error) {
      this.logger.error("Nonce cleanup could not persist; replay authorization stays fail-closed", error);
    }
  }

  /** A missing or non-numeric expiresAt counts as expired (review delta LD-7). */
  private expired(record: NonceRecord): boolean {
    return typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt) || this.clock() > record.expiresAt;
  }

  private check(nonce: string, record: NonceRecord | undefined): NonceValidationResult {
    if (!record) return { valid: false, reason: "not_found" };
    if (this.expired(record)) return { valid: false, reason: "expired", record };
    if (record.consumedAt || this.markers.has(nonce)) return { valid: false, reason: "already_used", record };
    return { valid: true, record };
  }

  /** A fresh lock-free read; a failure is classified by failed(). */
  private readStore(): void {
    try { this.nonces = this.file.read(); } catch (error) { this.failed(error); throw error; }
  }

  /** The stats path never changes the store's health (review delta LD-3). */
  private refreshQuietly(): void {
    if (!this.storeHealthy) return;
    try { this.nonces = this.file.read(); } catch { /* stats keep the last known store */ }
  }

  /** Busy and already-used are this call's outcome; anything else disables the store. */
  private failed(error: unknown): void {
    if (error instanceof NonceStoreBusyError || error instanceof NonceMarkerTakenError) return;
    this.storeHealthy = false;
    if (error instanceof NonceMarkerDirError) this.disabledBy = error;
  }

  /** One change in a locked transaction (NonceFile.transact), classified by failed(). */
  private transact<T>(change: NonceChange<T>): T {
    this.requireHealthyStore();
    try {
      const { result, records } = this.file.transact(change);
      this.nonces = records;
      return result;
    } catch (error) {
      this.failed(error);
      if (!(error instanceof NonceMarkerTakenError)) this.logger.error("Failed to save nonce store", error);
      throw error;
    }
  }

  private requireHealthyStore(): void {
    if (this.storeHealthy) return;
    throw new Error(this.disabledBy
      ? `Nonce store unavailable: fail-closed persistence state (${this.disabledBy.dir} is a link or not a folder). To recover, replace it with a real folder and reload the window.`
      : `Nonce store unavailable: fail-closed persistence state (${this.file.path}). To recover, move that file aside and reload the window; nonces expire after their TTL, so no replay window opens.`);
  }

  /** Nothing is written: every change is on disk, and this view could erase other processes' nonces. */
  dispose(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.nonces.clear();
  }
}
