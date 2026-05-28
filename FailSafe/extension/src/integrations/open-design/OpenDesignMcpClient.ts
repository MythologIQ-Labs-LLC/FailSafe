/**
 * OpenDesignMcpClient — MCP client wrapper for the Open Design daemon's
 * MCP surface (`od mcp` stdio subprocess).
 *
 * Refactored by plan-qor-b-int-4-mcp-client-host (B-INT-4) onto the shared
 * `McpClientHost` substrate. This subclass holds only the Open Design v1.1
 * specialization: the read-only allowlist preCallGate and the typed
 * `callRaw` re-assertion.
 *
 * v1.1 invariant: write tools (4 total, including 3 destructive — `delete_file`,
 * `delete_project`, `write_file`) are enumerated in `OpenDesignMcpAllowlist`
 * but REJECTED at runtime by the `preCallGate` hook with `WRITE_TOOL_NOT_ENABLED`
 * BEFORE reaching the transport. L3-gated exposure deferred to v1.2 (B-OD-8).
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
      // v1.1 invariant: gate write tools BEFORE idle.beginCall — fail-fast.
      preCallGate: (name) => {
        if (!OpenDesignMcpAllowlist.isReadOnly(name)) {
          throw new Error(
            `WRITE_TOOL_NOT_ENABLED: open-design write tools deferred to v1.2 — see plan-open-design-integration-v1.1.md §Open-Q1`,
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

  /** Type-narrowed callRaw. The host's runtimeGuard already validated the
   *  shape; this override just re-asserts the narrower type. */
  override async callRaw(
    name: string,
    args: Record<string, unknown>,
  ): Promise<OpenDesignToolCallResult> {
    return (await super.callRaw(name, args)) as OpenDesignToolCallResult;
  }
}
