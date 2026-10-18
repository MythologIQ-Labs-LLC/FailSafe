/**
 * #538 (B273): one Sentinel LLM authorizer per extension activation, shared by
 * the Sentinel daemon and the Console's Brainstorm service, so both see the
 * same approvals, declines and open dialog; and the command that forgets them.
 */

import * as vscode from 'vscode';
import {
  createLlmEgressAuthorizer, FORGET_LLM_APPROVALS_COMMAND, type LlmEgressAuthorizer,
} from '../sentinel/utils/llmEgressAuthorizer';

const instances = new WeakMap<vscode.ExtensionContext, LlmEgressAuthorizer>();

export function llmEgressAuthorizerFor(context: vscode.ExtensionContext): LlmEgressAuthorizer {
  let authorizer = instances.get(context);
  if (!authorizer) {
    authorizer = createLlmEgressAuthorizer(context.globalState, vscode.window);
    instances.set(context, authorizer);
  }
  return authorizer;
}

/** "FailSafe: Forget Sentinel LLM Approvals": removes every approval and this session's declines. */
export function registerForgetLlmApprovalsCommand(context: vscode.ExtensionContext, authorizer: LlmEgressAuthorizer): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(FORGET_LLM_APPROVALS_COMMAND, async () => {
      const removed = await authorizer.forget();
      void vscode.window.showInformationMessage(
        removed > 0
          ? `FailSafe forgot ${removed} Sentinel LLM approval(s). The next request to a model server that is not on this machine asks again.`
          : 'FailSafe had no stored Sentinel LLM approvals. Choices made in this session are cleared too.',
      );
    }),
  );
}
