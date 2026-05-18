/** HubSnapshotService — assembles `/api/hub` payload + owns checkpoint /
 *  transparency / risk / unattributed-file state. Pre-snapshot refresh
 *  hooks run BEFORE composition. Extracted (Phase 60 §0). */
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { TransparencyLogger } from "./TransparencyLogger";
import { RiskRegisterManager } from "./RiskRegisterManager";
import { WorkspaceArtifactBuilder, type WorkspaceArtifactSnapshot } from "./WorkspaceArtifactBuilder";
import {
  type CheckpointRecord, type CheckpointDb, type CheckpointStatus,
  getRecentCheckpoints as ckptGetRecent,
  getRecentVerdicts as ckptGetRecentVerdicts,
  verifyCheckpointChain as ckptVerifyChain,
  getCheckpointSummary as ckptGetSummary,
  buildCheckpointRecord as ckptBuildRecord,
  persistCheckpoint as ckptPersist,
  inferPhaseKeyFromPlan as inferPhaseKeyFromPlanFn,
  CHECKPOINT_INIT_SQL,
} from "./CheckpointStore";
import { QorRuntimeService } from "./QorRuntimeService";
import {
  buildGovernancePhase, buildMetricIntegrity, buildUnattributedFileActivity,
  buildRepoCompliance, buildTrustSummary, buildNodeStatus,
  inferActivePhaseTitle, buildRiskSummary, buildRecentCompletions,
} from "../ConsoleServerHub";
import type { CheckpointRef, RevertRequest } from "../../governance/revert/types";
import { FailSafeRevertService, RevertDeps } from "../../governance/revert/FailSafeRevertService";
import { GitResetService } from "../../governance/revert/GitResetService";
import type { PlanManager } from "../../qorelogic/planning/PlanManager";
import type { QorLogicManager } from "../../qorelogic/QorLogicManager";
import type { SentinelDaemon } from "../../sentinel/SentinelDaemon";
import type { AgentHealthIndicator } from "../../sentinel/AgentHealthIndicator";
import type { IdeActivityTracker } from "./IdeActivityTracker";
import type { WorkspaceMutationBus, MutationDisposable } from "../../shared/WorkspaceMutationBus";

export type UnattributedFileChange = { eventId: string; timestamp: string; type: string; artifactPath?: string; decision?: string; };
export type RecordCheckpointInput = { checkpointType: string; actor: string; phase: string; status: CheckpointStatus; policyVerdict: string; evidenceRefs: string[]; payload: unknown; };
export interface HubSnapshotServiceDeps {
  workspaceRoot: string; extensionVersion: string;
  planManager: PlanManager; qorelogicManager: QorLogicManager;
  sentinelDaemon: SentinelDaemon; qorRuntimeService: QorRuntimeService;
  gitResetService: GitResetService; transparencyLogger: TransparencyLogger;
  riskRegisterManager: RiskRegisterManager;
  mergePlanBlockers: (plan: unknown, a: WorkspaceArtifactSnapshot) => unknown;
  getActualPort: () => number;
  getIdeTracker: () => IdeActivityTracker | null;
  getAgentHealthIndicator: () => AgentHealthIndicator | null;
  checkpointTypeRegistry: Set<string>;
  /** Optional WorkspaceMutationBus (B192 remediation). When provided,
   *  HubSnapshotService subscribes to the SQLite db path's mutations and
   *  clears its cached chain validity so the next getCheckpointSummary()
   *  re-walks the chain via verifyCheckpointChain. Pro-coexistence: external
   *  db writes trigger refresh. */
  mutationBus?: WorkspaceMutationBus;
}

const FILE_EVENT_TYPES = new Set(["FILE_CREATED", "FILE_MODIFIED", "FILE_DELETED"]);

export interface CheckpointStoreRef { db: CheckpointDb; memory: CheckpointRecord[]; }

export class HubSnapshotService {
  private store: CheckpointStoreRef;
  private chainValidAt: string | null = null;
  private cachedChainValid: boolean = true;
  private unattributedFileChanges: UnattributedFileChange[] = [];
  private revertService: FailSafeRevertService | null = null;
  private chainValidityDisposable: MutationDisposable | null = null;
  autoDerivationHook: ((gp: ReturnType<typeof buildGovernancePhase>) => void) | null = null;
  constructor(private readonly deps: HubSnapshotServiceDeps & { storeRef?: CheckpointStoreRef }) {
    this.store = deps.storeRef ?? { db: null, memory: [] };
    this.initializeCheckpointStore();
    this.revertService = new FailSafeRevertService(this.buildRevertDeps());
    this.subscribeToChainValidityMutations();
  }

  /** B192 remediation: subscribe to the SQLite db file path so external
   *  mutations (e.g., FailSafe Pro writing to the same db) invalidate the
   *  cached chain validity. Idempotent: clearing cachedChainValid +
   *  chainValidAt means the next getCheckpointSummary() call re-walks
   *  the chain via verifyCheckpointChain. */
  private subscribeToChainValidityMutations(): void {
    if (!this.deps.mutationBus) return;
    try {
      const ledgerManager = this.deps.qorelogicManager.getLedgerManager();
      const dbPath = ledgerManager?.getLedgerPath?.();
      if (!dbPath) return; // ledger not initialized; bus subscription deferred
      this.chainValidityDisposable = this.deps.mutationBus.registerWatcher(
        dbPath,
        () => this.refreshChainValidity(),
      );
    } catch {
      // Ledger manager unavailable; degrade silently. The existing
      // belt-and-suspenders refresh hooks in buildHubSnapshot still apply.
    }
  }

  /** Clear cached chain validity so the next getCheckpointSummary call
   *  re-runs verifyCheckpointChain over the full chain. */
  refreshChainValidity(): void {
    this.chainValidAt = null;
    this.cachedChainValid = true; // optimistic default until re-walk
  }

  /** Release the mutation-bus subscription. Called by ConsoleServer.stop or
   *  extension deactivate. */
  dispose(): void {
    if (this.chainValidityDisposable) {
      try { this.chainValidityDisposable.dispose(); } catch { /* already gone */ }
      this.chainValidityDisposable = null;
    }
  }
  private get checkpointDb(): CheckpointDb { return this.store.db; }
  private set checkpointDb(v: CheckpointDb) { this.store.db = v; }
  private get checkpointMemory(): CheckpointRecord[] { return this.store.memory; }

  getChainValidAt(): string | null { return this.chainValidAt; }
  getCachedChainValid(): boolean { return this.cachedChainValid; }
  getRevertService(): FailSafeRevertService | null { return this.revertService; }
  setCachedChainValid(v: boolean, at: string): void { this.cachedChainValid = v; this.chainValidAt = at; }

  getRecentCheckpoints(l: number): CheckpointRecord[] { return ckptGetRecent(this.checkpointDb, this.checkpointMemory, l); }
  getRecentVerdicts(l = 50): Array<Record<string, unknown>> { return ckptGetRecentVerdicts(this.checkpointDb, this.checkpointMemory, l); }
  verifyCheckpointChain(): boolean { return ckptVerifyChain(this.checkpointDb, this.checkpointMemory); }
  getCheckpointSummary(): Record<string, unknown> {
    return ckptGetSummary(this.checkpointDb, this.checkpointMemory, this.cachedChainValid, this.chainValidAt);
  }

  getCheckpointById(id: string): CheckpointRef | null {
    if (this.checkpointDb) {
      try {
        const r = this.checkpointDb.prepare(
          "SELECT checkpoint_id, git_hash, timestamp, phase, status FROM failsafe_checkpoints WHERE checkpoint_id = ?",
        ).get(id) as { checkpoint_id: string; git_hash: string; timestamp: string; phase: string; status: string } | undefined;
        if (r) return { checkpointId: r.checkpoint_id, gitHash: r.git_hash, timestamp: r.timestamp, phase: r.phase, status: r.status };
      } catch { /* fall through */ }
    }
    const m = this.checkpointMemory.find((r) => r.checkpointId === id);
    if (!m) return null;
    return { checkpointId: m.checkpointId, gitHash: m.gitHash, timestamp: m.timestamp, phase: m.phase, status: m.status };
  }

  inferPhaseKeyFromPlan(plan: unknown): string { return inferPhaseKeyFromPlanFn(plan); }

  recordCheckpoint(input: RecordCheckpointInput): void {
    if (!this.deps.checkpointTypeRegistry.has(input.checkpointType)) return;
    if (input.evidenceRefs.length === 0) {
      const since = new Date(Date.now() - 60_000).toISOString();
      input.evidenceRefs = this.deps.sentinelDaemon.getRecentObservationIds(since, 10);
    }
    const runId = this.deps.planManager.getActivePlan()?.id || this.deps.planManager.getCurrentSprint()?.id || "global";
    const r = ckptBuildRecord(input, new Date().toISOString(), runId, this.checkpointDb, this.checkpointMemory);
    ckptPersist(r, this.checkpointDb, this.checkpointMemory);
  }

  getTransparencyEvents(l: number): Array<Record<string, unknown>> { return this.deps.transparencyLogger.getEvents(l); }
  logTransparencyEvent(e: Record<string, unknown>): void { this.deps.transparencyLogger.log(e); }
  getRiskRegister(): Array<Record<string, unknown>> { return this.deps.riskRegisterManager.getRisks(); }
  writeRiskRegister(r: Array<Record<string, unknown>>): void { this.deps.riskRegisterManager.writeRisks(r); }

  recordObservedFileMutation(payload: unknown, broadcast: (d: Record<string, unknown>) => void): void {
    if (!payload || typeof payload !== "object") return;
    const a = payload as Record<string, unknown>;
    if (a.source !== "file_watcher") return;
    if (!FILE_EVENT_TYPES.has(String(a.type || ""))) return;
    this.unattributedFileChanges.push({
      eventId: String(a.eventId || crypto.randomUUID()),
      timestamp: String(a.timestamp || new Date().toISOString()),
      type: String(a.type || "FILE_MODIFIED"),
      artifactPath: a.artifactPath as string | undefined,
      decision: a.decision as string | undefined,
    });
    this.unattributedFileChanges = this.unattributedFileChanges.slice(-10);
    broadcast({ type: "hub.refresh" });
  }

  async buildHubSnapshot(): Promise<Record<string, unknown>> {
    const d = this.deps;
    d.planManager.refreshFromWorkspace?.();
    d.qorelogicManager.refreshL3Queue?.();
    const activePlan = d.planManager.getActivePlan();
    const sentinelStatus: Record<string, unknown> = { ...d.sentinelDaemon.getStatus() };
    this.backfillSentinelEvents(sentinelStatus);
    const l3Queue = d.qorelogicManager.getL3Queue();
    const trust = buildTrustSummary(await d.qorelogicManager.getTrustEngine().getAllAgents());
    const qorRuntime = await d.qorRuntimeService.fetchSnapshot();
    const checkpointSummary = this.getCheckpointSummary();
    const governancePhase = buildGovernancePhase(d.workspaceRoot);
    this.autoDerivationHook?.(governancePhase); // plan-qor-model-sourced-risks Phase 3
    const artifacts = new WorkspaceArtifactBuilder(d.workspaceRoot).build();
    const phaseTitle = inferActivePhaseTitle(activePlan as unknown as Record<string, unknown>, (l) => this.getRecentCheckpoints(l));
    const runState = d.getIdeTracker()?.getRunState(phaseTitle) ?? { currentPhase: "Plan", activeTasks: [], activeDebugSessions: [] };
    const nodeStatusArr = buildNodeStatus(sentinelStatus as { running?: boolean; filesWatched?: number; queueDepth?: number; [k: string]: unknown }, l3Queue, trust, qorRuntime);
    return this.assembleHubPayload({ activePlan, sentinelStatus, l3Queue, trust, qorRuntime, checkpointSummary, governancePhase, artifacts, runState, nodeStatusArr });
  }

  private assembleHubPayload(a: {
    activePlan: unknown; sentinelStatus: Record<string, unknown>;
    l3Queue: unknown; trust: unknown; qorRuntime: unknown;
    checkpointSummary: Record<string, unknown>;
    governancePhase: ReturnType<typeof buildGovernancePhase>;
    artifacts: WorkspaceArtifactSnapshot;
    runState: { activeTasks?: unknown[]; activeDebugSessions?: unknown[] };
    nodeStatusArr: unknown;
  }): Record<string, unknown> {
    const hubDeps = { chainValidAt: this.chainValidAt, unattributedFileChanges: this.unattributedFileChanges };
    return {
      version: this.deps.extensionVersion,
      sprints: this.deps.planManager.getAllSprints(),
      currentSprint: this.deps.planManager.getCurrentSprint(),
      activePlan: this.deps.mergePlanBlockers(a.activePlan, a.artifacts),
      sentinelStatus: a.sentinelStatus,
      recentVerdicts: this.coalesceVerdicts(a.artifacts),
      l3Queue: a.l3Queue, trustSummary: a.trust, nodeStatus: a.nodeStatusArr,
      checkpointSummary: a.checkpointSummary,
      recentCheckpoints: this.getRecentCheckpoints(12),
      qorRuntime: a.qorRuntime, runState: a.runState,
      riskSummary: buildRiskSummary((l) => this.getRecentVerdicts(l)),
      recentCompletions: this.coalesceCompletions(a.artifacts),
      transparencyEvents: this.deps.transparencyLogger.getEvents(20).reverse(),
      unattributedFileActivity: buildUnattributedFileActivity(this.unattributedFileChanges),
      metricIntegrity: buildMetricIntegrity(a.governancePhase, a.checkpointSummary, a.sentinelStatus, a.runState, hubDeps),
      bootstrapState: {
        skillsInstalled: a.artifacts.qorLogicInstall.anyInstalled,
        governanceInitialized: fs.existsSync(path.join(this.deps.workspaceRoot, "docs", "CONCEPT.md")),
        workspaceName: path.basename(this.deps.workspaceRoot),
        systemState: a.artifacts.systemState,
        qorLogicInstall: a.artifacts.qorLogicInstall,
      },
      ledgerSummary: a.artifacts.ledgerSummary,
      latestAudit: a.artifacts.latestAudit,
      recentReleases: a.artifacts.recentReleases,
      workspaceName: path.basename(this.deps.workspaceRoot),
      workspacePath: this.deps.workspaceRoot,
      serverPort: this.deps.getActualPort(),
      governancePhase: a.governancePhase,
      repoCompliance: buildRepoCompliance(this.deps.workspaceRoot),
      chainValid: this.cachedChainValid ?? null,
      risks: this.getRiskRegister(),
      agentHealth: this.deps.getAgentHealthIndicator()?.buildMetrics() || null,
      generatedAt: new Date().toISOString(),
    };
  }

  private backfillSentinelEvents(sentinelStatus: Record<string, unknown>): void {
    if (!this.checkpointDb || sentinelStatus.eventsProcessed !== 0) return;
    try {
      const row = this.checkpointDb.prepare(
        `SELECT COUNT(*) as cnt FROM failsafe_checkpoints WHERE checkpoint_type LIKE 'policy.%'`,
      ).get() as { cnt: number } | undefined;
      if (row?.cnt) sentinelStatus.eventsProcessed = row.cnt;
    } catch { /* non-fatal */ }
  }

  private coalesceVerdicts(artifacts: WorkspaceArtifactSnapshot): Array<Record<string, unknown>> {
    const live = this.getRecentVerdicts(10);
    if (live.length > 0) return live;
    return artifacts.ledgerVerdicts.map((v) => ({ id: v.id, number: v.number, kind: v.kind, title: v.title, source: "meta-ledger" }));
  }

  private coalesceCompletions(artifacts: WorkspaceArtifactSnapshot): unknown {
    const live = buildRecentCompletions((l) => this.getRecentCheckpoints(l));
    if (Array.isArray(live) && live.length > 0) return live;
    return artifacts.ledgerCompletions.map((c) => ({ id: c.id, number: c.number, kind: c.kind, title: c.title, source: "meta-ledger" }));
  }

  private initializeCheckpointStore(): void {
    try {
      const db = this.deps.qorelogicManager.getLedgerManager()
        .getDatabase() as unknown as { exec: (sql: string) => void } & CheckpointDb;
      db.exec(CHECKPOINT_INIT_SQL);
      this.checkpointDb = db;
      this.cachedChainValid = this.verifyCheckpointChain();
      this.chainValidAt = new Date().toISOString();
    } catch {
      this.checkpointDb = null; this.cachedChainValid = false; this.chainValidAt = null;
    }
  }

  private buildRevertDeps(): RevertDeps {
    return {
      getCheckpoint: (id) => this.getCheckpointById(id),
      gitService: this.deps.gitResetService, purgeRagAfter: () => 0,
      recordRevertCheckpoint: (req: RevertRequest) => {
        this.recordCheckpoint({
          checkpointType: "governance.revert", actor: req.actor, phase: "revert",
          status: "sealed", policyVerdict: "PASS", evidenceRefs: [],
          payload: { targetCheckpointId: req.targetCheckpoint.checkpointId,
            targetGitHash: req.targetCheckpoint.gitHash, reason: req.reason },
        });
        return crypto.randomUUID();
      },
      workspaceRoot: this.deps.workspaceRoot,
    };
  }
}
