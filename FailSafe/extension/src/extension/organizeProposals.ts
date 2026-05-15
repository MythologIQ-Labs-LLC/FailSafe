import * as fs from "fs";
import * as path from "path";
import type { OrganizeProposal } from "./organizeWorkspace";

const GOVERNANCE_DIRS = [
  ".claude", ".codex", ".kilo", ".gemini", ".cursor",
  ".windsurf", ".agent", ".failsafe", ".qor",
];

function exists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}

function readText(p: string): string {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

function listRoot(workspaceRoot: string): string[] {
  try { return fs.readdirSync(workspaceRoot); } catch { return []; }
}

function editorConfigContent(archetype: string): string {
  const indent = archetype === "python-package" ? "4" : "2";
  return [
    "root = true", "",
    "[*]", "charset = utf-8", "end_of_line = lf",
    "insert_final_newline = true", `indent_style = space`, `indent_size = ${indent}`, "",
  ].join("\n");
}

function rootDocFiles(workspaceRoot: string): string[] {
  const keep = new Set(["README.md", "CHANGELOG.md", "LICENSE.md", "LICENSE", "CHANGELOG", "README"]);
  return listRoot(workspaceRoot)
    .filter((n) => n.toLowerCase().endsWith(".md"))
    .filter((n) => !keep.has(n));
}

export function conventionProposals(workspaceRoot: string, archetype: string): OrganizeProposal[] {
  const out: OrganizeProposal[] = [];
  if (!exists(path.join(workspaceRoot, "docs")) && rootDocFiles(workspaceRoot).length > 0) {
    out.push({
      label: "Create docs/ directory",
      description: "convention",
      detail: "Documentation-looking files exist in root but no docs/ directory.",
      priority: "medium",
      action: async () => { await fs.promises.mkdir(path.join(workspaceRoot, "docs"), { recursive: true }); },
    });
  }
  if (!exists(path.join(workspaceRoot, ".editorconfig"))) {
    out.push({
      label: "Create .editorconfig",
      description: `convention (${archetype})`,
      detail: `Missing .editorconfig — add a sensible default for ${archetype}.`,
      priority: "low",
      action: async () => {
        await fs.promises.writeFile(path.join(workspaceRoot, ".editorconfig"), editorConfigContent(archetype));
      },
    });
  }
  return out;
}

function presentGovernanceDirs(workspaceRoot: string): string[] {
  return GOVERNANCE_DIRS.filter((d) => exists(path.join(workspaceRoot, d)));
}

function missingIgnorePatterns(gitignore: string, dirs: string[]): string[] {
  const lines = new Set(gitignore.split(/\r?\n/).map((l) => l.trim()));
  return dirs.filter((d) => !lines.has(`${d}/`) && !lines.has(d));
}

export function privacyProposals(workspaceRoot: string): OrganizeProposal[] {
  const present = presentGovernanceDirs(workspaceRoot);
  if (present.length === 0) return [];
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const current = readText(gitignorePath);
  const missing = missingIgnorePatterns(current, present);
  if (missing.length === 0) return [];
  return [{
    label: `Add ${missing.length} governance pattern(s) to .gitignore`,
    description: "privacy",
    detail: `Governance dirs present but not ignored: ${missing.join(", ")}.`,
    priority: "high",
    action: async () => {
      const suffix = missing.map((d) => `${d}/`).join("\n");
      const sep = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      await fs.promises.appendFile(gitignorePath, `${sep}${suffix}\n`);
    },
  }];
}
