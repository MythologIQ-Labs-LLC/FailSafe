/**
 * EvaluationRouter - Sole authority for evaluation routing decisions.
 */

import * as fs from "fs";
import { EventBus } from "../shared/EventBus";
import { ConfigManager } from "../shared/ConfigManager";
import { LRUCache } from "../shared/LRUCache";
import {
  computeContentFingerprint,
  computeFingerprintSimilarity,
  ContentFingerprint,
} from "./fingerprint";
import { CacheInstrumentation } from "./CacheInstrumentation";
import { NoveltyAccuracyMonitor } from "./NoveltyAccuracyMonitor";
import { CacheSizeMonitor } from "./CacheSizeMonitor";

export type EvaluationTier = 0 | 1 | 2 | 3;
export type RiskGrade = "R0" | "R1" | "R2" | "R3";
export type NoveltyLevel = "low" | "medium" | "high";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface CortexEvent {
  id: string;
  timestamp: string;
  category: "sentinel" | "qorelogic" | "genesis" | "user" | "system";
  payload?: Record<string, unknown>;
}

export interface TriageSignals {
  risk: RiskGrade;
  novelty: NoveltyLevel;
  confidence: ConfidenceLevel;
}

export interface RoutingDecision {
  tier: EvaluationTier;
  triage: TriageSignals;
  invokeQorLogic: boolean;
  writeLedger: boolean;
  enforceSentinel: boolean;
  requiredActions: string[];
}

export interface RoutingThresholds {
  tier2RiskThreshold: RiskGrade;
  tier3RiskThreshold: RiskGrade;
  tier2NoveltyThreshold: NoveltyLevel;
  tier3NoveltyThreshold: NoveltyLevel;
  tier2ConfidenceThreshold: ConfidenceLevel;
  tier3ConfidenceThreshold: ConfidenceLevel;
}

export interface LedgerTierConfig {
  tier0_enabled: boolean;
  tier1_enabled: boolean;
  tier2_enabled: boolean;
  tier3_enabled: boolean;
}

const DEFAULT_THRESHOLDS: RoutingThresholds = {
  tier2RiskThreshold: "R2",
  tier3RiskThreshold: "R3",
  tier2NoveltyThreshold: "high",
  tier3NoveltyThreshold: "medium",
  tier2ConfidenceThreshold: "low",
  tier3ConfidenceThreshold: "low",
};

const DEFAULT_LEDGER: LedgerTierConfig = {
  tier0_enabled: false,
  tier1_enabled: false,
  tier2_enabled: false,
  tier3_enabled: true,
};

export class EvaluationRouter {
  private thresholds: RoutingThresholds;
  private ledgerConfig: LedgerTierConfig;
  private eventBus?: EventBus;
  private confidenceCache: Map<string, ConfidenceLevel> = new Map();
  private fingerprintCache = new LRUCache<string, ContentFingerprint>(100);
  private noveltyCache = new LRUCache<string, NoveltyLevel>(100);
  private cacheMetrics = new CacheInstrumentation();
  private noveltyAccuracy = new NoveltyAccuracyMonitor();
  private metricsEmitCounter = 0;
  private cacheSizeMonitor = new CacheSizeMonitor();
  private riskRank: Record<RiskGrade, number> = {
    R0: 0,
    R1: 1,
    R2: 2,
    R3: 3,
  };
  private noveltyRank: Record<NoveltyLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };
  private confidenceRank: Record<ConfidenceLevel, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  constructor(
    thresholds: RoutingThresholds = DEFAULT_THRESHOLDS,
    ledgerConfig: LedgerTierConfig = DEFAULT_LEDGER,
    eventBus?: EventBus,
  ) {
    this.thresholds = thresholds;
    this.ledgerConfig = ledgerConfig;
    this.eventBus = eventBus;

    if (this.eventBus) {
      this.eventBus.on("sentinel.confidence", (event) => {
        const payload = event.payload as { eventId?: string; confidence?: number };
        if (payload?.eventId && typeof payload.confidence === "number") {
          this.confidenceCache.set(payload.eventId, this.toConfidenceLevel(payload.confidence));
        }
      });
    }
  }

  static fromConfigManager(
    configManager: ConfigManager,
    eventBus?: EventBus,
  ): EvaluationRouter {
    const config = configManager.getConfig();
    const routing = config.evaluation?.routing;
    const ledger = config.evaluation?.ledger;
    if (routing) {
      return new EvaluationRouter(
        {
          tier2RiskThreshold: routing.tier2_risk_threshold,
          tier3RiskThreshold: routing.tier3_risk_threshold,
          tier2NoveltyThreshold: routing.tier2_novelty_threshold,
          tier3NoveltyThreshold: routing.tier3_novelty_threshold,
          tier2ConfidenceThreshold: routing.tier2_confidence_threshold,
          tier3ConfidenceThreshold: routing.tier3_confidence_threshold,
        },
        ledger ?? DEFAULT_LEDGER,
        eventBus,
      );
    }
    return new EvaluationRouter(DEFAULT_THRESHOLDS, DEFAULT_LEDGER, eventBus);
  }

  async computeTriage(event: CortexEvent): Promise<TriageSignals> {
    const risk = this.computeRisk(event);
    const confidence = this.computeConfidence(event);
    const novelty = await this.computeNovelty(event, risk, confidence);
    this.noveltyAccuracy.recordEvaluation(novelty, confidence);
    return {
      risk,
      novelty,
      confidence,
    };
  }

  computeRisk(_event: CortexEvent): RiskGrade {
    const targetPath = _event.payload?.targetPath as string | undefined;
    if (!targetPath) {
      return "R1";
    }
    const lower = targetPath.toLowerCase();
    if (
      lower.includes("auth") ||
      lower.includes("password") ||
      lower.includes("crypto") ||
      lower.includes("secret")
    ) {
      return "R3";
    }
    if (
      lower.includes("api") ||
      lower.includes("service") ||
      lower.includes("controller")
    ) {
      return "R2";
    }
    return "R1";
  }

  async computeNovelty(
    event: CortexEvent,
    risk: RiskGrade,
    confidence: ConfidenceLevel,
  ): Promise<NoveltyLevel> {
    const targetPath = event.payload?.targetPath as string | undefined;
    if (!targetPath) {
      return "low";
    }

    // Fast-path: avoid deep checks for low-risk, high-confidence events
    if (this.riskRank[risk] < this.riskRank["R2"] && confidence === "high") {
      return "low";
    }

    const cached = this.getNoveltyFromCache(targetPath);
    if (cached) {
      return cached;
    }

    const fingerprint = await this.getOrComputeFingerprint(targetPath);
    if (!fingerprint) {
      return "medium";
    }

    const similarity = this.findCachedSimilarity(fingerprint);
    let novelty = this.noveltyFromSimilarity(similarity);
    if (similarity === 0.0) {
      const lower = targetPath.toLowerCase();
      if (lower.includes("test") || lower.includes("spec")) {
        novelty = "low";
      } else if (fingerprint.size < 1000) {
        novelty = "low";
      } else if (fingerprint.size < 5000) {
        novelty = "medium";
      }
    }
    this.cacheNovelty(targetPath, novelty);
    return novelty;
  }

  computeConfidence(event: CortexEvent): ConfidenceLevel {
    const cached = this.confidenceCache.get(event.id);
    if (cached) {
      return cached;
    }
    if (event.category === "system" || event.category === "sentinel") {
      return "high";
    }
    return "medium";
  }

  determineTier(
    risk: RiskGrade,
    novelty: NoveltyLevel,
    confidence: ConfidenceLevel,
  ): EvaluationTier {
    if (
      this.riskRank[risk] >= this.riskRank[this.thresholds.tier3RiskThreshold] ||
      this.noveltyRank[novelty] >= this.noveltyRank[this.thresholds.tier3NoveltyThreshold] ||
      this.confidenceRank[confidence] >= this.confidenceRank[this.thresholds.tier3ConfidenceThreshold]
    ) {
      return 3;
    }

    if (
      this.riskRank[risk] >= this.riskRank[this.thresholds.tier2RiskThreshold] ||
      this.noveltyRank[novelty] >= this.noveltyRank[this.thresholds.tier2NoveltyThreshold] ||
      this.confidenceRank[confidence] >= this.confidenceRank[this.thresholds.tier2ConfidenceThreshold]
    ) {
      return 2;
    }

    return risk === "R0" ? 0 : 1;
  }

  async route(event: CortexEvent): Promise<RoutingDecision> {
    const triage = await this.computeTriage(event);
    const tier = this.determineTier(
      triage.risk,
      triage.novelty,
      triage.confidence,
    );

    this.emitMetricsIfNeeded();

    return {
      tier,
      triage,
      invokeQorLogic: tier >= 2,
      writeLedger: this.shouldWriteLedger(tier),
      enforceSentinel: true,
      requiredActions: [],
    };
  }

  private toConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.5) return "medium";
    return "low";
  }

  private getNoveltyFromCache(targetPath: string): NoveltyLevel | null {
    const cached = this.noveltyCache.get(targetPath);
    if (cached) {
      this.cacheMetrics.recordHit("novelty");
      return cached;
    }
    this.cacheMetrics.recordMiss("novelty");
    return null;
  }

  private async getOrComputeFingerprint(
    filePath: string,
  ): Promise<ContentFingerprint | null> {
    const cached = this.fingerprintCache.get(filePath);
    if (cached) {
      this.cacheMetrics.recordHit("fingerprint");
      return cached;
    }
    this.cacheMetrics.recordMiss("fingerprint");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const fingerprint = await computeContentFingerprint(filePath);
      this.fingerprintCache.set(filePath, fingerprint, 60 * 60 * 1000);
      return fingerprint;
    } catch {
      return null;
    }
  }

  private findCachedSimilarity(fingerprint: ContentFingerprint): number {
    let best = 0.0;
    for (const [pathKey, cached] of this.fingerprintCache.entries()) {
      if (pathKey === fingerprint.path) continue;
      const score = computeFingerprintSimilarity(fingerprint, cached);
      if (score > best) {
        best = score;
      }
    }
    return best;
  }

  private noveltyFromSimilarity(similarity: number): NoveltyLevel {
    if (similarity >= 0.9) return "low";
    if (similarity >= 0.5) return "medium";
    return "high";
  }

  private cacheNovelty(targetPath: string, novelty: NoveltyLevel): void {
    this.noveltyCache.set(targetPath, novelty, 5 * 60 * 1000);
  }

  private shouldWriteLedger(tier: EvaluationTier): boolean {
    switch (tier) {
      case 0:
        return this.ledgerConfig.tier0_enabled;
      case 1:
        return this.ledgerConfig.tier1_enabled;
      case 2:
        return this.ledgerConfig.tier2_enabled;
      case 3:
        return this.ledgerConfig.tier3_enabled;
      default:
        return false;
    }
  }

  private emitMetricsIfNeeded(): void {
    if (!this.eventBus) return;
    this.metricsEmitCounter += 1;
    if (this.metricsEmitCounter % 25 !== 0) return;

    this.eventBus.emit("evaluation.metrics", {
      cache: this.cacheMetrics.getMetrics(),
      noveltyAccuracy: this.noveltyAccuracy.getMetrics(),
      cacheSizes: {
        fingerprint: this.fingerprintCache.size(),
        novelty: this.noveltyCache.size(),
      },
      cacheBytes: this.cacheSizeMonitor.buildMetrics(
        this.fingerprintCache as unknown as LRUCache<string, unknown>,
        this.noveltyCache as unknown as LRUCache<string, unknown>,
      ),
    });
  }
}
