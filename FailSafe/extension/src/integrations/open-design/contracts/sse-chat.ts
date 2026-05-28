/**
 * Vendored Open Design SSE chat event contracts.
 *
 * SOURCE: nexu-io/open-design @ commit abe72af
 *   - packages/contracts/src/sse/chat.ts (ChatSseEvent discriminated union)
 *   - packages/contracts/src/sse/common.ts
 *   - packages/contracts/src/sse/errors.ts (SseErrorPayload)
 *
 * LICENSE: Apache-2.0. See ./NOTICE.md for the full attribution.
 *
 * These are pure type definitions plus one runtime guard. No upstream logic
 * is transplanted; the wire format alone is what FailSafe needs to parse the
 * Open Design daemon's per-run SSE stream (GET /api/runs/:id/events).
 */

// ── Shared primitives (common.ts) ────────────────────────────────────────

export interface DaemonAgentPayload {
  /** Free-form agent label as emitted by the daemon. */
  agent?: string;
  /** Optional model identifier the agent is running against. */
  model?: string;
}

// ── Error payload (errors.ts) ────────────────────────────────────────────

export interface SseErrorPayload {
  /** Short error code (e.g. 'transport', 'agent', 'internal'). */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Optional structured detail. */
  detail?: unknown;
}

// ── Chat SSE event variants (chat.ts) ────────────────────────────────────

export interface ChatSseStartEvent {
  kind: 'start';
  runId: string;
  agent?: DaemonAgentPayload;
}

export interface ChatSseAgentTextDeltaEvent {
  kind: 'agent.text_delta';
  delta: string;
}

export interface ChatSseAgentToolUseEvent {
  kind: 'agent.tool_use';
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface ChatSseAgentToolResultEvent {
  kind: 'agent.tool_result';
  toolName: string;
  result?: unknown;
  isError?: boolean;
}

export interface ChatSseStdoutEvent {
  kind: 'stdout';
  data: string;
}

export interface ChatSseStderrEvent {
  kind: 'stderr';
  data: string;
}

export interface ChatSseErrorEvent {
  kind: 'error';
  error: SseErrorPayload;
}

export interface ChatSseEndEvent {
  kind: 'end';
  exitCode?: number;
}

export type ChatSseEvent =
  | ChatSseStartEvent
  | ChatSseAgentTextDeltaEvent
  | ChatSseAgentToolUseEvent
  | ChatSseAgentToolResultEvent
  | ChatSseStdoutEvent
  | ChatSseStderrEvent
  | ChatSseErrorEvent
  | ChatSseEndEvent;

// ── Runtime guard ────────────────────────────────────────────────────────

const KNOWN_KINDS = new Set<string>([
  'start',
  'agent.text_delta',
  'agent.tool_use',
  'agent.tool_result',
  'stdout',
  'stderr',
  'error',
  'end',
]);

/**
 * Runtime guard. Confirms `value` has a string `.kind` matching one of the
 * known SSE variants. Per-variant shape validation is performed by callers
 * via TS type narrowing on `.kind`; this guard's contract is "is this a
 * known event envelope?" not "is every field present".
 */
export function isChatSseEvent(value: unknown): value is ChatSseEvent {
  if (value === null || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== 'string') return false;
  if (!KNOWN_KINDS.has(kind)) return false;
  // Per-variant minimal shape probes (cheap structural sanity).
  switch (kind) {
    case 'start':
      return typeof (value as { runId?: unknown }).runId === 'string';
    case 'agent.text_delta':
      return typeof (value as { delta?: unknown }).delta === 'string';
    case 'agent.tool_use':
    case 'agent.tool_result':
      return typeof (value as { toolName?: unknown }).toolName === 'string';
    case 'stdout':
    case 'stderr':
      return typeof (value as { data?: unknown }).data === 'string';
    case 'error': {
      const err = (value as { error?: unknown }).error;
      return (
        err !== null &&
        typeof err === 'object' &&
        typeof (err as { code?: unknown }).code === 'string' &&
        typeof (err as { message?: unknown }).message === 'string'
      );
    }
    case 'end':
      // exitCode is optional; envelope alone is acceptable.
      return true;
    default:
      return false;
  }
}
