// Enforcement Engine - Evaluates actions against Prime Axioms
//
// Mode evaluators extracted to ./enforcement/:
// - ObserveModeEvaluator, AssistModeEvaluator, EnforceModeEvaluator
// - IntentAutoCreator (used by AssistModeEvaluator)
import type { ProposedAction, Verdict, Intent } from "./types/IntentTypes";
import { Logger } from "../shared/Logger";
import type { IConfigProvider } from "../core/interfaces/IConfigProvider";
import type { INotificationService } from "../core/interfaces/INotificationService";
import type { IFeatureGate } from "../core/interfaces/IFeatureGate";
import {
  Axiom1Enforcer,
  Axiom2Enforcer,
  Axiom3Enforcer,
  evaluateObserveMode,
  evaluateAssistMode,
  evaluateEnforceMode,
} from "./enforcement";
import type { ActionContext } from "./enforcement";

export interface IntentProvider {
  getActiveIntent(): Promise<Intent | null>;
  createIntent(params: {
    type: "feature" | "refactor" | "bugfix" | "security" | "docs";
    purpose: string;
    scope: {
      files: string[];
      modules: string[];
      riskGrade: "L1" | "L2" | "L3";
    };
    metadata: { author: string; tags: string[] };
  }): Promise<Intent>;
}

export type GovernanceMode = "observe" | "assist" | "enforce";
export interface GovernanceModeState {
  mode: GovernanceMode;
  defaulted: boolean;
}
export type CommandExecutor = (command: string, ...args: unknown[]) => void;

const VALID_MODES: ReadonlySet<GovernanceMode> = new Set([
  "observe",
  "assist",
  "enforce",
]);

export class EnforcementEngine {
  private intentProvider: IntentProvider;
  private workspaceRoot: string;
  private logger: Logger;
  private configProvider: IConfigProvider;
  private notifications: INotificationService;
  private featureGate: IFeatureGate | undefined;
  private executeCommand: CommandExecutor;
  private axiom1: Axiom1Enforcer;
  private axiom2: Axiom2Enforcer;
  private axiom3: Axiom3Enforcer;

  constructor(
    intentProvider: IntentProvider,
    workspaceRoot: string,
    configProvider: IConfigProvider,
    notifications: INotificationService,
    featureGate?: IFeatureGate,
    executeCommand?: CommandExecutor,
  ) {
    this.intentProvider = intentProvider;
    this.workspaceRoot = workspaceRoot;
    this.configProvider = configProvider;
    this.notifications = notifications;
    this.logger = new Logger("EnforcementEngine");
    this.featureGate = featureGate;
    this.executeCommand = executeCommand ?? (() => {});
    this.axiom1 = new Axiom1Enforcer();
    this.axiom2 = new Axiom2Enforcer(workspaceRoot);
    this.axiom3 = new Axiom3Enforcer();
  }

  setFeatureGate(gate: IFeatureGate): void {
    this.featureGate = gate;
  }

  getGovernanceMode(): GovernanceMode {
    return this.getGovernanceModeState().mode;
  }

  getGovernanceModeState(): GovernanceModeState {
    const config = this.configProvider.getConfig();
    const raw = (config as unknown as Record<string, unknown>)["governance"] as
      | Record<string, unknown>
      | undefined;
    const candidate = raw?.["mode"];
    if (typeof candidate === "string" && VALID_MODES.has(candidate as GovernanceMode)) {
      return { mode: candidate as GovernanceMode, defaulted: false };
    }
    return { mode: "observe", defaulted: true };
  }

  isPathInScope(targetPath: string, scopePaths: string[]): boolean {
    return this.axiom2.isPathInScope(targetPath, scopePaths);
  }

  async evaluateAction(action: ProposedAction): Promise<Verdict> {
    const activeIntent = await this.intentProvider.getActiveIntent();
    const context: ActionContext = {
      action,
      activeIntent,
      workspaceRoot: this.workspaceRoot,
    };
    const mode = this.getGovernanceMode();

    if (mode === "observe") {
      return evaluateObserveMode(context, {
        axiom1: this.axiom1,
        logger: this.logger,
        notifications: this.notifications,
        executeCommand: this.executeCommand,
      });
    }

    if (mode === "assist") {
      return evaluateAssistMode(context, {
        axiom1: this.axiom1,
        intentProvider: this.intentProvider,
        workspaceRoot: this.workspaceRoot,
        logger: this.logger,
        notifications: this.notifications,
      });
    }

    return evaluateEnforceMode(context, {
      axiom1: this.axiom1,
      axiom2: this.axiom2,
      axiom3: this.axiom3,
      logger: this.logger,
      featureGate: this.featureGate,
    });
  }
}
