/**
 * RiskManager - Risk Register persistence and operations
 *
 * Manages project-level risk tracking with JSON persistence.
 */

import * as fs from "fs";
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

const RISKS_FILE = "risks.json";

export class RiskManager {
  private readonly risksPath: string;
  private readonly logger: Logger;
  private register: RiskRegister;

  constructor(
    workspaceRoot: string,
    private projectId: string,
  ) {
    this.risksPath = path.join(workspaceRoot, ".failsafe", "risks", RISKS_FILE);
    this.logger = new Logger("RiskManager");
    this.register = this.loadOrCreate();
  }

  private loadOrCreate(): RiskRegister {
    try {
      if (fs.existsSync(this.risksPath)) {
        const content = fs.readFileSync(this.risksPath, "utf8");
        const data = JSON.parse(content) as RiskRegister;
        const migrated = this.backfillManualSource(data.risks);
        this.logger.info(`Loaded ${data.risks.length} risks from register`);
        if (migrated) {
          this.register = data;
          this.save();
        }
        return data;
      }
    } catch (error) {
      this.logger.warn("Failed to load risk register, creating new", error);
    }

    return {
      projectId: this.projectId,
      projectName: path.basename(path.dirname(this.risksPath)),
      risks: [],
      lastUpdated: new Date().toISOString(),
    };
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
  private findByDedupKey(key: string): Risk | undefined {
    for (const r of this.register.risks) {
      const existing = this.dedupKey(r.derivedFrom);
      if (existing === key) return r;
    }
    return undefined;
  }

  private save(): void {
    try {
      const dir = path.dirname(this.risksPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.register.lastUpdated = new Date().toISOString();
      fs.writeFileSync(
        this.risksPath,
        JSON.stringify(this.register, null, 2),
        "utf8",
      );
      this.logger.info("Risk register saved");
    } catch (error) {
      this.logger.error("Failed to save risk register", error);
    }
  }

  getAllRisks(): Risk[] {
    return [...this.register.risks];
  }

  getRisk(id: string): Risk | undefined {
    return this.register.risks.find((r) => r.id === id);
  }

  getSummary() {
    return calculateRiskSummary(this.register.risks);
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

    // De-dup: an auto-derived risk with a matching derivedFrom key bumps
    // updatedAt on the existing risk instead of inserting a duplicate.
    const key = this.dedupKey(input.derivedFrom);
    if (key) {
      const existing = this.findByDedupKey(key);
      if (existing) {
        existing.updatedAt = new Date().toISOString();
        this.save();
        this.logger.info(`Updated existing risk via dedup key ${key}: ${existing.id}`);
        return existing;
      }
    }

    const now = new Date().toISOString();
    const risk: Risk = {
      id: crypto.randomUUID(),
      ...input,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };

    this.register.risks.push(risk);
    this.save();
    this.logger.info(`Created risk: ${risk.id}`);
    return risk;
  }

  updateRisk(
    id: string,
    updates: Partial<Omit<Risk, "id" | "createdAt">>,
  ): Risk | undefined {
    const index = this.register.risks.findIndex((r) => r.id === id);
    if (index === -1) {
      this.logger.warn(`Risk not found: ${id}`);
      return undefined;
    }

    const risk = this.register.risks[index];
    this.register.risks[index] = {
      ...risk,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.status === "resolved" && !risk.resolvedAt) {
      this.register.risks[index].resolvedAt = new Date().toISOString();
    }

    this.save();
    this.logger.info(`Updated risk: ${id}`);
    return this.register.risks[index];
  }

  deleteRisk(id: string): boolean {
    const index = this.register.risks.findIndex((r) => r.id === id);
    if (index === -1) {
      return false;
    }

    this.register.risks.splice(index, 1);
    this.save();
    this.logger.info(`Deleted risk: ${id}`);
    return true;
  }

  getRisksByStatus(status: RiskStatus): Risk[] {
    return this.register.risks.filter((r) => r.status === status);
  }

  getRisksBySeverity(severity: RiskSeverity): Risk[] {
    return this.register.risks.filter((r) => r.severity === severity);
  }

  getRisksByCategory(category: RiskCategory): Risk[] {
    return this.register.risks.filter((r) => r.category === category);
  }

  getOpenCriticalAndHigh(): Risk[] {
    return this.register.risks.filter(
      (r) =>
        r.status === "open" &&
        (r.severity === "critical" || r.severity === "high"),
    );
  }

  dispose(): void {
    this.save();
  }
}
