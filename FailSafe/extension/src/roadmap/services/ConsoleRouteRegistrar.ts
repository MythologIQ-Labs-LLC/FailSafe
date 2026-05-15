/** ConsoleRouteRegistrar — registers all Express routes for ConsoleServer.
 *  Extracted from ConsoleServer.ts (Phase 60 §0). Composes ApiRouteDeps from
 *  the host server + HubSnapshotService and wires every route module. */
import * as path from "path";
import * as fs from "fs";
import express, { Request, Response } from "express";
import {
  HomeRoute, RunDetailRoute, WorkflowsRoute, SkillsRoute, GenomeRoute,
  ReportsRoute, SettingsRoute, PreflightRoute, GovernanceKPIRoute,
  AgentCoverageRoute, SreRoute,
} from "../routes";
import type { RouteDeps } from "../routes";
import type { ApiRouteDeps } from "../routes/types";
import { ConfigurationProfile } from "../../genesis/ConfigurationProfile";
import { setupBrainstormRoutes } from "../routes/BrainstormRoute";
import { setupCheckpointRoutes } from "../routes/CheckpointRoute";
import { setupActionsRoutes } from "../routes/ActionsRoute";
import { setupTransparencyRiskRoutes } from "../routes/TransparencyRiskRoute";
import { registerQorRoute } from "../routes/QorRoute";
import { registerFeatureStatusRoute } from "../routes/FeatureStatusRoute";
import { registerSkillsApiRoute } from "../routes/SkillsApiRoute";
import { registerHookRoute } from "../routes/HookRoute";
import { setupMarketplaceRoutes } from "../routes/MarketplaceRoute";
import { setupAdapterRoutes } from "../routes/AdapterRoute";
import { setupAgentApiRoutes } from "../routes/AgentApiRoute";
import { setupSreApiRoutes } from "../routes/SreApiRoute";
import { fetchAgtSnapshot } from "../routes/templates/SreTemplate";
import { readRegistry } from "./ServerRegistry";
import { buildPhasesFromLedger } from "../ConsoleServer";
import { MetaLedgerReader } from "./MetaLedgerReader";
import type { HubSnapshotService } from "./HubSnapshotService";
import type { LedgerSummary } from "./MetaLedgerReader";

export interface ConsoleRouteHost {
  app: express.Application; uiDir: string; workspaceRoot: string; workspaceDirname: string;
  hub: HubSnapshotService;
  rejectIfRemote(req: Request, res: Response): boolean;
  broadcast(data: Record<string, unknown>): void;
  getUiEntryFile(req: Request): "command-center.html" | "index.html";
  getInstalledSkills: () => unknown[];
  getEnforcementEngine(): unknown | null;
  getPermissionManager(): { getAllRequestedScopes: () => unknown[]; grant: (id: string) => void; deny: (id: string) => void } | null;
  getSystemRegistry(): unknown | null;
  getScaffoldCallback(): (() => Promise<unknown>) | null;
  getScaffoldWebCallback(): ((hosts: unknown[], scope: unknown) => Promise<unknown>) | null;
  getOutputChannel(): { show(preserveFocus?: boolean): void } | null;
  getAgentTimelineService(): { getEntries: (f?: unknown) => unknown[] } | null;
  getAgentHealthIndicator(): { buildMetrics: () => unknown } | null;
  getAgentRunRecorder(): {
    getActiveRuns: () => unknown[]; getCompletedRuns: () => unknown[];
    getRun: (id: string) => unknown; loadRun: (id: string) => unknown;
    getRunSteps: (id: string) => unknown[];
  } | null;
  qorRuntimeService: unknown; brainstormService: unknown; audioVaultService: unknown;
  marketplaceCatalog: unknown; marketplaceInstaller: unknown; securityScanner: unknown;
  adapterService: { getConfig: () => { adapterBaseUrl?: string } | null };
  sentinelDaemon: unknown; planManager: unknown;
  qorelogicManager: { getLedgerManager: () => unknown; getShadowGenomeManager: () => unknown };
  featureGate: unknown;
}

export class ConsoleRouteRegistrar {
  constructor(private readonly host: ConsoleRouteHost) {}

  setupAllRoutes(): void {
    const app = this.host.app;
    app.use(express.json({ limit: "12mb" }));
    app.use(express.static(this.host.uiDir, { index: false, dotfiles: "allow" }));
    this.registerCoreRoutes();
    const deps = this.buildApiRouteDeps();
    registerQorRoute(app, deps);
    registerSkillsApiRoute(app, deps);
    this.registerApiRoutes(deps);
    registerFeatureStatusRoute(app, deps);
    this.registerVerdictAndTrustRoutes();
    registerHookRoute(app, deps);
    this.setupConsoleRoutes();
    // SPA fallback is NOT registered here — it's an app.use(...) catch-all that
    // would intercept any /api/* POST registered later (e.g., QorlogicRoute's
    // /api/actions/scaffold-skills/preview). Call finalizeFallback() after all
    // late route registrations complete.
  }

  /** Register the SPA fallback. Call AFTER all late route registrations
   *  (e.g., QorlogicRoute in bootstrapServers) so they win over the catch-all. */
  finalizeFallback(): void {
    this.registerSpaFallback();
  }

  /** Root, health, roadmap, hub, workspaces */
  private registerCoreRoutes(): void {
    const app = this.host.app;
    app.get("/", (req, res) => this.serveUiEntry(req, res));
    app.get("/health", (_req, res) => {
      const ready = fs.existsSync(path.join(this.host.uiDir, "index.html"));
      res.status(ready ? 200 : 503).json({ ready, uiDir: this.host.uiDir });
    });
    app.get("/api/roadmap", (_req, res) => this.serveRoadmap(_req, res));
    app.get("/api/hub", async (_req, res) => { res.json(await this.host.hub.buildHubSnapshot()); });
    app.get("/api/v1/workspaces", (_req, res) => {
      res.json({ workspaces: readRegistry(), current: this.host.workspaceRoot });
    });
  }

  private serveUiEntry(req: Request, res: Response): void {
    const file = this.host.getUiEntryFile(req);
    const target = path.join(this.host.uiDir, file);
    const sendOpts = { dotfiles: "allow" as const };
    if (fs.existsSync(target)) { res.sendFile(target, sendOpts); return; }
    res.sendFile(path.join(this.host.uiDir, "command-center.html"), sendOpts);
  }

  private serveRoadmap(_req: Request, res: Response): void {
    const pm = this.host.planManager as { getAllSprints: () => unknown; getCurrentSprint: () => unknown; getActivePlan: () => { phases?: unknown[] } | null };
    const sprints = pm.getAllSprints();
    const currentSprint = pm.getCurrentSprint();
    const activePlan = pm.getActivePlan();
    const ledgerSummary: LedgerSummary = new MetaLedgerReader(this.host.workspaceRoot).summarize();
    const phasesFromLedger = ledgerSummary.totalEntries > 0 ? buildPhasesFromLedger(ledgerSummary) : [];
    const phases = (activePlan?.phases?.length ?? 0) > 0 ? activePlan!.phases : phasesFromLedger;
    res.json({ sprints, currentSprint, activePlan, phases, ledgerSummary });
  }

  buildApiRouteDeps(): ApiRouteDeps {
    const h = this.host;
    const hub = h.hub;
    const sg = () => h.qorelogicManager.getShadowGenomeManager() as any;
    return {
      rejectIfRemote: (req, res) => h.rejectIfRemote(req, res),
      broadcast: (d) => h.broadcast(d),
      qorRuntimeService: h.qorRuntimeService as any,
      buildHubSnapshot: () => hub.buildHubSnapshot(),
      featureGate: h.featureGate as any,
      workspaceRoot: h.workspaceRoot, workspaceDirname: h.workspaceDirname,
      brainstormService: h.brainstormService, audioVaultService: h.audioVaultService,
      getRecentCheckpoints: (l) => hub.getRecentCheckpoints(l),
      getCheckpointById: (id) => hub.getCheckpointById(id),
      verifyCheckpointChain: () => hub.verifyCheckpointChain(),
      revertService: hub.getRevertService(),
      sentinelDaemon: h.sentinelDaemon, planManager: h.planManager,
      qorelogicManager: h.qorelogicManager,
      recordCheckpoint: (i) => hub.recordCheckpoint(i),
      inferPhaseKeyFromPlan: (p) => hub.inferPhaseKeyFromPlan(p),
      chainValidAt: hub.getChainValidAt(),
      cachedChainValid: hub.getCachedChainValid(),
      setCachedChainValid: (v, at) => hub.setCachedChainValid(v, at),
      getTransparencyEvents: (l) => hub.getTransparencyEvents(l),
      getRiskRegister: () => hub.getRiskRegister(),
      writeRiskRegister: (r) => hub.writeRiskRegister(r),
      scaffoldSkills: (h.getScaffoldCallback() as any) ?? undefined,
      scaffoldWithWebOptions: (h.getScaffoldWebCallback() as any) ?? undefined,
      showOutput: h.getOutputChannel() ? () => h.getOutputChannel()?.show(true) : undefined,
      getTimelineEntries: (f) => h.getAgentTimelineService()?.getEntries(f) || [],
      getHealthMetrics: () => h.getAgentHealthIndicator()?.buildMetrics() || null,
      getGenomePatterns: () => sg().analyzeFailurePatterns(),
      getGenomeAllPatterns: () => sg().analyzeAllPatterns(),
      getGenomeUnresolved: (l) => sg().getUnresolvedEntries(l),
      getActiveRuns: () => h.getAgentRunRecorder()?.getActiveRuns() || [],
      getCompletedRuns: () => h.getAgentRunRecorder()?.getCompletedRuns() || [],
      getRun: (id) => h.getAgentRunRecorder()?.getRun(id),
      loadRun: (id) => h.getAgentRunRecorder()?.loadRun(id) || null,
      getRunSteps: (id) => h.getAgentRunRecorder()?.getRunSteps(id) || [],
    };
  }

  private registerApiRoutes(apiDeps: ApiRouteDeps): void {
    const app = this.host.app;
    setupTransparencyRiskRoutes(app, apiDeps);
    setupAgentApiRoutes(app, apiDeps);
    const adapterUrl = this.host.adapterService.getConfig()?.adapterBaseUrl;
    setupSreApiRoutes(app, { rejectIfRemote: (req, res) => this.host.rejectIfRemote(req, res) }, adapterUrl);
    setupBrainstormRoutes(app, apiDeps);
    setupCheckpointRoutes(app, apiDeps);
    setupActionsRoutes(app, apiDeps);
    setupMarketplaceRoutes(app, {
      rejectIfRemote: (req, res) => this.host.rejectIfRemote(req, res),
      broadcast: (data) => this.host.broadcast(data),
      marketplaceCatalog: this.host.marketplaceCatalog as any,
      marketplaceInstaller: this.host.marketplaceInstaller as any,
      securityScanner: this.host.securityScanner as any,
      ledgerManager: this.host.qorelogicManager.getLedgerManager() as any,
    });
    setupAdapterRoutes(app, {
      rejectIfRemote: (req, res) => this.host.rejectIfRemote(req, res),
      broadcast: (data) => this.host.broadcast(data),
      adapterService: this.host.adapterService as any,
    });
  }

  private registerVerdictAndTrustRoutes(): void {
    const app = this.host.app;
    const hub = this.host.hub;
    app.get("/api/v1/verdicts", (_req, res) => {
      const limit = Math.min(Number(_req.query.limit) || 20, 100);
      res.json(hub.getRecentVerdicts(limit));
    });
    app.get("/api/v1/trust", async (_req, res) => {
      const snap = await hub.buildHubSnapshot();
      const cps = Object.values((snap.checkpoints as Record<string, unknown>) || {});
      const total = cps.length || 1;
      const passed = cps.filter((c: any) => c.policyVerdict !== "VIOLATION").length;
      res.json({ overall: Math.round((passed / total) * 100), checkpointCount: total, passCount: passed });
    });
  }

  private registerSpaFallback(): void {
    const exts = [".js", ".mjs", ".css", ".wasm", ".onnx", ".png", ".jpg", ".svg", ".data", ".json", ".bin"];
    this.host.app.use((req, res) => {
      if (req.path.startsWith("/api/") || req.path === "/health") { res.status(404).json({ error: "Not found" }); return; }
      if (exts.some((e) => req.path.toLowerCase().endsWith(e))) { res.status(404).type("text/plain").send("Not found"); return; }
      this.serveUiEntry(req, res);
    });
  }

  private buildRouteDeps(): RouteDeps {
    const configProfile = new ConfigurationProfile();
    configProfile.loadDefaults({ workspaceRoot: this.host.workspaceRoot });
    return {
      planManager: this.host.planManager as any,
      ledgerManager: this.host.qorelogicManager.getLedgerManager() as any,
      shadowGenomeManager: this.host.qorelogicManager.getShadowGenomeManager() as any,
      enforcementEngine: this.host.getEnforcementEngine() as any,
      configProfile,
      getInstalledSkills: () => this.host.getInstalledSkills() as any,
      systemRegistry: (this.host.getSystemRegistry() ?? undefined) as any,
    };
  }

  private setupConsoleRoutes(): void {
    const app = this.host.app;
    const d = () => this.buildRouteDeps();
    app.get("/console/home", async (req, res) => HomeRoute.render(req, res, d()));
    app.get("/console/run/:runId", (req, res) => RunDetailRoute.render(req, res, d()));
    app.get("/console/workflows", (req, res) => WorkflowsRoute.render(req, res, d()));
    app.get("/console/skills", (req, res) => SkillsRoute.render(req, res, d()));
    app.get("/console/genome", async (req, res) => GenomeRoute.render(req, res, d()));
    app.get("/console/reports", async (req, res) => ReportsRoute.render(req, res, d()));
    app.get("/console/settings", (req, res) => SettingsRoute.render(req, res, d()));
    app.get("/console/kpi", async (req, res) => GovernanceKPIRoute.render(req, res, { ledgerManager: d().ledgerManager }));
    this.registerConsoleExtras();
  }

  private registerConsoleExtras(): void {
    const app = this.host.app;
    app.get("/console/agents", async (req, res) => {
      const reg = this.host.getSystemRegistry();
      if (!reg) { res.status(503).send("SystemRegistry not available"); return; }
      AgentCoverageRoute.render(req, res, { systemRegistry: reg as any });
    });
    app.get("/console/sre", async (req: Request, res: Response) => SreRoute.render(req, res, {
      getSnapshot: () => fetchAgtSnapshot(this.host.adapterService.getConfig()?.adapterBaseUrl || "http://127.0.0.1:9377"),
    }));
    const pm = this.host.getPermissionManager();
    if (!pm) return;
    app.get("/console/preflight", (req, res) => PreflightRoute.render(req, res, { permissionManager: pm as any }));
    app.post("/console/preflight/grant", (req, res) => PreflightRoute.handleGrant(req, res, { permissionManager: pm as any }));
    app.post("/console/preflight/deny", (req, res) => PreflightRoute.handleDeny(req, res, { permissionManager: pm as any }));
  }
}
