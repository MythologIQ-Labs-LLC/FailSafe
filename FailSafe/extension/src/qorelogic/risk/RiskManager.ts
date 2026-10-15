/**
 * RiskManager - Risk Register persistence and operations
 *
 * Manages project-level risk tracking with JSON persistence. #517: every
 * read and write of risks.json goes through RiskStore, so records written by
 * other writers (imports, the Console, other windows) are seen and never
 * overwritten, and an unreadable register is refused rather than replaced.
 */

import * as path from "path";
import * as crypto from "crypto";
import {
  Risk,
  RiskDerivedFrom,
  RiskRegister,
  RiskSeverity,
  RiskSource,
  RiskStatus,
  RiskCategory,
  calculateRiskSummary,
} from "./types";
import { Logger } from "../../shared/Logger";
import { RiskDocument, RiskStore } from "../../shared/risk-store";

/** Activation must never wait long on another window's lock (#517 LD7). */
const BACKFILL_LOCK_TIMEOUT_MS = 500;

export class RiskManager {
  private readonly risksPath: string;
  private readonly logger: Logger;
  private readonly store: RiskStore;
  private register: RiskRegister;
  private warnedUnreadable = false;

  constructor(
    private readonly workspaceRoot: string,
    private projectId: string,
  ) {
    this.logger = new Logger("RiskManager");
    this.store = new RiskStore(workspaceRoot);
    this.risksPath = this.store.risksPath;
    this.register = this.emptyRegister();
    this.backfillLegacySources();
    this.refresh();
    this.logger.info(`Loaded ${this.register.risks.length} risks from register`);
  }

  private emptyRegister(): RiskRegister {
    return {
      projectId: this.projectId,
      projectName: path.basename(path.dirname(this.risksPath)),
      risks: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Persist source='manual' on legacy risks, only when one lacks it. A lock,
   * read or write failure is logged and never escapes activation.
   */
  private backfillLegacySources(): void {
    const current = this.store.read();
    if (current.state !== "ok" || current.doc.risks.every((r) => r.source)) return;
    try {
      new RiskStore(this.workspaceRoot, { lockTimeoutMs: BACKFILL_LOCK_TIMEOUT_MS }).mutate((doc) => {
        if (this.backfillManualSource(doc.risks as unknown as Risk[])) this.stampProject(doc);
      });
    } catch (error) {
      this.logger.warn("Could not persist the risk source backfill; continuing with the register as read", error);
    }
  }

  /** The register as it is on disk now; the last snapshot if it is unreadable. */
  private refresh(): RiskRegister {
    const current = this.store.read();
    if (current.state === "ok") {
      this.warnedUnreadable = false;
      const register = current.doc as unknown as RiskRegister;
      this.backfillManualSource(register.risks);
      this.register = register;
    } else if (current.state === "absent") {
      this.register = this.emptyRegister();
    } else if (!this.warnedUnreadable) {
      this.warnedUnreadable = true;
      this.logger.warn(`Failed to load risk register (${current.reason}); showing the last snapshot`);
    }
    return this.register;
  }

  /** Backfill source='manual' on any pre-existing risk lacking the field.
   *  Returns true if at least one risk was migrated. */
  private backfillManualSource(risks: Risk[]): boolean {
    let migrated = false;
    for (const r of risks) {
      if (!r.source) {
        (r as Risk).source = 'manual';
        migrated = true;
      }
    }
    return migrated;
  }

  /** Fill RiskManager's header keys only when a mutation changed something. */
  private stampProject(doc: RiskDocument): void {
    if (doc.projectId === undefined) doc.projectId = this.projectId;
    if (doc.projectName === undefined) doc.projectName = path.basename(path.dirname(this.risksPath));
  }

  /** Compute the de-dup key for a derivedFrom payload.
   *  Returns null when no slot is set (no de-dup). */
  private dedupKey(d: RiskDerivedFrom | undefined): string | null {
    if (!d) return null;
    if (d.ledgerEntry !== undefined) return `ledger:${d.ledgerEntry}`;
    if (d.shadowGenomeEventId) return `genome:${d.shadowGenomeEventId}`;
    if (d.planSlug) return `plan:${d.planSlug}`;
    return null;
  }

  /** Look up an existing risk by de-dup key. */
  private findByDedupKey(risks: Risk[], key: string): Risk | undefined {
    return risks.find((r) => this.dedupKey(r.derivedFrom) === key);
  }

  getAllRisks(): Risk[] {
    return [...this.refresh().risks];
  }

  getRisk(id: string): Risk | undefined {
    return this.refresh().risks.find((r) => r.id === id);
  }

  getSummary() {
    return calculateRiskSummary(this.refresh().risks);
  }

  createRisk(input: {
    title: string;
    description: string;
    category: RiskCategory;
    severity: RiskSeverity;
    impact: string;
    mitigation: string;
    source: RiskSource;
    sourceAgent?: string;
    derivedFrom?: RiskDerivedFrom;
    owner?: string;
    relatedArtifacts?: string[];
    checkpointId?: string;
  }): Risk {
    // Runtime guard: required even though the type system already enforces.
    // Covers JS callers and `as any` callers (per plan F8).
    if (typeof input?.source !== 'string' || input.source.length === 0) {
      throw new Error(
        `RiskManager.createRisk: 'source' is required (got: ${typeof input?.source})`,
      );
    }

    const key = this.dedupKey(input.derivedFrom);
    const { risk, deduped } = this.store.mutate((doc) => {
      const risks = doc.risks as unknown as Risk[];
      const now = new Date().toISOString();
      // De-dup: an auto-derived risk with a matching derivedFrom key bumps
      // updatedAt on the existing risk instead of inserting a duplicate.
      const existing = key ? this.findByDedupKey(risks, key) : undefined;
      this.stampProject(doc);
      if (existing) {
        existing.updatedAt = now;
        return { risk: existing, deduped: true };
      }
      const created: Risk = {
        id: crypto.randomUUID(),
        ...input,
        status: "open",
        createdAt: now,
        updatedAt: now,
      };
      risks.push(created);
      return { risk: created, deduped: false };
    });
    this.logger.info(deduped
      ? `Updated existing risk via dedup key ${key}: ${risk.id}`
      : `Created risk: ${risk.id}`);
    return risk;
  }

  updateRisk(
    id: string,
    updates: Partial<Omit<Risk, "id" | "createdAt">>,
  ): Risk | undefined {
    const updated = this.store.mutate((doc) => {
      const risks = doc.risks as unknown as Risk[];
      const index = risks.findIndex((r) => r.id === id);
      if (index === -1) return undefined;
      const risk = risks[index];
      const now = new Date().toISOString();
      risks[index] = { ...risk, ...updates, updatedAt: now };
      if (updates.status === "resolved" && !risk.resolvedAt) {
        risks[index].resolvedAt = now;
      }
      this.stampProject(doc);
      return risks[index];
    });
    if (!updated) {
      this.logger.warn(`Risk not found: ${id}`);
      return undefined;
    }
    this.logger.info(`Updated risk: ${id}`);
    return updated;
  }

  deleteRisk(id: string): boolean {
    const deleted = this.store.mutate((doc) => {
      const index = doc.risks.findIndex((r) => r.id === id);
      if (index === -1) return false;
      doc.risks.splice(index, 1);
      this.stampProject(doc);
      return true;
    });
    if (deleted) this.logger.info(`Deleted risk: ${id}`);
    return deleted;
  }

  getRisksByStatus(status: RiskStatus): Risk[] {
    return this.refresh().risks.filter((r) => r.status === status);
  }

  getRisksBySeverity(severity: RiskSeverity): Risk[] {
    return this.refresh().risks.filter((r) => r.severity === severity);
  }

  getRisksByCategory(category: RiskCategory): Risk[] {
    return this.refresh().risks.filter((r) => r.category === category);
  }

  getOpenCriticalAndHigh(): Risk[] {
    return this.refresh().risks.filter(
      (r) =>
        r.status === "open" &&
        (r.severity === "critical" || r.severity === "high"),
    );
  }

  dispose(): void {
    // No write: dispose never changed the register and a late flush could
    // erase external imports made after this manager was constructed.
  }
}
