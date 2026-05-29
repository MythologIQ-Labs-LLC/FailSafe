/**
 * OpenDesignMcpClient — MCP client wrapper for the Open Design daemon's
 * MCP surface (`od mcp` stdio subprocess).
 *
 * Refactored by plan-qor-b-int-4-mcp-client-host (B-INT-4) onto the shared
 * `McpClientHost` substrate. This subclass holds only the Open Design v1.1
 * specialization: the read-only allowlist preCallGate and the typed
 * `callRaw` re-assertion.
 *
 * v1.2 invariant (B-OD-8): the 3 destructive write tools (`delete_file`,
 * `delete_project`, `write_file`) are REJECTED at runtime by the `preCallGate`
 * hook with `WRITE_TOOL_NOT_ENABLED` BEFORE reaching the transport. The one
 * non-destructive write tool (`create_artifact`) is admitted ONLY through L3
 * approval: it is gated by construction via a one-shot approval token that only
 * `executeApprovedCreateArtifact` (invoked by `OpenDesignL3Executor` after an
 * APPROVED L3 decision) can set; a direct `callRaw('create_artifact', …)` with
 * no pending token throws `WRITE_TOOL_NOT_APPROVED`.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpClientHost } from '../mcp/McpClientHost';
import { OpenDesignMcpAllowlist } from './OpenDesignMcpAllowlist';

export interface OpenDesignMcpClientOptions {
  command: string;
  args?: string[];
  cwd: string;
  /** Extra env vars for the spawned subprocess (merged with SDK defaults). */
  env?: Record<string, string>;
  /** Idle-disconnect TTL in ms. 0 disables. Default 900_000 (15min). */
  idleDisconnectMs?: number;
  /** Test seam: override the underlying MCP client. */
  clientFactory?: () => Client;
  /** Test seam: override the transport constructor. */
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

export interface OpenDesignToolCallContent {
  type?: string;
  text?: string;
}

export interface OpenDesignToolCallResult {
  content?: OpenDesignToolCallContent[];
  isError?: boolean;
}

function isOpenDesignToolCallResult(value: unknown): value is OpenDesignToolCallResult {
  if (value === null || typeof value !== 'object') return false;
  const c = (value as { content?: unknown }).content;
  if (c !== undefined && !Array.isArray(c)) return false;
  return true;
}

export class OpenDesignMcpClient extends McpClientHost {
  constructor(opts: OpenDesignMcpClientOptions) {
    super({
      clientName: 'failsafe-open-design-client',
      errorPrefix: 'open-design tool',
      notConnectedMessage: 'OpenDesignMcpClient not connected',
      command: opts.command,
      args: opts.args,
      cwd: opts.cwd,
      env: opts.env,
      idleDisconnectMs: opts.idleDisconnectMs,
      clientFactory: opts.clientFactory,
      transportFactory: opts.transportFactory,
      // B-OD-8: reject destructive write tools BEFORE idle.beginCall —
      // fail-fast. Read-only tools and the L3-gated create_artifact pass this
      // gate; create_artifact is additionally token-gated in callRaw below.
      // (This closure is passed to super() and cannot reference `this`; the
      //  one-shot approval-token check therefore lives in the callRaw override.)
      preCallGate: (name) => {
        if (OpenDesignMcpAllowlist.isDestructive(name)) {
          throw new Error(
            `WRITE_TOOL_NOT_ENABLED: open-design destructive write tools (${name}) deferred beyond v1.2 — see plan-b-od-8-create-artifact-l3.md`,
          );
        }
      },
      runtimeGuard: (raw, name) => {
        if (!isOpenDesignToolCallResult(raw)) {
          throw new Error(
            `open-design tool ${name} returned a result that failed runtime type guard`,
          );
        }
      },
    });
  }

  /**
   * B-OD-8 one-shot approval token. Set ONLY by executeApprovedCreateArtifact
   * (invoked by OpenDesignL3Executor after an APPROVED L3 decision) and consumed
   * by the next create_artifact callRaw. Narrowly scoped mutable state — never
   * exposed; the only way to flip it true is the sanctioned approved-execute path.
   */
  private _pendingApprovedWrite = false;

  /**
   * B-OD-8: the ONLY sanctioned entry for create_artifact. Sets the one-shot
   * token then performs the call; the token is consumed in callRaw before the
   * transport call. Called by OpenDesignL3Executor post-APPROVAL.
   */
  async executeApprovedCreateArtifact(
    args: Record<string, unknown>,
  ): Promise<OpenDesignToolCallResult> {
    this._pendingApprovedWrite = true;
    return this.callRaw('create_artifact', args);
  }

  /**
   * Type-narrowed callRaw with the B-OD-8 L3 gate-by-construction check. For an
   * L3-gated write tool (create_artifact), require a pending one-shot approval
   * token and consume it before the call; absent the token, reject. Destructive
   * tools never reach this branch (isL3GatedWrite is false) and are rejected by
   * the host preCallGate inside super.callRaw. The host's runtimeGuard validated
   * the shape; this override re-asserts the narrower type.
   */
  override async callRaw(
    name: string,
    args: Record<string, unknown>,
  ): Promise<OpenDesignToolCallResult> {
    if (OpenDesignMcpAllowlist.isL3GatedWrite(name)) {
      if (!this._pendingApprovedWrite) {
        throw new Error(
          `WRITE_TOOL_NOT_APPROVED: open-design ${name} requires L3 approval (B-OD-8) — route via /api/actions/open-design-create-artifact`,
        );
      }
      this._pendingApprovedWrite = false; // consume one-shot token before the call
    }
    return (await super.callRaw(name, args)) as OpenDesignToolCallResult;
  }
}
