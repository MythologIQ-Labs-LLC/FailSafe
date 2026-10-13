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
  reason?: "not_found" | "expired" | "already_used" | "invalid_format" | "persistence_error";
  record?: NonceRecord;
}

export class SecurityReplayGuard {
  private readonly nonceStorePath: string;
  private readonly logger: Logger;
  private nonces: Map<string, NonceRecord> = new Map();
  private readonly defaultTtlMs: number;
  private cleanupInterval?: NodeJS.Timeout;
  private storeHealthy = true;

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
    this.requireHealthyStore();
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
    try { this.saveNonces(); } catch (error) {
      this.nonces.delete(nonce);
      this.storeHealthy = false;
      throw error;
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
    if (!this.storeHealthy) return { valid: false, reason: "persistence_error" };
    if (!nonce || typeof nonce !== "string" || !/^[0-9a-f]{64}$/.test(nonce)) {
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
    try { this.saveNonces(); } catch (error) {
      this.storeHealthy = false;
      this.logger.error("Refusing nonce consumption: durable write failed", error);
      return { valid: false, reason: "persistence_error" };
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
      try { this.saveNonces(); } catch (error) { this.storeHealthy = false; throw error; }
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
      this.logger.error("Nonce store unreadable: refusing replay authorization", error);
      this.nonces.clear();
      this.storeHealthy = false;
    }
  }

  /**
   * Save nonces to persistent storage
   */
  private requireHealthyStore(): void {
    if (!this.storeHealthy) throw new Error("Nonce store unavailable: fail-closed persistence state");
  }

  private saveNonces(): void {
    this.requireHealthyStore();
    const records = Array.from(this.nonces.values());
    const tempPath = this.nonceStorePath + "." + crypto.randomBytes(8).toString("hex") + ".tmp";
    try {
      fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
      fs.renameSync(tempPath, this.nonceStorePath);
    } catch (error) {
      try { fs.unlinkSync(tempPath); } catch { /* May not have created the temp file. */ }
      this.logger.error("Failed to save nonce store", error);
      throw error;
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    try { this.saveNonces(); } catch (error) { this.logger.error("Nonce store disposal persistence failed", error); }
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
