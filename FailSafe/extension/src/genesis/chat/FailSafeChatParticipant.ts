/**
 * FailSafe Chat Participant
 *
 * Provides slash commands in VSCode chat interface for governance operations.
 * Commands: /intent, /audit, /trust, /status, /seal
 */

import * as vscode from 'vscode';
import { IntentService } from '../../governance/IntentService';
import { SentinelDaemon } from '../../sentinel/SentinelDaemon';
import { QorLogicManager } from '../../qorelogic/QorLogicManager';
import { RiskManager } from '../../qorelogic/risk/RiskManager';
import { RiskChatHandler } from './handlers/RiskChatHandler';

const PARTICIPANT_ID = 'failsafe.chat';

export class FailSafeChatParticipant {
  private participant: vscode.ChatParticipant;
  private riskHandler = new RiskChatHandler();

  constructor(
    private intentService: IntentService,
    private sentinel: SentinelDaemon,
    private qorelogic: QorLogicManager,
    private riskManager?: RiskManager,
  ) {
    this.participant = vscode.chat.createChatParticipant(
      PARTICIPANT_ID,
      this.handleRequest.bind(this)
    );

    this.participant.iconPath = vscode.Uri.joinPath(
      vscode.extensions.getExtension('MythologIQ.mythologiq-failsafe')?.extensionUri ?? vscode.Uri.file(''),
      'media',
      'failsafe-icon.png'
    );
  }

  private async handleRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const command = request.command;

    try {
      switch (command) {
        case 'intent':
          return await this.handleIntent(request, stream);
        case 'audit':
          return await this.handleAudit(request, stream);
        case 'trust':
          return await this.handleTrust(request, stream);
        case 'status':
          return await this.handleStatus(stream);
        case 'seal':
          return await this.handleSeal(stream);
        case 'risk':
          if (!this.riskManager) {
            stream.markdown('**Risk manager not available** — workspace not initialized.');
            return { metadata: { command: 'risk' } };
          }
          return await this.riskHandler.handle(request, stream, this.riskManager);
        default:
          return await this.handleDefault(request, stream);
      }
    } catch (error) {
      stream.markdown(`**Error**: ${error instanceof Error ? error.message : String(error)}`);
      return { metadata: { command } };
    }
  }

  private async handleIntent(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const active = await this.intentService.getActiveIntent();

    if (!active) {
      stream.markdown('**No Active Intent**\n\n');
      stream.markdown('All file writes are currently **BLOCKED**.\n\n');
      stream.button({
        command: 'failsafe.createIntent',
        title: 'Create Intent'
      });
      return { metadata: { command: 'intent' } };
    }

    stream.markdown(`## Active Intent\n\n`);
    stream.markdown(`**Purpose**: ${active.purpose}\n\n`);
    stream.markdown(`**Type**: ${active.type}\n\n`);
    stream.markdown(`**Status**: ${active.status}\n\n`);
    stream.markdown(`**Risk Grade**: ${active.scope.riskGrade}\n\n`);

    if (active.scope.files.length > 0) {
      stream.markdown(`**Scope**: ${active.scope.files.join(', ')}\n\n`);
    }

    return { metadata: { command: 'intent' } };
  }

  private async handleAudit(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      stream.markdown('**No file open**. Open a file to audit.');
      return { metadata: { command: 'audit' } };
    }

    const filePath = editor.document.uri.fsPath;
    stream.markdown(`Auditing \`${filePath}\`...\n\n`);

    const verdict = await this.sentinel.auditFile(filePath);

    const icon = verdict.decision === 'PASS' ? '[PASS]' :
                 verdict.decision === 'WARN' ? '[WARN]' :
                 verdict.decision === 'ESCALATE' ? '[ESCALATE]' :
                 verdict.decision === 'QUARANTINE' ? '[QUARANTINE]' : '[BLOCK]';

    stream.markdown(`## ${icon} Verdict: ${verdict.decision}\n\n`);

    if (verdict.summary) {
      stream.markdown(`**Summary**: ${verdict.summary}\n\n`);
    }

    if (verdict.details) {
      stream.markdown(`**Details**: ${verdict.details}\n\n`);
    }

    if (verdict.matchedPatterns.length > 0) {
      stream.markdown(`### Matched Patterns\n\n`);
      verdict.matchedPatterns.forEach((pattern: string) => stream.markdown(`- ${pattern}\n`));
      stream.markdown('\n');
    }

    return { metadata: { command: 'audit' } };
  }

  private async handleTrust(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const trustEngine = this.qorelogic.getTrustEngine();
    const agents = await trustEngine.getAllAgents();

    if (agents.length === 0) {
      stream.markdown('**No registered agents**. Agents are registered on first interaction.');
      return { metadata: { command: 'trust' } };
    }

    stream.markdown(`## Agent Trust Scores\n\n`);
    stream.markdown(`| Agent | Score | Stage |\n|-------|-------|-------|\n`);

    for (const agent of agents) {
      const label = `${agent.persona}:${agent.did.substring(0, 12)}...`;
      stream.markdown(`| ${label} | ${(agent.trustScore * 100).toFixed(0)}% | ${agent.trustStage} |\n`);
    }

    return { metadata: { command: 'trust' } };
  }

  private async handleStatus(
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const sentinelStatus = this.sentinel.getStatus();
    const active = await this.intentService.getActiveIntent();

    stream.markdown(`## FailSafe Status\n\n`);

    // Sentinel
    stream.markdown(`### Sentinel\n`);
    stream.markdown(`- **Running**: ${sentinelStatus.running ? '✅ Yes' : '❌ No'}\n`);
    stream.markdown(`- **Mode**: ${sentinelStatus.mode}\n`);
    stream.markdown(`- **Files Watched**: ${sentinelStatus.filesWatched}\n`);
    stream.markdown(`- **Queue Depth**: ${sentinelStatus.queueDepth}\n\n`);

    // Governance
    stream.markdown(`### Governance\n`);
    if (active) {
      stream.markdown(`- **Active Intent**: ${active.purpose}\n`);
      stream.markdown(`- **Status**: ${active.status}\n`);
      stream.markdown(`- **Risk Grade**: ${active.scope.riskGrade}\n`);
    } else {
      stream.markdown(`- **Active Intent**: None (writes blocked)\n`);
    }

    return { metadata: { command: 'status' } };
  }

  private async handleSeal(
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const active = await this.intentService.getActiveIntent();

    if (!active) {
      stream.markdown('**No active intent to seal.**');
      return { metadata: { command: 'seal' } };
    }

    if (active.status !== 'PASS') {
      stream.markdown(`**Cannot seal**: Intent status is \`${active.status}\`. Only \`PASS\` intents can be sealed.`);
      return { metadata: { command: 'seal' } };
    }

    try {
      await this.intentService.sealIntent('chat-participant');
      stream.markdown(`✅ **Intent Sealed**: "${active.purpose}" has been sealed and archived.`);
    } catch (error) {
      stream.markdown(`**Failed to seal**: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { metadata: { command: 'seal' } };
  }

  private async handleDefault(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    stream.markdown(`## FailSafe Governance\n\n`);
    stream.markdown(`Available commands:\n\n`);
    stream.markdown(`- \`/intent\` - Create or view active intent\n`);
    stream.markdown(`- \`/audit\` - Audit current file for risks\n`);
    stream.markdown(`- \`/trust\` - Check agent trust scores\n`);
    stream.markdown(`- \`/status\` - Show governance status\n`);
    stream.markdown(`- \`/seal\` - Seal the active intent\n\n`);

    if (request.prompt) {
      stream.markdown(`You said: "${request.prompt}"\n\n`);
      stream.markdown(`Use one of the commands above to interact with FailSafe governance.`);
    }

    return { metadata: { command: 'default' } };
  }

  dispose(): void {
    this.participant.dispose();
  }
}
