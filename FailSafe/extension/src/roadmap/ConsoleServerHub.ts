/**
 * ConsoleServerHub — Hub snapshot builder
 *
 * Extracted from ConsoleServer.ts to satisfy Section 4 Razor.
 * Receives dependencies via parameter object (no class coupling).
 */

import * as path from "path";
import * as fs from "fs";
import {
  buildGovernanceState,
  type GovernanceState,
} from "./services/GovernancePhaseTracker";
import {
  auditWorkspace,
} from "./services/RepoGovernanceService";

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

type QorRuntimeSnapshot = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  policyVersion?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
};

export interface HubSnapshotDeps {
  workspaceRoot: string;
  chainValidAt: string | null;
  unattributedFileChanges: UnattributedFileChange[];
  ideTracker: { getRunState: (phase?: string) => Record<string, unknown> } | null;
  getRecentVerdicts: (limit: number) => Array<Record<string, unknown>>;
  getRecentCheckpoints: (limit: number) => Array<Record<string, unknown>>;
}

// ── Governance phase ────────────────────────────────────────────────
const IDLE_STATE: GovernanceState = { current: "IDLE", recentCompletions: [], nextSteps: [], activeAlerts: [] };
let lastKnownGovState: GovernanceState | null = null;

function readLedgerTail(filePath: string, bytes: number = 4096): string {
  const stat = fs.statSync(filePath);
  if (stat.size <= bytes) return fs.readFileSync(filePath, "utf-8");
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    fs.readSync(fd, buf, 0, bytes, stat.size - bytes);
    return buf.toString("utf-8");
  } finally {
    fs.closeSync(fd);
  }
}

export function buildGovernancePhase(workspaceRoot: string): GovernanceState {
  const ledgerPath = path.join(workspaceRoot, "docs", "META_LEDGER.md");
  if (!fs.existsSync(ledgerPath)) return IDLE_STATE;
  try {
    const content = readLedgerTail(ledgerPath);
    const state = buildGovernanceState(content);
    lastKnownGovState = state;
    return state;
  } catch (err) {
    console.warn("[GovernancePhase] Failed to read META_LEDGER:", (err as Error).message);
    return lastKnownGovState ?? IDLE_STATE;
  }
}

// ── Metric integrity ────────────────────────────────────────────────

export function buildMetricIntegrity(
  governancePhase: GovernanceState,
  checkpointSummary: Record<string, unknown>,
  sentinelStatus: { eventsProcessed?: number },
  runState: { activeTasks?: unknown[]; activeDebugSessions?: unknown[] },
  deps: Pick<HubSnapshotDeps, "chainValidAt" | "unattributedFileChanges">,
): MetricIntegrityRow[] {
  const chainVerified = checkpointSummary.chainValidAt || deps.chainValidAt;
  const ideSignals =
    (runState.activeTasks?.length || 0) + (runState.activeDebugSessions?.length || 0);
  const unattributed = buildUnattributedFileActivity(deps.unattributedFileChanges);
  const attributionBasis = unattributed.count > 0
    ? `observed ${unattributed.count} recent file changes without a governed actor`
    : "only authoritative for instrumented governance events";
  return [
    { id: "seal", label: "Seal State", status: "authoritative", basis: `META_LEDGER -> ${governancePhase.current}` },
    { id: "chain", label: "Chain Validity", status: chainVerified ? "authoritative" : "unknown", basis: chainVerified ? "checkpoint verification" : "not yet verified this session" },
    { id: "sentinel", label: "Sentinel Event Count", status: "authoritative", basis: `local daemon/checkpoints -> ${sentinelStatus.eventsProcessed || 0}` },
    { id: "ide", label: "IDE Activity", status: ideSignals > 0 ? "inferred" : "unknown", basis: ideSignals > 0 ? "task/debug lifecycle events" : "no active IDE telemetry" },
    { id: "file-actor", label: "File-to-Agent Attribution", status: unattributed.count > 0 ? "unknown" : "inferred", basis: attributionBasis },
  ];
}

// ── Unattributed file activity ──────────────────────────────────────

export function buildUnattributedFileActivity(
  changes: UnattributedFileChange[],
): { count: number; lastAt: string | null; recent: UnattributedFileChange[] } {
  return {
    count: changes.length,
    lastAt: changes.length ? changes[changes.length - 1].timestamp : null,
    recent: [...changes].reverse(),
  };
}

// ── Repo compliance ─────────────────────────────────────────────────

export function buildRepoCompliance(workspaceRoot: string): {
  score: number;
  maxScore: number;
  percentage: number;
  grade: string;
  errors: number;
  warnings: number;
  topViolations: Array<{ message: string; severity: string }>;
} {
  try {
    const report = auditWorkspace(workspaceRoot);
    return {
      score: report.score,
      maxScore: report.maxScore,
      percentage: report.percentage,
      grade: report.grade,
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      topViolations: report.violations
        .filter((v) => v.severity !== "info")
        .slice(0, 5)
        .map((v) => ({ message: v.message, severity: v.severity })),
    };
  } catch {
    return {
      score: 0, maxScore: 100, percentage: 0, grade: "F",
      errors: 0, warnings: 0, topViolations: [],
    };
  }
}

// ── Trust summary ───────────────────────────────────────────────────

export function buildTrustSummary(
  agents: Array<{ trustScore: number; isQuarantined: boolean; trustStage: string }>,
): Record<string, unknown> {
  const totalAgents = agents.length;
  const avgTrust = totalAgents === 0
    ? 0
    : agents.reduce((sum, a) => sum + a.trustScore, 0) / totalAgents;
  const quarantined = agents.filter((a) => a.isQuarantined).length;
  const stageCounts = agents.reduce(
    (counts, a) => {
      counts[a.trustStage] = (counts[a.trustStage] || 0) + 1;
      return counts;
    },
    { CBT: 0, KBT: 0, IBT: 0 } as Record<string, number>,
  );
  return { totalAgents, avgTrust, quarantined, stageCounts };
}

// ── Node status ─────────────────────────────────────────────────────

export function buildNodeStatus(
  sentinel: { running?: boolean; filesWatched?: number; queueDepth?: number; [k: string]: unknown },
  l3Queue: unknown[],
  trust: Record<string, unknown>,
  qor: QorRuntimeSnapshot,
): Array<Record<string, unknown>> {
  return [
    {
      id: "workspace-core", label: "Workspace Core",
      state: sentinel.running ? "nominal" : "paused",
      signal: `${sentinel.filesWatched || 0} files watched`,
    },
    {
      id: "verification-queue", label: "Verification Queue",
      state: l3Queue.length || (sentinel.queueDepth as number) > 0
        ? "reviewing" : "nominal",
      signal: `${l3Queue.length || 0} pending approvals`,
    },
    {
      id: "trust-engine", label: "Trust Engine",
      state: (trust.quarantined as number) > 0 ? "degraded" : "nominal",
      signal: `${Math.round((trust.avgTrust as number) * 100)}% avg trust`,
    },
    {
      id: "qor-runtime", label: "Qor Runtime",
      state: !qor.enabled ? "paused" : qor.connected ? "nominal" : "degraded",
      signal: !qor.enabled
        ? "integration disabled"
        : qor.connected
          ? `connected (${qor.policyVersion || "unknown policy"})`
          : `unreachable (${qor.baseUrl})`,
    },
  ];
}

// ── Hub helper methods ──────────────────────────────────────────────

export function inferActivePhaseTitle(
  activePlan: Record<string, unknown> | null,
  getRecentCheckpoints: (limit: number) => Array<Record<string, unknown>>,
): string | undefined {
  if (!activePlan) {
    const recent = getRecentCheckpoints(1);
    return recent.length > 0 ? (recent[0].phase as string) : undefined;
  }
  if (activePlan.currentPhaseId) return String(activePlan.currentPhaseId);
  const phases = activePlan.phases as Array<{ status: string; title: string }> | undefined;
  return phases?.find((ph) => ph.status === "active")?.title;
}

export function buildRiskSummary(
  getRecentVerdicts: (limit: number) => Array<Record<string, unknown>>,
): Record<string, number> {
  const verdicts = getRecentVerdicts(50);
  const high = verdicts.filter(
    v => ["BLOCK", "ESCALATE", "QUARANTINE"].includes(String(v.decision)),
  ).length;
  const medium = verdicts.filter(v => String(v.decision) === "WARN").length;
  const low = verdicts.filter(v => String(v.decision) === "PASS").length;
  return { high, medium, low };
}

export function buildRecentCompletions(
  getRecentCheckpoints: (limit: number) => Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const completionTypes = new Set([
    "milestone.completed",
    "phase.completed",
    "substantiate.sealed",
  ]);
  return getRecentCheckpoints(20)
    .filter((c) => completionTypes.has(c.checkpointType as string))
    .slice(0, 5)
    .map((c) => ({ type: c.checkpointType, phase: c.phase, at: c.timestamp }));
}
