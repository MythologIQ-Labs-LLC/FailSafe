// Pure ACP-intent → EvaluationRequestContract-action mappers (GH #172).
//
// Each governable ACP intent is shaped into the generic governance `action`
// ({ kind, target, payload }) so it can run through FailSafe's existing
// EvaluationRequest → EnforcementEngine → Receipt seam (the same path the
// McpInterceptor uses). Distinct `acp_*` kinds are emitted (instead of the
// MCP adapter's flat `tool_call`) for ledger fidelity — `action.kind` is a
// free-form string in `evaluation_request.json`, so they validate as-is.
//
// SECRET HYGIENE (ACP-AGENTIC-03): fs-write CONTENT is NEVER carried verbatim —
// it is reduced to a sha256 digest + byte length so the governance payload (and
// any future immutable ledger record of it) cannot leak file bodies. Govern on
// path/scope/hash, never the body. Agent-supplied `rawInput` is passed through
// for command-policy signal but is size-capped at the interceptor boundary.
//
// Pure + deterministic — no fs/network/logging/`Date`. `crypto.createHash` is a
// pure transform (no I/O), so these stay JSDOM/unit friendly.

import { createHash } from 'crypto';
import type { EvaluationRequestContract } from '../../contracts';
import type {
  AcpGovernableIntent,
  AcpToolCall,
  AcpFsWriteParams,
  AcpCreateTerminalParams,
  AcpPermissionRequest,
} from './acpTypes';

type Action = EvaluationRequestContract['action'];

/** sha256 hex digest of a string (UTF-8). Pure. */
function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

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
 *  engine widening can scope it via Axiom2. The content is reduced to a digest
 *  (sha256 + byte length) — it is NEVER carried verbatim (ACP-AGENTIC-03). */
export function acpFsWriteToAction(p: AcpFsWriteParams): Action {
  const content = typeof p.content === 'string' ? p.content : '';
  return {
    kind: 'acp_fs_write',
    target: p.path,
    payload: { path: p.path, contentSha256: sha256(content), contentBytes: Buffer.byteLength(content, 'utf8') },
  };
}

/** `terminal/create` → action. `target` is the command; `payload` carries the
 *  argv + cwd. NOTE: the engine does not yet read `action.payload` for command
 *  policy (brief GAP #1 / ACP-AGENTIC-01) — until it does, terminal command
 *  policy is NOT enforced; this payload is recorded for provenance only. */
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
