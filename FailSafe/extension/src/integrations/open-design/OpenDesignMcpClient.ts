/**
 * OpenDesignMcpClient — MCP client wrapper for the Open Design daemon's
 * MCP surface (`od mcp` stdio subprocess).
 *
 * Pattern transplanted from `src/integrations/bicameral/BicameralMcpClient.ts`
 * (verified lines 67-180 in v1 audit). Same constructor shape + same surface:
 *   - isConnected() / getCapabilities() / connect() / disconnect() / callRaw()
 *   - concurrent-connect promise caching
 *   - idle-disconnect via local IdleScheduler
 *   - transport.onclose teardown
 *   - capabilities cached from client.listTools()
 *   - test seams via clientFactory + transportFactory injection
 *
 * NEW vs Bicameral:
 *   - Allowlist gating: callRaw() rejects non-read-only tools at runtime
 *     with WRITE_TOOL_NOT_ENABLED before reaching the transport.
 *
 * Plan: plan-open-design-integration-v1.1.md Phase 1; FX722.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { IdleScheduler, DEFAULT_IDLE_DISCONNECT_MS } from './idle-scheduler';
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

export class OpenDesignMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private capabilities: Set<string> | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly idle: IdleScheduler;
  private readonly opts: OpenDesignMcpClientOptions;

  constructor(opts: OpenDesignMcpClientOptions) {
    this.opts = opts;
    this.idle = new IdleScheduler({
      idleMs: opts.idleDisconnectMs ?? DEFAULT_IDLE_DISCONNECT_MS,
      onIdle: () => {
        void this.disconnect().catch(() => undefined);
      },
    });
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  /** Defensive copy of the capability set. */
  getCapabilities(): Set<string> {
    return new Set(this.capabilities ?? []);
  }

  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async doConnect(): Promise<void> {
    const transport = this.opts.transportFactory
      ? this.opts.transportFactory(this.opts.command, this.opts.args ?? [], this.opts.cwd)
      : new StdioClientTransport({
          command: this.opts.command,
          args: this.opts.args ?? [],
          cwd: this.opts.cwd,
          ...(this.opts.env ? { env: this.opts.env } : {}),
        });
    const client = this.opts.clientFactory
      ? this.opts.clientFactory()
      : new Client({ name: 'failsafe-open-design-client', version: '1.0.0' });
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
    transport.onclose = () => {
      this.client = null;
      this.transport = null;
      this.capabilities = null;
      this.idle.cancel();
    };
    await this.fetchCapabilities(client);
  }

  private async fetchCapabilities(client: Client): Promise<void> {
    try {
      const result = await client.listTools();
      const list = (result as { tools?: unknown }).tools;
      if (Array.isArray(list)) {
        const names = list
          .map((t) =>
            t && typeof t === 'object' ? (t as { name?: unknown }).name : null,
          )
          .filter((n): n is string => typeof n === 'string' && n.length > 0);
        this.capabilities = new Set(names);
        return;
      }
      this.capabilities = new Set();
    } catch {
      this.capabilities = new Set();
    }
  }

  async disconnect(): Promise<void> {
    this.idle.cancel();
    if (!this.client) return;
    try {
      await this.client.close();
    } catch {
      /* noop */
    }
    this.client = null;
    this.transport = null;
    this.capabilities = null;
  }

  /**
   * Generic public callRaw. v1.1 invariant: only read-only tools are
   * forwarded. Write tools throw WRITE_TOOL_NOT_ENABLED before reaching the
   * transport — exposure deferred to v1.2 with explicit L3 approval per call.
   */
  async callRaw(
    name: string,
    args: Record<string, unknown>,
  ): Promise<OpenDesignToolCallResult> {
    if (!OpenDesignMcpAllowlist.isReadOnly(name)) {
      throw new Error(
        `WRITE_TOOL_NOT_ENABLED: open-design write tools deferred to v1.2 — see plan-open-design-integration-v1.1.md §Open-Q1`,
      );
    }
    if (!this.client) throw new Error('OpenDesignMcpClient not connected');
    this.idle.beginCall();
    try {
      const raw = await this.client.callTool({ name, arguments: args });
      if (!isOpenDesignToolCallResult(raw)) {
        throw new Error(
          `open-design tool ${name} returned a result that failed runtime type guard`,
        );
      }
      if (raw.isError) {
        const detail = raw.content?.[0]?.text;
        const msg =
          typeof detail === 'string' && detail.length > 0
            ? `open-design tool ${name} reported isError=true: ${detail.slice(0, 200)}`
            : `open-design tool ${name} reported isError=true`;
        throw new Error(msg);
      }
      return raw;
    } finally {
      this.idle.endCall();
    }
  }
}
