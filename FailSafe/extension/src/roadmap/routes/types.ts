import type { QorLogicInstallReport } from '../../extension/installSkillsReport';
import type { QorRuntimeService } from '../services/QorRuntimeService';
import type { IFeatureGate } from '../../core/interfaces/IFeatureGate';
import type { QorLogicHost } from '../../qorlogic/hostLayouts';
import type { ShadowGenomeResult } from '../../qorlogic/shadow-genome-client';
import type { ConfirmOperatorAction } from '../../extension/operatorConfirmation';

/**
 * Dependency injection interface for API route modules extracted
 * from ConsoleServer. Each route module receives this bag of
 * dependencies instead of referencing `this.*` on the server class.
 */
export interface ApiRouteDeps {
  rejectIfRemote: (req: any, res: any) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  /** #83A: commit-hook token validator (CommitGuard.validateToken). */
  validateCommitToken?: (token: string) => boolean;
  /** #532 part B (B283): the active intent for the commit-check route, read from the host's
   *  IntentService at request time; throws when no service is wired. Absent -> the route blocks. */
  getActiveIntent?: () => Promise<unknown>;
  // Phase 2 (B166) deps for QorRoute / FeatureStatusRoute / SkillsApiRoute / HookRoute
  qorRuntimeService: QorRuntimeService;
  buildHubSnapshot: () => Promise<Record<string, unknown>>;
  featureGate?: IFeatureGate;
  workspaceRoot: string;
  /**
   * `__dirname` of the ConsoleServer module — needed by skill discovery
   * to walk up to ancestor `.claude/skills/`, `.codex/skills/`, etc.
   * Passed in rather than re-derived so route tests can supply a
   * deterministic path.
   */
  workspaceDirname: string;
  brainstormService: any;
  audioVaultService: any;
  getRecentCheckpoints: (limit: number) => any[];
  getCheckpointById: (id: string) => any;
  verifyCheckpointChain: () => boolean;
  revertService: any;
  sentinelDaemon: any;
  planManager: any;
  qorelogicManager: any;
  recordCheckpoint: (input: any) => void;
  inferPhaseKeyFromPlan: (plan: any) => string;
  chainValidAt: string | null;
  cachedChainValid: boolean;
  setCachedChainValid: (valid: boolean, at: string) => void;
  getTransparencyEvents: (limit: number) => any[];
  getRiskRegister: () => any[];
  /** #377: durable-store-only view for mutation reads (no backlog fallback). */
  getStoredRiskRegister: () => any[];
  /** #517: read-modify-write the durable list under the risk store lock; fn runs once and changes the list in place. */
  mutateRiskRegister: <T>(fn: (risks: any[]) => T) => T;
  scaffoldSkills?: () => Promise<QorLogicInstallReport | null>;
  scaffoldWithWebOptions?: (
    hosts: QorLogicHost[],
    scope: "repo" | "global",
    skillFilter: Record<string, string[]> | undefined,
    /** #538: names the approved operation on the install's progress events. */
    context?: { operationId: string },
  ) => Promise<QorLogicInstallReport>;
  showOutput?: () => void;
  /** #514: modal VS Code confirmation for gated operator routes (L3 decisions,
   *  panic-stop, rollback, hooks disable). Absent -> those routes answer 503. */
  confirmOperatorAction?: ConfirmOperatorAction;
  /** #538: test seam for the scaffold route's confirmation deadline. */
  confirmationDeadlineMs?: number;
  // Agent API route delegates (Phase 2: B142/B143/B144)
  getTimelineEntries: (filter?: any) => any[];
  getHealthMetrics: () => any | null;
  getGenomePatterns: () => Promise<any[]>;
  getGenomeAllPatterns: () => Promise<any[]>; // B183: All patterns regardless of status
  getGenomeUnresolved: (limit: number) => Promise<any[]>;
  /**
   * FX863 shadow-genome causal-graph loader (#196 governance dashboard).
   * Optional + degrade-safe: absent ⇒ the route returns a zeroed `enabled:false`
   * payload. OFF by default (the loader itself only runs a subprocess when
   * `enabled:true`), so this never reaches the network or a remote store.
   */
  loadShadowGenome?: () => Promise<ShadowGenomeResult>;
  /** #454: raw `docs/META_LEDGER.md` text — the source for the reconstructed-genome
   *  appendix the dashboard merges in. Absent/empty → no appendix (degrade-safe). */
  /** #233 (FX892): ledger consumption goes through the adapter envelope —
   *  routes never read or parse META_LEDGER text directly. */
  readMetaLedgerEnvelope?: () => import("../../qorlogic/consumer/types").ArtifactEnvelope<
    import("../../qorlogic/meta-ledger-model").MetaLedgerEntry[]
  >;
  getActiveRuns: () => any[];
  getCompletedRuns: () => any[];
  getRun: (runId: string) => any | undefined;
  loadRun: (runId: string) => any | null;
  getRunSteps: (runId: string) => any[];
}
