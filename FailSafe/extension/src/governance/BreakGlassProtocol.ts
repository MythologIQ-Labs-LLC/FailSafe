/**
 * BreakGlassProtocol - Time-limited governance overrides with full audit trail.
 * Gap 2: Emergency override mechanism with justification, auto-revert, and ledger recording.
 */

import * as crypto from "crypto";
import { Logger } from "../shared/Logger";
import { EventBus } from "../shared/EventBus";
import { LedgerManager } from "../qorelogic/ledger/LedgerManager";

export type { GovernanceMode } from "./types";
import type { GovernanceMode } from "./types";

export interface BreakGlassRequest {
  reason: string;
  durationMinutes: number;
  requestedBy: string;
  targetMode?: GovernanceMode;
}

export interface BreakGlassRecord {
  id: string;
  activatedAt: string;
  expiresAt: string;
  reason: string;
  requestedBy: string;
  previousMode: GovernanceMode;
  overrideMode: GovernanceMode;
  status: "active" | "expired" | "revoked";
  revokedAt?: string;
  revokedBy?: string;
}

export class BreakGlassProtocol {
  private readonly logger = new Logger("BreakGlassProtocol");
  private activeOverride: BreakGlassRecord | null = null;
  private revertTimer: NodeJS.Timeout | null = null;
  private onModeChange: ((mode: GovernanceMode) => Promise<void>) | null = null;

  constructor(
    private readonly ledger: LedgerManager,
    private readonly eventBus: EventBus,
  ) {}

  setModeChangeHandler(handler: (mode: GovernanceMode) => Promise<void>): void {
    this.onModeChange = handler;
  }

  async activate(
    request: BreakGlassRequest,
    currentMode: GovernanceMode,
  ): Promise<BreakGlassRecord> {
    const error = this.validateRequest(request);
    if (error) throw new Error(`Break-glass denied: ${error}`);

    if (this.activeOverride?.status === "active") {
      throw new Error(
        `Break-glass denied: Override active until ${this.activeOverride.expiresAt}`,
      );
    }

    const record = this.buildActivationRecord(request, currentMode);
    await this.recordActivation(record);

    this.eventBus.emit("governance.breakGlassActivated", {
      overrideId: record.id,
      previousMode: record.previousMode,
      newMode: record.overrideMode,
      reason: record.reason,
      requestedBy: record.requestedBy,
      expiresAt: record.expiresAt,
      timestamp: record.activatedAt,
    });

    if (this.onModeChange) await this.onModeChange(record.overrideMode);
    this.scheduleRevert(record);
    this.activeOverride = record;

    this.logger.warn("Break-glass ACTIVATED", {
      id: record.id,
      expiresAt: record.expiresAt,
    });
    return record;
  }

  async revoke(revokedBy: string): Promise<BreakGlassRecord> {
    if (!this.activeOverride || this.activeOverride.status !== "active") {
      throw new Error("No active break-glass override to revoke.");
    }

    const record = this.activeOverride;
    record.status = "revoked";
    record.revokedAt = new Date().toISOString();
    record.revokedBy = revokedBy;

    if (this.revertTimer) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }

    await this.recordRevocation(record);
    this.eventBus.emit("governance.breakGlassRevoked", {
      overrideId: record.id,
      previousMode: record.overrideMode,
      newMode: record.previousMode,
      reason: "revoked",
      requestedBy: record.revokedBy ?? revokedBy,
      timestamp: record.revokedAt,
    });
    if (this.onModeChange) await this.onModeChange(record.previousMode);

    this.logger.warn("Break-glass REVOKED", { id: record.id });
    this.activeOverride = null;
    return record;
  }

  getActiveOverride(): BreakGlassRecord | null {
    if (this.activeOverride?.status === "active") {
      if (new Date() >= new Date(this.activeOverride.expiresAt)) {
        this.handleExpiry(this.activeOverride);
        return null;
      }
      return { ...this.activeOverride };
    }
    return null;
  }

  isActive(): boolean {
    return this.getActiveOverride() !== null;
  }

  dispose(): void {
    if (this.revertTimer) clearTimeout(this.revertTimer);
  }

  private validateRequest(r: BreakGlassRequest): string | null {
    if (!r.reason || r.reason.trim().length < 10) {
      return "Justification must be at least 10 characters.";
    }
    if (!r.requestedBy?.trim()) return "Requester identity required.";
    const d = r.durationMinutes || 30;
    if (d < 1 || d > 480) return "Duration must be 1–480 minutes.";
    return null;
  }

  private buildActivationRecord(
    request: BreakGlassRequest,
    currentMode: GovernanceMode,
  ): BreakGlassRecord {
    const now = new Date();
    const duration = request.durationMinutes || 30;
    return {
      id: `bg-${now.getTime()}-${crypto.randomBytes(4).toString("hex")}`,
      activatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + duration * 60_000).toISOString(),
      reason: request.reason,
      requestedBy: request.requestedBy,
      previousMode: currentMode,
      overrideMode: request.targetMode || "observe",
      status: "active",
    };
  }

  private async recordActivation(record: BreakGlassRecord): Promise<void> {
    const duration = Math.round(
      (new Date(record.expiresAt).getTime() -
        new Date(record.activatedAt).getTime()) /
        60_000,
    );
    await this.ledger.appendEntry({
      eventType: "USER_OVERRIDE",
      agentDid: record.requestedBy,
      payload: {
        action: "break_glass.activated",
        overrideId: record.id,
        reason: record.reason,
        previousMode: record.previousMode,
        overrideMode: record.overrideMode,
        durationMinutes: duration,
        expiresAt: record.expiresAt,
      },
    });
  }

  private async recordRevocation(record: BreakGlassRecord): Promise<void> {
    await this.ledger.appendEntry({
      eventType: "USER_OVERRIDE",
      agentDid: record.revokedBy || "unknown",
      payload: {
        action: "break_glass.revoked",
        overrideId: record.id,
        restoredMode: record.previousMode,
      },
    });
  }

  private scheduleRevert(record: BreakGlassRecord): void {
    if (this.revertTimer) clearTimeout(this.revertTimer);
    const ms = new Date(record.expiresAt).getTime() - Date.now();
    this.revertTimer = setTimeout(() => this.handleExpiry(record), ms);
  }

  private async handleExpiry(record: BreakGlassRecord): Promise<void> {
    if (record.status !== "active") return;
    record.status = "expired";
    this.revertTimer = null;

    await this.ledger.appendEntry({
      eventType: "USER_OVERRIDE",
      agentDid: "system:break-glass-timer",
      payload: {
        action: "break_glass.expired",
        overrideId: record.id,
        restoredMode: record.previousMode,
      },
    });

    this.eventBus.emit("governance.breakGlassExpired", {
      overrideId: record.id,
      previousMode: record.overrideMode,
      newMode: record.previousMode,
      reason: "expired",
      requestedBy: "system:break-glass-timer",
      timestamp: new Date().toISOString(),
    });
    if (this.onModeChange) await this.onModeChange(record.previousMode);
    this.logger.warn("Break-glass EXPIRED", { id: record.id });
    this.activeOverride = null;
  }
}
