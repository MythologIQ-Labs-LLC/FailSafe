/**
 * ConsoleServer - Express HTTP + WebSocket server for Cumulative Roadmap
 *
 * Serves the external browser-based roadmap visualization on port 9376.
 * Provides real-time updates via WebSocket for live activity streaming.
 */
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as net from "net";
import express, { Request, Response } from "express";
import { Server as HttpServer } from "http";
import { WebSocketManager } from "./services/WebSocketManager";
import { TransparencyLogger } from "./services/TransparencyLogger";
import { RiskRegisterManager } from "./services/RiskRegisterManager";
import { EventSubscriptionManager } from "./services/EventSubscriptionManager";
import { PlanManager } from "../qorelogic/planning/PlanManager";
import { QoreLogicManager } from "../qorelogic/QoreLogicManager";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";
import { EventBus } from "../shared/EventBus";
import { IFeatureGate, FeatureFlag } from "../core/interfaces/IFeatureGate";
import { GitResetService } from "../governance/revert/GitResetService";
import {
  FailSafeRevertService,
  RevertDeps,
} from "../governance/revert/FailSafeRevertService";
import { CheckpointRef, RevertRequest } from "../governance/revert/types";
import {
  HomeRoute, RunDetailRoute, WorkflowsRoute, SkillsRoute,
  GenomeRoute, ReportsRoute, SettingsRoute, PreflightRoute,
  GovernanceKPIRoute, AgentCoverageRoute, SreRoute,
} from "./routes";
import { ConfigurationProfile } from "../genesis/ConfigurationProfile";
import type { RouteDeps } from "./routes";
import type { PermissionScopeManager } from "../governance/PermissionScopeManager";
import type { EnforcementEngine } from "../governance/EnforcementEngine";
import { BrainstormService } from "./services/BrainstormService";
import { AudioVaultService } from "./services/AudioVaultService";
import type { IConfigProvider } from "../core/interfaces/IConfigProvider";
import { LLMClient } from "../sentinel/utils/LLMClient";
import { setupBrainstormRoutes } from "./routes/BrainstormRoute";
import { MetaLedgerReader, type LedgerSummary } from "./services/MetaLedgerReader";
import { type ParsedPlan } from "./services/PlanFileReader";
import { type PlanBlockerProjection } from "./services/BacklogReader";
import {
  WorkspaceArtifactBuilder,
  type WorkspaceArtifactSnapshot,
} from "./services/WorkspaceArtifactBuilder";
import { setupCheckpointRoutes } from "./routes/CheckpointRoute";
import { setupActionsRoutes } from "./routes/ActionsRoute";
import { setupTransparencyRiskRoutes } from "./routes/TransparencyRiskRoute";
import type { ApiRouteDeps } from "./routes/types";
import { registerQoreRoute } from "./routes/QoreRoute";
import { registerFeatureStatusRoute } from "./routes/FeatureStatusRoute";
import { registerSkillsApiRoute } from "./routes/SkillsApiRoute";
import { registerHookRoute } from "./routes/HookRoute";
import { QoreRuntimeService, type QoreRuntimeOptions } from "./services/QoreRuntimeService";
import { type InstalledSkill } from "./services/SkillParser";
import { discoverAllSkills } from "./services/SkillDiscovery";
import {
  type CheckpointRecord, type CheckpointDb, type CheckpointStatus,
  getRecentCheckpoints as ckptGetRecent,
  getRecentVerdicts as ckptGetRecentVerdicts,
  verifyCheckpointChain as ckptVerifyChain,
  getCheckpointSummary as ckptGetSummary,
  buildCheckpointRecord as ckptBuildRecord,
  persistCheckpoint as ckptPersist,
  inferPhaseKeyFromPlan,
  CHECKPOINT_INIT_SQL,
} from "./services/CheckpointStore";
import {
  registerServer,
  markDisconnected,
  readRegistry,
} from "./services/ServerRegistry";
import {
  type GovernanceState,
} from "./services/GovernancePhaseTracker";
import {
  type ComplianceReport,
} from "./services/RepoGovernanceService";
import {
  buildGovernancePhase,
  buildMetricIntegrity,
  buildUnattributedFileActivity,
  buildRepoCompliance,
  buildTrustSummary,
  buildNodeStatus,
  inferActivePhaseTitle,
  buildRiskSummary,
  buildRecentCompletions,
} from "./ConsoleServerHub";
import { MarketplaceCatalog } from "./services/MarketplaceCatalog";
import { MarketplaceInstaller } from "./services/MarketplaceInstaller";
import { SecurityScanner } from "./services/SecurityScanner";
import { setupMarketplaceRoutes } from "./routes/MarketplaceRoute";
import { AdapterService } from "./services/AdapterService";
import { setupAdapterRoutes } from "./routes/AdapterRoute";
import { setupAgentApiRoutes } from "./routes/AgentApiRoute";
import { setupSreApiRoutes } from "./routes/SreApiRoute";
import { fetchAgtSnapshot } from "./routes/templates/SreTemplate";
import type { AgentHealthIndicator } from "../sentinel/AgentHealthIndicator";
import type { AgentTimelineService } from "../sentinel/AgentTimelineService";
import type { AgentRunRecorder } from "../sentinel/AgentRunRecorder";

const PORT = 9376;
const HOST = "127.0.0.1";

// Read version from package.json once at module load
const EXTENSION_VERSION: string = (() => {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || 'unknown';
  } catch { return 'unknown'; }
})();

type ConsoleServerOptions = {
  qoreRuntime?: Partial<QoreRuntimeOptions>;
  workspaceRoot?: string;
  featureGate?: IFeatureGate;
  configProvider?: IConfigProvider;
};

type MetricIntegrityRow = {
  id: string;
  label: string;
  status: string;
  basis: string;
};

type UnattributedFileChange = {
  eventId: string;
  timestamp: string;
  type: string;
  artifactPath?: string;
  decision?: string;
};

/**
 * v5: a workspace counts as "skills installed" only if at least one qor-*
 * skill directory has the synthesized SOURCE.yml that the QorLogicSkillIngestor
 * writes after `qorlogic install`. File-existence alone is not enough — v4
 * scaffolds left bare SKILL.md files that should not satisfy v5 readiness.
 */
/**
 * Convert a META_LEDGER summary into the {id,name,status} phase shape the
 * Operations UI expects. One synthetic phase per plan iteration:
 *   - SUBSTANTIATION present for that iteration → status "complete"
 *   - GATE TRIBUNAL only (no seal yet) → status "in-progress"
 * The UI's `roadmap?.phases?.filter(p => p.status === 'complete').length`
 * then yields `sessionsCompleted`, and the planned count = plansStarted.
 */
export const MAX_PHASE_RENDER = 10;

export function buildPhasesFromLedger(
  summary: LedgerSummary,
): Array<{ id: string; name: string; status: string; source: "meta-ledger" }> {
  const phases: Array<{ id: string; name: string; status: string; source: "meta-ledger" }> = [];
  // Show in-flight first (more actionable), then sealed; total capped at MAX_PHASE_RENDER.
  const inFlightToShow = Math.min(summary.sessionsInFlight, MAX_PHASE_RENDER);
  const completedRemaining = MAX_PHASE_RENDER - inFlightToShow;
  const completedToShow = Math.min(summary.sessionsCompleted, Math.max(0, completedRemaining));
  for (let i = 0; i < inFlightToShow; i += 1) {
    phases.push({
      id: `ledger-in-flight-${i + 1}`,
      name: `Session in flight ${i + 1}`,
      status: "in-progress",
      source: "meta-ledger",
    });
  }
  for (let i = 0; i < completedToShow; i += 1) {
    phases.push({
      id: `ledger-completed-${i + 1}`,
      name: `Session ${i + 1} (sealed)`,
      status: "complete",
      source: "meta-ledger",
    });
  }
  const total = summary.sessionsInFlight + summary.sessionsCompleted;
  const truncated = total - phases.length;
  if (truncated > 0) {
    phases.push({
      id: "ledger-summary",
      name: `(${truncated} more — total ${summary.sessionsCompleted} sealed / ${summary.sessionsInFlight} in flight)`,
      status: "summary",
      source: "meta-ledger",
    });
  }
  return phases;
}

/**
 * If PlanManager has no active plan, fall back to the most-recent file-based
 * plan from `.failsafe/governance/plans/`. Either way, ensure `plan.blockers`
 * is populated from BACKLOG when the structured field is empty.
 */
function mergePlanBlockers(
  activePlan: unknown,
  artifacts: { activePlanFromFile: ParsedPlan | null; planBlockers: PlanBlockerProjection[] },
): unknown {
  if (activePlan && typeof activePlan === "object") {
    const existing = activePlan as Record<string, unknown>;
    const currentBlockers = Array.isArray(existing.blockers) ? existing.blockers : [];
    if (currentBlockers.length > 0) return activePlan;
    return { ...existing, blockers: artifacts.planBlockers };
  }
  if (!artifacts.activePlanFromFile) return null;
  const plan = artifacts.activePlanFromFile;
  return {
    id: plan.planId,
    intentId: "",
    title: plan.title,
    phases: plan.phases,
    blockers: artifacts.planBlockers,
    risks: [],
    milestones: [],
    currentPhaseId: plan.phases[0]?.id ?? "",
    source: "plan-file",
    filePath: plan.filePath,
    openQuestions: plan.openQuestions,
  };
}

// QorLogic install detection uses the canonical install record file
// `<base>/.qorlogic-installed.json` written by qor-logic itself. See
// `src/qorlogic/qorLogicInstallRecord.ts`. Do not infer from directory
// listings or per-skill provenance — qor-logic only ships SOURCE.yml for
// some skills, and synthesizing it everywhere pollutes user content.

export class ConsoleServer {
  private app: express.Application;
  private server: HttpServer | null = null;
  private wsManager = new WebSocketManager();
  private planManager: PlanManager;
  private qorelogicManager: QoreLogicManager;
  private sentinelDaemon: SentinelDaemon;
  private eventBus: EventBus;
  private uiDir: string;
  private checkpointDb: CheckpointDb = null;
  private checkpointMemory: CheckpointRecord[] = [];
  private qoreRuntime: QoreRuntimeOptions;
  private qoreRuntimeService: QoreRuntimeService;
  private workspaceRoot: string;
  private featureGate: IFeatureGate | undefined;
  private sealedSubstantiateCompletions = new Set<string>();
  private revertService: FailSafeRevertService | null = null;
  private gitResetService: GitResetService;
  private chainValidAt: string | null = null;
  private cachedChainValid: boolean = true;
  private brainstormService: BrainstormService;
  private audioVaultService: AudioVaultService;
  private configProvider: IConfigProvider | undefined;
  private enforcementEngine: EnforcementEngine | null = null;
  private permissionManager: PermissionScopeManager | null = null;
  private systemRegistry:
    | import("../qorelogic/SystemRegistry").SystemRegistry
    | null = null;
  private ideTracker:
    | import("./services/IdeActivityTracker").IdeActivityTracker
    | null = null;
  private scaffoldCallback: (() => Promise<import("../extension/installSkillsReport").QorLogicInstallReport | null>) | null = null;
  private outputChannel: { show(preserveFocus?: boolean): void } | null = null;
  private marketplaceCatalog: MarketplaceCatalog;
  private marketplaceInstaller: MarketplaceInstaller;
  private securityScanner: SecurityScanner;
  private adapterService: AdapterService;
  private agentTimelineService: AgentTimelineService | null = null;
  private agentHealthIndicator: AgentHealthIndicator | null = null;
  private agentRunRecorder: AgentRunRecorder | null = null;
  private transparencyLogger: TransparencyLogger;
  private riskRegisterManager: RiskRegisterManager;
  private ledgerWatcher: fs.FSWatcher | null = null;
  private ledgerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private unattributedFileChanges: UnattributedFileChange[] = [];
  private checkpointTypeRegistry = new Set<string>([
    "snapshot.created",
    "phase.entered",
    "phase.exited",
    "skill.recommended",
    "skill.invoked",
    "policy.checked",
    "override.requested",
    "override.approved",
    "attempt.committed",
    "attempt.rolled_back",
    "export.generated",
    "monitoring.resumed",
    "monitoring.stopped",
    "event.stream",
    "governance.revert",
  ]);

  constructor(
    planManager: PlanManager,
    qorelogicManager: QoreLogicManager,
    sentinelDaemon: SentinelDaemon,
    eventBus: EventBus,
    options: ConsoleServerOptions = {},
  ) {
    this.planManager = planManager;
    this.qorelogicManager = qorelogicManager;
    this.sentinelDaemon = sentinelDaemon;
    this.eventBus = eventBus;
    this.app = express();
    this.qoreRuntime = this.resolveQoreRuntimeOptions(options.qoreRuntime);
    this.qoreRuntimeService = new QoreRuntimeService(this.qoreRuntime);
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.featureGate = options.featureGate;
    this.configProvider = options.configProvider;
    this.uiDir = this.resolveUiDir();
    this.initializeCheckpointStore();
    this.gitResetService = new GitResetService();
    this.initializeRevertService();
    this.audioVaultService = new AudioVaultService(this.workspaceRoot);
    this.audioVaultService
      .init()
      .catch((err) => console.error("AudioVaultService init error:", err));
    this.brainstormService = this.createBrainstormService();
    this.marketplaceCatalog = new MarketplaceCatalog();
    this.marketplaceInstaller = new MarketplaceInstaller(this.eventBus);
    this.securityScanner = new SecurityScanner(this.eventBus);
    this.adapterService = new AdapterService(this.eventBus);
    this.transparencyLogger = new TransparencyLogger(this.workspaceRoot);
    this.riskRegisterManager = new RiskRegisterManager(this.workspaceRoot);
    this.setupRoutes();
    this.subscribeToEvents();
  }

  // ------------------------------------------------------------------
  //  Route setup
  // ------------------------------------------------------------------

  private setupRoutes(): void {
    this.app.use(express.json({ limit: "12mb" }));
    this.app.use(express.static(this.uiDir, { index: false, dotfiles: "allow" }));
    this.registerCoreRoutes();
    registerQoreRoute(this.app, this.buildApiRouteDeps());
    registerSkillsApiRoute(this.app, this.buildApiRouteDeps());
    this.registerApiRoutes();
    registerFeatureStatusRoute(this.app, this.buildApiRouteDeps());
    this.registerVerdictAndTrustRoutes();
    registerHookRoute(this.app, this.buildApiRouteDeps());
    this.setupConsoleRoutes();
    this.registerSpaFallback();
  }

  /** Root, health, roadmap, hub, qore, sprint, plans, skills routes */
  private registerCoreRoutes(): void {
    this.app.get("/", (req: Request, res: Response) => {
      const file = this.getUiEntryFile(req);
      const target = path.join(this.uiDir, file);
      const sendOpts = { dotfiles: "allow" as const };
      if (fs.existsSync(target)) { res.sendFile(target, sendOpts); return; }
      res.sendFile(path.join(this.uiDir, "command-center.html"), sendOpts);
    });

    this.app.get("/health", (_req: Request, res: Response) => {
      const ready = fs.existsSync(path.join(this.uiDir, "index.html"));
      res.status(ready ? 200 : 503).json({ ready, uiDir: this.uiDir });
    });

    this.app.get("/api/roadmap", (_req: Request, res: Response) => {
      const sprints = this.planManager.getAllSprints();
      const currentSprint = this.planManager.getCurrentSprint();
      const activePlan = this.planManager.getActivePlan();
      // Backfill from META_LEDGER.md when PlanManager has no event-sourced state.
      // This is the workspace-truth path: 261+ historical entries become real
      // phase counts in the UI rather than 0/0 theater.
      const ledgerSummary = new MetaLedgerReader(this.workspaceRoot).summarize();
      const phasesFromLedger = ledgerSummary.totalEntries > 0
        ? buildPhasesFromLedger(ledgerSummary)
        : [];
      const phases = (activePlan?.phases?.length ?? 0) > 0
        ? activePlan!.phases
        : phasesFromLedger;
      res.json({
        sprints, currentSprint, activePlan,
        phases,
        ledgerSummary,
      });
    });

    this.app.get("/api/hub", async (_req: Request, res: Response) => {
      res.json(await this.buildHubSnapshot());
    });

    // Workspace isolation: return server registry for workspace selector
    this.app.get("/api/v1/workspaces", (_req: Request, res: Response) => {
      const workspaces = readRegistry();
      res.json({
        workspaces,
        current: this.getWorkspaceRoot(),
      });
    });

  }

  private buildApiRouteDeps(): ApiRouteDeps {
    return {
      rejectIfRemote: (req, res) => this.rejectIfRemote(req, res),
      broadcast: (data) => this.broadcast(data),
      qoreRuntimeService: this.qoreRuntimeService,
      buildHubSnapshot: () => this.buildHubSnapshot(),
      featureGate: this.featureGate,
      workspaceRoot: this.workspaceRoot,
      workspaceDirname: __dirname,
      brainstormService: this.brainstormService,
      audioVaultService: this.audioVaultService,
      getRecentCheckpoints: (limit) => this.getRecentCheckpoints(limit),
      getCheckpointById: (id) => this.getCheckpointById(id),
      verifyCheckpointChain: () => this.verifyCheckpointChain(),
      revertService: this.revertService,
      sentinelDaemon: this.sentinelDaemon,
      planManager: this.planManager,
      qorelogicManager: this.qorelogicManager,
      recordCheckpoint: (input) => this.recordCheckpoint(input),
      inferPhaseKeyFromPlan: (plan) => this.inferPhaseKeyFromPlan(plan),
      chainValidAt: this.chainValidAt,
      cachedChainValid: this.cachedChainValid,
      setCachedChainValid: (v, at) => {
        this.cachedChainValid = v;
        this.chainValidAt = at;
      },
      getTransparencyEvents: (limit) => this.getTransparencyEvents(limit),
      getRiskRegister: () => this.getRiskRegister(),
      writeRiskRegister: (risks) => this.writeRiskRegister(risks),
      scaffoldSkills: this.scaffoldCallback ?? undefined,
      showOutput: this.outputChannel ? () => this.outputChannel?.show(true) : undefined,
      // Agent API delegates (B142/B143/B144)
      getTimelineEntries: (filter) => this.agentTimelineService?.getEntries(filter) || [],
      getHealthMetrics: () => this.agentHealthIndicator?.buildMetrics() || null,
      getGenomePatterns: () => this.qorelogicManager.getShadowGenomeManager().analyzeFailurePatterns(),
      getGenomeAllPatterns: () => this.qorelogicManager.getShadowGenomeManager().analyzeAllPatterns(), // B183
      getGenomeUnresolved: (limit) => this.qorelogicManager.getShadowGenomeManager().getUnresolvedEntries(limit),
      getActiveRuns: () => this.agentRunRecorder?.getActiveRuns() || [],
      getCompletedRuns: () => this.agentRunRecorder?.getCompletedRuns() || [],
      getRun: (runId) => this.agentRunRecorder?.getRun(runId),
      loadRun: (runId) => this.agentRunRecorder?.loadRun(runId) || null,
      getRunSteps: (runId) => this.agentRunRecorder?.getRunSteps(runId) || [],
    };
  }

  /** Delegated API routes (transparency/agent/brainstorm/checkpoint/actions/marketplace/adapter) */
  private registerApiRoutes(): void {
    const apiDeps = this.buildApiRouteDeps();
    setupTransparencyRiskRoutes(this.app, apiDeps);
    setupAgentApiRoutes(this.app, apiDeps);
    const adapterUrl = this.adapterService?.getConfig()?.adapterBaseUrl;
    setupSreApiRoutes(this.app, { rejectIfRemote: (req, res) => this.rejectIfRemote(req, res) }, adapterUrl);
    setupBrainstormRoutes(this.app, apiDeps);
    setupCheckpointRoutes(this.app, apiDeps);
    setupActionsRoutes(this.app, apiDeps);
    setupMarketplaceRoutes(this.app, {
      rejectIfRemote: (req, res) => this.rejectIfRemote(req, res),
      broadcast: (data) => this.broadcast(data),
      marketplaceCatalog: this.marketplaceCatalog,
      marketplaceInstaller: this.marketplaceInstaller,
      securityScanner: this.securityScanner,
      ledgerManager: this.qorelogicManager.getLedgerManager(),
    });
    setupAdapterRoutes(this.app, {
      rejectIfRemote: (req, res) => this.rejectIfRemote(req, res),
      broadcast: (data) => this.broadcast(data),
      adapterService: this.adapterService,
    });
  }

  private registerVerdictAndTrustRoutes(): void {
    this.app.get("/api/v1/verdicts", (_req: Request, res: Response) => {
      const limit = Math.min(Number(_req.query.limit) || 20, 100);
      res.json(this.getRecentVerdicts(limit));
    });
    this.app.get("/api/v1/trust", async (_req: Request, res: Response) => {
      const hub = await this.buildHubSnapshot();
      const cps = Object.values((hub.checkpoints as Record<string, unknown>) || {});
      const total = cps.length || 1;
      const passed = cps.filter((c: any) => c.policyVerdict !== "VIOLATION").length;
      res.json({ overall: Math.round((passed / total) * 100), checkpointCount: total, passCount: passed });
    });
  }

  /** SPA fallback for deep links or unknown non-API routes */
  private registerSpaFallback(): void {
    this.app.use((req: Request, res: Response) => {
      if (req.path.startsWith("/api/") || req.path === "/health") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const staticExts = [
        ".js", ".mjs", ".css", ".wasm", ".onnx",
        ".png", ".jpg", ".svg", ".data", ".json", ".bin",
      ];
      if (staticExts.some((ext) => req.path.toLowerCase().endsWith(ext))) {
        res.status(404).type("text/plain").send("Not found");
        return;
      }
      const file = this.getUiEntryFile(req);
      const target = path.join(this.uiDir, file);
      const sendOpts = { dotfiles: "allow" as const };
      if (fs.existsSync(target)) { res.sendFile(target, sendOpts); return; }
      res.sendFile(path.join(this.uiDir, "command-center.html"), sendOpts);
    });
  }

  // ------------------------------------------------------------------
  //  UI helpers
  // ------------------------------------------------------------------

  private getUiEntryFile(req: Request): "command-center.html" | "index.html" {
    const uiMode = String(req.query.ui || "").toLowerCase();
    const compactParam = String(req.query.compact || "").toLowerCase();
    if (uiMode === "compact") return "index.html";
    if (uiMode === "console" || uiMode === "extended" || uiMode === "popout") {
      return "command-center.html";
    }
    if (compactParam === "1" || compactParam === "true" || compactParam === "yes") {
      return "index.html";
    }
    return "command-center.html";
  }

  // ------------------------------------------------------------------
  //  Auth middleware
  // ------------------------------------------------------------------

  private isLocalRequest(req: Request): boolean {
    const normalized = String(req.socket?.remoteAddress || req.ip || "").trim();
    return (
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "::ffff:127.0.0.1"
    );
  }

  private rejectIfRemote(req: Request, res: Response): boolean {
    if (this.isLocalRequest(req)) return false;
    res.status(403).json({ error: "Forbidden: local access only" });
    return true;
  }

  private rejectIfProRequired(
    feature: FeatureFlag,
    _req: Request,
    res: Response,
  ): boolean {
    if (!this.featureGate || this.featureGate.isEnabled(feature)) return false;
    res.status(402).json({
      error: `Feature '${feature}' is not enabled in current configuration`,
      upgrade: true,
      currentTier: this.featureGate.getTier(),
      requiredTier: "pro",
    });
    return true;
  }

  // ------------------------------------------------------------------
  //  WebSocket
  // ------------------------------------------------------------------

  private setupWebSocket(): void {
    if (!this.server) return;
    this.wsManager.setup(this.server, (ws) => {
      this.buildHubSnapshot().then((hub) => {
        ws.send(JSON.stringify({ type: "init", payload: hub }));
      });
    });
  }

  private broadcast(data: Record<string, unknown>): void {
    this.wsManager.broadcast(data);
  }

  /**
   * Public broadcast for callers wired during bootstrap (e.g. install
   * progress events from `createInstallSkillsHandler`). Use sparingly —
   * prefer wiring through the existing scaffoldCallback / setScaffoldCallback
   * flow when a one-off return value is sufficient.
   */
  broadcastEvent(data: Record<string, unknown>): void {
    this.broadcast(data);
  }

  private watchMetaLedger(): void {
    const ledgerPath = path.join(this.getWorkspaceRoot(), "docs", "META_LEDGER.md");
    if (!fs.existsSync(ledgerPath)) return;
    try {
      this.ledgerWatcher = fs.watch(ledgerPath, () => {
        if (this.ledgerDebounceTimer) clearTimeout(this.ledgerDebounceTimer);
        this.ledgerDebounceTimer = setTimeout(() => {
          this.broadcast({ type: "hub.refresh" });
        }, 1500);
      });
    } catch {
      // File watcher not supported or ledger inaccessible — degrade silently
    }
  }

  // ------------------------------------------------------------------
  //  Console UI routes (HTML server-rendered)
  // ------------------------------------------------------------------

  setConsoleDeps(
    enforcement: EnforcementEngine,
    perm: PermissionScopeManager,
  ): void {
    this.enforcementEngine = enforcement;
    this.permissionManager = perm;
  }

  setSystemRegistry(
    registry: import("../qorelogic/SystemRegistry").SystemRegistry,
  ): void {
    this.systemRegistry = registry;
  }

  setIdeTracker(
    tracker: import("./services/IdeActivityTracker").IdeActivityTracker,
  ): void {
    this.ideTracker = tracker;
  }

  setScaffoldCallback(cb: () => Promise<import("../extension/installSkillsReport").QorLogicInstallReport | null>): void {
    this.scaffoldCallback = cb;
  }

  /**
   * Wire the FailSafe (QorLogic) OutputChannel reference so the Settings card
   * "Show Output" button (POST /api/actions/show-output) can focus it.
   * Round 2 / Issue #49.
   */
  setOutputChannel(channel: { show(preserveFocus?: boolean): void }): void {
    this.outputChannel = channel;
  }

  setAgentTimelineService(service: AgentTimelineService): void {
    this.agentTimelineService = service;
  }

  setAgentHealthIndicator(indicator: AgentHealthIndicator): void {
    this.agentHealthIndicator = indicator;
  }

  setAgentRunRecorder(recorder: AgentRunRecorder): void {
    this.agentRunRecorder = recorder;
  }

  private buildRouteDeps(): RouteDeps {
    const configProfile = new ConfigurationProfile();
    configProfile.loadDefaults({ workspaceRoot: this.workspaceRoot });
    return {
      planManager: this.planManager,
      ledgerManager: this.qorelogicManager.getLedgerManager(),
      shadowGenomeManager: this.qorelogicManager.getShadowGenomeManager(),
      enforcementEngine: this.enforcementEngine!,
      configProfile,
      getInstalledSkills: () => this.getInstalledSkills(),
      systemRegistry: this.systemRegistry ?? undefined,
    };
  }

  private setupConsoleRoutes(): void {
    const deps = () => this.buildRouteDeps();
    this.app.get("/console/home", async (req, res) => HomeRoute.render(req, res, deps()));
    this.app.get("/console/run/:runId", (req, res) => RunDetailRoute.render(req, res, deps()));
    this.app.get("/console/workflows", (req, res) => WorkflowsRoute.render(req, res, deps()));
    this.app.get("/console/skills", (req, res) => SkillsRoute.render(req, res, deps()));
    this.app.get("/console/genome", async (req, res) => GenomeRoute.render(req, res, deps()));
    this.app.get("/console/reports", async (req, res) => ReportsRoute.render(req, res, deps()));
    this.app.get("/console/settings", (req, res) => SettingsRoute.render(req, res, deps()));
    this.app.get("/console/kpi", async (req, res) =>
      GovernanceKPIRoute.render(req, res, { ledgerManager: deps().ledgerManager }),
    );
    this.registerConsoleExtras();
  }

  private registerConsoleExtras(): void {
    this.app.get("/console/agents", async (req, res) => {
      if (!this.systemRegistry) { res.status(503).send("SystemRegistry not available"); return; }
      AgentCoverageRoute.render(req, res, { systemRegistry: this.systemRegistry });
    });
    this.app.get("/console/sre", async (req: Request, res: Response) => {
      await SreRoute.render(req, res, {
        getSnapshot: () => fetchAgtSnapshot(this.adapterService?.getConfig()?.adapterBaseUrl || "http://127.0.0.1:9377"),
      });
    });
    if (!this.permissionManager) return;
    const pm = this.permissionManager;
    this.app.get("/console/preflight", (req, res) => PreflightRoute.render(req, res, { permissionManager: pm }));
    this.app.post("/console/preflight/grant", (req, res) => PreflightRoute.handleGrant(req, res, { permissionManager: pm }));
    this.app.post("/console/preflight/deny", (req, res) => PreflightRoute.handleDeny(req, res, { permissionManager: pm }));
  }

  // ------------------------------------------------------------------
  //  Event subscriptions
  // ------------------------------------------------------------------

  private subscribeToEvents(): void {
    const manager = new EventSubscriptionManager({
      eventBus: this.eventBus,
      recordCheckpoint: (r) => this.recordCheckpoint(r),
      broadcast: (d) => this.broadcast(d),
      logTransparencyEvent: (e) => this.logTransparencyEvent(e),
      inferPhaseKey: () => this.inferPhaseKeyFromPlan(this.planManager.getActivePlan()),
      recordObservedFileMutation: (p) => this.recordObservedFileMutation(p),
      getPlan: (id) => this.planManager.getPlan(id),
      sealedSubstantiateCompletions: this.sealedSubstantiateCompletions,
    });
    manager.subscribe();
  }

  // ------------------------------------------------------------------
  //  Qore Runtime helpers extracted to QoreRuntimeService (B166 Phase 2)
  // ------------------------------------------------------------------

  private recordObservedFileMutation(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const activity = payload as {
      eventId?: string;
      timestamp?: string;
      source?: string;
      type?: string;
      artifactPath?: string;
      decision?: string;
      agentDid?: string;
    };
    const fileEventTypes = new Set(["FILE_CREATED", "FILE_MODIFIED", "FILE_DELETED"]);
    if (activity.source !== "file_watcher") return;
    if (!fileEventTypes.has(String(activity.type || ""))) return;

    this.unattributedFileChanges.push({
      eventId: String(activity.eventId || crypto.randomUUID()),
      timestamp: String(activity.timestamp || new Date().toISOString()),
      type: String(activity.type || "FILE_MODIFIED"),
      artifactPath: activity.artifactPath,
      decision: activity.decision,
    });
    this.unattributedFileChanges = this.unattributedFileChanges.slice(-10);
    this.broadcast({ type: "hub.refresh" });
  }

  // ------------------------------------------------------------------
  //  Hub snapshot
  // ------------------------------------------------------------------

  private async buildHubSnapshot(): Promise<Record<string, unknown>> {
    const activePlan = this.planManager.getActivePlan();
    const sentinelStatusRaw = this.sentinelDaemon.getStatus();
    const sentinelStatus = { ...sentinelStatusRaw };
    if (this.checkpointDb && sentinelStatus.eventsProcessed === 0) {
      try {
        const row = this.checkpointDb.prepare(
          `SELECT COUNT(*) as cnt FROM failsafe_checkpoints
           WHERE checkpoint_type LIKE 'policy.%'`,
        ).get() as { cnt: number } | undefined;
        if (row?.cnt) (sentinelStatus as Record<string, unknown>).eventsProcessed = row.cnt;
      } catch { /* non-fatal */ }
    }
    const l3Queue = this.qorelogicManager.getL3Queue();
    const agents = await this.qorelogicManager.getTrustEngine().getAllAgents();
    const trust = buildTrustSummary(agents);
    const qoreRuntime = await this.qoreRuntimeService.fetchSnapshot();
    const checkpointSummary = this.getCheckpointSummary();
    const governancePhase = buildGovernancePhase(this.getWorkspaceRoot());
    const hubDeps = { chainValidAt: this.chainValidAt, unattributedFileChanges: this.unattributedFileChanges };
    const activePhaseTitle = inferActivePhaseTitle(
      activePlan as unknown as Record<string, unknown>,
      (limit) => this.getRecentCheckpoints(limit),
    );
    const runState = this.ideTracker
      ? this.ideTracker.getRunState(activePhaseTitle)
      : { currentPhase: "Plan", activeTasks: [], activeDebugSessions: [] };
    const nodeStatusArr = buildNodeStatus(
      sentinelStatus as unknown as { running?: boolean; filesWatched?: number; queueDepth?: number; [k: string]: unknown },
      l3Queue, trust, qoreRuntime,
    );
    const artifacts = this.assembleWorkspaceArtifactSnapshot();
    const verdicts = this.coalesceVerdicts(artifacts);
    const completions = this.coalesceCompletions(artifacts);
    const activePlanWithBlockers = mergePlanBlockers(activePlan, artifacts);
    return {
      version: EXTENSION_VERSION,
      sprints: this.planManager.getAllSprints(),
      currentSprint: this.planManager.getCurrentSprint(),
      activePlan: activePlanWithBlockers,
      sentinelStatus,
      recentVerdicts: verdicts,
      l3Queue,
      trustSummary: trust,
      nodeStatus: nodeStatusArr,
      checkpointSummary,
      recentCheckpoints: this.getRecentCheckpoints(12),
      qoreRuntime,
      runState,
      riskSummary: buildRiskSummary((limit) => this.getRecentVerdicts(limit)),
      recentCompletions: completions,
      transparencyEvents: this.transparencyLogger.getEvents(20).reverse(),
      unattributedFileActivity: buildUnattributedFileActivity(this.unattributedFileChanges),
      metricIntegrity: buildMetricIntegrity(governancePhase, checkpointSummary, sentinelStatus, runState, hubDeps),
      bootstrapState: {
        skillsInstalled: artifacts.qorLogicInstall.anyInstalled,
        governanceInitialized: fs.existsSync(
          path.join(this.getWorkspaceRoot(), "docs", "CONCEPT.md"),
        ),
        workspaceName: path.basename(this.getWorkspaceRoot()),
        systemState: artifacts.systemState,
        qorLogicInstall: artifacts.qorLogicInstall,
      },
      ledgerSummary: artifacts.ledgerSummary,
      latestAudit: artifacts.latestAudit,
      recentReleases: artifacts.recentReleases,
      workspaceName: path.basename(this.getWorkspaceRoot()),
      workspacePath: this.getWorkspaceRoot(),
      serverPort: this.actualPort,
      governancePhase,
      repoCompliance: buildRepoCompliance(this.getWorkspaceRoot()),
      chainValid: this.cachedChainValid ?? null,
      risks: this.getRiskRegister(),
      agentHealth: this.agentHealthIndicator?.buildMetrics() || null,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Delegates to `WorkspaceArtifactBuilder` (extracted per audit Entry #278
   * Amendment 1). Returns workspace-truth artifacts plus derived SHIELD-phase
   * progression for the Monitor.
   */
  private assembleWorkspaceArtifactSnapshot(): WorkspaceArtifactSnapshot {
    return new WorkspaceArtifactBuilder(this.getWorkspaceRoot()).build();
  }

  /**
   * Verdict source priority: live (sqlite-backed) records first, then
   * META_LEDGER backfill when nothing has been recorded this session.
   */
  private coalesceVerdicts(
    artifacts: ReturnType<ConsoleServer["assembleWorkspaceArtifactSnapshot"]>,
  ): Array<Record<string, unknown>> {
    const live = this.getRecentVerdicts(10);
    if (live.length > 0) return live;
    return artifacts.ledgerVerdicts.map((v) => ({
      id: v.id,
      number: v.number,
      kind: v.kind,
      title: v.title,
      source: "meta-ledger",
    }));
  }

  private coalesceCompletions(
    artifacts: ReturnType<ConsoleServer["assembleWorkspaceArtifactSnapshot"]>,
  ): unknown {
    const live = buildRecentCompletions((limit) => this.getRecentCheckpoints(limit));
    if (Array.isArray(live) && live.length > 0) return live;
    return artifacts.ledgerCompletions.map((c) => ({
      id: c.id,
      number: c.number,
      kind: c.kind,
      title: c.title,
      source: "meta-ledger",
    }));
  }

  // ------------------------------------------------------------------
  //  Server lifecycle
  // ------------------------------------------------------------------

  private actualPort: number = PORT;

  async start(): Promise<void> {
    this.actualPort = await this.findAvailablePort(PORT);
    this.server = this.app.listen(this.actualPort, HOST, () => {
      console.log(`Roadmap server: http://localhost:${this.actualPort}`);
    });
    this.setupWebSocket();
    this.watchMetaLedger();
    // Register in multi-workspace server registry
    registerServer({
      port: this.actualPort,
      workspaceName: path.basename(this.getWorkspaceRoot()),
      workspacePath: this.getWorkspaceRoot(),
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    this.recordCheckpoint({
      checkpointType: "snapshot.created",
      actor: "system",
      phase: this.inferPhaseKeyFromPlan(this.planManager.getActivePlan()),
      status: "validated",
      policyVerdict: "PASS",
      evidenceRefs: [],
      payload: { source: "roadmap-server.start" },
    });
  }

  stop(): void {
    // Mark as disconnected (not unregister) so workspace remains visible
    markDisconnected(this.actualPort);
    this.ledgerWatcher?.close();
    this.ledgerWatcher = null;
    this.wsManager.close();
    this.server?.close();
  }

  getPort(): number {
    return this.actualPort;
  }

  private async findAvailablePort(preferred: number): Promise<number> {
    if (await this.isPortAvailable(preferred)) return preferred;
    for (let offset = 1; offset <= 10; offset++) {
      const candidate = preferred + offset;
      if (await this.isPortAvailable(candidate)) {
        console.log(`Port ${preferred} in use, using ${candidate}`);
        return candidate;
      }
    }
    return preferred;
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, HOST);
    });
  }

  // ------------------------------------------------------------------
  //  Skills — `/api/skills*` and ingest helpers extracted to
  //  routes/SkillsApiRoute.ts (B166 Phase 2). Console-side RouteDeps
  //  still needs a discovery thunk; delegate directly to SkillDiscovery.
  // ------------------------------------------------------------------

  private getInstalledSkills(): InstalledSkill[] {
    return discoverAllSkills(this.getWorkspaceRoot(), __dirname);
  }

  // ------------------------------------------------------------------
  //  Checkpoint management (delegated to CheckpointStore)
  // ------------------------------------------------------------------

  private initializeCheckpointStore(): void {
    try {
      const ledgerDb = this.qorelogicManager
        .getLedgerManager()
        .getDatabase() as unknown as {
        exec: (sql: string) => void;
      } & CheckpointDb;
      ledgerDb.exec(CHECKPOINT_INIT_SQL);
      this.checkpointDb = ledgerDb;
      this.cachedChainValid = this.verifyCheckpointChain();
      this.chainValidAt = new Date().toISOString();
    } catch (error) {
      this.checkpointDb = null;
      this.cachedChainValid = false;
      this.chainValidAt = null;
    }
  }

  private initializeRevertService(): void {
    const deps: RevertDeps = {
      getCheckpoint: (id: string) => this.getCheckpointById(id),
      gitService: this.gitResetService,
      purgeRagAfter: () => 0,
      recordRevertCheckpoint: (request: RevertRequest) => {
        this.recordCheckpoint({
          checkpointType: "governance.revert",
          actor: request.actor, phase: "revert", status: "sealed",
          policyVerdict: "PASS", evidenceRefs: [],
          payload: {
            targetCheckpointId: request.targetCheckpoint.checkpointId,
            targetGitHash: request.targetCheckpoint.gitHash,
            reason: request.reason,
          },
        });
        return crypto.randomUUID();
      },
      workspaceRoot: this.workspaceRoot,
    };
    this.revertService = new FailSafeRevertService(deps);
  }

  private getCheckpointById(id: string): CheckpointRef | null {
    if (this.checkpointDb) {
      try {
        const row = this.checkpointDb.prepare(
          "SELECT checkpoint_id, git_hash, timestamp, phase, status FROM failsafe_checkpoints WHERE checkpoint_id = ?",
        ).get(id) as
          | { checkpoint_id: string; git_hash: string; timestamp: string; phase: string; status: string }
          | undefined;
        if (row) {
          return {
            checkpointId: row.checkpoint_id, gitHash: row.git_hash,
            timestamp: row.timestamp, phase: row.phase, status: row.status,
          };
        }
      } catch { /* fall through */ }
    }
    const mem = this.checkpointMemory.find((r) => r.checkpointId === id);
    if (!mem) return null;
    return {
      checkpointId: mem.checkpointId, gitHash: mem.gitHash,
      timestamp: mem.timestamp, phase: mem.phase, status: mem.status,
    };
  }

  private inferPhaseKeyFromPlan(plan: unknown): string {
    return inferPhaseKeyFromPlan(plan);
  }

  private recordCheckpoint(input: {
    checkpointType: string; actor: string; phase: string;
    status: CheckpointStatus; policyVerdict: string;
    evidenceRefs: string[]; payload: unknown;
  }): void {
    if (!this.checkpointTypeRegistry.has(input.checkpointType)) return;
    if (input.evidenceRefs.length === 0) {
      const since = new Date(Date.now() - 60_000).toISOString();
      input.evidenceRefs = this.sentinelDaemon.getRecentObservationIds(since, 10);
    }
    const runId = this.planManager.getActivePlan()?.id ||
      this.planManager.getCurrentSprint()?.id || "global";
    const record = ckptBuildRecord(
      input, new Date().toISOString(), runId,
      this.checkpointDb, this.checkpointMemory,
    );
    ckptPersist(record, this.checkpointDb, this.checkpointMemory);
  }

  private getRecentCheckpoints(limit: number): CheckpointRecord[] {
    return ckptGetRecent(this.checkpointDb, this.checkpointMemory, limit);
  }

  private getRecentVerdicts(limit = 50): Array<Record<string, unknown>> {
    return ckptGetRecentVerdicts(this.checkpointDb, this.checkpointMemory, limit);
  }

  private verifyCheckpointChain(): boolean {
    return ckptVerifyChain(this.checkpointDb, this.checkpointMemory);
  }

  private getCheckpointSummary(): Record<string, unknown> {
    return ckptGetSummary(
      this.checkpointDb, this.checkpointMemory,
      this.cachedChainValid, this.chainValidAt,
    );
  }

  // ------------------------------------------------------------------
  //  Transparency & Risk helpers (used by buildHubSnapshot + routes)
  // ------------------------------------------------------------------

  private getTransparencyEvents(limit: number): Array<Record<string, unknown>> {
    return this.transparencyLogger.getEvents(limit);
  }

  private logTransparencyEvent(event: Record<string, unknown>): void {
    this.transparencyLogger.log(event);
  }

  private getRiskRegister(): Array<Record<string, unknown>> {
    return this.riskRegisterManager.getRisks();
  }

  private writeRiskRegister(risks: Array<Record<string, unknown>>): void {
    this.riskRegisterManager.writeRisks(risks);
  }

  // ------------------------------------------------------------------
  //  Initialization helpers
  // ------------------------------------------------------------------

  private getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  private resolveUiDir(): string {
    const candidates = [
      path.join(__dirname, "ui"),
      path.resolve(__dirname, "../../src/roadmap/ui"),
      path.resolve(__dirname, "../../../src/roadmap/ui"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
    }
    return path.join(__dirname, "ui");
  }

  private resolveQoreRuntimeOptions(
    options?: Partial<QoreRuntimeOptions>,
  ): QoreRuntimeOptions {
    const baseUrl = String(options?.baseUrl || "http://127.0.0.1:7777")
      .trim().replace(/\/+$/, "");
    return {
      enabled: Boolean(options?.enabled),
      baseUrl,
      apiKey: options?.apiKey ? String(options.apiKey) : undefined,
      timeoutMs: Math.max(500, Math.min(30000, Number(options?.timeoutMs || 4000))),
    };
  }

  private createBrainstormService(): BrainstormService {
    return new BrainstormService(async (prompt, payload) => {
      const fullPrompt = `${prompt}\n\nTranscript:\n${payload}`;
      const clean = (raw: string): string => {
        let c = raw.trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const first = c.indexOf("{");
        const last = c.lastIndexOf("}");
        if (first >= 0 && last > first) c = c.slice(first, last + 1);
        return c;
      };
      if (this.configProvider) {
        const llm = new LLMClient(this.configProvider);
        if (await llm.checkAvailability()) {
          try {
            const result = await llm.callEndpoint(fullPrompt, 60000);
            return clean(result.response);
          } catch (err) {
            console.warn("[Brainstorm] Ollama callEndpoint failed:", err);
          }
        }
      }
      try {
        const vscode = await import("vscode");
        const models = await vscode.lm.selectChatModels();
        if (models.length > 0) {
          const messages = [vscode.LanguageModelChatMessage.User(fullPrompt)];
          const chatResponse = await models[0].sendRequest(messages);
          let text = "";
          for await (const chunk of chatResponse.text) text += chunk;
          return clean(text);
        }
      } catch { /* VS Code LM API not available */ }
      throw new Error(
        "No LLM available — start Ollama or enable a VS Code language model",
      );
    });
  }
}
