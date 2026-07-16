/**
 * agent-cli-core — shared substrate for FailSafe's CLI agent-wrapper integrations
 * (Group B: Continue #104, Aider #107). Governs a headless coding-agent CLI by
 * (1) detecting the binary, (2) classifying the risk of the diff it produces,
 * (3) deciding ALLOW / BLOCK / ESCALATE-to-L3, and (4) emitting a receipt.
 *
 * Everything here is pure given an injected runner (`AgentRunFn`), so no live
 * process is spawned in tests. argv-form ONLY — the runner spawns with
 * `shell: false`; command strings are never constructed (no shell-injection
 * surface). Secrets (API keys) travel via the child ENV, never argv and never
 * the receipt.
 */

import { createHash } from 'crypto';
import { spawn } from 'child_process';
import type { RiskGrade } from '../../shared/types/risk';

/** argv-form process runner. `opts.env` carries secrets to the child only.
 *  Mirrors PythonInterpreterResolver's RunCommand but adds cwd/env (needed for
 *  git cwd + agent API-key env). Injected in tests; `defaultAgentRun` in prod. */
export interface AgentRunResult { stdout: string; stderr: string; code: number | null }
export type AgentRunFn = (
  cmd: string,
  args: ReadonlyArray<string>,
  opts?: { cwd?: string; env?: Record<string, string | undefined> },
) => Promise<AgentRunResult>;

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

/** True if the worktree has uncommitted changes (`git status --porcelain`). */
export async function isWorktreeDirty(run: AgentRunFn, cwd: string): Promise<boolean> {
  const res = await run('git', ['status', '--porcelain'], { cwd });
  return !!res.stdout.trim();
}

/** Capture the working-tree diff. Robust: returns whatever git produced even on
 *  a non-zero exit (e.g. when the agent itself failed mid-edit). */
export async function captureGitDiff(run: AgentRunFn, cwd: string): Promise<string> {
  try {
    const res = await run('git', ['diff'], { cwd });
    return res.stdout ?? '';
  } catch {
    return '';
  }
}

export interface DiffSummary { files: number; additions: number; deletions: number; paths: string[] }

/** Pure parse of a unified `git diff` into a summary (files, +/- lines, paths). */
export function summarizeDiff(diff: string): DiffSummary {
  if (!diff || !diff.trim()) return { files: 0, additions: 0, deletions: 0, paths: [] };
  const paths: string[] = [];
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      if (m) paths.push(m[2]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }
  return { files: paths.length, additions, deletions, paths };
}

/** Classify a diff's risk = the MAX tier across its changed paths, using the
 *  injected classifier (PolicyEngine.classifyRisk at runtime). Empty diff = L1. */
export function classifyDiffRisk(summary: DiffSummary, classify: (path: string) => RiskGrade): RiskGrade {
  let grade: RiskGrade = 'L1';
  for (const p of summary.paths) grade = maxRisk(grade, classify(p));
  return grade;
}

export type AgentVerdict = 'ALLOW' | 'BLOCK' | 'ESCALATE';

export interface AgentDecision { verdict: AgentVerdict; reason: string; riskGrade: RiskGrade }

/**
 * Deterministic gate decision for an agent run that produced `riskGrade`:
 *   L3                       → ESCALATE (route to the L3 approval queue)
 *   writes not permitted     → BLOCK
 *   otherwise                → ALLOW
 */
export function decideAgentRun(riskGrade: RiskGrade, opts: { writesAllowed: boolean }): AgentDecision {
  if (riskGrade === 'L3') {
    return { verdict: 'ESCALATE', reason: 'L3-risk change requires human (L3) approval', riskGrade };
  }
  if (!opts.writesAllowed) {
    return { verdict: 'BLOCK', reason: 'writes are not permitted in the current governance mode', riskGrade };
  }
  return { verdict: 'ALLOW', reason: 'within auto-approve risk tier', riskGrade };
}

export interface AgentReceipt {
  receiptId: string;
  agent: string;
  /** argv actually spawned — secrets never travel in argv, so this is safe. */
  argv: string[];
  verdict: AgentVerdict;
  verdictRationale: string;
  riskGrade: RiskGrade;
  exitCode: number | null;
  diff: DiffSummary;
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
  decision: AgentDecision;
  exitCode: number | null;
  diff: DiffSummary;
  issuedAt: string;
  issuedBy?: string;
}): AgentReceipt {
  const issuedBy = input.issuedBy ?? `did:failsafe:agent:${input.agent}`;
  const receiptId = createHash('sha256')
    .update(`${input.agent}|${input.issuedAt}|${input.diff.files}|${input.diff.additions}|${input.diff.deletions}|${input.argv.join(' ')}`)
    .digest('hex')
    .slice(0, 32);
  return {
    receiptId,
    agent: input.agent,
    argv: input.argv,
    verdict: input.decision.verdict,
    verdictRationale: input.decision.reason,
    riskGrade: input.decision.riskGrade,
    exitCode: input.exitCode,
    diff: input.diff,
    evidence: [{ kind: 'cli_agent_diff', ref: `${input.diff.files} file(s)`, summary: `+${input.diff.additions}/-${input.diff.deletions}` }],
    issuedAt: input.issuedAt,
    issuedBy,
  };
}

/** Shared outcome shape for a governed agent run (used by both wrappers + the
 *  command layer). */
export interface AgentRunOutcome {
  available: boolean;
  spawned: boolean;
  decision?: AgentDecision;
  diff?: DiffSummary;
  receipt?: AgentReceipt;
  stdout?: string;
  error?: string;
}

/** The L3 approval request a CLI-agent escalation enqueues (matches the
 *  `Omit<L3ApprovalRequest, 'id'|'state'|'queuedAt'|'slaDeadline'>` accepted by
 *  QorLogicManager.queueL3Approval). Pure builder so the escalation request
 *  shape is unit-testable without the vscode/command layer. */
export interface L3EscalationRequest {
  filePath: string;
  riskGrade: 'L3';
  agentDid: string;
  agentTrust: number;
  sentinelSummary: string;
  flags: string[];
  kind: string;
  meta: Record<string, unknown>;
}

/** Build the L3 escalation request from a governed-run outcome. The receipt
 *  (which carries argv but never secrets) rides in `meta`. */
export function buildL3EscalationRequest(agent: string, outcome: AgentRunOutcome): L3EscalationRequest {
  const d = outcome.diff;
  return {
    filePath: d?.paths[0] ?? `<${agent}-run>`,
    riskGrade: 'L3',
    agentDid: `did:failsafe:agent:${agent}`,
    agentTrust: 0.5,
    sentinelSummary: `${agent} CLI produced an L3-risk change (${d?.files ?? 0} file(s), +${d?.additions ?? 0}/-${d?.deletions ?? 0}). ${outcome.decision?.reason ?? ''}`.trim(),
    flags: ['cli-agent', agent],
    kind: 'cli-agent-run',
    meta: { receipt: outcome.receipt },
  };
}

/** Default argv-form runner (production). `shell: false` — no shell-injection
 *  surface. cwd/env optional; env carries secrets to the child only. */
export const defaultAgentRun: AgentRunFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    const spawnOptions = {
      shell: false as const,
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
    };
    const argv = [...args];
    const child = cmd === 'git'
      ? spawn('git', argv, spawnOptions)
      : cmd === 'aider'
        ? spawn('aider', argv, spawnOptions)
        : cmd === 'cn'
          ? spawn('cn', argv, spawnOptions)
          : null;
    if (!child) {
      resolve({ stdout: '', stderr: `Unsupported agent executable: ${cmd}`, code: 126 });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', () => resolve({ stdout, stderr, code: 127 }));
    child.on('close', (code: number | null) => resolve({ stdout, stderr, code }));
  });
