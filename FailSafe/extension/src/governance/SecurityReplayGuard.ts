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
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../shared/Logger";

export interface NonceRecord {
  nonce: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
  consumedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface NonceValidationResult {
  valid: boolean;
  reason?: "not_found" | "expired" | "already_used" | "invalid_format" | "storage_unavailable";
  record?: NonceRecord;
}

export class SecurityReplayGuard {
  private readonly nonceStorePath: string;
  private readonly logger: Logger;
  private nonces: Map<string, NonceRecord> = new Map();
  private readonly defaultTtlMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    rootOrSecurityDir: string,
    options: { ttlMs?: number; cleanupIntervalMs?: number } = {},
  ) {
    const normalizedInput = path.resolve(rootOrSecurityDir);
    const looksLikeSecurityDir =
      path.basename(normalizedInput) === "security" &&
      path.basename(path.dirname(normalizedInput)) === ".failsafe";
    const storeDir = looksLikeSecurityDir
      ? normalizedInput
      : path.join(normalizedInput, ".failsafe", "security");
    this.nonceStorePath = path.join(storeDir, "nonces.json");
    this.defaultTtlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default
    this.logger = new Logger("SecurityReplayGuard");

    // Ensure directory exists
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }

    // Load existing nonces
    this.loadNonces();

    // Start cleanup interval
    const cleanupMs = options.cleanupIntervalMs || 60 * 1000; // 1 minute
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
  }

  /**
   * Generate a new nonce for a governance request
   */
  generateNonce(metadata?: Record<string, unknown>, ttlMs?: number): string {
    const nonce = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const ttl = ttlMs || this.defaultTtlMs;

    const record: NonceRecord = {
      nonce,
      createdAt: now,
      expiresAt: now + ttl,
      metadata,
    };

    this.nonces.set(nonce, record);
    if (!this.saveNonces()) {
      this.nonces.delete(nonce);
      throw new Error("Cannot issue replay nonce: durable nonce storage unavailable");
    }

    this.logger.debug("Generated nonce", {
      nonce: nonce.substring(0, 8) + "...",
      ttl,
    });

    return nonce;
  }

  /**
   * Validate a nonce without consuming it
   */
  validateNonce(nonce: string): NonceValidationResult {
    if (!nonce || typeof nonce !== "string" || nonce.length !== 64) {
      return { valid: false, reason: "invalid_format" };
    }

    const record = this.nonces.get(nonce);

    if (!record) {
      return { valid: false, reason: "not_found" };
    }

    if (Date.now() > record.expiresAt) {
      return { valid: false, reason: "expired", record };
    }

    if (record.consumedAt) {
      return { valid: false, reason: "already_used", record };
    }

    return { valid: true, record };
  }

  /**
   * Validate and consume a nonce in one operation
   */
  consumeNonce(nonce: string, consumedBy?: string): NonceValidationResult {
    const validation = this.validateNonce(nonce);

    if (!validation.valid) {
      this.logger.warn("Nonce validation failed", {
        nonce: nonce.substring(0, 8) + "...",
        reason: validation.reason,
      });
      return validation;
    }

    const record = validation.record!;
    record.consumedAt = Date.now();
    record.consumedBy = consumedBy;

    this.nonces.set(nonce, record);
    if (!this.saveNonces()) {
      // Retain the in-memory consumed mark so this process never retries a
      // failed persistence attempt as an accepted new request (#472).
      this.logger.error("Nonce consumption cannot be confirmed durably");
      return { valid: false, reason: "storage_unavailable", record };
    }

    this.logger.debug("Consumed nonce", {
      nonce: nonce.substring(0, 8) + "...",
      consumedBy,
    });

    return { valid: true, record };
  }

  /**
   * Check if a nonce exists (regardless of state)
   */
  hasNonce(nonce: string): boolean {
    return this.nonces.has(nonce);
  }

  /**
   * Get statistics about the nonce store
   */
  getStats(): {
    total: number;
    active: number;
    expired: number;
    consumed: number;
  } {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let consumed = 0;

    for (const record of this.nonces.values()) {
      if (record.consumedAt) {
        consumed++;
      } else if (now > record.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.nonces.size,
      active,
      expired,
      consumed,
    };
  }

  /**
   * Remove expired and consumed nonces
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [nonce, record] of this.nonces.entries()) {
      // Remove if expired or consumed more than 1 hour ago
      const shouldRemove =
        now > record.expiresAt ||
        (record.consumedAt && now - record.consumedAt > 60 * 60 * 1000);

      if (shouldRemove) {
        this.nonces.delete(nonce);
        removed++;
      }
    }

    if (removed > 0) {
      this.saveNonces();
      this.logger.debug(`Cleaned up ${removed} nonces`);
    }

    return removed;
  }

  /**
   * Load nonces from persistent storage
   */
  private loadNonces(): void {
    try {
      if (fs.existsSync(this.nonceStorePath)) {
        const content = fs.readFileSync(this.nonceStorePath, "utf8");
        const records = JSON.parse(content) as NonceRecord[];

        for (const record of records) {
          this.nonces.set(record.nonce, record);
        }

        this.logger.info(`Loaded ${this.nonces.size} nonces from store`);
      }
    } catch (error) {
      this.logger.warn("Failed to load nonce store, starting fresh", error);
      this.nonces.clear();
    }
  }

  /**
   * Save nonces to persistent storage
   */
  private saveNonces(): boolean {
    // Write an entirely new snapshot, fsync it, then rename over the old one
    // on the same filesystem. A partial JSON write must never corrupt the
    // previously accepted nonce history. Last-writer races across multiple
    // independent host processes remain a separate deployment constraint.
    const tmp = `${this.nonceStorePath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    let fd: number | undefined;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify([...this.nonces.values()], null, 2), "utf8");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.nonceStorePath);
      return true;
    } catch (error) {
      this.logger.error("Failed to persist nonce store", error);
      return false;
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* preserve original failure */ }
      }
      try { fs.unlinkSync(tmp); } catch { /* temp was renamed or could not be removed */ }
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.saveNonces();
    this.nonces.clear();
  }
}

/**
 * Helper function to create a signed request with nonce
 */
export function createSignedRequest(
  guard: SecurityReplayGuard,
  action: string,
  payload: Record<string, unknown>,
): {
  nonce: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
} {
  const nonce = guard.generateNonce({ action });
  return {
    nonce,
    action,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to validate and process a signed request
 */
export function processSignedRequest(
  guard: SecurityReplayGuard,
  request: { nonce: string; action: string; timestamp: string },
): NonceValidationResult {
  // Check timestamp is recent (within 5 minutes)
  const requestTime = new Date(request.timestamp).getTime();
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;

  if (isNaN(requestTime) || now - requestTime > maxAge) {
    return {
      valid: false,
      reason: "expired",
    };
  }

  return guard.consumeNonce(request.nonce, request.action);
}
