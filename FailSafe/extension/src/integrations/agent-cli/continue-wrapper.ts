/**
 * continue-wrapper — FailSafe governance wrapper for the Continue headless CLI
 * (`cn`, #104). Detects `cn`, maps the requested `--allow` tool allowlist to a
 * FailSafe risk tier, gates BEFORE spawning (a write/shell allowlist never runs
 * un-approved), runs argv-form with the API key in the child ENV only, then
 * classifies the produced diff and routes any surprise L3 change to escalation.
 *
 * Verified surface (issue #104): `cn -p <prompt>` headless, `CONTINUE_API_KEY`
 * env, explicit `--allow <tool>` permissions. The API key is NEVER placed in
 * argv or the receipt — only in the child env.
 */

import type { RiskGrade } from '../../shared/types/risk';
import {
  type AgentRunFn, type AgentRunOutcome,
  detectBinary, captureGitDiff, summarizeDiff, classifyDiffRisk, decideAgentRun,
  buildAgentReceipt, maxRisk,
} from './agent-cli-core';

/** Tool-name fragments that imply shell/exec power (highest tier). */
const SHELL_TOOLS = ['shell', 'exec', 'bash', 'command', 'run', 'terminal', 'process'];
/** Tool-name fragments that imply file writes (medium tier). */
const WRITE_TOOLS = ['write', 'edit', 'create', 'apply', 'delete', 'patch', 'insert'];

/** Map a Continue `--allow` tool allowlist to a FailSafe risk tier (max across
 *  entries). shell/exec → L3, file-write → L2, read-only/empty → L1. */
export function mapAllowlistToRisk(allow: ReadonlyArray<string>): RiskGrade {
  let grade: RiskGrade = 'L1';
  for (const raw of allow) {
    const t = (raw || '').toLowerCase();
    if (SHELL_TOOLS.some((s) => t.includes(s))) grade = maxRisk(grade, 'L3');
    else if (WRITE_TOOLS.some((s) => t.includes(s))) grade = maxRisk(grade, 'L2');
  }
  return grade;
}

/** Pure argv builder. argv only — the API key is NOT here (it goes via env). */
export function buildContinueArgs(prompt: string, allow: ReadonlyArray<string>): string[] {
  const args = ['-p', prompt];
  for (const tool of allow) args.push('--allow', tool);
  return args;
}

export async function detectContinue(run: AgentRunFn): Promise<{ available: boolean; version?: string }> {
  return detectBinary('cn', ['--version'], run);
}

export interface ContinueRunOptions {
  prompt: string;
  allow: ReadonlyArray<string>;
  apiKey?: string;
  cwd: string;
  writesAllowed: boolean;
  /** Base environment to inherit (the API key is overlaid onto this). */
  baseEnv?: Record<string, string | undefined>;
}

export interface ContinueDeps {
  run: AgentRunFn;
  classify: (path: string) => RiskGrade;
  issuedAt: string;
}

export type { AgentRunOutcome };

/**
 * Govern a Continue headless run. Two-phase gate: the allowlist tier is checked
 * BEFORE spawning (a write/shell allowlist that is L3, or any write when writes
 * are disallowed, never spawns); only an auto-approve allowlist runs, after
 * which the actual diff is re-classified and a surprise L3 change escalates.
 */
export async function runContinueGoverned(opts: ContinueRunOptions, deps: ContinueDeps): Promise<AgentRunOutcome> {
  const det = await detectContinue(deps.run);
  if (!det.available) return { available: false, spawned: false, error: '`cn` (Continue CLI) not found on PATH' };

  const argv = buildContinueArgs(opts.prompt, opts.allow);
  const allowlistRisk = mapAllowlistToRisk(opts.allow);

  // Phase 1 — pre-run gate on the requested tool permissions.
  const pre = decideAgentRun(allowlistRisk, { writesAllowed: opts.writesAllowed });
  if (pre.verdict !== 'ALLOW') {
    const receipt = buildAgentReceipt({ agent: 'continue', argv, decision: pre, exitCode: null, diff: { files: 0, additions: 0, deletions: 0, paths: [] }, issuedAt: deps.issuedAt });
    return { available: true, spawned: false, decision: pre, receipt };
  }

  // Phase 2 — run argv-form; API key in the child ENV only (never argv/receipt).
  const env = { ...(opts.baseEnv ?? {}), ...(opts.apiKey ? { CONTINUE_API_KEY: opts.apiKey } : {}) };
  const res = await deps.run('cn', argv, { cwd: opts.cwd, env });

  const diff = summarizeDiff(await captureGitDiff(deps.run, opts.cwd));
  const finalRisk = maxRisk(allowlistRisk, classifyDiffRisk(diff, deps.classify));
  const decision = decideAgentRun(finalRisk, { writesAllowed: opts.writesAllowed });
  const receipt = buildAgentReceipt({ agent: 'continue', argv, decision, exitCode: res.code, diff, issuedAt: deps.issuedAt });
  return { available: true, spawned: true, decision, diff, receipt, stdout: res.stdout };
}
