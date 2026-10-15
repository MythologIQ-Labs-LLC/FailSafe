/**
 * agent-cli-command — registers the governed CLI-agent commands:
 *   `FailSafe: Run Continue (governed)`  (#104)
 *   `FailSafe: Run Aider (governed)`     (#107)
 *
 * The agent runs in a disposable worktree (#475). If it produced changes, they
 * are held in memory as a quarantined change set and the operator chooses, in
 * this same invocation, Discard / Review diff / Apply. Escape or closing the
 * dialog discards. Apply goes through agent-run-promotion. Nothing promotable
 * outlives the invocation; the on-disk audit copy is never read back.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { RiskGrade } from '../shared/types/risk';
import { defaultAgentRun, type AgentRunOutcome } from '../integrations/agent-cli/agent-cli-core';
import { runContinueGoverned } from '../integrations/agent-cli/continue-wrapper';
import { runAiderGoverned } from '../integrations/agent-cli/aider-wrapper';
import {
  applyQuarantined, writeAuditCopy, type PromotionResult, type QuarantinedChangeSet,
} from '../integrations/agent-cli/agent-run-promotion';

interface PolicyClassifier { classifyRisk(filePath: string, content?: string): RiskGrade }
interface LedgerSink {
  appendEntry(request: {
    eventType: 'QUARANTINE_START' | 'QUARANTINE_END' | 'EXTERNAL_DRIFT'; agentDid: string; riskGrade?: RiskGrade;
    artifactHash?: string; overseerDecision?: string; payload?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface AgentCliDeps {
  workspaceRoot: string;
  policyEngine: PolicyClassifier;
  ledger?: LedgerSink;
  /** Directory for write-only audit copies (globalStorageUri/agent-runs). */
  auditDir?: string;
  /** Injected in tests; `applyQuarantined` in production. */
  apply?: (cs: QuarantinedChangeSet) => Promise<PromotionResult>;
}

export const BOUNDARY_NOTE = 'A worktree is not a process sandbox. Writes the agent makes to this repository or its git state '
  + 'are detected at the post-run check and again before Apply, and never promoted, but they have already happened. '
  + 'Writes outside the repository or inside ignored directories are not detected, and a process that escapes tracking '
  + 'can write after those checks undetected. A process escapes on Linux when it clears its environment, leaves the '
  + "agent's process group (setsid or setpgid) and its parent exits between 250 ms samples; on macOS when it leaves the "
  + 'process group and its parent exits between samples; on Windows when it leaves the process tree through a short-lived '
  + 'intermediate between samples; and anywhere when it is started outside the tree (a service, a scheduler or WMI).';

const REVIEW_SCHEME = 'failsafe-agent-run';
const reviews = new Map<string, string>();

const did = (agent: string): string => `did:failsafe:agent:${agent}`;
const listed = (details: string[] | undefined): string => (details?.length ? ` ${details.slice(0, 5).join('; ')}${details.length > 5 ? ` (+${details.length - 5} more)` : ''}` : '');

async function record(deps: AgentCliDeps, entry: Parameters<LedgerSink['appendEntry']>[0]): Promise<void> {
  if (deps.ledger) await deps.ledger.appendEntry(entry);
}

async function openReview(cs: QuarantinedChangeSet): Promise<void> {
  reviews.set(cs.receiptId, cs.patch.toString('utf8'));
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${REVIEW_SCHEME}:/${cs.receiptId}.diff`));
  await vscode.languages.setTextDocumentLanguage(doc, 'diff');
  await vscode.window.showTextDocument(doc, { preview: true });
}

/** Ask the operator; anything but an explicit Apply is a discard. */
async function choose(agent: string, cs: QuarantinedChangeSet, risk: RiskGrade | undefined): Promise<'Apply' | 'Discard'> {
  const summary = `${agent}: ${cs.stats.files} file(s) changed (+${cs.stats.additions}/-${cs.stats.deletions}, risk ${risk ?? 'L1'}) are held in quarantine. Nothing has been written to your workspace.`;
  const first = await vscode.window.showWarningMessage(summary, { modal: true, detail: BOUNDARY_NOTE }, 'Discard', 'Review diff', 'Apply');
  if (first === 'Apply') return 'Apply';
  if (first !== 'Review diff') return 'Discard';
  await openReview(cs);
  const second = await vscode.window.showWarningMessage(`${agent}: reviewing ${cs.stats.files} quarantined file(s). Apply them to the workspace?`, 'Discard', 'Apply');
  return second === 'Apply' ? 'Apply' : 'Discard';
}

async function promote(deps: AgentCliDeps, agent: string, out: AgentRunOutcome, cs: QuarantinedChangeSet): Promise<void> {
  const base = { agentDid: did(agent), riskGrade: out.riskGrade, artifactHash: cs.patchSha256 };
  try {
    await record(deps, { ...base, eventType: 'QUARANTINE_START', payload: { receipt: out.receipt, paths: cs.stats.paths } });
    if (deps.auditDir) writeAuditCopy(deps.auditDir, cs, { receipt: out.receipt });
  } catch (err) {
    vscode.window.showErrorMessage(`${agent}: the run could not be recorded (${err instanceof Error ? err.message : String(err)}); the change set was discarded.`);
    return;
  }
  const choice = await choose(agent, cs, out.riskGrade);
  const result: PromotionResult = choice === 'Apply'
    ? await (deps.apply ?? applyQuarantined)(cs)
    : { status: 'DISCARDED', reason: 'discarded by the operator', details: [] };
  reviews.delete(cs.receiptId);
  try {
    await record(deps, { ...base, eventType: 'QUARANTINE_END', overseerDecision: result.status, payload: { receiptId: cs.receiptId, reason: result.reason, details: result.details } });
  } catch (err) {
    vscode.window.showErrorMessage(`${agent}: ${result.status} could not be recorded in the ledger (${err instanceof Error ? err.message : String(err)}).`);
  }
  const text = `${agent}: ${result.status} — ${result.reason}.${listed(result.details)}`;
  if (result.status === 'APPLIED') vscode.window.showInformationMessage(text);
  else if (result.status === 'DISCARDED') vscode.window.showInformationMessage(`${text} Your workspace is unchanged.`);
  else vscode.window.showErrorMessage(text);
}

/** Act on a governed-run outcome. Exported for direct unit testing (agent-cli-command.test.cjs). */
export async function handleOutcome(deps: AgentCliDeps, agent: string, out: AgentRunOutcome): Promise<void> {
  if (!out.available) { vscode.window.showWarningMessage(`${out.error ?? `${agent} not available`}.`); return; }
  const cleanup = out.cleanupError ? ` (${out.cleanupError})` : '';
  const text = `${agent}: ${out.status} — ${out.reason}.${listed(out.details)}${cleanup}`;
  switch (out.status) {
    case 'QUARANTINED_PENDING_APPROVAL':
      if (out.changeSet) { await promote(deps, agent, out, out.changeSet); return; }
      vscode.window.showErrorMessage(`${agent}: quarantined run has no change set; nothing was applied.`);
      return;
    case 'NO_CHANGES':
    case 'BLOCKED_PRE_EXECUTION':
      vscode.window.showWarningMessage(text);
      return;
    case 'WORKSPACE_CHANGED_DURING_RUN':
      await record(deps, { eventType: 'EXTERNAL_DRIFT', agentDid: did(agent), payload: { receipt: out.receipt, details: out.details } }).catch(() => undefined);
      vscode.window.showErrorMessage(`${text} ${BOUNDARY_NOTE}`);
      return;
    default:
      vscode.window.showErrorMessage(text);
  }
}

function settings(): vscode.WorkspaceConfiguration { return vscode.workspace.getConfiguration('failsafe'); }

export function registerAgentCliCommands(context: vscode.ExtensionContext, deps: AgentCliDeps): void {
  const classify = (p: string): RiskGrade => deps.policyEngine.classifyRisk(p);
  const cwd = deps.workspaceRoot;
  const timeoutMs = (): number => settings().get<number>('integrations.agentCli.timeoutMs', 900000);
  const run = (title: string, task: () => Promise<AgentRunOutcome>): Thenable<AgentRunOutcome> =>
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(REVIEW_SCHEME, {
      provideTextDocumentContent: (uri) => reviews.get(path.posix.basename(uri.path, '.diff')) ?? 'This change set is no longer held; it was applied or discarded.',
    }),

    vscode.commands.registerCommand('failsafe.continue.run', async () => {
      const cfg = settings();
      if (!cfg.get<boolean>('integrations.continue.enabled', false)) { vscode.window.showWarningMessage('Continue integration is disabled. Enable `failsafe.integrations.continue.enabled`.'); return; }
      const prompt = await vscode.window.showInputBox({ title: 'Run Continue (governed)', prompt: 'Prompt for the Continue headless agent', ignoreFocusOut: true });
      if (!prompt) return;
      const out = await run('Running Continue in an isolated worktree…', () => runContinueGoverned(
        {
          prompt, cwd, timeoutMs: timeoutMs(), baseEnv: process.env,
          allow: cfg.get<string[]>('integrations.continue.allow', []) ?? [],
          apiKey: cfg.get<string>('integrations.continue.apiKey', '') || undefined,
          writesAllowed: cfg.get<boolean>('integrations.continue.allowWrites', false),
        },
        { run: defaultAgentRun, classify, issuedAt: new Date().toISOString() },
      ));
      await handleOutcome(deps, 'continue', out);
    }),

    vscode.commands.registerCommand('failsafe.aider.run', async () => {
      const cfg = settings();
      if (!cfg.get<boolean>('integrations.aider.enabled', false)) { vscode.window.showWarningMessage('Aider integration is disabled. Enable `failsafe.integrations.aider.enabled`.'); return; }
      const prompt = await vscode.window.showInputBox({ title: 'Run Aider (governed)', prompt: 'Message for Aider (one-shot)', ignoreFocusOut: true });
      if (!prompt) return;
      const out = await run('Running Aider in an isolated worktree…', () => runAiderGoverned(
        { prompt, cwd, timeoutMs: timeoutMs(), writesAllowed: cfg.get<boolean>('integrations.aider.allowWrites', false) },
        { run: defaultAgentRun, classify, issuedAt: new Date().toISOString() },
      ));
      await handleOutcome(deps, 'aider', out);
    }),
  );
}
