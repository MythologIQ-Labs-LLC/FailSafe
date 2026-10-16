/**
 * SecurityReplayGuard - Prevents replay attacks on governance calls
 *
 * Implements nonce-based request validation:
 * - Generates unique nonces for each governance request
 * - Validates nonces are used exactly once
 * - Rejects replayed or expired requests
 *
 * Architecture:
 * ```
 * Governance Request
 *     -> generateNonce() -> attach to request
 *     -> validateNonce() -> check one-time use
 *     -> consumeNonce() -> mark as used
 * ```
 *
 * v6.0.8 (#472): nonces.json is the authority, shared by every FailSafe
 * process on the workspace. Issuing, consuming and cleanup are each one
 * transaction under the cross-process lock on a fresh read (nonceStore.ts),
 * so of several processes consuming one nonce exactly one is accepted, and no
 * process's write erases another's nonces. Every failure fails closed: a busy
 * store refuses this call; a store that cannot be read or written refuses
 * every call until reload.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../shared/Logger";
import { NonceChange, NonceFile, NonceRecord, NonceStoreBusyError, NonceStoreSeams } from "./nonceStore";

export type { NonceRecord } from "./nonceStore";
export { createSignedRequest, processSignedRequest } from "./signedRequest";

export interface NonceValidationResult {
  valid: boolean;
  reason?: "not_found" | "expired" | "already_used" | "invalid_format" | "persistence_error";
  record?: NonceRecord;
}

export interface ReplayGuardOptions extends NonceStoreSeams {
  ttlMs?: number;
  cleanupIntervalMs?: number;
  /** How long a change waits for the store lock (default 3000 ms). */
  lockTimeoutMs?: number;
  /** Internal test seam: the lock's monotonic clock. */
  now?: () => number;
}

const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 5000;
const NONCE_FORMAT = /^[0-9a-f]{64}$/;
const isNonce = (nonce: unknown): nonce is string => typeof nonce === "string" && NONCE_FORMAT.test(nonce);
const short = (nonce: unknown): string => String(nonce).substring(0, 8) + "...";

export class SecurityReplayGuard {
  private readonly file: NonceFile;
  private readonly logger = new Logger("SecurityReplayGuard");
  private nonces: Map<string, NonceRecord> = new Map();
  private readonly defaultTtlMs: number;
  private cleanupInterval?: NodeJS.Timeout;
  private storeHealthy = true;

  constructor(rootOrSecurityDir: string, options: ReplayGuardOptions = {}) {
    const normalizedInput = path.resolve(rootOrSecurityDir);
    const looksLikeSecurityDir =
      path.basename(normalizedInput) === "security" &&
      path.basename(path.dirname(normalizedInput)) === ".failsafe";
    const storeDir = looksLikeSecurityDir
      ? normalizedInput
      : path.join(normalizedInput, ".failsafe", "security");
    this.file = new NonceFile(
      path.join(storeDir, "nonces.json"),
      { timeoutMs: options.lockTimeoutMs ?? LOCK_TIMEOUT_MS, staleMs: LOCK_STALE_MS, now: options.now },
      { renameSync: options.renameSync, writeSync: options.writeSync, fsyncSync: options.fsyncSync },
    );
    this.defaultTtlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default

    if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });

    try { // Load existing nonces
      this.readStore();
      this.logger.info(`Loaded ${this.nonces.size} nonces from store`);
    } catch (error) {
      this.logger.error("Nonce store unreadable: refusing replay authorization", error);
    }

    // Start cleanup interval
    const cleanupMs = options.cleanupIntervalMs || 60 * 1000; // 1 minute
    this.cleanupInterval = setInterval(() => this.runScheduledCleanup(), cleanupMs);
  }

  /**
   * Generate a new nonce for a governance request. Throws, issuing nothing,
   * when the nonce cannot be stored durably.
   */
  generateNonce(metadata?: Record<string, unknown>, ttlMs?: number): string {
    this.requireHealthyStore();
    const nonce = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const ttl = ttlMs || this.defaultTtlMs;
    const record: NonceRecord = { nonce, createdAt: now, expiresAt: now + ttl, metadata };
    this.transact((records) => {
      records.set(nonce, record);
      return { changed: true, result: undefined };
    });
    this.logger.debug("Generated nonce", { nonce: short(nonce), ttl });
    return nonce;
  }

  /** Validate a nonce without consuming it, against a fresh read of the store. */
  validateNonce(nonce: string): NonceValidationResult {
    if (!this.storeHealthy) return { valid: false, reason: "persistence_error" };
    if (!isNonce(nonce)) return { valid: false, reason: "invalid_format" };
    try { this.readStore(); } catch { return { valid: false, reason: "persistence_error" }; }
    return this.check(this.nonces.get(nonce));
  }

  /**
   * Validate and consume a nonce in one locked transaction. The decision is
   * made only from the store as read under the lock.
   */
  consumeNonce(nonce: string, consumedBy?: string): NonceValidationResult {
    let outcome: NonceValidationResult = { valid: false, reason: "persistence_error" };
    if (this.storeHealthy && !isNonce(nonce)) outcome = { valid: false, reason: "invalid_format" };
    else if (this.storeHealthy) {
      try {
        outcome = this.transact((records) => {
          const found = this.check(records.get(nonce));
          if (!found.valid) return { changed: false, result: found };
          const record: NonceRecord = { ...found.record!, consumedAt: Date.now(), consumedBy };
          records.set(nonce, record);
          return { changed: true, result: { valid: true, record } };
        });
      } catch (error) {
        this.logger.error("Refusing nonce consumption: the store could not be updated", error);
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
    const now = Date.now();
    const stats = { total: this.nonces.size, active: 0, expired: 0, consumed: 0 };
    for (const record of this.nonces.values()) {
      if (record.consumedAt) stats.consumed++;
      else if (now > record.expiresAt) stats.expired++;
      else stats.active++;
    }
    return stats;
  }

  /** Remove expired and consumed nonces */
  cleanup(): number {
    const now = Date.now();
    const removed = this.transact((records) => {
      let count = 0;
      for (const [nonce, record] of records.entries()) {
        // Remove if expired or consumed more than 1 hour ago
        if (now > record.expiresAt || (record.consumedAt && now - record.consumedAt > 60 * 60 * 1000)) {
          records.delete(nonce);
          count++;
        }
      }
      return { changed: count > 0, result: count };
    });
    if (removed > 0) this.logger.debug(`Cleaned up ${removed} nonces`);
    return removed;
  }

  /**
   * Interval entry point: a persistence failure here must not escape the timer
   * (it would be an uncaught exception in the extension host). A failed write
   * has already marked the store unhealthy, so authorization stays fail-closed.
   */
  private runScheduledCleanup(): void {
    try { this.cleanup(); } catch (error) {
      this.logger.error("Nonce cleanup could not persist; replay authorization stays fail-closed", error);
    }
  }

  private check(record: NonceRecord | undefined): NonceValidationResult {
    if (!record) return { valid: false, reason: "not_found" };
    if (Date.now() > record.expiresAt) return { valid: false, reason: "expired", record };
    if (record.consumedAt) return { valid: false, reason: "already_used", record };
    return { valid: true, record };
  }

  /** A fresh lock-free read. A store that cannot be read or parsed disables it (fail closed). */
  private readStore(): void {
    try {
      this.nonces = this.file.read();
    } catch (error) {
      this.storeHealthy = false;
      throw error;
    }
  }

  private refreshQuietly(): void {
    if (!this.storeHealthy) return;
    try { this.readStore(); } catch { /* stats keep the last known store */ }
  }

  /**
   * One change in a locked transaction (NonceFile.transact). A busy or
   * taken-over store throws without disabling it; a failed read or write
   * disables it.
   */
  private transact<T>(change: NonceChange<T>): T {
    this.requireHealthyStore();
    try {
      const { result, records } = this.file.transact(change);
      this.nonces = records;
      return result;
    } catch (error) {
      if (!(error instanceof NonceStoreBusyError)) this.storeHealthy = false;
      this.logger.error("Failed to save nonce store", error);
      throw error;
    }
  }

  private requireHealthyStore(): void {
    if (!this.storeHealthy) {
      throw new Error(
        `Nonce store unavailable: fail-closed persistence state (${this.file.path}). ` +
        "To recover, move that file aside and reload the window; nonces expire after their TTL, so no replay window opens.",
      );
    }
  }

  /**
   * Dispose of resources. Nothing is written: every change is already on
   * disk, and writing this process's view would erase other processes' nonces.
   */
  dispose(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.nonces.clear();
  }
}
