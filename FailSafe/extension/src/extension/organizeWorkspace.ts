import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { conventionProposals, privacyProposals } from "./organizeProposals";

export { conventionProposals, privacyProposals };

export interface OrganizeProposal {
  label: string;
  description: string;
  detail: string;
  action: () => Promise<void>;
  priority: "high" | "medium" | "low";
}

export interface OrganizeReport {
  archetype: string;
  /** Every proposal that was generated (not only the ones the user picked). */
  proposals: OrganizeProposal[];
  /** Labels of the user-selected proposals whose action succeeded. */
  executed: string[];
  /** Labels of the user-selected proposals whose action threw, with the error. */
  skipped: string[];
}

/** Paths that must never be moved/deleted (relative names, with or without trailing slash). */
export const PROTECTED_PATHS = [
  ".agent", ".claude", ".qor", ".failsafe", ".codex", ".kilo",
  ".gemini", ".cursor", ".windsurf", ".git", "node_modules", "docs",
];

function exists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}

export function detectArchetype(workspaceRoot: string): string {
  const has = (rel: string) => exists(path.join(workspaceRoot, rel));
  if (has(".claude") && has(".failsafe")) return "ai-workspace";
  if (has("package.json")) return "node-app";
  if (has("pyproject.toml") || has("setup.py")) return "python-package";
  return "generic";
}

async function mkdirp(target: string): Promise<void> {
  await fs.promises.mkdir(target, { recursive: true });
}

function nonCollidingPath(dir: string, name: string): string {
  let candidate = path.join(dir, name);
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}.${n}${ext}`);
    n += 1;
  }
  return candidate;
}

async function moveToArchive(workspaceRoot: string, name: string): Promise<void> {
  const archiveDir = path.join(workspaceRoot, "docs", "archive");
  await mkdirp(archiveDir);
  const src = path.join(workspaceRoot, name);
  const dest = nonCollidingPath(archiveDir, name);
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await fs.promises.copyFile(src, dest);
    await fs.promises.rm(src, { force: true });
  }
}

async function removePath(workspaceRoot: string, name: string): Promise<void> {
  await fs.promises.rm(path.join(workspaceRoot, name), { recursive: true, force: true });
}

function listRoot(workspaceRoot: string): string[] {
  try { return fs.readdirSync(workspaceRoot); } catch { return []; }
}

function isProtected(name: string): boolean {
  return PROTECTED_PATHS.includes(name.replace(/[\\/]+$/, ""));
}

function governanceDirProposals(workspaceRoot: string): OrganizeProposal[] {
  const target = path.join(workspaceRoot, ".failsafe", "governance", "plans");
  if (exists(target)) return [];
  return [{
    label: "Create .failsafe/governance/plans",
    description: "governance structure",
    detail: "Missing .failsafe/governance/plans directory — create it.",
    priority: "high",
    action: async () => { await mkdirp(target); },
  }];
}

// Matches FailSafe's historical root debris plan slugs (e.g. `plan-e7-foo.md`,
// `plan-feature-bar.md`). The `e\d+-` form deliberately does NOT match
// `plan-e2e-*.md` — those are legitimate end-to-end test plans.
const STALE_PLAN_RE = /^plan-(e\d+-|feature-|hotfix-|monitor-)/i;
const DELETE_EXACT = new Set([
  "prs.json", "pr21_diff.txt", "branch_stat.txt", "changed_files.txt", "nul",
]);

function isStalePlan(name: string): boolean {
  return name.endsWith(".md") && STALE_PLAN_RE.test(name);
}

function isDeleteDebris(name: string): boolean {
  if (DELETE_EXACT.has(name)) return true;
  return name.startsWith("validation_output");
}

function debrisProposals(workspaceRoot: string, _archetype: string): OrganizeProposal[] {
  const out: OrganizeProposal[] = [];
  for (const name of listRoot(workspaceRoot)) {
    if (isProtected(name)) continue;
    if (isStalePlan(name)) {
      out.push({
        label: `Move ${name} to docs/archive/`,
        description: "stale plan file",
        detail: `Root debris: ${name} belongs in docs/archive/. Propose MOVE.`,
        priority: "medium",
        action: () => moveToArchive(workspaceRoot, name),
      });
    } else if (isDeleteDebris(name)) {
      out.push({
        label: `Delete ${name}`,
        description: "one-off artifact",
        detail: `Root debris: ${name} is a stale one-off artifact. Propose DELETE.`,
        priority: "low",
        action: () => removePath(workspaceRoot, name),
      });
    } else if (name === "transfer to agent-toolkit") {
      out.push({
        label: `Remove directory "transfer to agent-toolkit/"`,
        description: "stale transfer dir",
        detail: "Root debris: leftover transfer directory. Propose archive/remove.",
        priority: "low",
        action: () => removePath(workspaceRoot, name),
      });
    }
  }
  return out;
}

export function buildProposals(workspaceRoot: string): OrganizeProposal[] {
  const archetype = detectArchetype(workspaceRoot);
  return [
    ...governanceDirProposals(workspaceRoot),
    ...debrisProposals(workspaceRoot, archetype),
    ...conventionProposals(workspaceRoot, archetype),
    ...privacyProposals(workspaceRoot),
  ];
}

export async function executeProposals(
  proposals: OrganizeProposal[],
): Promise<{ executed: string[]; skipped: string[] }> {
  const executed: string[] = [];
  const skipped: string[] = [];
  for (const p of proposals) {
    try {
      await p.action();
      executed.push(p.label);
    } catch (err) {
      skipped.push(`${p.label} (${(err as Error).message})`);
    }
  }
  return { executed, skipped };
}

function summarize(output: vscode.OutputChannel, report: OrganizeReport): void {
  output.appendLine(`[organize] archetype=${report.archetype} proposals=${report.proposals.length}`);
  for (const e of report.executed) output.appendLine(`[organize] applied: ${e}`);
  for (const s of report.skipped) output.appendLine(`[organize] skipped: ${s}`);
  if (report.proposals.length === 0) output.appendLine("[organize] workspace already tidy");
}

async function pickProposals(proposals: OrganizeProposal[]): Promise<OrganizeProposal[]> {
  if (proposals.length === 0) return [];
  const picked = await vscode.window.showQuickPick(
    proposals.map((p) => ({ label: p.label, description: p.description, detail: p.detail, proposal: p })),
    { canPickMany: true, title: "FailSafe — Organize Workspace", placeHolder: "Select changes to apply" },
  );
  if (!picked) return [];
  return picked.map((q) => q.proposal);
}

export interface NextStep {
  label: string;
  command?: string;
}

export interface OrganizeCallbacks {
  onToast?: (message: string) => void;
  onHubRefresh?: (reason: string) => void;
  onNextStep?: (suggestion: NextStep) => void;
}

export function computeNextStep(report: OrganizeReport): NextStep | null {
  if (report.executed.length === 0) return null;
  if (report.executed.some((l) => l.includes("governance/plans"))) {
    return { label: "Now run Initialize to bootstrap qor-logic + skills", command: "failsafe.bootstrap" };
  }
  if (report.executed.some((l) => l.startsWith("Add"))) {
    return { label: "Review the .gitignore patches and commit when ready" };
  }
  return { label: `Organize applied ${report.executed.length} change(s)` };
}

export async function runOrganize(
  workspaceRoot: string,
  output: vscode.OutputChannel,
  callbacks: OrganizeCallbacks = {},
): Promise<OrganizeReport> {
  const archetype = detectArchetype(workspaceRoot);
  const proposals = buildProposals(workspaceRoot);
  const selected = await pickProposals(proposals);
  const { executed, skipped } = await executeProposals(selected);
  const report: OrganizeReport = { archetype, proposals, executed, skipped };
  summarize(output, report);
  if (executed.length > 0) {
    const toast = skipped.length === 0
      ? `Organize: applied ${executed.length} change(s)`
      : `Organize: applied ${executed.length}, ${skipped.length} skipped`;
    callbacks.onToast?.(toast);
    callbacks.onHubRefresh?.("workspace-organized");
  }
  const next = computeNextStep(report);
  if (next) callbacks.onNextStep?.(next);
  return report;
}
