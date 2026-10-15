/**
 * agent-cli-core — shared substrate for FailSafe's CLI agent-wrapper integrations
 * (Group B: Continue #104, Aider #107). Detects the binary, classifies the risk
 * of a quarantined change set, and emits a receipt. The run itself happens in a
 * disposable worktree (isolated-run.ts, #475); nothing here writes the workspace.
 *
 * argv-form ONLY — the runner spawns with `shell: false`; command strings are
 * never constructed (no shell-injection surface). Secrets (API keys) travel via
 * the child ENV, never argv and never the receipt.
 */

import { createHash } from 'crypto';
import { spawn } from 'child_process';
import type { RiskGrade } from '../../shared/types/risk';
import type { IsolatedRunResult, RunStatus } from './isolated-run';
import type { QuarantinedChangeSet } from './agent-run-promotion';

/** argv-form process runner. `opts.env` carries secrets to the child only.
 *  `onSpawn` receives the child PID so the process tree can be tracked;
 *  `detached` makes the child a process-group leader (POSIX). Injected in
 *  tests; `defaultAgentRun` in prod. */
export interface AgentRunResult { stdout: string; stderr: string; code: number | null }
export interface AgentRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: Buffer | string;
  detached?: boolean;
  onSpawn?: (pid: number) => void;
}
export type AgentRunFn = (cmd: string, args: ReadonlyArray<string>, opts?: AgentRunOptions) => Promise<AgentRunResult>;

const RISK_ORDER: Record<RiskGrade, number> = { L1: 1, L2: 2, L3: 3 };

/** Max (most severe) of two risk grades. */
export function maxRisk(a: RiskGrade, b: RiskGrade): RiskGrade {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export interface DetectResult { available: boolean; version?: string }

/** Detect a CLI binary + version via `<cmd> <versionArgs>`. available iff exit 0. */
export async function detectBinary(
  cmd: string,
  versionArgs: ReadonlyArray<string>,
  run: AgentRunFn,
): Promise<DetectResult> {
  try {
    const res = await run(cmd, versionArgs);
    if (res.code !== 0) return { available: false };
    const m = /\d+\.\d+(?:\.\d+)?/.exec(`${res.stdout} ${res.stderr}`);
    return { available: true, version: m ? m[0] : undefined };
  } catch {
    return { available: false };
  }
}

export interface DiffSummary { files: number; additions: number; deletions: number; paths: string[] }

export const EMPTY_DIFF: DiffSummary = { files: 0, additions: 0, deletions: 0, paths: [] };

/** Classify a change set's risk = the MAX tier across its changed paths, using the
 *  injected classifier (PolicyEngine.classifyRisk at runtime). Empty = L1. */
export function classifyDiffRisk(summary: DiffSummary, classify: (path: string) => RiskGrade): RiskGrade {
  let grade: RiskGrade = 'L1';
  for (const p of summary.paths) grade = maxRisk(grade, classify(p));
  return grade;
}

export interface AgentReceipt {
  receiptId: string;
  agent: string;
  /** argv actually spawned — secrets never travel in argv, so this is safe. */
  argv: string[];
  status: RunStatus;
  statusReason: string;
  riskGrade: RiskGrade;
  exitCode: number | null;
  diff: DiffSummary;
  baseHead?: string;
  patchSha256?: string;
  evidence: Array<{ kind: string; ref: string; summary?: string }>;
  issuedAt: string;
  issuedBy: string;
}

/** Build a receipt (conforms to the FailSafe receipt contract shape). Pure:
 *  `issuedAt` is injected so the receipt is deterministic in tests. The receipt
 *  records argv (never env) so no API key can leak through it. */
export function buildAgentReceipt(input: {
  agent: string;
  argv: string[];
  status: RunStatus;
  reason: string;
  riskGrade: RiskGrade;
  exitCode: number | null;
  diff: DiffSummary;
  baseHead?: string;
  patchSha256?: string;
  issuedAt: string;
  issuedBy?: string;
}): AgentReceipt {
  const issuedBy = input.issuedBy ?? `did:failsafe:agent:${input.agent}`;
  const receiptId = createHash('sha256')
    .update(`${input.agent}|${input.issuedAt}|${input.status}|${input.patchSha256 ?? ''}|${input.argv.join(' ')}`)
    .digest('hex')
    .slice(0, 32);
  return {
    receiptId,
    agent: input.agent,
    argv: input.argv,
    status: input.status,
    statusReason: input.reason,
    riskGrade: input.riskGrade,
    exitCode: input.exitCode,
    diff: input.diff,
    baseHead: input.baseHead,
    patchSha256: input.patchSha256,
    evidence: [{ kind: 'cli_agent_quarantine', ref: `${input.diff.files} file(s)`, summary: `+${input.diff.additions}/-${input.diff.deletions}` }],
    issuedAt: input.issuedAt,
    issuedBy,
  };
}

/** Outcome of a governed agent command (both wrappers + the command layer). */
export interface AgentRunOutcome {
  available: boolean;
  spawned: boolean;
  status?: RunStatus;
  reason?: string;
  details?: string[];
  riskGrade?: RiskGrade;
  diff?: DiffSummary;
  receipt?: AgentReceipt;
  stdout?: string;
  error?: string;
  cleanupError?: string;
  /** In-memory change set; present only for QUARANTINED_PENDING_APPROVAL. */
  changeSet?: QuarantinedChangeSet;
}

/** Outcome for a run refused before any process started. */
export function blockedOutcome(agent: string, argv: string[], reason: string, riskGrade: RiskGrade, issuedAt: string): AgentRunOutcome {
  const status: RunStatus = 'BLOCKED_PRE_EXECUTION';
  return {
    available: true, spawned: false, status, reason, details: [], riskGrade, diff: EMPTY_DIFF,
    receipt: buildAgentReceipt({ agent, argv, status, reason, riskGrade, exitCode: null, diff: EMPTY_DIFF, issuedAt }),
  };
}

/** Outcome for an isolated run; risk = max(pre-run floor, every touched path). */
export function isolatedOutcome(
  agent: string, argv: string[], r: IsolatedRunResult,
  ctx: { classify: (path: string) => RiskGrade; issuedAt: string; riskFloor?: RiskGrade },
): AgentRunOutcome {
  const riskGrade = maxRisk(ctx.riskFloor ?? 'L1', classifyDiffRisk(r.stats, ctx.classify));
  const receipt = buildAgentReceipt({
    agent, argv, status: r.status, reason: r.reason, riskGrade, exitCode: r.exitCode, diff: r.stats,
    baseHead: r.baseHead, patchSha256: r.patchSha256, issuedAt: ctx.issuedAt,
  });
  let changeSet: QuarantinedChangeSet | undefined;
  if (r.status === 'QUARANTINED_PENDING_APPROVAL' && r.patch && r.patchSha256 && r.root && r.baseHead && r.preSnapshot) {
    changeSet = {
      receiptId: receipt.receiptId, agent, root: r.root, baseHead: r.baseHead, preSnapshot: r.preSnapshot,
      patch: r.patch, patchSha256: r.patchSha256, stats: r.stats,
    };
  }
  return {
    available: true, spawned: r.agentStarted, status: r.status, reason: r.reason, details: r.details, riskGrade,
    diff: r.stats, receipt, stdout: r.stdout, cleanupError: r.cleanupError, changeSet,
  };
}

/** Spawn any executable argv-form (`shell: false`) and collect its output. */
export function spawnAgentProcess(cmd: string, args: ReadonlyArray<string>, opts?: AgentRunOptions): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, [...args], {
        shell: false, windowsHide: true, cwd: opts?.cwd, env: opts?.env ?? process.env, detached: opts?.detached ?? false,
      });
    } catch (err) {
      resolve({ stdout: '', stderr: String(err), code: 127 });
      return;
    }
    if (child.pid !== undefined) opts?.onSpawn?.(child.pid);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.stdin?.on('error', () => { /* the agent may close stdin early */ });
    child.on('error', (err) => resolve({ stdout, stderr: `${stderr}${String(err)}`, code: 127 }));
    child.on('close', (code: number | null) => resolve({ stdout, stderr, code }));
    if (opts?.input !== undefined) child.stdin?.end(opts.input); else child.stdin?.end();
  });
}

const PRODUCTION_AGENTS = new Set(['aider', 'cn']);

/** Default runner (production): only the supported agent CLIs, argv-form. */
export const defaultAgentRun: AgentRunFn = (cmd, args, opts) =>
  PRODUCTION_AGENTS.has(cmd)
    ? spawnAgentProcess(cmd, args, opts)
    : Promise.resolve({ stdout: '', stderr: `Unsupported agent executable: ${cmd}`, code: 126 });
