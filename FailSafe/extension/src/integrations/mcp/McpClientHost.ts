/**
 * McpClientHost — generic substrate for MCP-over-stdio client wrappers.
 *
 * Extracted by B-INT-4 (plan-qor-b-int-4-mcp-client-host) from the 95%-shared
 * lifecycle code that BicameralMcpClient and OpenDesignMcpClient previously
 * duplicated. Owns: stdio transport spawn, MCP Client construction,
 * connect/disconnect lifecycle, concurrent-connect coalescing, capability
 * cache (populated from listTools), idle disconnect via IdleScheduler,
 * transport.onclose teardown, and a generic callRaw with optional pre-call
 * gating + optional post-connect assertion + optional runtime guard hooks.
 *
 * Per-integration specialization happens via three hooks:
 *   - preCallGate(name)     — throws to reject a call before idle.beginCall.
 *                             Open Design uses this for the read-only allowlist.
 *   - postConnectAssertion  — throws to fail-closed teardown after capability
 *                             fetch. Bicameral uses this for protocol-floor.
 *   - runtimeGuard(raw)     — throws when the tool-call result doesn't match the
 *                             integration's expected shape. Each subclass passes
 *                             its own guard; callRaw runs the guard BEFORE the
 *                             isError check so isError handling can safely
 *                             access the narrowed shape.
 *
 * Subclasses pass `clientName`, `errorPrefix`, and `notConnectedMessage` via
 * the constructor options; they typically `override callRaw` only to re-assert
 * the narrower return type (the host already runs their `runtimeGuard`).
 *
 * Section 4 razor: ≤ 220 LoC.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { IdleScheduler, DEFAULT_IDLE_DISCONNECT_MS } from './idle-scheduler';

export interface McpClientHostOptions {
  /** Passed to `new Client({ name, version })`. */
  clientName: string;
  /** Defaults to `'1.0.0'`. */
  clientVersion?: string;
  /** Used in callRaw error messages, e.g. `'bicameral tool'` or `'open-design tool'`. */
  errorPrefix: string;
  /** Thrown by callRaw when called before connect. */
  notConnectedMessage: string;
  command: string;
  args?: string[];
  cwd: string;
  /** Extra env vars for the spawned subprocess (merged with SDK defaults). */
  env?: Record<string, string>;
  /** Idle disconnect TTL in ms. 0 disables. Default `DEFAULT_IDLE_DISCONNECT_MS`. */
  idleDisconnectMs?: number;
  /** Optional pre-call gate. Throws to reject the call before `idle.beginCall`. */
  preCallGate?: (name: string) => void;
  /** Optional post-connect assertion. Runs AFTER capability fetch and BEFORE
   *  `connect()` resolves. Throws to fail-closed teardown (host closes the
   *  client and clears state before re-throwing). */
  postConnectAssertion?: (client: Client) => void | Promise<void>;
  /** Optional runtime guard. Runs on every callRaw response BEFORE the
   *  `isError` check. Throws to reject malformed responses. */
  runtimeGuard?: (raw: unknown, name: string) => void;
  /** Test seam: override the underlying MCP client (mocks). */
  clientFactory?: () => Client;
  /** Test seam: override the transport constructor. */
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

interface ToolCallShape {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
}

export class McpClientHost {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private capabilities: Set<string> | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly idle: IdleScheduler;
  private readonly opts: McpClientHostOptions;

  constructor(opts: McpClientHostOptions) {
    this.opts = opts;
    this.idle = new IdleScheduler({
      idleMs: opts.idleDisconnectMs ?? DEFAULT_IDLE_DISCONNECT_MS,
      onIdle: () => { void this.disconnect().catch(() => undefined); },
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
    // Cache the in-flight promise so concurrent callers share the same spawn.
    // Cleared on settle so the next connect() can retry after failure.
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect().finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  private async doConnect(): Promise<void> {
    const transport = this.opts.transportFactory
      ? this.opts.transportFactory(this.opts.command, this.opts.args ?? [], this.opts.cwd)
      : new StdioClientTransport({
          command: this.opts.command,
          args: this.opts.args ?? [],
          cwd: this.opts.cwd,
          // StdioClientTransport restricts inherited env to an allowlist; any
          // extra vars (e.g. ELECTRON_RUN_AS_NODE) must be passed explicitly.
          ...(this.opts.env ? { env: this.opts.env } : {}),
        });
    const client = this.opts.clientFactory
      ? this.opts.clientFactory()
      : new Client({ name: this.opts.clientName, version: this.opts.clientVersion ?? '1.0.0' });
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
    transport.onclose = () => {
      this.client = null;
      this.transport = null;
      this.capabilities = null;
      // Cancel pending idle fire when transport closes externally.
      this.idle.cancel();
    };
    await this.fetchCapabilities(client);
    // postConnectAssertion runs AFTER fetchCapabilities so the hook can
    // inspect the populated capability set if needed. Fail-closed teardown
    // on throw: close the client, clear state, re-throw.
    if (this.opts.postConnectAssertion) {
      try {
        await this.opts.postConnectAssertion(client);
      } catch (err) {
        try { await client.close(); } catch { /* noop */ }
        this.client = null;
        this.transport = null;
        this.capabilities = null;
        throw err;
      }
    }
  }

  private async fetchCapabilities(client: Client): Promise<void> {
    try {
      const result = await client.listTools();
      const list = (result as { tools?: unknown }).tools;
      if (Array.isArray(list)) {
        const names = list
          .map((t) => (t && typeof t === 'object' ? (t as { name?: unknown }).name : null))
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
    try { await this.client.close(); } catch { /* noop */ }
    this.client = null;
    this.transport = null;
    this.capabilities = null;
  }

  /** Generic call. Subclasses typically override only to re-assert a narrower
   *  return type (the host runs their runtimeGuard so the cast is sound). */
  async callRaw(name: string, args: Record<string, unknown>): Promise<unknown> {
    // preCallGate runs BEFORE the not-connected check so gate-rejected calls
    // never reach idle.beginCall (preserved from Open Design's v1.1 invariant).
    if (this.opts.preCallGate) this.opts.preCallGate(name);
    if (!this.client) throw new Error(this.opts.notConnectedMessage);
    this.idle.beginCall();
    try {
      const raw = await this.client.callTool({ name, arguments: args });
      if (this.opts.runtimeGuard) this.opts.runtimeGuard(raw, name);
      const result = raw as ToolCallShape;
      if (result.isError) {
        const detail = result.content?.[0]?.text;
        const msg = typeof detail === 'string' && detail.length > 0
          ? `${this.opts.errorPrefix} ${name} reported isError=true: ${detail.slice(0, 200)}`
          : `${this.opts.errorPrefix} ${name} reported isError=true`;
        throw new Error(msg);
      }
      return raw;
    } finally {
      this.idle.endCall();
    }
  }
}
