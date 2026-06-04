// ACP (Agent Client Protocol) governable-surface types — the foundation of the
// FailSafe ACP governance adapter (GH #172).
//
// ACP is JSON-RPC 2.0 over stdio between a code-editor CLIENT and an AI AGENT.
// FailSafe governs the AGENT→CLIENT methods that carry side-effecting intent:
// `session/request_permission`, `fs/write_text_file`, and `terminal/create`,
// plus the tool-call reporting surfaced on `session/update`. See the research
// brief at <repo-root>/docs/research-brief-acp-governance-2026-06-04.md and
// the review at <repo-root>/docs/review-acp-governance-2026-06-04.md.
//
// HONEST SCOPE: governance here is cooperative-path + mode-dependent — see the
// AcpInterceptor.ts and acpPermissionAuthority.ts headers. This is the pure
// offline core; it does not speak ACP transport.
//
// These are LOCAL types covering only the governable subset — NOT a full ACP
// SDK binding. Field names are confirmed against the canonical schema
// (raw.githubusercontent.com/agentclientprotocol/agent-client-protocol schema.json,
// protocol v1). Two deliberate defensive choices are documented inline where the
// schema and the prose docs disagree; reconcile the full ToolCall sub-shapes
// against schema.json before wiring a live stdio transport (out of scope here).

/** ACP tool-call category (`session/update` tool_call `kind`). Documented enum;
 *  typed as a closed union for ergonomics but the mapper never enforces it. */
export type AcpToolKind =
  | 'read' | 'edit' | 'delete' | 'move' | 'search'
  | 'execute' | 'think' | 'fetch' | 'other';

/** `PermissionOptionKind` — confirmed verbatim from schema.json. */
export type AcpPermissionOptionKind =
  | 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

/** One selectable permission option offered by the agent. */
export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: AcpPermissionOptionKind;
}

/** A location a tool call touches (file path + optional line). */
export interface AcpToolCallLocation {
  path: string;
  line?: number;
}

/** The governable subset of an ACP ToolCall / ToolCallUpdate. The full sub-shape
 *  (content block variants, exact rawInput keys) must be reconciled against
 *  schema.json before live use — only the fields a governor inspects are typed. */
export interface AcpToolCall {
  toolCallId: string;
  title?: string;
  kind?: AcpToolKind;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Original tool params — e.g. `{ command: ['/bin/zsh','-lc','...'] }`. */
  rawInput?: Record<string, unknown>;
  locations?: AcpToolCallLocation[];
}

/** `RequestPermissionRequest`. DEFENSIVE: schema.json lists `toolName` as a
 *  required field while the prose docs describe a `toolCall` (ToolCallUpdate)
 *  object — both are modeled optional so the mapper reads whichever the host
 *  actually sends (preferring `toolCall.rawInput`, the richer signal). */
export interface AcpPermissionRequest {
  sessionId: string;
  toolName?: string;
  toolCall?: AcpToolCall;
  options: AcpPermissionOption[];
}

/** `RequestPermissionResponse.outcome` — discriminated union, confirmed from
 *  schema.json. `cancelled` is the MANDATORY response to `session/cancel`. */
export type AcpPermissionOutcome =
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' };

/** `WriteTextFileRequest` params (agent→client). `path` is absolute. */
export interface AcpFsWriteParams {
  sessionId: string;
  path: string;
  content: string;
}

/** `CreateTerminalRequest` params (agent→client) — the highest-value
 *  shell-execution interception point. */
export interface AcpCreateTerminalParams {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string | null;
  env?: Array<{ name: string; value: string }>;
  outputByteLimit?: number | null;
}

/** A governable ACP intent — the discriminated input to the AcpInterceptor. */
export type AcpGovernableIntent =
  | { type: 'tool_call'; toolCall: AcpToolCall }
  | { type: 'fs_write'; params: AcpFsWriteParams }
  | { type: 'terminal_create'; params: AcpCreateTerminalParams }
  | { type: 'permission'; request: AcpPermissionRequest };
