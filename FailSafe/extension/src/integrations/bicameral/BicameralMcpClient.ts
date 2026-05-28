// BicameralMcpClient — MCP client wrapper for v1 tools + deferred surfaces.
// Plan: docs/plan-qor-bicameral-cluster-high.md Phase 1 (B-BIC-19).
// Extended by docs/plan-qor-bicameral-safety-concurrency.md for B-BIC-8/9/11/21/22/23.
// Refactored by docs/plan-qor-b-int-4-mcp-client-host.md (B-INT-4) onto the
// shared McpClientHost substrate; this subclass holds only Bicameral-specific
// surface (typed wrappers + protocol-floor wiring).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpClientHost } from '../mcp/McpClientHost';
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
import { assertBicameralProtocolFloor } from './protocol-floor';

interface BicameralMcpClientOptions {
  command: string;
  args?: string[];
  cwd: string;
  /** Extra environment variables for the spawned MCP server process. Merged
   *  into the SDK's default-inherited env. Needed e.g. to set
   *  ELECTRON_RUN_AS_NODE when `command` is an Electron binary. */
  env?: Record<string, string>;
  /** B-BIC-9: idle disconnect TTL in ms. 0 disables. Default 900_000 (15min). */
  idleDisconnectMs?: number;
  /** Test seam: override the underlying MCP client (mocks). */
  clientFactory?: () => Client;
  /** Test seam: override the transport constructor. */
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

export class BicameralMcpClient extends McpClientHost {
  constructor(opts: BicameralMcpClientOptions) {
    super({
      clientName: 'failsafe-bicameral-client',
      errorPrefix: 'bicameral tool',
      notConnectedMessage: 'BicameralMcpClient not connected',
      command: opts.command,
      args: opts.args,
      cwd: opts.cwd,
      env: opts.env,
      idleDisconnectMs: opts.idleDisconnectMs,
      clientFactory: opts.clientFactory,
      transportFactory: opts.transportFactory,
      runtimeGuard: (raw, name) => {
        if (!isToolCallResult(raw)) {
          throw new Error(`bicameral tool ${name} returned a result that failed runtime type guard`);
        }
      },
      // B-BIC-22: protocol/version floor assertion. Fail-closed on missing or
      // below-floor versions so the operator can't accidentally talk to a
      // schema-incompatible upstream. Runs AFTER capability fetch.
      postConnectAssertion: (client) => { assertBicameralProtocolFloor(client); },
    });
  }

  /** B-BIC-19: type-narrowed callRaw. The host's runtimeGuard already
   *  validated the shape; this override just re-asserts the narrower type. */
  override async callRaw(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return (await super.callRaw(name, args)) as ToolCallResult;
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
