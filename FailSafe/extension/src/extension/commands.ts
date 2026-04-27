import * as vscode from "vscode";
import { GenesisManager } from "../genesis/GenesisManager";
import { QoreLogicManager } from "../qorelogic/QoreLogicManager";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";
import { FeedbackManager } from "../genesis/FeedbackManager";
import { IntentService } from "../governance/IntentService";
import { IntentType } from "../governance/types/IntentTypes";
import { DetectedSystem, FrameworkSync } from "../qorelogic/FrameworkSync";
import { WorkspaceMigration } from "../qorelogic/WorkspaceMigration";
import { RiskManager, RiskSeverity, RiskCategory } from "../qorelogic/risk";
import { ProjectOverviewPanel } from "../genesis/panels/ProjectOverviewPanel";
import { EventBus } from "../shared/EventBus";
import { FAILSAFE_PRO_ABOUT_URL } from "../shared/constants";
import * as http from "http";

// Workspace isolation: dynamic port and workspace root
let serverPort = 9376;
let workspaceRoot = "";

export function setServerPort(port: number, wsRoot: string): void {
  serverPort = port;
  workspaceRoot = wsRoot;
}

function getBaseUrl(): string {
  return `http://localhost:${serverPort}`;
}

function checkConsoleServerReady(timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${getBaseUrl()}/api/roadmap`, (res) => {
      res.resume();
      resolve((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 400);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });

    req.on("error", () => resolve(false));
  });
}

async function waitForConsoleServerReady(
  attempts = 6,
  delayMs = 250,
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ready = await checkConsoleServerReady(900);
    if (ready) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function openRoadmapExternal(view?: string): Promise<void> {
  // Open the new Command Center UI
  const targetUrl = new URL(getBaseUrl());
  // Add workspace identity for multi-workspace support
  if (workspaceRoot) {
    targetUrl.searchParams.set("workspace", workspaceRoot);
  }
  targetUrl.searchParams.set("ui", "console");
  if (view) {
    targetUrl.searchParams.set("view", view);
  }

  const themeKind = vscode.window.activeColorTheme.kind;
  const themeParam =
    themeKind === vscode.ColorThemeKind.Light ||
    themeKind === vscode.ColorThemeKind.HighContrastLight
      ? "light"
      : themeKind === vscode.ColorThemeKind.HighContrast
        ? "high-contrast"
        : "dark";
  targetUrl.searchParams.set("theme", themeParam);

  const target = targetUrl.toString();
  const ready = await waitForConsoleServerReady();
  if (!ready) {
    vscode.window.showWarningMessage(
      "FailSafe Command Center is starting. Opening browser now; refresh in a moment if needed.",
    );
  }
  try {
    const opened = await vscode.env.openExternal(vscode.Uri.parse(target));
    if (!opened) {
      throw new Error("openExternal returned false");
    }
  } catch {
    vscode.window.showErrorMessage(
      "Could not open FailSafe Command Center in browser. Check your system browser configuration.",
    );
  }
}

async function openRoadmapCompactEditor(): Promise<void> {
  const targetUrl = new URL(getBaseUrl());
  targetUrl.searchParams.set("ui", "compact");

  const themeKind = vscode.window.activeColorTheme.kind;
  const themeParam =
    themeKind === vscode.ColorThemeKind.Light ||
    themeKind === vscode.ColorThemeKind.HighContrastLight
      ? "light"
      : themeKind === vscode.ColorThemeKind.HighContrast
        ? "high-contrast"
        : "dark";
  targetUrl.searchParams.set("theme", themeParam);

  const ready = await waitForConsoleServerReady();
  if (!ready) {
    vscode.window.showWarningMessage(
      "FailSafe webpanel is starting. Opened compact hub in editor; refresh shortly if needed.",
    );
  }

  const target = targetUrl.toString();
  try {
    await vscode.commands.executeCommand("simpleBrowser.show", target);
  } catch {
    // Fallback to external browser if Simple Browser is unavailable.
    await vscode.env.openExternal(vscode.Uri.parse(target));
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  genesis: GenesisManager,
  qorelogic: QoreLogicManager,
  sentinel: SentinelDaemon,
  feedback: FeedbackManager,
  riskManager: RiskManager,
  intentService: IntentService,
  eventBus: EventBus,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openSidebar", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.failsafe-sidebar-container",
      );
      try {
        await vscode.commands.executeCommand("failsafe.sidebarView.focus");
      } catch {
        // Best-effort focus; container open is the primary action.
      }
    }),
  );

  // v5: "About FailSafe Pro" opens the learn-more product page. The download
  // URL is reachable from that page; the extension does NOT link to it directly
  // because "About" should not mean "download right now".
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openFailSafeProAbout", async () => {
      await vscode.env.openExternal(vscode.Uri.parse(FAILSAFE_PRO_ABOUT_URL));
    }),
  );

  // Project Overview Panel command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openProjectOverview", () => {
      ProjectOverviewPanel.createOrShow(
        context.extensionUri,
        sentinel,
        qorelogic,
        riskManager,
        intentService,
        eventBus,
      );
    }),
  );

  // Risk Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openRiskRegister", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.failsafe-sidebar-container",
      );
      // Focus the risk register view if available
      try {
        await vscode.commands.executeCommand("failsafe.riskRegister.focus");
      } catch {
        // Fall back to sidebar
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.addRisk", async () => {
      const title = await vscode.window.showInputBox({
        prompt: "Risk Title",
        placeHolder: "Brief description of the risk",
      });
      if (!title) return;

      const description = await vscode.window.showInputBox({
        prompt: "Risk Description",
        placeHolder: "Detailed description of the risk",
      });
      if (!description) return;

      const severityPick = await vscode.window.showQuickPick(
        ["critical", "high", "medium", "low"],
        { placeHolder: "Select Risk Severity" },
      );
      if (!severityPick) return;
      const severity = severityPick as RiskSeverity;

      const categoryPick = await vscode.window.showQuickPick(
        [
          "security",
          "performance",
          "technical-debt",
          "dependency",
          "governance",
          "compliance",
          "operational",
        ],
        { placeHolder: "Select Risk Category" },
      );
      if (!categoryPick) return;
      const category = categoryPick as RiskCategory;

      const risk = riskManager.createRisk({
        title,
        description,
        severity,
        category,
        impact: "",
        mitigation: "",
      });

      vscode.window.showInformationMessage(
        `Risk "${risk.title}" created with ID: ${risk.id}`,
      );
    }),
  );

  // Legacy UI command shims: keep command ids valid, route to compact hub.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showDashboard", () => {
      return openRoadmapCompactEditor();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showLivingGraph", () => {
      return openRoadmapCompactEditor();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.focusCortex", () => {
      return openRoadmapCompactEditor();
    }),
  );

  // Sentinel status command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.sentinelStatus", () => {
      const status = sentinel.getStatus();
      vscode.window.showInformationMessage(
        `Sentinel: ${status.running ? "Active" : "Stopped"} (${status.mode}) | ` +
          `Files: ${status.filesWatched} | Queue: ${status.queueDepth}`,
      );
    }),
  );

  // Audit file command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.auditFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No file is currently open");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Auditing ${filePath}...`,
          cancellable: false,
        },
        async () => {
          const verdict = await sentinel.auditFile(filePath);
          genesis.showVerdictNotification(verdict);
        },
      );
    }),
  );

  // Legacy UI command shim.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.viewLedger", () => {
      return openRoadmapCompactEditor();
    }),
  );

  // Legacy UI command shim.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.approveL3", () => {
      return openRoadmapCompactEditor();
    }),
  );

  // Generate feedback command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.generateFeedback", async () => {
      const entry = await feedback.createFeedbackEntry();
      if (entry) {
        try {
          await feedback.saveFeedback(entry);
          vscode.window
            .showInformationMessage(
              `Feedback saved. ID: ${entry.id}`,
              "View Feedback",
            )
            .then((action) => {
              if (action === "View Feedback") {
                feedback.showFeedbackPanel();
              }
            });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to save feedback: ${error}`);
        }
      }
    }),
  );

  // Legacy UI command shim.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.viewFeedback", () => {
      return openRoadmapCompactEditor();
    }),
  );

  // V3 REMEDIATION: Register roadmap focus command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showRoadmap", () => {
      vscode.commands.executeCommand("failsafe.roadmap.focus");
    }),
  );

  // External popout console actions.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openPlannerHub", () => {
      return openRoadmapExternal();
    }),
  );
  // Compatibility alias for previously misspelled command id observed in some hosts.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openPlannnerHub", () => {
      return openRoadmapExternal();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openRoadmap", () => {
      return vscode.commands.executeCommand("failsafe.openPlannerHub");
    }),
  );
  // Explicit in-editor tab variant of the Command Center.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openPlannerHubEditor", () => {
      return openRoadmapCompactEditor();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openRoadmapTimeline", () => {
      return openRoadmapExternal("timeline");
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openRoadmapActiveSprint", () => {
      return openRoadmapExternal("current-sprint");
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.openRoadmapLiveActivity", () => {
      return openRoadmapExternal("live-activity");
    }),
  );

  // v3.0.0: Full-screen Planning Roadmap Window
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showRoadmapWindow", () => {
      return openRoadmapCompactEditor();
    }),
  );

  // Legacy UI command shim.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showAnalytics", () => {
      return openRoadmapCompactEditor();
    }),
  );

  // Token Economics ROI Dashboard (v4.0.0)
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showEconomics", () => {
      genesis.showEconomics();
    }),
  );

  // Time-Travel Rollback (v4.1.0)
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.revertToCheckpoint", async () => {
      const checkpointId = await vscode.window.showInputBox({
        prompt: "Checkpoint ID to revert to",
        placeHolder: "Enter checkpoint ID",
      });
      if (checkpointId) {
        genesis.showRevert(checkpointId);
      }
    }),
  );

  // Export feedback command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.exportFeedback", async () => {
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file("failsafe-feedback-export.json"),
        filters: {
          "JSON Files": ["json"],
        },
      });

      if (saveUri) {
        try {
          await feedback.exportFeedback(saveUri.fsPath);
          vscode.window.showInformationMessage(
            `Feedback exported to: ${saveUri.fsPath}`,
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to export feedback: ${error}`);
        }
      }
    }),
  );

  // Secure Workspace command (Manual Hygiene)
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.secureWorkspace", async () => {
      await WorkspaceMigration.checkAndRepair(context);
      vscode.window.showInformationMessage(
        "🛡️ Workspace hygiene check complete.",
      );
    }),
  );
  // Panic stop command (B59): immediate stop of active monitoring loop.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.panicStop", async () => {
      const choice = await vscode.window.showWarningMessage(
        "Panic Stop will halt active FailSafe monitoring for this session. Continue?",
        { modal: true },
        "Stop Now",
      );
      if (choice !== "Stop Now") {
        return;
      }

      sentinel.stop();
      vscode.window.showWarningMessage(
        "FailSafe Panic Stop executed. Sentinel daemon halted. Re-run activation to resume monitoring.",
      );
    }),
  );

  // Resume monitoring command: restart Sentinel after panic stop.
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.resumeMonitoring", async () => {
      if (sentinel.isRunning()) {
        vscode.window.showInformationMessage(
          "FailSafe monitoring is already running.",
        );
        return;
      }
      await sentinel.start();
      vscode.window.showInformationMessage(
        "FailSafe monitoring resumed successfully.",
      );
    }),
  );
}

export function registerGovernanceCommands(
  context: vscode.ExtensionContext,
  intentService: IntentService,
  workspaceRoot: string,
) {
  // Set Governance Mode Command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.setGovernanceMode", async () => {
      const currentMode = vscode.workspace
        .getConfiguration("failsafe")
        .get<string>("governance.mode", "observe");

      const modes = [
        {
          label: "$(eye) Observe",
          description:
            "No blocking, just visibility and logging. Zero friction.",
          value: "observe",
        },
        {
          label: "$(lightbulb) Assist",
          description:
            "Smart defaults, auto-intent creation, gentle prompts. Recommended for most users.",
          value: "assist",
        },
        {
          label: "$(lock) Enforce",
          description:
            "Full control, intent-gated saves, L3 approvals. For compliance workflows.",
          value: "enforce",
        },
      ];

      const choice = await vscode.window.showQuickPick(modes, {
        placeHolder: `Current mode: ${currentMode}. Select a new governance mode:`,
      });

      if (choice) {
        await vscode.workspace
          .getConfiguration("failsafe")
          .update(
            "governance.mode",
            choice.value,
            vscode.ConfigurationTarget.Workspace,
          );
        vscode.window.showInformationMessage(
          `FailSafe governance mode set to: ${choice.value}`,
        );
      }
    }),
  );

  // Create Intent Command
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.createIntent", async () => {
      // 1. Select Type
      const type = await vscode.window.showQuickPick(
        ["feature", "bugfix", "refactor", "security", "docs"] as IntentType[],
        { placeHolder: "Select Intent Type" },
      );
      if (!type) return;

      // 2. Input Purpose
      const purpose = await vscode.window.showInputBox({
        prompt: "Enter Intent Purpose (Why are you doing this?)",
        placeHolder: "Short, descriptive sentence",
      });
      if (!purpose) return;

      // 3. Define Scope (Simulated Wizard)
      const scopeInput = await vscode.window.showInputBox({
        prompt: "Enter Scope (File paths, comma separated)",
        placeHolder: "src/main.ts, src/utils.ts",
      });
      const files = scopeInput
        ? scopeInput.split(",").map((s) => s.trim())
        : [];

      try {
        await intentService.createIntent({
          type: type as IntentType,
          purpose,
          scope: { files, modules: [], riskGrade: "L1" }, // Default L1 for now
          metadata: { author: "user", tags: [] },
        });
        vscode.window.showInformationMessage("Intent Created Successfully");
        vscode.commands.executeCommand("failsafe.showMenu"); // Update UI
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to create Intent: ${message}`);
      }
    }),
  );

  // Show Menu / Status
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.showMenu", async () => {
      const active = await intentService.getActiveIntent();
      if (!active) {
        const choice = await vscode.window.showInformationMessage(
          "FailSafe: No Active Intent. Writes are BLOCKED.",
          "Create Intent",
        );
        if (choice === "Create Intent") {
          vscode.commands.executeCommand("failsafe.createIntent");
        }
        return;
      }

      const choice = await vscode.window.showInformationMessage(
        `Active Intent: ${active.purpose} [${active.status}]`,
        "Seal Intent",
      );

      if (choice === "Seal Intent") {
        if (active.status !== "PASS") {
          vscode.window.showErrorMessage(
            "Only Intents with PASS status can be SEALED.",
          );
          return;
        }
        try {
          await intentService.sealIntent("user");
          vscode.window.showInformationMessage(
            `Intent "${active.purpose}" SEALED and Archived.`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to seal intent: ${message}`);
        }
      }
    }),
  );

  // Sync Framework Command
  const frameworkSync = new FrameworkSync(workspaceRoot);
  context.subscriptions.push(
    vscode.commands.registerCommand("failsafe.syncFramework", async () => {
      const systems = await frameworkSync.detectSystems();
      const items = systems.map((system: DetectedSystem) => ({
        label: system.name,
        description: system.description,
        detail: system.hasGovernance
          ? "Governed"
          : system.isInstalled
            ? "Ungoverned"
            : "Not Detected",
        system,
      }));

      const choice = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a system to propagate QoreLogic Governance",
      });

      if (choice) {
        if (choice.system.isInstalled) {
          await frameworkSync.propagate(choice.system.id);
          vscode.window.showInformationMessage(
            `QoreLogic propagated to ${choice.label}`,
          );
        } else {
          vscode.window.showWarningMessage(
            `${choice.label} is not detected in this workspace.`,
          );
        }
      }
    }),
  );
}
