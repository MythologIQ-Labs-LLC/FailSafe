import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { WorkspaceMigration } from "../qorelogic/WorkspaceMigration";
import type { IQorLogicPackageInstaller } from "../qorlogic/QorLogicPackageInstaller";
import type { QorLogicSkillIngestor } from "../qorlogic/QorLogicSkillIngestor";
import { FROZEN_QOR_LOGIC_VERSION } from "../qorlogic/hostLayouts";
import { assembleReport, type BootstrapStep, type BootstrapReport } from "./bootstrapAssembleReport";
export { assembleReport, type BootstrapStep, type BootstrapReport };

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
  const status = await deps.installer.verifyInstalledVersion();
  if (status.installed === FROZEN_QOR_LOGIC_VERSION) {
    const health = await deps.installer.verifyInstalledDependencies();
    if (!health.ok) {
      return { name: "qor-logic-package", status: "deferred",
        detail: `Frozen wheel present but dependencies unhealthy: ${health.error}; skill installation withheld` };
    }
    return { name: "qor-logic-package", status: "ok",
      detail: `frozen version ${FROZEN_QOR_LOGIC_VERSION} and dependencies present; conformance separate` };
  }
  if (status.installed !== null) {
    return { name: "qor-logic-package", status: "deferred",
      detail: `Installed ${status.installed}; expected frozen ${FROZEN_QOR_LOGIC_VERSION}. No automatic upgrade/downgrade.` };
  }
  if (mode !== "interactive") {
    return { name: "qor-logic-package", status: "deferred",
      detail: "Missing or unverified qor-logic; select the verified 0.176.1 wheel interactively. No automatic network installation." };
  }
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
    filters: { "Python wheel": ["whl"] },
    openLabel: "Select frozen Qor-logic wheel",
  });
  if (!selected?.length) return { name: "qor-logic-package", status: "deferred", detail: "operator declined wheel selection" };
  const choice = await vscode.window.showWarningMessage(
    `Install Qor-logic ${FROZEN_QOR_LOGIC_VERSION} from selected local wheel? FailSafe checks its pinned SHA-256, uses no network or dependency downloads, and will not replace an installed version.`,
    { modal: true }, "Install verified wheel",
  );
  if (choice !== "Install verified wheel") return { name: "qor-logic-package", status: "deferred", detail: "operator declined install" };
  const result = await deps.installer.install(selected[0].fsPath);
  if (!result.ok) return { name: "qor-logic-package", status: "failed", detail: result.error ?? "install failed" };
  const recheck = await deps.installer.verifyInstalledVersion();
  if (recheck.installed !== FROZEN_QOR_LOGIC_VERSION) {
    return { name: "qor-logic-package", status: "failed", detail: "post-install version mismatch" };
  }
  const health = await deps.installer.verifyInstalledDependencies();
  if (!health.ok) {
    return { name: "qor-logic-package", status: "failed",
      detail: `post-install dependencies unhealthy: ${health.error}` };
  }
  return { name: "qor-logic-package", status: "performed", detail: "exact verified wheel installed; conformance pending" };
}

async function stepSkillIngestion(
  deps: BootstrapDeps,
  mode: BootstrapMode,
): Promise<BootstrapStep> {
  if (skillsAlreadyIngested(deps.workspaceRoot)) {
    return { name: "skill-ingestion", status: "ok", detail: "qor-* skills present with provenance" };
  }
  if (mode !== "interactive") {
    return { name: "skill-ingestion", status: "deferred", detail: "requires explicit operator approval; auto installs disabled" };
  }
  const approve = await vscode.window.showWarningMessage(
    "Install Qor-logic skills to the Claude and Codex workspace directories? This writes to agent configuration directories.",
    { modal: true }, "Install skills",
  );
  if (approve !== "Install skills") return { name: "skill-ingestion", status: "deferred", detail: "operator declined" };
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

