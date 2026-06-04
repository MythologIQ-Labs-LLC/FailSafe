/**
 * aider-wrapper — FailSafe git-gate wrapper for the Aider CLI (#107). Detects
 * `aider`, refuses a dirty worktree unless explicitly allowed, runs argv-form
 * with auto-commit OFF by default (changes stay uncommitted for review),
 * captures the before/after diff robustly even when Aider exits non-zero, and
 * routes a high-risk (L3) diff to escalation.
 *
 * Verified surface (issue #107): Aider git integration + `--message` scripting.
 * Flags verified against https://aider.chat/docs/config/options.html + upstream
 * aider/args.py: `--message`/`-m`, `--no-auto-commits`/`--auto-commits`,
 * `--yes-always` (NOT `--yes` — no such flag exists), `--version`. See
 * docs/integrations/INTEGRATION_DOCS_INDEX.md.
 */

import type { RiskGrade } from '../../shared/types/risk';
import {
  type AgentRunFn, type DiffSummary, type AgentReceipt, type AgentDecision, type AgentRunOutcome,
  detectBinary, captureGitDiff, summarizeDiff, classifyDiffRisk, decideAgentRun,
  buildAgentReceipt, isWorktreeDirty,
} from './agent-cli-core';

export async function detectAider(run: AgentRunFn): Promise<{ available: boolean; version?: string }> {
  return detectBinary('aider', ['--version'], run);
}

/** Pure argv builder. Auto-commit is OFF unless `autoCommit` is explicitly set. */
export function buildAiderArgs(prompt: string, opts: { autoCommit?: boolean } = {}): string[] {
  const args = ['--message', prompt, '--yes-always'];
  args.push(opts.autoCommit ? '--auto-commits' : '--no-auto-commits');
  return args;
}

export interface AiderRunOptions {
  prompt: string;
  cwd: string;
  /** Allow running against a dirty worktree (default false → refuse). */
  allowDirty?: boolean;
  /** Enable Aider auto-commit (default false). */
  autoCommit?: boolean;
  writesAllowed: boolean;
}

export interface AiderDeps {
  run: AgentRunFn;
  classify: (path: string) => RiskGrade;
  issuedAt: string;
}

const EMPTY_DIFF: DiffSummary = { files: 0, additions: 0, deletions: 0, paths: [] };

function receiptFor(decision: AgentDecision, argv: string[], exitCode: number | null, diff: DiffSummary, issuedAt: string): AgentReceipt {
  return buildAgentReceipt({ agent: 'aider', argv, decision, exitCode, diff, issuedAt });
}

/**
 * Govern an Aider run. Pre-run gate: refuse a dirty worktree unless allowed
 * (BLOCK, no spawn). Then run argv-form (auto-commit off), capture the resulting
 * diff robustly, classify it, and decide ALLOW / BLOCK / ESCALATE-to-L3.
 */
export async function runAiderGoverned(opts: AiderRunOptions, deps: AiderDeps): Promise<AgentRunOutcome> {
  const det = await detectAider(deps.run);
  if (!det.available) return { available: false, spawned: false, error: '`aider` not found on PATH' };

  const argv = buildAiderArgs(opts.prompt, { autoCommit: opts.autoCommit });

  // Pre-run gate: dirty worktree refusal.
  if (!opts.allowDirty && (await isWorktreeDirty(deps.run, opts.cwd))) {
    const decision: AgentDecision = { verdict: 'BLOCK', reason: 'worktree has uncommitted changes; refusing to run Aider (set allowDirty to override)', riskGrade: 'L1' };
    return { available: true, spawned: false, decision, receipt: receiptFor(decision, argv, null, EMPTY_DIFF, deps.issuedAt) };
  }

  // Run argv-form; auto-commit off so changes stay uncommitted for the gate.
  const res = await deps.run('aider', argv, { cwd: opts.cwd });

  // Capture the diff robustly even if Aider exited non-zero.
  const diff = summarizeDiff(await captureGitDiff(deps.run, opts.cwd));
  const risk = classifyDiffRisk(diff, deps.classify);
  const decision = decideAgentRun(risk, { writesAllowed: opts.writesAllowed });
  return { available: true, spawned: true, decision, diff, receipt: receiptFor(decision, argv, res.code, diff, deps.issuedAt), stdout: res.stdout };
}
