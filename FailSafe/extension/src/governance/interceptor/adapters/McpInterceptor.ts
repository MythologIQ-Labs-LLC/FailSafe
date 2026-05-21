// B151 — McpInterceptor: adapter that wraps an MCP `{name, arguments}` tool-call
// envelope into a B190 `EvaluationRequestContract`, validates it, and dispatches
// to a backing `IGovernanceInterceptor`.
//
// Boundary rule 2: this adapter receives the MCP client by CONSTRUCTOR INJECTION
// typed against the minimal local `McpInterceptorBackingClient` interface — it
// MUST NOT import `src/integrations/bicameral/*`. The bicameral module satisfies
// this structural type without the interceptor depending on it.
//
// AJV validation failure → `QUARANTINE` receipt WITHOUT invoking the backing
// interceptor. The validator is fetched from the module-scoped cache per call.

import type { EvaluationRequestContract, ReceiptContract } from "../../../contracts";
import type { IGovernanceInterceptor } from "../IGovernanceInterceptor";
import { deriveEvaluationRequestId, quarantineReceipt } from "../contractMappers";
import { getValidator } from "../ajv-instance";

/** An MCP tool-call envelope. */
export interface McpEnvelope {
  name: string;
  arguments?: Record<string, unknown> | null;
}

/**
 * Minimal structural view of the MCP client. The bicameral `BicameralMcpClient`
 * satisfies this without the interceptor importing the bicameral module.
 */
export interface McpInterceptorBackingClient {
  isConnected(): boolean;
}

/** Optional adapter config — the agent DID stamped onto evaluation requests. */
export interface McpInterceptorConfig {
  agentDid?: string;
}

const DEFAULT_AGENT_DID = "did:failsafe:agent:mcp";
const ISSUED_BY = "did:failsafe:interceptor:mcp";

/**
 * Return a human-readable reason an MCP envelope is malformed, or `null` when
 * it is well-formed. A non-object envelope or an empty/non-string `name` is
 * malformed; `arguments` may be absent or `null` (treated as no payload).
 */
function describeMalformedEnvelope(envelope: McpEnvelope): string | null {
  if (!envelope || typeof envelope !== "object") {
    return "envelope is not an object";
  }
  if (typeof envelope.name !== "string" || envelope.name.length === 0) {
    return "name must be a non-empty string";
  }
  const args = envelope.arguments;
  if (args !== undefined && args !== null && typeof args !== "object") {
    return "arguments must be an object when present";
  }
  return null;
}

/**
 * Governance adapter for MCP tool calls. `intercept` builds a contract-valid
 * `EvaluationRequestContract`, validates it, and dispatches to the backing
 * `IGovernanceInterceptor`; the returned `ReceiptContract` is passed straight
 * back to the caller.
 */
export class McpInterceptor {
  private readonly client: McpInterceptorBackingClient;
  private readonly backing: IGovernanceInterceptor;
  private readonly agentDid: string;

  constructor(
    client: McpInterceptorBackingClient,
    backing: IGovernanceInterceptor,
    config: McpInterceptorConfig = {},
  ) {
    this.client = client;
    this.backing = backing;
    this.agentDid = config.agentDid ?? DEFAULT_AGENT_DID;
  }

  /** The injected MCP client (exposed for callers that also need its state). */
  getClient(): McpInterceptorBackingClient {
    return this.client;
  }

  /**
   * Govern an MCP tool-call envelope. Builds the evaluation request, validates
   * it against `evaluation_request.json`, and dispatches to the backing
   * interceptor. A malformed envelope or a validation failure short-circuits to
   * a `QUARANTINE` receipt WITHOUT invoking the backing interceptor.
   */
  async intercept(envelope: McpEnvelope): Promise<ReceiptContract> {
    const req = this.buildRequest(envelope);
    const envelopeError = describeMalformedEnvelope(envelope);
    if (envelopeError) {
      return quarantineReceipt(
        deriveEvaluationRequestId(req),
        ISSUED_BY,
        `malformed MCP envelope: ${envelopeError}`,
      );
    }
    const validate = getValidator("evaluation_request");
    if (!validate(req)) {
      const detail = JSON.stringify(validate.errors ?? []);
      return quarantineReceipt(
        deriveEvaluationRequestId(req),
        ISSUED_BY,
        `evaluation_request validation failed: ${detail}`,
      );
    }
    return this.backing.evaluate(req);
  }

  /** Build the evaluation request from an MCP envelope. */
  private buildRequest(envelope: McpEnvelope): EvaluationRequestContract {
    const args = envelope.arguments;
    const action: EvaluationRequestContract["action"] = {
      kind: "tool_call",
      target: envelope.name,
    };
    if (args && typeof args === "object") {
      action.payload = args;
    }
    return {
      agentDid: this.agentDid,
      action,
      timestamp: new Date().toISOString(),
    };
  }
}
