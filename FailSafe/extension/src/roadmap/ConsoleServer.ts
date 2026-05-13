/** ConsoleServer — composition root for the Express HTTP + WebSocket server
 *  backing the browser-based Cumulative Roadmap on port 9376. Phase 60 §0
 *  split: services/{HubSnapshotService,ConsoleRouteRegistrar,
 *  ConsoleLifecycleService,ConsoleServerSupport}.ts hold all behavior. */
import * as path from "path";
import * as fs from "fs";
import express, { Request, Response } from "express";
import { WebSocketManager } from "./services/WebSocketManager";
import { TransparencyLogger } from "./services/TransparencyLogger";
import { RiskRegisterManager } from "./services/RiskRegisterManager";
import { EventSubscriptionManager } from "./services/EventSubscriptionManager";
import { PlanManager } from "../qorelogic/planning/PlanManager";
import { QoreLogicManager } from "../qorelogic/QoreLogicManager";
import { SentinelDaemon } from "../sentinel/SentinelDaemon";
import { EventBus } from "../shared/EventBus";
import { IFeatureGate } from "../core/interfaces/IFeatureGate";
import { GitResetService } from "../governance/revert/GitResetService";
import type { PermissionScopeManager } from "../governance/PermissionScopeManager";
import type { EnforcementEngine } from "../governance/EnforcementEngine";
import { BrainstormService } from "./services/BrainstormService";
import { AudioVaultService } from "./services/AudioVaultService";
import type { IConfigProvider } from "../core/interfaces/IConfigProvider";
import { QoreRuntimeService, type QoreRuntimeOptions } from "./services/QoreRuntimeService";
import { type InstalledSkill } from "./services/SkillParser";
import { discoverAllSkills } from "./services/SkillDiscovery";
import { MarketplaceCatalog } from "./services/MarketplaceCatalog";
import { MarketplaceInstaller } from "./services/MarketplaceInstaller";
import { SecurityScanner } from "./services/SecurityScanner";
import { AdapterService } from "./services/AdapterService";
import type { AgentHealthIndicator } from "../sentinel/AgentHealthIndicator";
import type { AgentTimelineService } from "../sentinel/AgentTimelineService";
import type { AgentRunRecorder } from "../sentinel/AgentRunRecorder";
import { HubSnapshotService, type RecordCheckpointInput, type CheckpointStoreRef } from "./services/HubSnapshotService";
import { ConsoleRouteRegistrar, type ConsoleRouteHost } from "./services/ConsoleRouteRegistrar";
import { ConsoleLifecycleService } from "./services/ConsoleLifecycleService";
import {
  buildPhasesFromLedger as buildPhasesFromLedgerImpl,
  mergePlanBlockers, createBrainstormService,
  resolveQoreRuntimeOptions, resolveUiDir,
  CHECKPOINT_TYPE_REGISTRY,
  MAX_PHASE_RENDER as MAX_PHASE_RENDER_IMPL,
} from "./services/ConsoleServerSupport";
import type { WorkspaceArtifactSnapshot } from "./services/WorkspaceArtifactBuilder";

const PORT = 9376;
const HOST = "127.0.0.1";

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

// Re-export public test surface from support module for backward compat.
export const MAX_PHASE_RENDER = MAX_PHASE_RENDER_IMPL;
export const buildPhasesFromLedger = buildPhasesFromLedgerImpl;

export class ConsoleServer {
  private app: express.Application = express();
  private wsManager = new WebSocketManager();
  private uiDir: string;
  private qoreRuntimeService: QoreRuntimeService;
  private workspaceRoot: string;
  private featureGate: IFeatureGate | undefined;
  private sealedSubstantiateCompletions = new Set<string>();
  private gitResetService = new GitResetService();
  private brainstormService: BrainstormService;
  private audioVaultService: AudioVaultService;
  private enforcementEngine: EnforcementEngine | null = null;
  private permissionManager: PermissionScopeManager | null = null;
  private systemRegistry: import("../qorelogic/SystemRegistry").SystemRegistry | null = null;
  private ideTracker: import("./services/IdeActivityTracker").IdeActivityTracker | null = null;
  private scaffoldCallback: (() => Promise<import("../extension/installSkillsReport").QorLogicInstallReport | null>) | null = null;
  private scaffoldWebCallback: ((hosts: import("../qorlogic/hostLayouts").QorLogicHost[], scope: import("../qorlogic/QorLogicSkillIngestor").QorLogicScope) => Promise<import("../extension/installSkillsReport").QorLogicInstallReport>) | null = null;
  private outputChannel: { show(preserveFocus?: boolean): void } | null = null;
  private marketplaceCatalog = new MarketplaceCatalog();
  private marketplaceInstaller: MarketplaceInstaller;
  private securityScanner: SecurityScanner;
  private adapterService: AdapterService;
  private agentTimelineService: AgentTimelineService | null = null;
  private agentHealthIndicator: AgentHealthIndicator | null = null;
  private agentRunRecorder: AgentRunRecorder | null = null;
  private transparencyLogger: TransparencyLogger;
  private riskRegisterManager: RiskRegisterManager;
  private hub: HubSnapshotService;
  private lifecycle: ConsoleLifecycleService;
  private registrar: ConsoleRouteRegistrar;
  /** Shared so legacy fixtures that reassign priv.checkpointMemory/Db keep working. */
  private storeRef: CheckpointStoreRef = { db: null, memory: [] };
  get checkpointMemory(): import("./services/CheckpointStore").CheckpointRecord[] { return this.storeRef.memory; }
  set checkpointMemory(v: import("./services/CheckpointStore").CheckpointRecord[]) { this.storeRef.memory = v; }
  get checkpointDb(): import("./services/CheckpointStore").CheckpointDb { return this.storeRef.db; }
  set checkpointDb(v: import("./services/CheckpointStore").CheckpointDb) { this.storeRef.db = v; }

  constructor(
    private planManager: PlanManager,
    private qorelogicManager: QoreLogicManager,
    private sentinelDaemon: SentinelDaemon,
    private eventBus: EventBus,
    options: ConsoleServerOptions = {},
  ) {
    this.qoreRuntimeService = new QoreRuntimeService(resolveQoreRuntimeOptions(options.qoreRuntime));
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.featureGate = options.featureGate;
    this.uiDir = resolveUiDir(__dirname);
    this.audioVaultService = new AudioVaultService(this.workspaceRoot);
    this.audioVaultService.init().catch((err) => console.error("AudioVaultService init error:", err));
    this.brainstormService = createBrainstormService(options.configProvider);
    this.marketplaceInstaller = new MarketplaceInstaller(eventBus);
    this.securityScanner = new SecurityScanner(eventBus);
    this.adapterService = new AdapterService(eventBus);
    this.transparencyLogger = new TransparencyLogger(this.workspaceRoot);
    this.riskRegisterManager = new RiskRegisterManager(this.workspaceRoot);
    this.hub = this.buildHubService();
    this.lifecycle = new ConsoleLifecycleService({
      app: this.app, port: PORT, host: HOST, workspaceRoot: this.workspaceRoot,
      wsManager: this.wsManager, hub: this.hub, planManager: this.planManager,
      broadcast: (d) => this.broadcast(d),
    });
    this.registrar = new ConsoleRouteRegistrar(this.buildRouteHost());
    this.registrar.setupAllRoutes();
    this.subscribeToEvents();
  }

  // ── public API (unchanged surface) ─────────────────────────────────
  async start(): Promise<void> { await this.lifecycle.start(); }
  stop(): void { this.lifecycle.stop(); }
  getPort(): number { return this.lifecycle.getPort(); }
  broadcastEvent(data: Record<string, unknown>): void { this.broadcast(data); }
  /** @internal — preserved for legacy test reach-ins; routes use HubSnapshotService directly. */
  getTransparencyEvents(limit: number): Array<Record<string, unknown>> { return this.hub.getTransparencyEvents(limit); }
  /** @internal — preserved for legacy test reach-ins; routes use HubSnapshotService directly. */
  getRiskRegister(): Array<Record<string, unknown>> { return this.hub.getRiskRegister(); }

  setConsoleDeps(enforcement: EnforcementEngine, perm: PermissionScopeManager): void {
    this.enforcementEngine = enforcement; this.permissionManager = perm;
  }
  setSystemRegistry(reg: import("../qorelogic/SystemRegistry").SystemRegistry): void { this.systemRegistry = reg; }
  setIdeTracker(t: import("./services/IdeActivityTracker").IdeActivityTracker): void { this.ideTracker = t; }
  setScaffoldCallback(cb: () => Promise<import("../extension/installSkillsReport").QorLogicInstallReport | null>): void { this.scaffoldCallback = cb; }
  setScaffoldWebCallback(cb: (hosts: import("../qorlogic/hostLayouts").QorLogicHost[], scope: import("../qorlogic/QorLogicSkillIngestor").QorLogicScope) => Promise<import("../extension/installSkillsReport").QorLogicInstallReport>): void {
    this.scaffoldWebCallback = cb;
  }
  setOutputChannel(channel: { show(preserveFocus?: boolean): void }): void { this.outputChannel = channel; }
  setAgentTimelineService(s: AgentTimelineService): void { this.agentTimelineService = s; }
  setAgentHealthIndicator(i: AgentHealthIndicator): void { this.agentHealthIndicator = i; }
  setAgentRunRecorder(r: AgentRunRecorder): void { this.agentRunRecorder = r; }

  // ── internals ──────────────────────────────────────────────────────
  private broadcast(data: Record<string, unknown>): void { this.wsManager.broadcast(data); }

  private isLocalRequest(req: Request): boolean {
    const n = String(req.socket?.remoteAddress || req.ip || "").trim();
    return n === "127.0.0.1" || n === "::1" || n === "::ffff:127.0.0.1";
  }

  private rejectIfRemote(req: Request, res: Response): boolean {
    if (this.isLocalRequest(req)) return false;
    res.status(403).json({ error: "Forbidden: local access only" });
    return true;
  }

  private getUiEntryFile(req: Request): "command-center.html" | "index.html" {
    const ui = String(req.query.ui || "").toLowerCase();
    const compact = String(req.query.compact || "").toLowerCase();
    if (ui === "compact") return "index.html";
    if (ui === "console" || ui === "extended" || ui === "popout") return "command-center.html";
    if (compact === "1" || compact === "true" || compact === "yes") return "index.html";
    return "command-center.html";
  }

  private getInstalledSkills(): InstalledSkill[] {
    return discoverAllSkills(this.workspaceRoot, __dirname);
  }

  private buildHubService(): HubSnapshotService {
    return new HubSnapshotService({
      workspaceRoot: this.workspaceRoot, extensionVersion: EXTENSION_VERSION,
      planManager: this.planManager, qorelogicManager: this.qorelogicManager,
      sentinelDaemon: this.sentinelDaemon, qoreRuntimeService: this.qoreRuntimeService,
      gitResetService: this.gitResetService,
      transparencyLogger: this.transparencyLogger,
      riskRegisterManager: this.riskRegisterManager,
      mergePlanBlockers: (plan, a) => mergePlanBlockers(plan, a as WorkspaceArtifactSnapshot),
      getActualPort: () => this.lifecycle?.getPort() ?? PORT,
      getIdeTracker: () => this.ideTracker,
      getAgentHealthIndicator: () => this.agentHealthIndicator,
      checkpointTypeRegistry: CHECKPOINT_TYPE_REGISTRY,
      storeRef: this.storeRef,
    });
  }

  private buildRouteHost(): ConsoleRouteHost {
    return {
      app: this.app, uiDir: this.uiDir, workspaceRoot: this.workspaceRoot,
      workspaceDirname: __dirname, hub: this.hub,
      rejectIfRemote: (req, res) => this.rejectIfRemote(req, res),
      broadcast: (d) => this.broadcast(d),
      getUiEntryFile: (req) => this.getUiEntryFile(req),
      getInstalledSkills: () => this.getInstalledSkills() as any,
      getEnforcementEngine: () => this.enforcementEngine,
      getPermissionManager: () => this.permissionManager as any,
      getSystemRegistry: () => this.systemRegistry,
      getScaffoldCallback: () => this.scaffoldCallback as any,
      getScaffoldWebCallback: () => this.scaffoldWebCallback as any,
      getOutputChannel: () => this.outputChannel,
      getAgentTimelineService: () => this.agentTimelineService as any,
      getAgentHealthIndicator: () => this.agentHealthIndicator as any,
      getAgentRunRecorder: () => this.agentRunRecorder as any,
      qoreRuntimeService: this.qoreRuntimeService,
      brainstormService: this.brainstormService,
      audioVaultService: this.audioVaultService,
      marketplaceCatalog: this.marketplaceCatalog,
      marketplaceInstaller: this.marketplaceInstaller,
      securityScanner: this.securityScanner,
      adapterService: this.adapterService,
      sentinelDaemon: this.sentinelDaemon,
      planManager: this.planManager,
      qorelogicManager: this.qorelogicManager,
      featureGate: this.featureGate,
    };
  }

  private subscribeToEvents(): void {
    const manager = new EventSubscriptionManager({
      eventBus: this.eventBus,
      recordCheckpoint: (r: RecordCheckpointInput) => this.hub.recordCheckpoint(r),
      broadcast: (d) => this.broadcast(d),
      logTransparencyEvent: (e) => this.hub.logTransparencyEvent(e),
      inferPhaseKey: () => this.hub.inferPhaseKeyFromPlan(this.planManager.getActivePlan()),
      recordObservedFileMutation: (p) => this.hub.recordObservedFileMutation(p, (d) => this.broadcast(d)),
      getPlan: (id) => this.planManager.getPlan(id),
      sealedSubstantiateCompletions: this.sealedSubstantiateCompletions,
    });
    manager.subscribe();
  }

}
