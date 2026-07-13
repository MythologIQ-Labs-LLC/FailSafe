export interface LedgerProjection {
  id: string;
  number?: number;
  kind: string;
  title: string;
}

export interface HubArtifactPayload {
  ledgerSummary: unknown;
  latestAudit: unknown;
  recentReleases: unknown;
  qorConsumer: unknown;
}

export interface HubPayloadInput {
  base: Record<string, unknown>;
  artifacts: HubArtifactPayload;
  liveVerdicts: Array<Record<string, unknown>>;
  ledgerVerdicts: LedgerProjection[];
  liveCompletions: unknown;
  ledgerCompletions: LedgerProjection[];
}

export interface HubPayloadSource {
  version: string; workspaceRoot: string; chainValidAt: string | null;
  cachedChainValid: boolean; unattributedFileChanges: unknown[];
  getAllSprints: () => unknown; getCurrentSprint: () => unknown;
  mergePlanBlockers: (plan: unknown, artifacts: WorkspaceArtifactSnapshot) => unknown;
  getRecentCheckpoints: (limit: number) => unknown[];
  getRecentVerdicts: (limit: number) => Array<Record<string, unknown>>;
  getTransparencyEvents: () => unknown; getRiskRegister: () => unknown;
  getPort: () => number; getAgentHealth: () => unknown;
  getGovernanceMode: () => unknown; getModeTransitions: () => unknown;
  getEducation: () => unknown;
}

export interface HubPayloadState {
  activePlan: unknown; sentinelStatus: Record<string, unknown>; l3Queue: unknown;
  trust: unknown; qorRuntime: unknown; checkpointSummary: Record<string, unknown>;
  governancePhase: Parameters<typeof buildMetricIntegrity>[0];
  artifacts: WorkspaceArtifactSnapshot;
  runState: { activeTasks?: unknown[]; activeDebugSessions?: unknown[] };
  nodeStatus: unknown;
}

function projectLedger(items: LedgerProjection[]): Array<Record<string, unknown>> {
  return items.map((item) => ({ ...item, source: "meta-ledger" }));
}

function coalesceLive(live: unknown, ledger: LedgerProjection[]): unknown {
  if (Array.isArray(live) && live.length > 0) return live;
  return projectLedger(ledger);
}

export function assembleHubPayload(input: HubPayloadInput): Record<string, unknown> {
  return {
    ...input.base,
    recentVerdicts: coalesceLive(input.liveVerdicts, input.ledgerVerdicts),
    recentCompletions: coalesceLive(input.liveCompletions, input.ledgerCompletions),
    ledgerSummary: input.artifacts.ledgerSummary,
    latestAudit: input.artifacts.latestAudit,
    recentReleases: input.artifacts.recentReleases,
    qorConsumer: input.artifacts.qorConsumer,
  };
}

function buildServiceBase(source: HubPayloadSource, state: HubPayloadState): Record<string, unknown> {
  const hubDeps = {
    chainValidAt: source.chainValidAt,
    unattributedFileChanges: source.unattributedFileChanges,
  };
  return {
    version: source.version, sprints: source.getAllSprints(),
    currentSprint: source.getCurrentSprint(),
    activePlan: source.mergePlanBlockers(state.activePlan, state.artifacts),
    sentinelStatus: state.sentinelStatus, l3Queue: state.l3Queue,
    trustSummary: state.trust, nodeStatus: state.nodeStatus,
    checkpointSummary: state.checkpointSummary,
    recentCheckpoints: source.getRecentCheckpoints(12),
    qorRuntime: state.qorRuntime, runState: state.runState,
    riskSummary: buildRiskSummary(source.getRecentVerdicts),
    transparencyEvents: source.getTransparencyEvents(),
    unattributedFileActivity: buildUnattributedFileActivity(
      source.unattributedFileChanges as Parameters<typeof buildUnattributedFileActivity>[0],
    ),
    metricIntegrity: buildMetricIntegrity(state.governancePhase, state.checkpointSummary,
      state.sentinelStatus, state.runState,
      hubDeps as Parameters<typeof buildMetricIntegrity>[4]),
    bootstrapState: buildBootstrapState(source, state.artifacts),
    workspaceName: path.basename(source.workspaceRoot), workspacePath: source.workspaceRoot,
    serverPort: source.getPort(), governancePhase: state.governancePhase,
    repoCompliance: buildRepoCompliance(source.workspaceRoot),
    chainValid: source.cachedChainValid ?? null, risks: source.getRiskRegister(),
    agentHealth: source.getAgentHealth(), governanceModeState: source.getGovernanceMode(),
    recentModeTransitions: source.getModeTransitions(), education: source.getEducation(),
    generatedAt: new Date().toISOString(),
  };
}

function buildBootstrapState(source: HubPayloadSource, artifacts: WorkspaceArtifactSnapshot) {
  return {
    skillsInstalled: artifacts.qorLogicInstall.anyInstalled,
    governanceInitialized: fs.existsSync(path.join(source.workspaceRoot, "docs", "CONCEPT.md")),
    workspaceName: path.basename(source.workspaceRoot),
    systemState: artifacts.systemState,
    qorLogicInstall: artifacts.qorLogicInstall,
  };
}

export function assembleServiceHubPayload(
  source: HubPayloadSource,
  state: HubPayloadState,
): Record<string, unknown> {
  return assembleHubPayload({
    base: buildServiceBase(source, state), artifacts: state.artifacts,
    liveVerdicts: source.getRecentVerdicts(10),
    ledgerVerdicts: state.artifacts.ledgerVerdicts,
    liveCompletions: buildRecentCompletions((limit) =>
      source.getRecentCheckpoints(limit) as Array<Record<string, unknown>>),
    ledgerCompletions: state.artifacts.ledgerCompletions,
  });
}
import * as fs from "fs";
import * as path from "path";
import {
  buildMetricIntegrity, buildUnattributedFileActivity, buildRepoCompliance,
  buildRiskSummary, buildRecentCompletions,
} from "../ConsoleServerHub";
import type { WorkspaceArtifactSnapshot } from "./WorkspaceArtifactBuilder";
