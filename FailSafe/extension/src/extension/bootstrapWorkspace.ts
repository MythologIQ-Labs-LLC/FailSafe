import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { WorkspaceMigration } from "../qorelogic/WorkspaceMigration";
import type { IQorLogicPackageInstaller } from "../qorlogic/QorLogicPackageInstaller";
import type { QorLogicSkillIngestor } from "../qorlogic/QorLogicSkillIngestor";

export interface BootstrapStep {
  name: string;
  status: "ok" | "skipped" | "performed" | "failed" | "deferred";
  detail?: string;
}

export interface BootstrapReport {
  ok: boolean;
  steps: BootstrapStep[];
  summary: string;
}

export interface BootstrapDeps {
  context: vscode.ExtensionContext;
  workspaceRoot: string;
  installer: IQorLogicPackageInstaller;
  ingestor: QorLogicSkillIngestor;
  output: vscode.OutputChannel;
}

export type BootstrapMode = "auto" | "interactive" | "silent";

/**
 * Idempotent workspace bootstrap. Runs on every startup; each step skips
 * itself when the infrastructure it provisions is already present.
 *
 *   1. WorkspaceMigration.checkAndRepair — `.failsafe/` dirs, `.gitignore`,
 *      intent schema, etc. (existing).
 *   2. Ensure governance directory shape (`.failsafe/governance/`).
 *   3. qor-logic Python package — install when missing.
 *   4. QorLogic skill ingestion — run when no qor-* skills are present
 *      with synthesized provenance.
 *
 * `mode === "silent"` only performs side-effect-free checks and reports.
 * `mode === "auto"` performs side effects up to the cost of the network
 * (pip install). `mode === "interactive"` prompts before each side effect.
 */
export async function runWorkspaceBootstrap(
  deps: BootstrapDeps,
  mode: BootstrapMode = "auto",
): Promise<BootstrapReport> {
  const steps: BootstrapStep[] = [];
  steps.push(await stepWorkspaceMigration(deps, mode));
  steps.push(stepGovernanceDirs(deps));
  const pkgStep = await stepQorLogicPackage(deps, mode);
  steps.push(pkgStep);
  if (pkgStep.status === "ok" || pkgStep.status === "performed") {
    steps.push(await stepSkillIngestion(deps, mode));
  } else {
    steps.push({ name: "skill-ingestion", status: "deferred", detail: "qor-logic not installed" });
  }
  return assembleReport(steps);
}

async function stepWorkspaceMigration(
  deps: BootstrapDeps,
  mode: BootstrapMode,
): Promise<BootstrapStep> {
  if (mode === "silent") {
    return { name: "workspace-migration", status: "skipped", detail: "silent mode" };
  }
  try {
    await WorkspaceMigration.checkAndRepair(deps.context);
    return { name: "workspace-migration", status: "ok" };
  } catch (err) {
    return { name: "workspace-migration", status: "failed", detail: (err as Error).message };
  }
}

function stepGovernanceDirs(deps: BootstrapDeps): BootstrapStep {
  const required = [
    path.join(deps.workspaceRoot, ".failsafe"),
    path.join(deps.workspaceRoot, ".failsafe", "governance"),
    path.join(deps.workspaceRoot, ".failsafe", "governance", "plans"),
  ];
  let created = 0;
  for (const dir of required) {
    if (fs.existsSync(dir)) continue;
    fs.mkdirSync(dir, { recursive: true });
    created += 1;
  }
  return {
    name: "governance-dirs",
    status: created === 0 ? "ok" : "performed",
    detail: created === 0 ? "all directories present" : `created ${created} dir(s)`,
  };
}

async function stepQorLogicPackage(
  deps: BootstrapDeps,
  mode: BootstrapMode,
): Promise<BootstrapStep> {
  const installed = await deps.installer.isInstalled().catch(() => false);
  if (installed) return { name: "qor-logic-package", status: "ok" };
  if (mode === "silent") {
    return { name: "qor-logic-package", status: "deferred", detail: "silent mode; not installed" };
  }
  if (mode === "interactive") {
    const choice = await vscode.window.showInformationMessage(
      "FailSafe needs the qor-logic Python package to ingest governance skills. Install now?",
      "Install",
      "Later",
    );
    if (choice !== "Install") {
      return { name: "qor-logic-package", status: "deferred", detail: "user deferred" };
    }
  }
  deps.output.appendLine("[bootstrap] installing qor-logic via pip");
  const result = await deps.installer.install();
  if (!result.ok) {
    return {
      name: "qor-logic-package",
      status: "failed",
      detail: result.error ?? result.stderr ?? "install failed",
    };
  }
  return { name: "qor-logic-package", status: "performed" };
}

async function stepSkillIngestion(
  deps: BootstrapDeps,
  mode: BootstrapMode,
): Promise<BootstrapStep> {
  if (skillsAlreadyIngested(deps.workspaceRoot)) {
    return { name: "skill-ingestion", status: "ok", detail: "qor-* skills present with provenance" };
  }
  if (mode === "silent") {
    return { name: "skill-ingestion", status: "deferred", detail: "silent mode" };
  }
  deps.output.appendLine("[bootstrap] running qorlogic install for claude+codex");
  const result = await deps.ingestor.ingest({ hosts: ["claude", "codex"], scope: "repo" });
  if (!result.ok && result.installedHosts.length === 0) {
    return {
      name: "skill-ingestion",
      status: "failed",
      detail: result.failures.map((f) => `${f.host}: ${f.error}`).join("; "),
    };
  }
  return {
    name: "skill-ingestion",
    status: "performed",
    detail: `${result.skillCount} skill(s); hosts: ${result.installedHosts.join(", ")}`,
  };
}

function skillsAlreadyIngested(workspaceRoot: string): boolean {
  const skillsRoot = path.join(workspaceRoot, ".claude", "skills");
  if (!fs.existsSync(skillsRoot)) return false;
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("qor-")) continue;
    const sourceYml = path.join(skillsRoot, entry.name, "SOURCE.yml");
    if (fs.existsSync(sourceYml)) return true;
  }
  return false;
}

function assembleReport(steps: BootstrapStep[]): BootstrapReport {
  const failed = steps.filter((s) => s.status === "failed");
  const performed = steps.filter((s) => s.status === "performed");
  const deferred = steps.filter((s) => s.status === "deferred");
  let summary: string;
  if (failed.length > 0) {
    summary = `Bootstrap completed with ${failed.length} failure(s): ${failed.map((s) => s.name).join(", ")}`;
  } else if (performed.length === 0 && deferred.length === 0) {
    summary = "Bootstrap: workspace ready (all infrastructure already present)";
  } else if (performed.length > 0) {
    summary = `Bootstrap performed: ${performed.map((s) => s.name).join(", ")}`;
  } else {
    summary = `Bootstrap: ${deferred.length} step(s) deferred`;
  }
  return { ok: failed.length === 0, steps, summary };
}
