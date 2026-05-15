import * as fs from "fs";
import * as path from "path";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface BacklogRisk {
  id: string;
  title: string;
  severity: RiskSeverity;
  description: string;
  source: "backlog";
  backlogId: string;
  section: string;
}

export interface BacklogSummary {
  totalOpenBlockers: number;
  totalSecurityBlockers: number;
  totalDevBlockers: number;
  totalOpenBacklog: number;
}

const ITEM_RE = /^-\s+\[(?<state>[ x])\]\s+\[(?<id>[A-Z]\d+)\]\s+(?<text>.+?)$/;
const HEADING_RE = /^(##+)\s+(.+?)\s*$/;

interface ParseContext {
  topSection: string;
  subSection: string;
}

/**
 * Reads `docs/BACKLOG.md` and returns OPEN blockers/risks as risk-shaped records
 * the Risks tab can render. Closed items (`[x]`) are filtered. Section context
 * (Security / Development / Backlog) determines severity.
 */
export class BacklogReader {
  constructor(private readonly workspaceRoot: string) {}

  exists(): boolean {
    return fs.existsSync(this.backlogPath());
  }

  parseOpenItems(): BacklogRisk[] {
    if (!this.exists()) return [];
    let content: string;
    try { content = fs.readFileSync(this.backlogPath(), "utf8"); }
    catch { return []; }
    return parseOpenItemsFromText(content);
  }

  parseOpenBlockers(): PlanBlockerProjection[] {
    if (!this.exists()) return [];
    let content: string;
    try { content = fs.readFileSync(this.backlogPath(), "utf8"); }
    catch { return []; }
    return parseOpenBlockersFromText(content, this.backlogMtime());
  }

  summarize(): BacklogSummary {
    const items = this.parseOpenItems();
    return summarizeBacklog(items);
  }

  private backlogPath(): string {
    return path.join(this.workspaceRoot, "docs", "BACKLOG.md");
  }

  private backlogMtime(): string {
    try { return fs.statSync(this.backlogPath()).mtime.toISOString(); }
    catch { return new Date().toISOString(); }
  }
}

/**
 * Projection of BACKLOG blockers into the `Plan.blockers` shape from
 * `qorelogic/planning/types.ts`. Only S* and D* open items qualify; B*
 * (planned backlog work) is intentionally excluded.
 */
export interface PlanBlockerProjection {
  id: string;
  phaseId: string;
  title: string;
  reason: string;
  severity: "hard" | "soft";
  createdAt: string;
}

export function parseOpenBlockersFromText(
  content: string, createdAt = new Date().toISOString(),
): PlanBlockerProjection[] {
  const items = parseOpenItemsFromText(content);
  const blockers: PlanBlockerProjection[] = [];
  for (const item of items) {
    if (!item.section.includes("Blockers")) continue;
    blockers.push({
      id: item.backlogId,
      phaseId: "unassigned",
      title: item.title,
      reason: item.description,
      severity: severityToHardSoft(item.severity),
      createdAt,
    });
  }
  return blockers;
}

function severityToHardSoft(severity: RiskSeverity): "hard" | "soft" {
  return severity === "critical" || severity === "high" ? "hard" : "soft";
}

export function parseOpenItemsFromText(content: string): BacklogRisk[] {
  const items: BacklogRisk[] = [];
  const ctx: ParseContext = { topSection: "", subSection: "" };
  for (const line of content.split(/\r?\n/)) {
    if (updateSectionFromHeading(line, ctx)) continue;
    const item = parseItemLine(line, ctx);
    if (item) items.push(item);
  }
  return items;
}

export function summarizeBacklog(items: BacklogRisk[]): BacklogSummary {
  let totalSecurityBlockers = 0;
  let totalDevBlockers = 0;
  let totalOpenBacklog = 0;
  for (const item of items) {
    if (item.section.includes("Security Blockers")) totalSecurityBlockers += 1;
    else if (item.section.includes("Development Blockers")) totalDevBlockers += 1;
    else totalOpenBacklog += 1;
  }
  return {
    totalOpenBlockers: totalSecurityBlockers + totalDevBlockers,
    totalSecurityBlockers,
    totalDevBlockers,
    totalOpenBacklog,
  };
}

function updateSectionFromHeading(line: string, ctx: ParseContext): boolean {
  const match = HEADING_RE.exec(line);
  if (!match) return false;
  const depth = match[1].length;
  const title = match[2];
  if (depth === 2) { ctx.topSection = title; ctx.subSection = ""; }
  else if (depth >= 3) { ctx.subSection = title; }
  return true;
}

function parseItemLine(line: string, ctx: ParseContext): BacklogRisk | null {
  const match = ITEM_RE.exec(line);
  if (!match || !match.groups) return null;
  if (match.groups.state.trim().length > 0) return null; // [x] = closed
  const id = match.groups.id;
  const text = match.groups.text.trim();
  const { title, description } = splitTitleDescription(text);
  const sectionLabel = ctx.subSection || ctx.topSection;
  return {
    id: `backlog:${id}`,
    title,
    description,
    severity: deriveSeverity(id, sectionLabel),
    source: "backlog",
    backlogId: id,
    section: sectionLabel,
  };
}

function splitTitleDescription(text: string): { title: string; description: string } {
  // Title = first sentence/clause up to a separator. Description = full original.
  const cap = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  const firstSep = text.search(/\s+[—\-|]\s+/);
  const title = firstSep > 0 ? text.slice(0, firstSep).trim() : cap;
  return { title: title || text.slice(0, 80), description: text };
}

function deriveSeverity(id: string, section: string): RiskSeverity {
  if (id.startsWith("S")) return "critical";
  if (section.includes("Security")) return "critical";
  if (id.startsWith("D")) return "high";
  if (section.includes("Development Blockers")) return "high";
  if (id.startsWith("B")) return "medium";
  return "low";
}
