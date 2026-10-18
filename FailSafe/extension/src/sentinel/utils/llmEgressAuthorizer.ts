/**
 * llmEgressAuthorizer - the operator's approval before content goes to a model
 * server that is not on this machine (#538, B273).
 *
 * Approvals are per origin and per operation, granted only through a modal
 * VS Code dialog, and kept in extension global state (this machine, never a
 * workspace file). A decline is remembered until VS Code restarts, so
 * Sentinel file events cannot raise a storm of prompts, and requests for the
 * same destination share one open dialog. Every error refuses.
 *
 * No `vscode` import: the state and the window are injected, as in
 * operatorConfirmation.ts.
 */

import { sanitizeDialogText, type ConfirmationWindow, type OperatorActionRequest } from '../../extension/operatorConfirmation';
import type { LlmEgressOperation } from './llmDestinationPolicy';

export interface LlmEgressRequest { origin: string; operation: LlmEgressOperation; model: string }

export interface LlmEgressAuthorizer {
  /** True only for a stored approval, or (with `ask`) one the operator gives now. */
  authorize(request: LlmEgressRequest, options: { ask: boolean }): Promise<boolean>;
  /** Clear every stored approval and this session's declines; returns how many approvals were removed. */
  forget(): Promise<number>;
}

/** The slice of a vscode.Memento this module needs. */
export interface ApprovalState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export const LLM_APPROVALS_KEY = 'failsafe.sentinel.llmDestinationApprovals';
export const FORGET_LLM_APPROVALS_COMMAND = 'failsafe.sentinel.forgetLlmApprovals';
export const FORGET_LLM_APPROVALS_TITLE = 'FailSafe: Forget Sentinel LLM Approvals';
export const ALLOW_LABEL = 'Allow';
const MODEL_LIMIT = 80;

interface ApprovalRecord { origin: string; operation: LlmEgressOperation; model: string; approvedAt: string }

const WHAT_IS_SENT: Record<LlmEgressOperation, { title: string; content: string }> = {
  'sentinel-file-analysis': {
    title: 'Send Sentinel file content to a model server that is not on this machine?',
    content: 'the file path, the matched heuristic ids and up to the first 2000 characters of each flagged file',
  },
  'brainstorm-transcript': {
    title: 'Send Brainstorm transcripts to a model server that is not on this machine?',
    content: 'the full transcript of each Brainstorm request',
  },
};

export function llmEgressRequest(request: LlmEgressRequest): OperatorActionRequest {
  const what = WHAT_IS_SENT[request.operation];
  // The origin is shown whole: a truncated destination is not an informed approval.
  const origin = sanitizeDialogText(request.origin, Math.max(request.origin.length, 1));
  const lines = [
    `Destination: ${origin}`,
    ...(origin.startsWith('http:') ? ['This connection is not encrypted (http): anyone on the network path can read what is sent.'] : []),
    `What is sent: ${what.content}.`,
    `Model: "${sanitizeDialogText(request.model, MODEL_LIMIT).replace(/"/g, "'")}"`,
    'The endpoint comes from failsafe.sentinel.ollamaEndpoint in your user or remote-machine settings.',
    '',
    `Allow is remembered on this machine for this destination and this use until you run "${FORGET_LLM_APPROVALS_TITLE}". Don't allow lasts until VS Code restarts.`,
  ];
  return { title: what.title, detail: lines.join('\n'), approveLabel: ALLOW_LABEL };
}

function isRecord(v: unknown): v is ApprovalRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.origin === 'string' && (r.operation === 'sentinel-file-analysis' || r.operation === 'brainstorm-transcript');
}

export function createLlmEgressAuthorizer(state: ApprovalState, window: ConfirmationWindow): LlmEgressAuthorizer {
  const declined = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();
  const keyOf = (r: { origin: string; operation: string }) => `${r.operation} ${r.origin}`;
  const records = (): ApprovalRecord[] => {
    const v = state.get<unknown>(LLM_APPROVALS_KEY);
    return Array.isArray(v) ? v.filter(isRecord) : [];
  };

  const ask = async (request: LlmEgressRequest): Promise<boolean> => {
    const dialog = llmEgressRequest(request);
    const choice = await window.showWarningMessage(dialog.title, { modal: true, detail: dialog.detail }, dialog.approveLabel);
    if (choice !== dialog.approveLabel) {
      declined.add(keyOf(request));
      return false;
    }
    const kept = records().filter((r) => keyOf(r) !== keyOf(request));
    await state.update(LLM_APPROVALS_KEY, [...kept, { ...request, approvedAt: new Date().toISOString() }]);
    return true;
  };

  return {
    async authorize(request, options) {
      try {
        const key = keyOf(request);
        if (records().some((r) => keyOf(r) === key)) return true;
        if (declined.has(key) || !options.ask) return false;
        let answer = pending.get(key);
        if (!answer) {
          answer = ask(request).finally(() => pending.delete(key));
          pending.set(key, answer);
        }
        return await answer;
      } catch {
        return false;
      }
    },
    async forget() {
      const count = records().length;
      declined.clear();
      await state.update(LLM_APPROVALS_KEY, undefined);
      return count;
    },
  };
}
