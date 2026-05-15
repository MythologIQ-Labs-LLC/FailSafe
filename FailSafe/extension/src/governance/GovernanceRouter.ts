import * as crypto from "crypto";
import * as fs from "fs";
import { IntentService } from "./IntentService";
import { EnforcementEngine, CommandExecutor } from "./EnforcementEngine";
import { GovernanceStatusBar } from "./GovernanceStatusBar";
import { ProposedAction, BlockVerdict } from "./types/IntentTypes";
import { EvaluationRouter, CortexEvent } from "./EvaluationRouter";
import { INotificationService } from "../core/interfaces/INotificationService";
import { QorLogicManager } from "../qorelogic/QorLogicManager";
import { PlanManager } from "../qorelogic/planning/PlanManager";
import { Plan, PlanPhase } from "../qorelogic/planning/types";
import { Logger } from "../shared/Logger";
import { GovernanceAdapter } from "./GovernanceAdapter";

// ======================================================================================
// GovernanceRouter: The Central Nervous System for Governance
//
// Decoupled from vscode.* APIs: uses INotificationService for user-facing
// messages and CommandExecutor for triggering commands. The handleFileOperation
// method now accepts a plain string path instead of vscode.Uri.
// ======================================================================================
export class GovernanceRouter {
  private logger: Logger;
  private planManager?: PlanManager;
  private governanceAdapter?: GovernanceAdapter;
  private notifications: INotificationService;
  private executeCommand: CommandExecutor;
  private qorLogicManager?: QorLogicManager;

  constructor(
    private intentService: IntentService,
    private enforcement: EnforcementEngine,
    private statusBar: GovernanceStatusBar,
    private evaluationRouter: EvaluationRouter,
    notifications: INotificationService,
    executeCommand?: CommandExecutor,
    qorLogicManager?: QorLogicManager,
  ) {
    this.logger = new Logger("GovernanceRouter");
    this.notifications = notifications;
    this.executeCommand = executeCommand ?? (() => {});
    this.qorLogicManager = qorLogicManager;
  }

  setGovernanceAdapter(adapter: GovernanceAdapter): void {
    this.governanceAdapter = adapter;
  }

  setQorLogicManager(manager: QorLogicManager): void {
    this.qorLogicManager = manager;
  }

  setPlanManager(manager: PlanManager): void {
    this.planManager = manager;
  }

  /**
   * V5 REMEDIATION: Find which phase an artifact belongs to
   */
  private findPhaseForArtifact(
    plan: Plan,
    artifactPath: string,
  ): PlanPhase | undefined {
    return plan.phases.find((p) =>
      p.artifacts.some((a) => artifactPath.endsWith(a.path)),
    );
  }

  /**
   * Handle file operations (Save, Rename, Delete)
   * Returns FALSE if blocked, TRUE if allowed.
   *
   * Accepts a plain filesystem path string instead of vscode.Uri.
   * The bootstrap layer is responsible for extracting uri.fsPath
   * before calling this method.
   */
  async handleFileOperation(
    type: ProposedAction["type"],
    fsPath: string,
  ): Promise<boolean> {
    // 1. Construct ProposedAction
    const activeIntent = await this.intentService.getActiveIntent();
    const action: ProposedAction = {
      type,
      targetPath: fsPath,
      intentId: activeIntent?.id ?? null,
      proposedAt: new Date().toISOString(),
      proposedBy: "vscode-user",
    };

    // Compute routing decision (authoritative, non-blocking for now)
    const event: CortexEvent = {
      id: `${action.proposedAt}:${action.targetPath}`,
      timestamp: action.proposedAt,
      category: "user",
      payload: {
        actionType: action.type,
        targetPath: action.targetPath,
        intentId: action.intentId,
      },
    };
    const decision = await this.evaluationRouter.route(event);

    if (
      (decision.invokeQorLogic || decision.writeLedger) &&
      this.qorLogicManager
    ) {
      await this.qorLogicManager.processEvaluationDecision(decision, event);
    }

    if (!decision.enforceSentinel) {
      return true;
    }

    // 2. GovernanceAdapter Preflight (if available)
    if (this.governanceAdapter) {
      // Gap 3: Compute artifact hash for ledger traceability
      let artifactHash: string | undefined;
      try {
        if (fs.existsSync(fsPath)) {
          const content = fs.readFileSync(fsPath);
          artifactHash = crypto.createHash("sha256").update(content).digest("hex");
        }
      } catch {
        // Non-fatal: proceed without hash
      }

      const governanceResult = await this.governanceAdapter.evaluate({
        action: "file.write",
        agentDid: "vscode-user",
        intentId: activeIntent?.id,
        artifactPath: fsPath,
        artifactHash,
        payload: { actionType: action.type },
      });

      if (!governanceResult.allowed) {
        await this.showBlockade(
          governanceResult.reason || "Governance policy denied this action",
          `Risk Grade: ${governanceResult.riskGrade}`,
          { message: governanceResult.reason },
          action.targetPath,
        );
        return false;
      }
    }

    // 3. Evaluate Verdict via EnforcementEngine
    const verdict = await this.enforcement.evaluateAction(action);

    // 4. Handle Result
    if (verdict.status === "ALLOW") {
      // Track file operation in active plan
      if (this.planManager) {
        const activePlan = this.planManager.getActivePlan();
        if (activePlan) {
          const phase = this.findPhaseForArtifact(activePlan, fsPath);
          if (phase) {
            const opMap: Record<
              string,
              "write" | "create" | "delete" | "rename"
            > = {
              SAVE: "write",
              CREATE: "create",
              DELETE: "delete",
              RENAME: "rename",
            };
            const planOp = opMap[type] || "write";
            this.planManager.recordArtifactTouch(
              activePlan.id,
              phase.id,
              fsPath,
              planOp,
            );
          }
        }
      }
      return true;
    }

    if (verdict.status === "BLOCK") {
      const violation =
        "violation" in verdict ? verdict.violation : "Unknown Violation";
      const remediation =
        "remediation" in verdict
          ? verdict.remediation
          : "No remediation provided.";
      const diagnostics = (verdict as BlockVerdict).diagnostics;
      await this.showBlockade(
        violation,
        remediation,
        diagnostics,
        action.targetPath,
      );
      return false; // CANCEL OPERATION
    }

    if (verdict.status === "ESCALATE") {
      this.logger.warn("Governance Escalation", {
        reason: verdict.reason,
        intentId: verdict.intentId,
        targetFile: action.targetPath,
      });
      this.notifications.showWarning(
        `Governance Escalation: ${verdict.reason}`,
      );
      return false;
    }

    return true;
  }

  private async showBlockade(
    violation: string,
    remediation: string,
    diagnostics?: {
      offendingFiles?: string[];
      scopeFiles?: string[];
      intentId?: string;
      message?: string;
    },
    targetPath?: string,
  ): Promise<void> {
    // Log detailed diagnostics for user visibility
    this.logger.error("BLOCKADE TRIGGERED", {
      violation,
      remediation,
      diagnostics,
      targetFile: targetPath,
    });

    // Auto-show the output channel for immediate visibility
    this.logger.show();

    // Build a detailed error message
    let errorMessage = `FailSafe Blocked: ${violation}`;

    if (diagnostics?.message) {
      errorMessage += `\n\nDetails: ${diagnostics.message}`;
    }

    if (diagnostics?.offendingFiles && diagnostics.offendingFiles.length > 0) {
      errorMessage += `\n\nOffending File(s):\n${diagnostics.offendingFiles.map((f) => `  - ${f}`).join("\n")}`;
    }

    if (diagnostics?.scopeFiles && diagnostics.scopeFiles.length > 0) {
      errorMessage += `\n\nAllowed File(s):\n${diagnostics.scopeFiles.map((f) => `  - ${f}`).join("\n")}`;
    } else if (diagnostics?.scopeFiles && diagnostics.scopeFiles.length === 0) {
      errorMessage += `\n\nNote: No files are currently allowed in this Intent scope.`;
    }

    errorMessage += `\n\nRemediation: ${remediation}`;

    const choice = await this.notifications.showError(
      errorMessage,
      "Create Intent",
      "View Active Intent",
      "Show Logs",
    );

    if (choice === "Create Intent") {
      this.executeCommand("failsafe.createIntent");
    } else if (choice === "View Active Intent") {
      this.executeCommand("failsafe.showMenu");
    } else if (choice === "Show Logs") {
      this.logger.show();
    }
  }
}
