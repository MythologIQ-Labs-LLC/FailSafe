import * as fs from "fs";
import * as path from "path";

export type LedgerEntryKind =
  | "GENESIS"
  | "GATE TRIBUNAL"
  | "IMPLEMENTATION"
  | "SUBSTANTIATION"
  | "SESSION SEAL"
  | "PLAN"
  | "RESEARCH BRIEF"
  | "REMEDIATION"
  | "DELIVER"
  | "WORKSPACE_ORGANIZATION"
  | "OTHER";

export interface LedgerEntry {
  number: number;
  kind: LedgerEntryKind;
  title: string;
  rawHeading: string;
}

export interface LedgerSummary {
  totalEntries: number;
  byKind: Record<LedgerEntryKind, number>;
  /** Distinct sessions = each SUBSTANTIATION entry seals one session. */
  sessionsCompleted: number;
  /** Plans started ≈ GATE TRIBUNAL count (each plan goes through gate). */
  plansStarted: number;
  /** Sessions started but not yet sealed = plansStarted - sessionsCompleted. */
  sessionsInFlight: number;
  latestEntry: LedgerEntry | null;
}

// Permissive heading match: captures `### Entry #N: KIND ...` and `### Entry #N — KIND ...`.
// The kind token is everything between the entry number and the first separator
// (`-`, `—`, `:`, or end of line). We classify after extraction.
const HEADING_RE = /^###\s+Entry\s+#(\d+)\s*[:\-—]?\s*([^\r\n]*)$/;

const KIND_KEYWORDS: ReadonlyArray<{ kind: LedgerEntryKind; match: string }> = [
  { kind: "GENESIS", match: "GENESIS" },
  { kind: "GATE TRIBUNAL", match: "GATE TRIBUNAL" },
  { kind: "IMPLEMENTATION", match: "IMPLEMENTATION" },
  { kind: "SUBSTANTIATION", match: "SUBSTANTIATION" },
  { kind: "SESSION SEAL", match: "SESSION SEAL" },
  { kind: "PLAN", match: "PLAN" },
  { kind: "RESEARCH BRIEF", match: "RESEARCH BRIEF" },
  { kind: "REMEDIATION", match: "REMEDIATION" },
  { kind: "DELIVER", match: "DELIVER" },
  { kind: "WORKSPACE_ORGANIZATION", match: "WORKSPACE_ORGANIZATION" },
];

export class MetaLedgerReader {
  constructor(private readonly workspaceRoot: string) {}

  exists(): boolean {
    return fs.existsSync(this.ledgerPath());
  }

  parseEntries(): LedgerEntry[] {
    if (!this.exists()) return [];
    let content: string;
    try { content = fs.readFileSync(this.ledgerPath(), "utf8"); }
    catch { return []; }
    return parseEntriesFromText(content);
  }

  summarize(): LedgerSummary {
    return summarizeEntries(this.parseEntries());
  }

  recentVerdicts(limit = 20): VerdictRecord[] {
    return recentVerdictsFromEntries(this.parseEntries(), limit);
  }

  recentCompletions(limit = 20): CompletionRecord[] {
    return recentCompletionsFromEntries(this.parseEntries(), limit);
  }

  private ledgerPath(): string {
    return path.join(this.workspaceRoot, "docs", "META_LEDGER.md");
  }
}

export interface VerdictRecord {
  id: string;
  number: number;
  kind: "GATE TRIBUNAL";
  title: string;
}

export interface CompletionRecord {
  id: string;
  number: number;
  kind: "SUBSTANTIATION" | "SESSION SEAL" | "DELIVER";
  title: string;
}

const COMPLETION_KINDS: ReadonlySet<LedgerEntryKind> = new Set([
  "SUBSTANTIATION", "SESSION SEAL", "DELIVER",
]);

export function recentVerdictsFromEntries(
  entries: LedgerEntry[], limit: number,
): VerdictRecord[] {
  const gates = entries.filter((e) => e.kind === "GATE TRIBUNAL");
  return gates.slice(-Math.max(0, limit)).map((e) => ({
    id: `ledger-${e.number}`,
    number: e.number,
    kind: "GATE TRIBUNAL",
    title: e.title || e.rawHeading,
  }));
}

export function recentCompletionsFromEntries(
  entries: LedgerEntry[], limit: number,
): CompletionRecord[] {
  const completions = entries.filter((e) => COMPLETION_KINDS.has(e.kind));
  return completions.slice(-Math.max(0, limit)).map((e) => ({
    id: `ledger-${e.number}`,
    number: e.number,
    kind: e.kind as CompletionRecord["kind"],
    title: e.title || e.rawHeading,
  }));
}

export function parseEntriesFromText(content: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = HEADING_RE.exec(line);
    if (!match) continue;
    const num = Number(match[1]);
    if (!Number.isFinite(num)) continue;
    const remainder = match[2] ?? "";
    const { kindToken, title } = splitKindAndTitle(remainder);
    entries.push({
      number: num,
      kind: classifyKind(kindToken),
      title,
      rawHeading: line,
    });
  }
  return entries;
}

function splitKindAndTitle(remainder: string): { kindToken: string; title: string } {
  // The kind is the leading uppercase tokens; title is what follows
  // a separator (-, —) or starts after the kind run ends.
  const sepMatch = /^([^-—]+?)(?:\s+[-—]\s+(.+))?$/.exec(remainder.trim());
  if (!sepMatch) return { kindToken: remainder.trim(), title: "" };
  return {
    kindToken: sepMatch[1].trim(),
    title: (sepMatch[2] ?? "").trim(),
  };
}

export function summarizeEntries(entries: LedgerEntry[]): LedgerSummary {
  const byKind: Record<LedgerEntryKind, number> = {
    GENESIS: 0, "GATE TRIBUNAL": 0, IMPLEMENTATION: 0,
    SUBSTANTIATION: 0, "SESSION SEAL": 0, PLAN: 0,
    "RESEARCH BRIEF": 0, REMEDIATION: 0, DELIVER: 0,
    WORKSPACE_ORGANIZATION: 0, OTHER: 0,
  };
  for (const e of entries) byKind[e.kind] += 1;
  // Both SUBSTANTIATION (early) and SESSION SEAL (later) terminate a session.
  // DELIVER also implies a sealed shipped release.
  const sessionsCompleted = byKind.SUBSTANTIATION + byKind["SESSION SEAL"] + byKind.DELIVER;
  // Each GATE TRIBUNAL = a plan iteration submitted for review.
  // Re-audits share the same entry number; dedupe so re-iteration doesn't
  // inflate the planned count.
  const gateNumbers = new Set(
    entries.filter((e) => e.kind === "GATE TRIBUNAL").map((e) => e.number),
  );
  const plansStarted = gateNumbers.size;
  const sessionsInFlight = Math.max(0, plansStarted - sessionsCompleted);
  return {
    totalEntries: entries.length,
    byKind,
    sessionsCompleted,
    plansStarted,
    sessionsInFlight,
    latestEntry: pickLatestEntry(entries),
  };
}

function pickLatestEntry(entries: LedgerEntry[]): LedgerEntry | null {
  if (entries.length === 0) return null;
  return entries.reduce((acc, cur) => (cur.number > acc.number ? cur : acc), entries[0]);
}

function classifyKind(token: string): LedgerEntryKind {
  const upper = token.trim().toUpperCase();
  for (const { kind, match } of KIND_KEYWORDS) {
    if (upper.startsWith(match)) return kind;
  }
  return "OTHER";
}
