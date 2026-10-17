/**
 * AgentTimelineService - Aggregates EventBus events into timeline entries
 *
 * Subscribes to all EventBus events, filters relevant ones, and maintains
 * a bounded in-memory timeline for UI consumption.
 */

import type { EventBus } from "../shared/EventBus";
import type { FailSafeEvent, FailSafeEventType } from "../shared/types/events";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  /** `imported`: historical evidence imported from an exported agent run (#477). */
  category: "verdict" | "trust" | "file" | "plan" | "approval" | "diffguard" | "imported";
  title: string;
  detail: string;
  icon: string;
  severity: "info" | "success" | "warning" | "error";
  agentDid?: string;
  artifactPath?: string;
}

export interface TimelineFilter {
  categories?: TimelineEntry["category"][];
  severity?: TimelineEntry["severity"][];
  agentDid?: string;
  since?: string;
}

type PayloadRecord = Record<string, unknown>;
type Severity = TimelineEntry["severity"];
type Category = TimelineEntry["category"];

const MAX_ENTRIES = 500;

const CATEGORY_ICONS: Record<Category, string> = {
  verdict: "shield",
  trust: "person",
  approval: "checklist",
  diffguard: "diff",
  file: "file",
  plan: "notebook",
  imported: "archive",
};

const MAPPED_EVENT_TYPES: ReadonlySet<FailSafeEventType> = new Set([
  "sentinel.verdict",
  "qorelogic.trustUpdate",
  "qorelogic.agentQuarantined",
  "qorelogic.agentReleased",
  "qorelogic.l3Queued",
  "diffguard.analysisReady",
  "diffguard.approved",
  "diffguard.rejected",
  "sentinel.healthUpdate",
]);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function str(payload: PayloadRecord, key: string): string {
  const val = payload[key];
  return typeof val === "string" ? val : String(val ?? "");
}

function num(payload: PayloadRecord, key: string): number {
  const val = payload[key];
  return typeof val === "number" ? val : 0;
}

function verdictSeverity(decision: string): Severity {
  if (decision === "PASS") return "success";
  if (decision === "WARN") return "warning";
  return "error";
}

function healthSeverity(level: string): Severity {
  if (level === "healthy" || level === "green") return "success";
  if (level === "degraded" || level === "yellow") return "warning";
  if (level === "critical" || level === "red") return "error";
  return "info";
}

function riskSeverity(risk: string): Severity {
  const lower = risk.toLowerCase();
  if (lower === "low" || lower === "none") return "info";
  if (lower === "medium") return "warning";
  return "error";
}

function entry(
  ts: string, cat: Category, title: string,
  detail: string, severity: Severity,
  agentDid?: string, artifactPath?: string,
): TimelineEntry {
  return {
    id: generateId(), timestamp: ts, category: cat, title, detail,
    icon: CATEGORY_ICONS[cat], severity,
    agentDid: agentDid || undefined,
    artifactPath: artifactPath || undefined,
  };
}

function mapEvent(event: FailSafeEvent): TimelineEntry | null {
  const p = (event.payload ?? {}) as PayloadRecord;
  const ts = event.timestamp;

  switch (event.type) {
    case "sentinel.verdict": {
      const decision = str(p, "decision");
      const path = str(p, "artifactPath");
      return entry(ts, "verdict",
        `Verdict: ${decision} (${path || "unknown"})`,
        str(p, "summary"), verdictSeverity(decision),
        str(p, "agentDid"), path);
    }
    case "qorelogic.trustUpdate": {
      const did = str(p, "did");
      const score = num(p, "newScore") || num(p, "score");
      return entry(ts, "trust",
        `Trust: ${did} \u2192 ${score.toFixed(2)}`,
        str(p, "reason"), score >= 0.5 ? "info" : "warning", did);
    }
    case "qorelogic.agentQuarantined":
      return entry(ts, "trust",
        `Quarantined: ${str(p, "did")}`,
        str(p, "reason"), "error", str(p, "did"));
    case "qorelogic.agentReleased":
      return entry(ts, "trust",
        `Released: ${str(p, "did")}`, "", "success", str(p, "did"));
    case "qorelogic.l3Queued": {
      const artifact = str(p, "artifact") || str(p, "artifactPath");
      return entry(ts, "approval",
        `L3 Queued: ${artifact || "unknown"}`,
        str(p, "reason"), "warning", undefined, artifact);
    }
    case "diffguard.analysisReady": {
      const filePath = str(p, "filePath");
      const risk = str(p, "overallRisk");
      return entry(ts, "diffguard",
        `DiffGuard: ${filePath || "unknown"} (${risk || "unknown"})`,
        str(p, "summary"), riskSeverity(risk), undefined, filePath);
    }
    case "diffguard.approved":
      return entry(ts, "diffguard", "DiffGuard Approved", "", "success");
    case "diffguard.rejected":
      return entry(ts, "diffguard", "DiffGuard Rejected", "", "error");
    case "sentinel.healthUpdate": {
      const level = str(p, "currentLevel");
      const prev = str(p, "previousLevel");
      return entry(ts, "verdict",
        `Health: ${level || "unknown"}`,
        prev ? `Changed from ${prev}` : "", healthSeverity(level));
    }
    default:
      return null;
  }
}

export class AgentTimelineService {
  private entries: TimelineEntry[] = [];
  private unsubscribe: (() => void) | null = null;
  private importedProvider: (() => TimelineEntry[]) | null = null;

  constructor(private readonly eventBus: EventBus) {
    this.unsubscribe = this.eventBus.onAll((event: FailSafeEvent) => {
      this.handleEvent(event);
    });
  }

  private handleEvent(event: FailSafeEvent): void {
    if (!MAPPED_EVENT_TYPES.has(event.type)) return;

    const mapped = mapEvent(event);
    if (!mapped) return;

    this.entries.push(mapped);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this.eventBus.emit("timeline.entryAdded", mapped);
  }

  /** #477: entries imported from exported agent runs, merged into getEntries. */
  setImportedEntriesProvider(provider: (() => TimelineEntry[]) | null): void {
    this.importedProvider = provider;
  }

  getEntries(filter?: TimelineFilter): TimelineEntry[] {
    const live = this.filterEntries(this.entries, filter).reverse();
    let imported: TimelineEntry[] = [];
    try { imported = this.importedProvider ? this.filterEntries(this.importedProvider(), filter) : []; } catch { imported = []; }
    if (imported.length === 0) return live;
    // Newest first across live and imported entries (a stable sort keeps the
    // live order for equal timestamps).
    return [...live, ...imported].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  private filterEntries(source: TimelineEntry[], filter?: TimelineFilter): TimelineEntry[] {
    let result = source;

    if (filter?.categories?.length) {
      result = result.filter((e) => filter.categories!.includes(e.category));
    }
    if (filter?.severity?.length) {
      result = result.filter((e) => filter.severity!.includes(e.severity));
    }
    if (filter?.agentDid) {
      result = result.filter((e) => e.agentDid === filter.agentDid);
    }
    if (filter?.since) {
      result = result.filter((e) => e.timestamp >= filter.since!);
    }

    return [...result];
  }

  /** Live entries only: this is the sequence-numbered live increment, and
   *  imported entries have no sequence (#477). */
  getEntriesSince(seq: number): TimelineEntry[] {
    if (seq < 0 || seq >= this.entries.length) return [];
    return this.entries.slice(seq).reverse();
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.entries = [];
  }
}
