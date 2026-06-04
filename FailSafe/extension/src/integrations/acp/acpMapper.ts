// Pure ACP-intent → EvaluationRequestContract-action mappers (GH #172).
//
// Each governable ACP intent is shaped into the generic governance `action`
// ({ kind, target, payload }) so it can run through FailSafe's existing
// EvaluationRequest → EnforcementEngine → Receipt seam (the same path the
// McpInterceptor uses). Distinct `acp_*` kinds are emitted (instead of the
// MCP adapter's flat `tool_call`) for ledger fidelity — `action.kind` is a
// free-form string in `evaluation_request.json`, so they validate as-is.
//
// No I/O, no logging, no `Date` — pure functions, JSDOM/unit friendly.

import type { EvaluationRequestContract } from '../../contracts';
import type {
  AcpGovernableIntent,
  AcpToolCall,
  AcpFsWriteParams,
  AcpCreateTerminalParams,
  AcpPermissionRequest,
} from './acpTypes';

type Action = EvaluationRequestContract['action'];

/** ACP tool-call report → action. `target` is the human title (falling back to
 *  the tool-call id); `payload` carries the original tool params. */
export function acpToolCallToAction(tc: AcpToolCall): Action {
  return {
    kind: 'acp_tool_call',
    target: tc.title ?? tc.toolCallId,
    payload: { ...(tc.rawInput ?? {}), toolCallId: tc.toolCallId, toolKind: tc.kind ?? 'other' },
  };
}

/** `fs/write_text_file` → action. `target` is the ABSOLUTE path so a future
 *  engine widening can scope it via Axiom2; `payload` carries path + content. */
export function acpFsWriteToAction(p: AcpFsWriteParams): Action {
  return {
    kind: 'acp_fs_write',
    target: p.path,
    payload: { path: p.path, content: p.content },
  };
}

/** `terminal/create` → action. `target` is the command; `payload` carries the
 *  full argv + cwd for command-policy evaluation. */
export function acpTerminalCreateToAction(p: AcpCreateTerminalParams): Action {
  return {
    kind: 'acp_terminal_create',
    target: p.command,
    payload: { command: p.command, args: p.args ?? [], cwd: p.cwd ?? null },
  };
}

/** `session/request_permission` → action. Reads the richer `toolCall.rawInput`
 *  when present (command/argv data lives there), else falls back to `toolName`
 *  — handling the schema/docs `toolName`-vs-`toolCall` ambiguity. */
export function acpPermissionToAction(req: AcpPermissionRequest): Action {
  const tc = req.toolCall;
  const target = tc?.title ?? tc?.toolCallId ?? req.toolName ?? 'acp:permission';
  const payload: Record<string, unknown> = { ...(tc?.rawInput ?? {}) };
  if (req.toolName) payload.toolName = req.toolName;
  if (tc?.toolCallId) payload.toolCallId = tc.toolCallId;
  payload.optionKinds = req.options.map((o) => o.kind);
  return { kind: 'acp_permission', target, payload };
}

/** Dispatch a governable ACP intent to its action mapping. An unrecognized
 *  `type` (impossible per the union, but possible from untrusted runtime input)
 *  maps to a sentinel `acp_unknown` action so the interceptor's validate /
 *  quarantine path handles it instead of crashing. */
export function acpIntentToAction(intent: AcpGovernableIntent): Action {
  switch (intent.type) {
    case 'tool_call': return acpToolCallToAction(intent.toolCall);
    case 'fs_write': return acpFsWriteToAction(intent.params);
    case 'terminal_create': return acpTerminalCreateToAction(intent.params);
    case 'permission': return acpPermissionToAction(intent.request);
    default: return { kind: 'acp_unknown' };
  }
}
