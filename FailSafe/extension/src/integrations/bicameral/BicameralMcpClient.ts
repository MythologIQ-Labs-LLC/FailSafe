// BicameralMcpClient — MCP client wrapper for v1 tools + deferred surfaces.
// Plan: docs/plan-qor-bicameral-cluster-high.md Phase 1 (B-BIC-19).
// Extended by docs/plan-qor-bicameral-safety-concurrency.md for B-BIC-8/9/11/21/22/23.
//
// Section 4 razor: parsers + runtime guards in parsers.ts, idle scheduler
// in idle-scheduler.ts, semver compare in semver.ts.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  BicameralDriftStatus,
  BicameralFeatureBrief,
  BicameralPreflightResult,
  BicameralRatifyVerdict,
  BicameralIngestResult,
  BicameralSearchResult,
  BicameralBriefResult,
  BicameralJudgeGapsResult,
  BicameralResolveComplianceResult,
  BicameralLinkCommitResult,
  BicameralUpdateResult,
  BicameralResetResult,
  BicameralDashboardResult,
  BicameralValidateSymbolsResult,
  BicameralGetNeighborsResult,
} from './types';
import {
  ToolCallResult,
  parseJsonContent,
  parseFeatureBriefs,
  parsePreflightResult,
  parseDriftStatuses,
  isToolCallResult,
  isIngestResult,
  isSearchResult,
  isBriefResult,
  isJudgeGapsResult,
  isResolveComplianceResult,
  isLinkCommitResult,
  isUpdateResult,
  isResetResult,
  isDashboardResult,
  isValidateSymbolsResult,
  isGetNeighborsResult,
} from './parsers';
import { IdleScheduler } from './idle-scheduler';
import { assertBicameralProtocolFloor } from './protocol-floor';

const DEFAULT_IDLE_DISCONNECT_MS = 900_000; // 15 minutes

interface BicameralMcpClientOptions {
  command: string;
  args?: string[];
  cwd: string;
  /** B-BIC-9: idle disconnect TTL in ms. 0 disables. Default 900_000 (15min). */
  idleDisconnectMs?: number;
  /** Test seam: override the underlying MCP client (mocks). */
  clientFactory?: () => Client;
  /** Test seam: override the transport constructor. */
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

export class BicameralMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  /** B-BIC-4: capability set populated from client.listTools() on connect. */
  private capabilities: Set<string> | null = null;
  /** B-BIC-8: cached in-flight connect promise so concurrent connect() calls
   *  share the same transport spawn and don't leak resources. */
  private connectPromise: Promise<void> | null = null;
  /** B-BIC-9: idle-disconnect scheduler. Owns timer + inflight counter. */
  private readonly idle: IdleScheduler;
  private readonly opts: BicameralMcpClientOptions;

  constructor(opts: BicameralMcpClientOptions) {
    this.opts = opts;
    this.idle = new IdleScheduler({
      idleMs: opts.idleDisconnectMs ?? DEFAULT_IDLE_DISCONNECT_MS,
      onIdle: () => { void this.disconnect().catch(() => undefined); },
    });
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  /** B-BIC-4: defensive copy of the capability set. */
  getCapabilities(): Set<string> {
    return new Set(this.capabilities ?? []);
  }

  async connect(): Promise<void> {
    if (this.client) return;
    // B-BIC-8: cache the in-flight promise so concurrent callers share the
    // same spawn. Cleared on settle so the next connect() can retry.
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
        });
    const client = this.opts.clientFactory
      ? this.opts.clientFactory()
      : new Client({ name: 'failsafe-bicameral-client', version: '1.0.0' });
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
    transport.onclose = () => {
      this.client = null;
      this.transport = null;
      this.capabilities = null;
      // B-BIC-9: cancel pending idle fire when transport closes externally.
      this.idle.cancel();
    };
    await this.fetchCapabilities(client);
    // B-BIC-22: protocol/version floor assertion. Fail-closed on missing or
    // below-floor versions so the operator can't accidentally talk to a
    // schema-incompatible upstream.
    try {
      assertBicameralProtocolFloor(client);
    } catch (err) {
      // Tear down to avoid leaving a half-connected client around.
      try { await client.close(); } catch { /* noop */ }
      this.client = null;
      this.transport = null;
      this.capabilities = null;
      throw err;
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
    // B-BIC-9: cancel pending idle fire on explicit disconnect.
    this.idle.cancel();
    if (!this.client) return;
    try { await this.client.close(); } catch { /* noop */ }
    this.client = null;
    this.transport = null;
    this.capabilities = null;
  }

  /** B-BIC-19: generic, public callRaw for deferred-tool surfaces.
   *  Underpins all typed wrappers; throws on isError or when disconnected.
   *  B-BIC-9: increments idle inflight-counter so long-running calls don't
   *  trigger spurious idle disconnects; counter decrements after response.
   *  B-BIC-23: result is runtime-narrowed via isToolCallResult before use.
   *  B-BIC-11: when isError, surface result.content[0].text in the message. */
  async callRaw(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (!this.client) throw new Error('BicameralMcpClient not connected');
    this.idle.beginCall();
    try {
      const raw = await this.client.callTool({ name, arguments: args });
      if (!isToolCallResult(raw)) {
        throw new Error(`bicameral tool ${name} returned a result that failed runtime type guard`);
      }
      if (raw.isError) {
        const detail = raw.content?.[0]?.text;
        const msg = typeof detail === 'string' && detail.length > 0
          ? `bicameral tool ${name} reported isError=true: ${detail.slice(0, 200)}`
          : `bicameral tool ${name} reported isError=true`;
        throw new Error(msg);
      }
      return raw;
    } finally {
      this.idle.endCall();
    }
  }

  // ── v1 tools ──────────────────────────────────────────────────────────

  async history(): Promise<BicameralFeatureBrief[]> {
    return parseFeatureBriefs(await this.callRaw('bicameral.history', {}));
  }

  async preflight(filePath: string): Promise<BicameralPreflightResult> {
    return parsePreflightResult(await this.callRaw('bicameral.preflight', { file: filePath }));
  }

  async drift(filePath: string): Promise<BicameralDriftStatus[]> {
    return parseDriftStatuses(await this.callRaw('bicameral.drift', { file_path: filePath }));
  }

  async ratify(decisionId: string, verdict: BicameralRatifyVerdict): Promise<void> {
    await this.callRaw('bicameral.ratify', { decision_id: decisionId, verdict });
  }

  // ── Deferred tools (B-BIC-19 type-surface) ────────────────────────────
  // Each wrapper: callRaw → parseJsonContent → per-tool runtime guard → narrow.

  async ingest(opts: { repoPath: string }): Promise<BicameralIngestResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.ingest', { repo_path: opts.repoPath }));
    if (!isIngestResult(raw)) throw new Error('bicameral.ingest returned unexpected shape');
    return raw;
  }

  async search(opts: { query: string }): Promise<BicameralSearchResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.search', { query: opts.query }));
    if (!isSearchResult(raw)) throw new Error('bicameral.search returned unexpected shape');
    return raw;
  }

  async brief(opts: { feature: string }): Promise<BicameralBriefResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.brief', { feature: opts.feature }));
    if (!isBriefResult(raw)) throw new Error('bicameral.brief returned unexpected shape');
    return raw;
  }

  async judgeGaps(opts: { feature: string }): Promise<BicameralJudgeGapsResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.judgeGaps', { feature: opts.feature }));
    if (!isJudgeGapsResult(raw)) throw new Error('bicameral.judgeGaps returned unexpected shape');
    return raw;
  }

  async resolveCompliance(opts: { decisionId: string; resolution: string }): Promise<BicameralResolveComplianceResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.resolveCompliance', {
      decision_id: opts.decisionId, resolution: opts.resolution,
    }));
    if (!isResolveComplianceResult(raw)) throw new Error('bicameral.resolveCompliance returned unexpected shape');
    return raw;
  }

  async linkCommit(opts: { commitSha: string; decisionId: string }): Promise<BicameralLinkCommitResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.linkCommit', {
      commit_sha: opts.commitSha, decision_id: opts.decisionId,
    }));
    if (!isLinkCommitResult(raw)) throw new Error('bicameral.linkCommit returned unexpected shape');
    return raw;
  }

  async update(opts: { decisionId: string; payload: Record<string, unknown> }): Promise<BicameralUpdateResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.update', {
      decision_id: opts.decisionId, payload: opts.payload,
    }));
    if (!isUpdateResult(raw)) throw new Error('bicameral.update returned unexpected shape');
    return raw;
  }

  async reset(opts: { scope?: string } = {}): Promise<BicameralResetResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.reset', opts.scope ? { scope: opts.scope } : {}));
    if (!isResetResult(raw)) throw new Error('bicameral.reset returned unexpected shape');
    return raw;
  }

  async dashboard(): Promise<BicameralDashboardResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.dashboard', {}));
    if (!isDashboardResult(raw)) throw new Error('bicameral.dashboard returned unexpected shape');
    return raw;
  }

  async validateSymbols(opts: { symbols: string[] }): Promise<BicameralValidateSymbolsResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.validateSymbols', { symbols: opts.symbols }));
    if (!isValidateSymbolsResult(raw)) throw new Error('bicameral.validateSymbols returned unexpected shape');
    return raw;
  }

  async getNeighbors(opts: { decisionId: string }): Promise<BicameralGetNeighborsResult> {
    const raw = parseJsonContent(await this.callRaw('bicameral.getNeighbors', { decision_id: opts.decisionId }));
    if (!isGetNeighborsResult(raw)) throw new Error('bicameral.getNeighbors returned unexpected shape');
    return raw;
  }
}
