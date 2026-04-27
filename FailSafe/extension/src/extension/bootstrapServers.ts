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
import type { QoreLogicManager } from "../qorelogic/QoreLogicManager";
import type { SentinelDaemon } from "../sentinel/SentinelDaemon";
import type { SystemRegistry } from "../qorelogic/SystemRegistry";
import type { ConfigManager } from "../shared/ConfigManager";
import { IdeActivityTracker } from "../roadmap/services/IdeActivityTracker";
import { PythonInterpreterResolver, defaultRun } from "../qorlogic/PythonInterpreterResolver";
import { QorLogicPackageInstaller, defaultInstallerRun } from "../qorlogic/QorLogicPackageInstaller";
import { QorLogicSkillIngestor } from "../qorlogic/QorLogicSkillIngestor";
import { createInstallSkillsHandler } from "./installSkillsHandler";
import { runWorkspaceBootstrap, type BootstrapReport } from "./bootstrapWorkspace";

export interface ServerDeps {
  planManager: PlanManager;
  qorelogicManager: QoreLogicManager;
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
  await consoleServer.start();
  context.subscriptions.push({ dispose: () => consoleServer?.stop() });

  // QorLogic skill installer (v5): replaces v4 bundled-skills copy path.
  const outputChannel = vscode.window.createOutputChannel("FailSafe (QorLogic)");
  context.subscriptions.push(outputChannel);
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
  consoleServer.setScaffoldCallback(createInstallSkillsHandler(skillIngestor));

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
      // Organize is a focused subset: workspace structure only, no pip install.
      const report = await runWorkspaceBootstrap(bootstrapDeps, "silent");
      reportBootstrapToUser(report, outputChannel);
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
