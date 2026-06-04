/**
 * agent-cli-command — registers the Group B governed CLI-agent commands:
 *   `FailSafe: Run Continue (governed)`  (#104)
 *   `FailSafe: Run Aider (governed)`     (#107)
 *
 * Each gathers config + a prompt, runs the agent through the unit-tested
 * wrapper (argv-form, secrets in env only), then acts on the gate decision:
 * ALLOW → report the captured diff; BLOCK → warn; ESCALATE → enqueue a real L3
 * approval via QorLogicManager. Risk is classified with the live PolicyEngine.
 * Off-by-default; the API key/secret is read from settings and never logged.
 */

import * as vscode from 'vscode';
import type { RiskGrade } from '../shared/types/risk';
import { defaultAgentRun, buildL3EscalationRequest, type AgentRunOutcome } from '../integrations/agent-cli/agent-cli-core';
import { runContinueGoverned } from '../integrations/agent-cli/continue-wrapper';
import { runAiderGoverned } from '../integrations/agent-cli/aider-wrapper';

interface PolicyClassifier { classifyRisk(filePath: string, content?: string): RiskGrade }
interface L3Queue {
  queueL3Approval(request: {
    filePath: string; riskGrade: RiskGrade; agentDid: string; agentTrust: number;
    sentinelSummary: string; flags: string[]; kind?: string; meta?: Record<string, unknown>;
  }): Promise<string>;
}

export interface AgentCliDeps {
  workspaceRoot: string;
  policyEngine: PolicyClassifier;
  qorelogicManager: L3Queue;
}

async function escalate(deps: AgentCliDeps, agent: string, out: AgentRunOutcome): Promise<void> {
  // Shape built by the unit-tested pure helper (agent-cli-core).
  await deps.qorelogicManager.queueL3Approval(buildL3EscalationRequest(agent, out));
}

async function report(deps: AgentCliDeps, agent: string, out: AgentRunOutcome): Promise<void> {
  if (!out.available) { vscode.window.showWarningMessage(`${out.error ?? `${agent} not available`}.`); return; }
  const d = out.decision;
  if (d?.verdict === 'ESCALATE') {
    await escalate(deps, agent, out);
    vscode.window.showWarningMessage(`${agent}: L3-risk change — escalated to the L3 approval queue (${out.diff?.files ?? 0} file(s), uncommitted).`);
  } else if (d?.verdict === 'BLOCK') {
    vscode.window.showWarningMessage(`${agent}: ${d.reason}.`);
  } else if (d?.verdict === 'ALLOW') {
    vscode.window.showInformationMessage(`${agent}: ran (auto-approve tier). Captured diff: ${out.diff?.files ?? 0} file(s), +${out.diff?.additions ?? 0}/-${out.diff?.deletions ?? 0}. Review before committing.`);
  } else {
    vscode.window.showWarningMessage(`${agent}: no decision produced.`);
  }
}

export function registerAgentCliCommands(context: vscode.ExtensionContext, deps: AgentCliDeps): void {
  const classify = (p: string): RiskGrade => deps.policyEngine.classifyRisk(p);
  const cwd = deps.workspaceRoot;

  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.continue.run', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const enabled = cfg.get<boolean>('integrations.continue.enabled', false);
      const apiKey = cfg.get<string>('integrations.continue.apiKey', '');
      if (!enabled) { vscode.window.showWarningMessage('Continue integration is disabled. Enable `failsafe.integrations.continue.enabled`.'); return; }
      const prompt = await vscode.window.showInputBox({ title: 'Run Continue (governed)', prompt: 'Prompt for the Continue headless agent', ignoreFocusOut: true });
      if (!prompt) return;
      const allow = cfg.get<string[]>('integrations.continue.allow', []) ?? [];
      const writesAllowed = cfg.get<boolean>('integrations.continue.allowWrites', false);
      const out = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Running Continue (governed)…' },
        () => runContinueGoverned(
          { prompt, allow, apiKey: apiKey || undefined, cwd, writesAllowed, baseEnv: process.env },
          { run: defaultAgentRun, classify, issuedAt: new Date().toISOString() },
        ),
      );
      await report(deps, 'continue', out);
    }),

    vscode.commands.registerCommand('failsafe.aider.run', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const enabled = cfg.get<boolean>('integrations.aider.enabled', false);
      if (!enabled) { vscode.window.showWarningMessage('Aider integration is disabled. Enable `failsafe.integrations.aider.enabled`.'); return; }
      const prompt = await vscode.window.showInputBox({ title: 'Run Aider (governed)', prompt: 'Message for Aider (one-shot)', ignoreFocusOut: true });
      if (!prompt) return;
      const out = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Running Aider (governed)…' },
        () => runAiderGoverned(
          {
            prompt, cwd,
            allowDirty: cfg.get<boolean>('integrations.aider.allowDirty', false),
            autoCommit: cfg.get<boolean>('integrations.aider.autoCommit', false),
            writesAllowed: cfg.get<boolean>('integrations.aider.allowWrites', false),
          },
          { run: defaultAgentRun, classify, issuedAt: new Date().toISOString() },
        ),
      );
      await report(deps, 'aider', out);
    }),
  );
}
