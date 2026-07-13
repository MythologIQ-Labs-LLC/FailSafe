/** HubSnapshotService — assembles `/api/hub` payload + owns checkpoint /
 *  transparency / risk / unattributed-file state. Pre-snapshot refresh
 *  hooks run BEFORE composition. Extracted (Phase 60 §0). */
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
import { buildGovernancePhase, buildTrustSummary, buildNodeStatus,
  inferActivePhaseTitle } from "../ConsoleServerHub";
import type { CheckpointRef } from "../../governance/revert/types";
import { FailSafeRevertService } from "../../governance/revert/FailSafeRevertService";
import { GitResetService } from "../../governance/revert/GitResetService";
import type { PlanManager } from "../../qorelogic/planning/PlanManager";
import type { QorLogicManager } from "../../qorelogic/QorLogicManager";
import type { SentinelDaemon } from "../../sentinel/SentinelDaemon";
import type { AgentHealthIndicator } from "../../sentinel/AgentHealthIndicator";
import type { IdeActivityTracker } from "./IdeActivityTracker";
import type { WorkspaceMutationBus, MutationDisposable } from "../../shared/WorkspaceMutationBus";
import { assembleServiceHubPayload, type HubPayloadSource } from "./hub-payload-assembler";
import { createHubRevertDeps } from "./hub-revert-deps";
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
  mutationBus?: WorkspaceMutationBus;
  modeTransitionHistory?: import("../../governance/ModeTransitionHistory").ModeTransitionHistory;
  getGovernanceMode?: () => import("../../governance/types").GovernanceModeState;
  getQorLogicVerifier?: () => Promise<import("../../qorlogic/qorLogicInstallRecord").QorLogicVersionStatus>;
  getEducationConfig?: () => import("../../education/educationConfig").EducationConfig;
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
    this.revertService = new FailSafeRevertService(createHubRevertDeps({
      workspaceRoot: deps.workspaceRoot,
      gitService: deps.gitResetService,
      getCheckpoint: (id) => this.getCheckpointById(id),
      recordCheckpoint: (request) => this.recordCheckpoint({
        checkpointType: "governance.revert", actor: request.actor, phase: "revert",
        status: "sealed", policyVerdict: "PASS", evidenceRefs: [],
        payload: { targetCheckpointId: request.targetCheckpoint.checkpointId,
          targetGitHash: request.targetCheckpoint.gitHash, reason: request.reason },
      }),
    }));
    this.subscribeToChainValidityMutations();
  }

  private subscribeToChainValidityMutations(): void {
    if (!this.deps.mutationBus) return;
    try {
      const ledgerManager = this.deps.qorelogicManager.getLedgerManager();
      const dbPath = ledgerManager?.getLedgerPath?.();
      if (!dbPath) return;
      this.chainValidityDisposable = this.deps.mutationBus.registerWatcher(
        dbPath,
        () => this.refreshChainValidity(),
      );
    } catch {
      // Ledger access is optional during bootstrap.
    }
  }

  refreshChainValidity(): void {
    this.chainValidAt = null;
    this.cachedChainValid = true;
  }

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
    // B197: resolve qor-logic version-floor status once per hub rebuild (the
    // verifier spawns `pip show`; running it per-UI-render would be costly).
    // Failures degrade silently so a missing `pip` or transient subprocess
    // error doesn't crash hub-build — the UI just omits the warning.
    let qorLogicVersionStatus: import("../../qorlogic/qorLogicInstallRecord").QorLogicVersionStatus | undefined;
    if (this.deps.getQorLogicVerifier) {
      try { qorLogicVersionStatus = await this.deps.getQorLogicVerifier(); }
      catch { qorLogicVersionStatus = undefined; }
    }
    const artifacts = new WorkspaceArtifactBuilder(d.workspaceRoot, qorLogicVersionStatus).build();
    const phaseTitle = inferActivePhaseTitle(activePlan as unknown as Record<string, unknown>, (l) => this.getRecentCheckpoints(l));
    const runState = d.getIdeTracker()?.getRunState(phaseTitle) ?? { currentPhase: "Plan", activeTasks: [], activeDebugSessions: [] };
    const nodeStatusArr = buildNodeStatus(sentinelStatus as { running?: boolean; filesWatched?: number; queueDepth?: number; [k: string]: unknown }, l3Queue, trust, qorRuntime);
    return assembleServiceHubPayload(this.payloadSource(), {
      activePlan, sentinelStatus, l3Queue, trust, qorRuntime, checkpointSummary,
      governancePhase, artifacts, runState, nodeStatus: nodeStatusArr,
    });
  }

  private payloadSource(): HubPayloadSource {
    const d = this.deps;
    return {
      version: d.extensionVersion, workspaceRoot: d.workspaceRoot,
      chainValidAt: this.chainValidAt, cachedChainValid: this.cachedChainValid,
      unattributedFileChanges: this.unattributedFileChanges,
      getAllSprints: () => d.planManager.getAllSprints(),
      getCurrentSprint: () => d.planManager.getCurrentSprint(),
      mergePlanBlockers: d.mergePlanBlockers,
      getRecentCheckpoints: (limit) => this.getRecentCheckpoints(limit),
      getRecentVerdicts: (limit) => this.getRecentVerdicts(limit),
      getTransparencyEvents: () => d.transparencyLogger.getEvents(20).reverse(),
      getRiskRegister: () => this.getRiskRegister(), getPort: d.getActualPort,
      getAgentHealth: () => d.getAgentHealthIndicator()?.buildMetrics() || null,
      getGovernanceMode: () => d.getGovernanceMode?.(),
      getModeTransitions: () => d.modeTransitionHistory?.getRecent(10) ?? [],
      getEducation: () => d.getEducationConfig?.(),
    };
  }
      // B194: governance mode state + recent transition feed. Both optional;
      // when deps absent, fields stay undefined (legacy behavior).
      // Educational Component (v5.2.0): the {enabled, proficiency} pair the
      // webview micro-lesson affordance consumes. Threaded through the SAME
      // dep-callback pattern as getGovernanceMode — when the dep is absent
      // (test contexts) the field stays undefined and renderLesson() degrades
      // to the empty string.

  private backfillSentinelEvents(sentinelStatus: Record<string, unknown>): void {
    if (!this.checkpointDb || sentinelStatus.eventsProcessed !== 0) return;
    try {
      const row = this.checkpointDb.prepare(
        `SELECT COUNT(*) as cnt FROM failsafe_checkpoints WHERE checkpoint_type LIKE 'policy.%'`,
      ).get() as { cnt: number } | undefined;
      if (row?.cnt) sentinelStatus.eventsProcessed = row.cnt;
    } catch { /* non-fatal */ }
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

}
