import * as fs from "fs";
import * as path from "path";

export interface ParsedPhase {
  id: string;
  name: string;
  status: "in-progress";
}

export interface ParsedPlan {
  planId: string;
  title: string;
  filePath: string;
  mtime: string;
  openQuestions: string[];
  phases: ParsedPhase[];
}

const H1_RE = /^#\s+(.+?)\s*$/;
const PHASE_RE = /^##\s+(Phase\s+[\dA-Za-z].*?)\s*$/;
const QUESTION_BULLET_RE = /^\s*(?:\d+\.|-)\s+(.+?)\s*$/;
const SECTION_RE = /^##\s+(.+?)\s*$/;

/**
 * Reads `.failsafe/governance/plans/*.md` and exposes the most-recent plan
 * (by mtime) as a `ParsedPlan` value. Each parser is a pure function over
 * markdown content — no caching, no shared state.
 */
export class PlanFileReader {
  constructor(private readonly workspaceRoot: string) {}

  pickLatestPlan(): ParsedPlan | null {
    const all = this.listPlans();
    return all.length > 0 ? all[0] : null;
  }

  listPlans(): ParsedPlan[] {
    const dir = this.plansDir();
    if (!fs.existsSync(dir)) return [];
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return []; }
    const plans: ParsedPlan[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;
      const fullPath = path.join(dir, entry.name);
      const stat = safeStat(fullPath);
      if (!stat) continue;
      const content = safeRead(fullPath);
      if (content === null) continue;
      const parsed = parsePlanFromText(content, entry.name);
      plans.push({ ...parsed, filePath: fullPath, mtime: stat.mtime.toISOString() });
    }
    return plans.sort((a, b) => b.mtime.localeCompare(a.mtime));
  }

  private plansDir(): string {
    return path.join(this.workspaceRoot, ".failsafe", "governance", "plans");
  }
}

export function parsePlanFromText(content: string, filename: string): ParsedPlan {
  const lines = content.split(/\r?\n/);
  const title = extractTitle(lines, filename);
  const openQuestions = extractOpenQuestions(lines);
  const phases = extractPhases(lines);
  const planId = filename.replace(/\.md$/, "");
  return {
    planId,
    title,
    filePath: filename,
    mtime: "",
    openQuestions,
    phases,
  };
}

function extractTitle(lines: string[], filename: string): string {
  for (const line of lines) {
    const match = H1_RE.exec(line);
    if (match) return match[1];
  }
  return filename.replace(/\.md$/, "");
}

function extractPhases(lines: string[]): ParsedPhase[] {
  const phases: ParsedPhase[] = [];
  for (const line of lines) {
    const match = PHASE_RE.exec(line);
    if (!match) continue;
    const name = match[1];
    phases.push({ id: slugify(name), name, status: "in-progress" });
  }
  return phases;
}

function extractOpenQuestions(lines: string[]): string[] {
  const questions: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      inSection = /open\s+questions/i.test(sectionMatch[1]);
      continue;
    }
    if (!inSection) continue;
    const bullet = QUESTION_BULLET_RE.exec(line);
    if (bullet) questions.push(bullet[1]);
  }
  return questions;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function safeStat(filePath: string): fs.Stats | null {
  try { return fs.statSync(filePath); }
  catch { return null; }
}

function safeRead(filePath: string): string | null {
  try { return fs.readFileSync(filePath, "utf8"); }
  catch { return null; }
}
