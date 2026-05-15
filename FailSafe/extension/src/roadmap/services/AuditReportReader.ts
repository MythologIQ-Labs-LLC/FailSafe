import * as fs from "fs";
import * as path from "path";

export type AuditVerdict = "PASS" | "VETO";

export interface AuditSnapshot {
  verdict: AuditVerdict | null;
  riskGrade: string | null;
  target: string | null;
  tribunalDate: string | null;
  observationCount: number;
  summary: string;
}

const VERDICT_RE = /^##\s+VERDICT:\s+(PASS|VETO)/m;
const TARGET_RE = /^\*\*Target\*\*:\s+(.+?)\s*$/m;
const RISK_GRADE_RE = /^\*\*Risk Grade\*\*:\s+(.+?)\s*$/m;
const TRIBUNAL_DATE_RE = /^\*\*Tribunal Date\*\*:\s+(.+?)\s*$/m;
const OBS_SECTION_RE = /^###\s+Audit Observations.*$/m;
const NUMBERED_RE = /^\s*\d+\.\s+/;

/**
 * Reads `.failsafe/governance/AUDIT_REPORT.md`. The file is overwritten by
 * each /qor-audit run, so it always reflects the latest verdict — no list
 * needed, just one snapshot.
 */
export class AuditReportReader {
  constructor(private readonly workspaceRoot: string) {}

  read(): AuditSnapshot | null {
    const filePath = this.auditPath();
    if (!fs.existsSync(filePath)) return null;
    let content: string;
    try { content = fs.readFileSync(filePath, "utf8"); }
    catch { return null; }
    return parseAuditFromText(content);
  }

  private auditPath(): string {
    return path.join(this.workspaceRoot, ".failsafe", "governance", "AUDIT_REPORT.md");
  }
}

export function parseAuditFromText(content: string): AuditSnapshot {
  const verdictMatch = VERDICT_RE.exec(content);
  return {
    verdict: verdictMatch ? (verdictMatch[1] as AuditVerdict) : null,
    target: matchOrNull(content, TARGET_RE),
    riskGrade: matchOrNull(content, RISK_GRADE_RE),
    tribunalDate: matchOrNull(content, TRIBUNAL_DATE_RE),
    observationCount: countObservations(content),
    summary: extractSummary(content),
  };
}

function matchOrNull(content: string, re: RegExp): string | null {
  const match = re.exec(content);
  return match ? match[1] : null;
}

function countObservations(content: string): number {
  const obsMatch = OBS_SECTION_RE.exec(content);
  if (!obsMatch || obsMatch.index === undefined) return 0;
  const after = content.slice(obsMatch.index + obsMatch[0].length);
  let count = 0;
  for (const line of after.split(/\r?\n/)) {
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
    if (NUMBERED_RE.test(line)) count += 1;
  }
  return count;
}

function extractSummary(content: string): string {
  const idx = content.indexOf("### Executive Summary");
  if (idx < 0) return "";
  const after = content.slice(idx);
  const lines = after.split(/\r?\n/).slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^#/.test(trimmed) || /^---/.test(trimmed)) continue;
    return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
  }
  return "";
}
