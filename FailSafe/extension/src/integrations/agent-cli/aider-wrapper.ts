/**
 * aider-wrapper — FailSafe wrapper for the Aider CLI (#107, #475). Detects
 * `aider`, refuses to start without write authorization, and runs it in a
 * disposable worktree (isolated-run.ts) with auto-commit always off. Whatever
 * Aider changes is held as a quarantined change set; it reaches the workspace
 * only through the operator's Apply (agent-run-promotion.ts).
 *
 * Verified surface (issue #107): Aider git integration + `--message` scripting.
 * Flags verified against https://aider.chat/docs/config/options.html + upstream
 * aider/args.py: `--message`/`-m`, `--no-auto-commits`, `--yes-always` (NOT
 * `--yes` — no such flag exists), `--version`. See
 * docs/integrations/INTEGRATION_DOCS_INDEX.md.
 */

import type { RiskGrade } from '../../shared/types/risk';
import { type AgentRunFn, type AgentRunOutcome, blockedOutcome, detectBinary, isolatedOutcome } from './agent-cli-core';
import { runIsolated, type IsolatedRunDeps } from './isolated-run';

export async function detectAider(run: AgentRunFn): Promise<{ available: boolean; version?: string }> {
  return detectBinary('aider', ['--version'], run);
}

/** Pure argv builder. Auto-commit is always off: changes stay in the worktree for capture. */
export function buildAiderArgs(prompt: string): string[] {
  return ['--message', prompt, '--yes-always', '--no-auto-commits'];
}

export interface AiderRunOptions {
  prompt: string;
  cwd: string;
  /** Permit an isolated run whose output can be reviewed for promotion. */
  writesAllowed: boolean;
  timeoutMs: number;
}

export interface AiderDeps extends Omit<IsolatedRunDeps, 'timeoutMs'> {
  classify: (path: string) => RiskGrade;
  issuedAt: string;
}

/** Govern an Aider run: refuse without authorization, else run isolated and quarantine. */
export async function runAiderGoverned(opts: AiderRunOptions, deps: AiderDeps): Promise<AgentRunOutcome> {
  const det = await detectAider(deps.run);
  if (!det.available) return { available: false, spawned: false, error: '`aider` not found on PATH' };
  const argv = buildAiderArgs(opts.prompt);
  if (!opts.writesAllowed) {
    return blockedOutcome('aider', argv, 'running Aider requires `failsafe.integrations.aider.allowWrites`', 'L2', deps.issuedAt);
  }
  const r = await runIsolated(opts.cwd, { cmd: 'aider', args: argv }, { ...deps, timeoutMs: opts.timeoutMs });
  return isolatedOutcome('aider', argv, r, deps);
}
