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
import { wireVoicePack, reprobeAndSet } from "./bootstrapVoicePack";
import { setupVoicePackRoutes } from "../roadmap/routes/VoicePackRoute";

export interface ServerDeps {
  planManager: PlanManager;
  qorelogicManager: QorLogicManager;
  sentinelDaemon: SentinelDaemon;
  eventBus: EventBus;
  workspaceRoot: string;
  systemRegistry: SystemRegistry;
  configManager: ConfigManager;
  /** B192 remediation: shared workspace-mutation bus. */
  mutationBus?: import("../shared/WorkspaceMutationBus").WorkspaceMutationBus;
  /** B194: governance mode-transition history ring buffer. */
  modeTransitionHistory?: import("../governance/ModeTransitionHistory").ModeTransitionHistory;
  /** B194: callback returning current governance mode state. */
  getGovernanceMode?: () => import("../governance/types").GovernanceModeState;
  /** B151: enforcement engine backing the universal governance interceptor;
   *  threaded into wireBicameralIntegration so the bicameral tool routes are
   *  governed. Absent in test contexts that don't exercise governed routes. */
  enforcementEngine?: import("../governance/EnforcementEngine").EnforcementEngine;
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

  // B197: forward-reference holder so HubSnapshotService's verifier closure
  // can reach the installer that's constructed below (after ConsoleServer).
  // The verifier is only invoked at hub-build time (post-activation), so the
  // late assignment is safe.
  let qorLogicPackageInstallerRef: QorLogicPackageInstaller | null = null;
  // Single unified server on port 9376
  const consoleServer = new ConsoleServer(
    deps.planManager,
    deps.qorelogicManager,
    deps.sentinelDaemon,
    deps.eventBus,
    {
      workspaceRoot: deps.workspaceRoot,
      configProvider: deps.configManager,
      mutationBus: deps.mutationBus,
      modeTransitionHistory: deps.modeTransitionHistory,
      getGovernanceMode: deps.getGovernanceMode,
      getQorLogicVerifier: async () => {
        if (!qorLogicPackageInstallerRef) {
          return { installed: null, minimum: '0.0.0', meetsFloor: false };
        }
        return qorLogicPackageInstallerRef.verifyInstalledVersion();
      },
    },
  );
  consoleServer.setIdeTracker(ideTracker);
  consoleServer.setSystemRegistry(deps.systemRegistry);
  wireBicameralIntegration(context, consoleServer, deps.workspaceRoot, {
    l3Service: {
      queueL3Approval: (req) => deps.qorelogicManager.queueL3Approval(req),
    },
    // B-INT-2: L3 surface for the preflight mediator. attachPreflightEvidence
    // + setPreflightMediator delegate to L3ApprovalService via QorLogicManager.
    l3PreflightService: {
      attachPreflightEvidence: (id, meta, flag) =>
        deps.qorelogicManager.attachPreflightEvidence(id, meta, flag),
      setPreflightMediator: (m) => deps.qorelogicManager.setPreflightMediator(m),
    },
    eventBus: deps.eventBus,
    logger: _logger,
    // B151: back the universal governance interceptor with the enforcement
    // engine so the 3 bicameral tool routes are governed.
    enforcementEngine: deps.enforcementEngine,
    // Phase 4 config adapter: read VS Code settings on demand. Keeps the
    // monitor decoupled from the VS Code API surface for unit testability.
    configProvider: {
      getNumber: (key, defaultValue) => {
        // VS Code settings use dot-paths; key already includes the section.
        const lastDot = key.lastIndexOf('.');
        const section = lastDot > 0 ? key.slice(0, lastDot) : '';
        const leaf = lastDot > 0 ? key.slice(lastDot + 1) : key;
        const v = vscode.workspace.getConfiguration(section).get<number>(leaf);
        return typeof v === 'number' ? v : defaultValue;
      },
      getString: (key, defaultValue) => {
        const lastDot = key.lastIndexOf('.');
        const section = lastDot > 0 ? key.slice(0, lastDot) : '';
        const leaf = lastDot > 0 ? key.slice(lastDot + 1) : key;
        const v = vscode.workspace.getConfiguration(section).get<string>(leaf);
        return typeof v === 'string' && v.length > 0 ? v : defaultValue;
      },
    },
  });

  // Voice Pack wiring — Phase 3 of voice-substrate-extraction.
  // Probe globalStorageUri/voice-pack/ BEFORE consoleServer.start() so the
  // /vendor static mount picks up the pack on first route registration. The
  // probe is fs-only; no spawn, no network. Stale / corrupt / absent all
  // resolve to null voicePackPath so the existing dist mount falls through.
  const extensionVersion = readExtensionVersion();
  await wireVoicePack(context, consoleServer, extensionVersion);

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
  // B197: assign forward-reference so HubSnapshotService.getQorLogicVerifier
  // closure (above) can reach the installer at hub-build time.
  qorLogicPackageInstallerRef = packageInstaller;
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
  // Voice Pack routes — Phase 3 of voice-substrate-extraction. Same
  // post-start pattern as qorlogic routes above so the SPA fallback is
  // registered AFTER these /api/* routes are wired.
  const reprobeVoicePackOnChange = async () => {
    const gs = context.globalStorageUri?.fsPath;
    if (gs) await reprobeAndSet(consoleServer, gs, extensionVersion);
  };
  setupVoicePackRoutes(consoleServer.getExpressApp(), {
    rejectIfRemote: (req, res) => {
      const remote = req.socket?.remoteAddress ?? "";
      const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
      if (!local) { res.status(403).json({ error: "Forbidden: local access only" }); return true; }
      return false;
    },
    broadcast: (data) => consoleServer.broadcastEvent(data),
    globalStoragePath: context.globalStorageUri?.fsPath || "",
    extensionVersion,
    onPackStateChanged: reprobeVoicePackOnChange,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.installVoicePack", async () => {
      const gs = context.globalStorageUri?.fsPath;
      if (!gs) { void vscode.window.showErrorMessage("Voice Pack: globalStorage unavailable."); return; }
      try {
        const { installVoicePack } = await import("../voice-pack");
        outputChannel.appendLine(`[voice-pack] starting install v${extensionVersion}`);
        const report = await installVoicePack({
          globalStoragePath: gs,
          version: extensionVersion,
          output: outputChannel,
          onProgress: (evt) => consoleServer.broadcastEvent({
            type: evt.status === "error" ? "voicePack.install.error" : "voicePack.install.progress",
            invocation: evt,
          }),
        });
        await reprobeVoicePackOnChange();
        consoleServer.broadcastEvent({ type: "voicePack.install.complete", report });
        void vscode.window.showInformationMessage(`Voice Pack installed (v${report.version}).`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`[voice-pack] install failed: ${msg}`);
        void vscode.window.showErrorMessage(`Voice Pack install failed: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("failsafe.uninstallVoicePack", async () => {
      const gs = context.globalStorageUri?.fsPath;
      if (!gs) return;
      const { uninstallVoicePack } = await import("../voice-pack");
      uninstallVoicePack(gs);
      await reprobeVoicePackOnChange();
      consoleServer.broadcastEvent({ type: "voicePack.uninstalled" });
      void vscode.window.showInformationMessage("Voice Pack uninstalled.");
    }),
  );

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

function readExtensionVersion(): string {
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
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
