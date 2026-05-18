/**
 * Servers Bootstrap Module
 *
 * Sets up ConsoleServer and webview providers.
 * All UI and API served from single server on port 9376.
 */

import * as vscode from "vscode";
import { Logger } from "../shared/Logger";
import { ConsoleServer } from "../roadmap";
import { FailSafeSidebarProvider } from "../roadmap/FailSafeSidebarProvider";
import { RiskManager } from "../qorelogic/risk";
import type { EventBus } from "../shared/EventBus";
import type { PlanManager } from "../qorelogic/planning/PlanManager";
import type { QorLogicManager } from "../qorelogic/QorLogicManager";
import type { SentinelDaemon } from "../sentinel/SentinelDaemon";
import type { SystemRegistry } from "../qorelogic/SystemRegistry";
import type { ConfigManager } from "../shared/ConfigManager";
import { IdeActivityTracker } from "../roadmap/services/IdeActivityTracker";
import { PythonInterpreterResolver, defaultRun } from "../qorlogic/PythonInterpreterResolver";
import { QorLogicPackageInstaller, defaultInstallerRun } from "../qorlogic/QorLogicPackageInstaller";
import { QorLogicSkillIngestor } from "../qorlogic/QorLogicSkillIngestor";
import { createInstallSkillsHandler, createScaffoldWithWebOptions } from "./installSkillsHandler";
import { runWorkspaceBootstrap, type BootstrapReport } from "./bootstrapWorkspace";
import { wireBicameralIntegration, maybeAutoConnectBicameral } from "./bootstrapBicameral";

export interface ServerDeps {
  planManager: PlanManager;
  qorelogicManager: QorLogicManager;
  sentinelDaemon: SentinelDaemon;
  eventBus: EventBus;
  workspaceRoot: string;
  systemRegistry: SystemRegistry;
  configManager: ConfigManager;
}

export interface ServerResult {
  consoleServer: ConsoleServer;
  riskManager: RiskManager;
  actualPort: number;
}

export async function bootstrapServers(
  context: vscode.ExtensionContext,
  deps: ServerDeps,
  _logger: Logger,
): Promise<ServerResult> {
  // Risk Manager
  const riskManager = new RiskManager(
    deps.workspaceRoot,
    deps.workspaceRoot.split(/[/\\]/).pop() || "project",
  );

  // IDE Activity Tracker (receives task/debug events via EventBus)
  const ideTracker = new IdeActivityTracker(deps.eventBus);

  // Single unified server on port 9376
  const consoleServer = new ConsoleServer(
    deps.planManager,
    deps.qorelogicManager,
    deps.sentinelDaemon,
    deps.eventBus,
    { workspaceRoot: deps.workspaceRoot, configProvider: deps.configManager },
  );
  consoleServer.setIdeTracker(ideTracker);
  consoleServer.setSystemRegistry(deps.systemRegistry);
  wireBicameralIntegration(context, consoleServer, deps.workspaceRoot);

  // QorLogic skill installer (v5): replaces v4 bundled-skills copy path.
  // Construct + register the scaffold callback BEFORE consoleServer.start() so
  // the route deps capture the wired callback rather than null. Earlier wiring
  // had this after start(), which left `/api/actions/scaffold-skills` returning
  // 501 "Scaffold not available" forever. (Plan A Phase 3 fix follow-up.)
  const outputChannel = vscode.window.createOutputChannel("FailSafe (Qor-Logic)");
  context.subscriptions.push(outputChannel);
  consoleServer.setOutputChannel(outputChannel);

  // Risk Auto-Derivation pipeline (plan-qor-model-sourced-risks Phase 3).
  const { wireRiskAutoDerivation } = await import("../qorelogic/risk/wireAutoDerivation");
  wireRiskAutoDerivation(consoleServer, deps.eventBus, riskManager, deps.workspaceRoot, outputChannel);
  const interpreterResolver = new PythonInterpreterResolver(
    vscode.workspace.getConfiguration(),
    vscode,
    defaultRun,
  );
  const packageInstaller = new QorLogicPackageInstaller(
    interpreterResolver,
    outputChannel,
    defaultInstallerRun,
  );
  const skillIngestor = new QorLogicSkillIngestor(
    packageInstaller,
    interpreterResolver,
    deps.workspaceRoot,
    defaultInstallerRun,
    async () => undefined,
    outputChannel,
  );
  consoleServer.setScaffoldCallback(createInstallSkillsHandler(context, skillIngestor, {
    onProgress: (invocation) => consoleServer.broadcastEvent({ type: "skills.install.progress", invocation }),
    onComplete: (report) => {
      consoleServer.broadcastEvent({ type: "skills.install.complete", report });
      // Plan A Phase 3 / issue #48: refresh the hub so the Get Started banner
      // re-evaluates against the new install record state.
      consoleServer.broadcastEvent({ type: "hub.refresh", reason: "skills-installed" });
    },
  }, 'prompt'));

  consoleServer.setScaffoldWebCallback(createScaffoldWithWebOptions(skillIngestor, {
    onProgress: (invocation) => consoleServer.broadcastEvent({ type: "skills.install.progress", invocation }),
    onComplete: (report) => {
      consoleServer.broadcastEvent({ type: "skills.install.complete", report });
      consoleServer.broadcastEvent({ type: "hub.refresh", reason: "skills-installed" });
    },
  }));

  await consoleServer.start();
  context.subscriptions.push({ dispose: () => consoleServer?.stop() });
  maybeAutoConnectBicameral(consoleServer, deps.workspaceRoot, outputChannel);

  // Phase 3 V3 Path A: register qorlogic routes after server start.
  const { registerQorlogicRoutes } = await import("../roadmap/routes/QorlogicRoute");
  const { enumerateSkillsForHost } = await import("../qorlogic/skillEnumeration");
  const { previewInstall } = await import("../qorlogic/installDryRun");
  const runCli = async (_ing: unknown, extra: ReadonlyArray<string>) => {
    const py = await interpreterResolver.resolve();
    if (!py.ok) return { stdout: "", stderr: "no-python-found", code: -1 };
    const r = await defaultInstallerRun(py.command, [...py.args, "-m", "qor.cli", ...extra], { timeoutMs: 180_000, cwd: deps.workspaceRoot, env: { QORLOGIC_PROJECT_DIR: deps.workspaceRoot } });
    return { stdout: r.stdout, stderr: r.stderr, code: r.code };
  };
  const skillEnumDeps = { runQorlogicCommand: runCli, warn: (m: string) => outputChannel.appendLine(`[skill-enum] ${m}`) };
  registerQorlogicRoutes(consoleServer.getExpressApp(), {
    enumerateSkillsForHost: (host, scope) => enumerateSkillsForHost(skillIngestor, host, scope, skillEnumDeps),
    previewInstall: (host, scope, filter) => previewInstall(skillIngestor, host, scope, filter),
  });
  // SPA fallback registered LAST so qorlogic POST routes above are matched
  // before the catch-all intercepts them.
  consoleServer.finalizeRoutes();

  // Invalidate the resolver's cache when the user changes the Python override.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("failsafe.qorlogic.pythonPath")) {
        interpreterResolver.invalidate();
      }
    }),
  );

  // Register `failsafe.bootstrap` and `failsafe.organize` commands. Bootstrap
  // is the always-available workspace-readiness gate (idempotent: skips
  // already-present infrastructure). Without these registrations the sidebar
  // "Initialize" button falls through to a misleading "not enabled" message.
  const bootstrapDeps = {
    context, workspaceRoot: deps.workspaceRoot,
    installer: packageInstaller, ingestor: skillIngestor, output: outputChannel,
  } as const;

  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.bootstrap", async () => {
      const report = await runWorkspaceBootstrap(bootstrapDeps, "interactive");
      reportBootstrapToUser(report, outputChannel);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.organize", async () => {
      const { runOrganize } = await import("./organizeWorkspace");
      await runOrganize(deps.workspaceRoot, outputChannel, {
        onToast: (message) => { void vscode.window.showInformationMessage(message); },
        onHubRefresh: (reason) => consoleServer.broadcastEvent({ type: "hub.refresh", reason }),
        onNextStep: (suggestion) => {
          outputChannel.appendLine(`[organize] next: ${suggestion.label}`);
          if (suggestion.command) {
            void vscode.window.showInformationMessage(suggestion.label, "Run").then((choice) => {
              if (choice === "Run") void vscode.commands.executeCommand(suggestion.command!);
            });
          }
        },
      });
    }),
  );

  // Round 2 / Issue #50: defaults-mode install command — bypasses the
  // prompt QuickPick and installs against {claude, codex} at repo scope.
  // Used for automation, scripts, and the command palette quick path.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.installQorLogicSkillsDefaults", async () => {
      const handler = createInstallSkillsHandler(context, skillIngestor, {
        onProgress: (invocation) => consoleServer.broadcastEvent({ type: "skills.install.progress", invocation }),
        onComplete: (report) => {
          consoleServer.broadcastEvent({ type: "skills.install.complete", report });
          consoleServer.broadcastEvent({ type: "hub.refresh", reason: "skills-installed" });
        },
      }, 'defaults');
      const report = await handler();
      if (report === null) {
        outputChannel.appendLine('[install-skills-defaults] cancelled');
        return;
      }
      const summary = report.ok
        ? `Installed ${report.totalInstalled} skills across ${report.destinations.length} destination(s)`
        : `Install completed with ${report.failures.length} failure(s)`;
      outputChannel.appendLine(`[install-skills-defaults] ${summary}`);
      if (!report.ok) outputChannel.show(true);
    }),
  );

  // Run silent bootstrap on activation so missing infrastructure is created
  // immediately. Heavy steps (pip install) are deferred until the user
  // explicitly invokes `failsafe.bootstrap` from the sidebar or command palette.
  void runWorkspaceBootstrap(bootstrapDeps, "silent").then((report) => {
    outputChannel.appendLine(`[bootstrap-on-activation] ${report.summary}`);
    for (const step of report.steps) {
      outputChannel.appendLine(`  - ${step.name}: ${step.status}${step.detail ? ` (${step.detail})` : ""}`);
    }
  });

  // Get actual port for workspace isolation
  const actualPort = consoleServer.getPort();

  // Webview Providers - pass dynamic port for workspace isolation
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      FailSafeSidebarProvider.viewType,
      new FailSafeSidebarProvider(actualPort),
    ),
  );

  return { consoleServer, riskManager, actualPort };
}

function reportBootstrapToUser(
  report: BootstrapReport,
  output: vscode.OutputChannel,
): void {
  output.appendLine(`[bootstrap] ${report.summary}`);
  for (const step of report.steps) {
    output.appendLine(`  - ${step.name}: ${step.status}${step.detail ? ` (${step.detail})` : ""}`);
  }
  if (!report.ok) {
    void vscode.window.showErrorMessage(report.summary, "Show Output").then((choice) => {
      if (choice === "Show Output") output.show(true);
    });
    return;
  }
  void vscode.window.showInformationMessage(report.summary);
}
