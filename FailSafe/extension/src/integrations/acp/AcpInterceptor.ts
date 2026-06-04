// AcpInterceptor (GH #172) — sibling of the McpInterceptor: wraps a governable
// ACP intent into a contract-valid `EvaluationRequestContract`, validates it,
// and dispatches to a backing `IGovernanceInterceptor` (the EngineBackedInterceptor
// in production). A malformed intent or an AJV validation failure short-circuits
// to a `QUARANTINE` receipt WITHOUT invoking the backing interceptor — identical
// fail-closed posture to the MCP adapter.
//
// Boundary: imports only from `src/contracts/`, `src/governance/interceptor/`,
// and the local ACP modules. It does NOT speak ACP transport (no stdio, no agent
// spawn, no SDK) — that is a follow-up. This is the pure governance core.
//
// SCOPE (honest): "fail-closed" here means malformed/unmapped/oversized intents
// QUARANTINE WITHOUT reaching the engine. It does NOT mean an enforced verdict on
// well-formed intents — the verdict reflects the engine's governance mode (observe
// mode auto-allows by design), and governing the agent at all assumes the
// cooperative path (the agent surfaces the intent). See
// acpPermissionAuthority.ts header.

import type { EvaluationRequestContract, ReceiptContract } from '../../contracts';
import type { IGovernanceInterceptor } from '../../governance/interceptor/IGovernanceInterceptor';
import { deriveEvaluationRequestId, quarantineReceipt } from '../../governance/interceptor/contractMappers';
import { getValidator } from '../../governance/interceptor/ajv-instance';
import { acpIntentToAction } from './acpMapper';
import type { AcpGovernableIntent, AcpPermissionOptionKind } from './acpTypes';

const DEFAULT_AGENT_DID = 'did:failsafe:agent:acp';
const ISSUED_BY = 'did:failsafe:interceptor:acp';

/** The four valid ACP permission-option kinds — anything else is malformed. */
const VALID_OPTION_KINDS: ReadonlySet<AcpPermissionOptionKind> = new Set([
  'allow_once', 'allow_always', 'reject_once', 'reject_always',
]);

/** Max serialized `action.payload` size (ACP-AGENTIC-03 DoS / unbounded-payload
 *  guard). Oversized payloads QUARANTINE rather than reach the engine. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

export interface AcpInterceptorConfig {
  /** Agent DID stamped onto evaluation requests. Defaults to the ACP agent DID. */
  agentDid?: string;
}

/** Return a human-readable reason an ACP intent is malformed, or `null` when it
 *  is well-formed enough to govern. Fail-closed: anything unrecognized is
 *  malformed and will QUARANTINE. */
function describeMalformedIntent(intent: AcpGovernableIntent): string | null {
  if (!intent || typeof intent !== 'object') return 'intent is not an object';
  switch (intent.type) {
    case 'tool_call':
      if (!intent.toolCall || typeof intent.toolCall.toolCallId !== 'string' || intent.toolCall.toolCallId.length === 0) {
        return 'tool_call requires a non-empty toolCall.toolCallId';
      }
      return null;
    case 'fs_write':
      if (!intent.params || typeof intent.params.path !== 'string' || intent.params.path.length === 0) {
        return 'fs_write requires a non-empty params.path';
      }
      if (typeof intent.params.content !== 'string') return 'fs_write requires params.content (string)';
      return null;
    case 'terminal_create':
      if (!intent.params || typeof intent.params.command !== 'string' || intent.params.command.length === 0) {
        return 'terminal_create requires a non-empty params.command';
      }
      return null;
    case 'permission': {
      const req = intent.request;
      if (!req || !Array.isArray(req.options)) return 'permission requires request.options (array)';
      if (req.options.length === 0) return 'permission requires at least one option';
      // ACP-AGENTIC-05: validate every option so an agent cannot smuggle a
      // mislabeled / empty-id option set that distorts the verdict→outcome map.
      const seen = new Set<string>();
      for (const o of req.options) {
        if (!o || typeof o.optionId !== 'string' || o.optionId.length === 0) {
          return 'each permission option requires a non-empty optionId';
        }
        if (seen.has(o.optionId)) return `duplicate permission optionId: ${o.optionId}`;
        seen.add(o.optionId);
        if (!VALID_OPTION_KINDS.has(o.kind)) return `invalid permission option kind: ${String(o.kind)}`;
      }
      return null;
    }
    default:
      return `unknown ACP intent type: ${String((intent as { type?: unknown }).type)}`;
  }
}

/** Governance adapter for ACP agent intents. */
export class AcpInterceptor {
  private readonly backing: IGovernanceInterceptor;
  private readonly agentDid: string;

  constructor(backing: IGovernanceInterceptor, config: AcpInterceptorConfig = {}) {
    this.backing = backing;
    this.agentDid = config.agentDid ?? DEFAULT_AGENT_DID;
  }

  /**
   * Govern a single ACP intent. Builds the evaluation request, validates it
   * against `evaluation_request.json`, and dispatches to the backing
   * interceptor. Malformed intent or validation failure → `QUARANTINE` without
   * invoking the backing interceptor.
   */
  async intercept(intent: AcpGovernableIntent): Promise<ReceiptContract> {
    const req = this.buildRequest(intent);
    const malformed = describeMalformedIntent(intent);
    if (malformed) {
      return quarantineReceipt(deriveEvaluationRequestId(req), ISSUED_BY, `malformed ACP intent: ${malformed}`);
    }
    // ACP-AGENTIC-03: cap the payload so an unbounded agent payload cannot reach
    // the engine (DoS) or bloat a future ledger record. fs-write content is
    // already digested in the mapper; this bounds rawInput/argv/env.
    const payloadBytes = Buffer.byteLength(JSON.stringify(req.action.payload ?? {}), 'utf8');
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      return quarantineReceipt(deriveEvaluationRequestId(req), ISSUED_BY, `ACP intent payload exceeds ${MAX_PAYLOAD_BYTES} bytes (${payloadBytes})`);
    }
    const validate = getValidator('evaluation_request');
    if (!validate(req)) {
      const detail = JSON.stringify(validate.errors ?? []);
      return quarantineReceipt(deriveEvaluationRequestId(req), ISSUED_BY, `evaluation_request validation failed: ${detail}`);
    }
    return this.backing.evaluate(req);
  }

  /** Build the evaluation request from an ACP intent. A mapping throw degrades
   *  to an `acp_unknown` action so the validate/quarantine path handles it. */
  private buildRequest(intent: AcpGovernableIntent): EvaluationRequestContract {
    let action: EvaluationRequestContract['action'];
    try {
      action = acpIntentToAction(intent);
    } catch {
      action = { kind: 'acp_unknown' };
    }
    return {
      agentDid: this.agentDid,
      action,
      timestamp: new Date().toISOString(),
    };
  }
}
