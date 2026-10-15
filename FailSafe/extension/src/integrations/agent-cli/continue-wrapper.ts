/**
 * continue-wrapper — FailSafe wrapper for the Continue headless CLI (`cn`, #104,
 * #475). Detects `cn`, maps the requested `--allow` tool allowlist to a risk
 * tier, refuses before spawning when writes are not authorized or the allowlist
 * grants shell/exec tools (a shell can write outside the isolated worktree), and
 * otherwise runs `cn` in a disposable worktree. Its changes are quarantined and
 * reach the workspace only through the operator's Apply.
 *
 * Verified surface (issue #104): `cn -p <prompt>` headless, `CONTINUE_API_KEY`
 * env, explicit `--allow <tool>` permissions. The API key is NEVER placed in
 * argv or the receipt — only in the child env.
 */

import type { RiskGrade } from '../../shared/types/risk';
import {
  type AgentRunFn, type AgentRunOutcome, type ResolveAgentFn, blockedOutcome, detectBinary, isolatedOutcome, maxRisk,
} from './agent-cli-core';
import { runIsolated, type IsolatedRunDeps } from './isolated-run';

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

/** Detect `cn` on PATH outside `workspaceRoot`. On Windows only cn.exe / cn.com
 *  count: the npm shim cn.cmd cannot run without a shell, so it is unavailable. */
export async function detectContinue(run: AgentRunFn, workspaceRoot: string, resolve?: ResolveAgentFn): Promise<{ available: boolean; version?: string }> {
  return detectBinary('cn', ['--version'], run, { workspaceRoot, resolve });
}

export interface ContinueRunOptions {
  prompt: string;
  allow: ReadonlyArray<string>;
  apiKey?: string;
  cwd: string;
  /** Permit an isolated run whose output can be reviewed for promotion. */
  writesAllowed: boolean;
  timeoutMs: number;
  /** Base environment to inherit (the API key is overlaid onto this). */
  baseEnv?: Record<string, string | undefined>;
}

export interface ContinueDeps extends Omit<IsolatedRunDeps, 'timeoutMs'> {
  classify: (path: string) => RiskGrade;
  issuedAt: string;
  /** Injected in tests; `resolveAgentExecutable` in production. */
  resolve?: ResolveAgentFn;
}

export type { AgentRunOutcome };

/** Govern a Continue headless run: pre-spawn gate on authorization and the
 *  allowlist, then an isolated run whose changes are quarantined. */
export async function runContinueGoverned(opts: ContinueRunOptions, deps: ContinueDeps): Promise<AgentRunOutcome> {
  const det = await detectContinue(deps.run, opts.cwd, deps.resolve);
  if (!det.available) return { available: false, spawned: false, error: '`cn` (Continue CLI) not found on PATH outside the workspace, or `cn --version` failed' };

  const argv = buildContinueArgs(opts.prompt, opts.allow);
  const allowlistRisk = mapAllowlistToRisk(opts.allow);
  if (!opts.writesAllowed) {
    return blockedOutcome('continue', argv, 'running Continue requires `failsafe.integrations.continue.allowWrites`', maxRisk(allowlistRisk, 'L2'), deps.issuedAt);
  }
  if (allowlistRisk === 'L3') {
    return blockedOutcome('continue', argv, 'the allowlist grants shell/exec tools, which can write outside the isolated worktree; FailSafe does not run them', 'L3', deps.issuedAt);
  }

  // API key in the child ENV only (never argv/receipt).
  const env = { ...(opts.baseEnv ?? {}), ...(opts.apiKey ? { CONTINUE_API_KEY: opts.apiKey } : {}) };
  const r = await runIsolated(opts.cwd, { cmd: 'cn', args: argv, env }, { ...deps, timeoutMs: opts.timeoutMs });
  return isolatedOutcome('continue', argv, r, { ...deps, riskFloor: allowlistRisk });
}
