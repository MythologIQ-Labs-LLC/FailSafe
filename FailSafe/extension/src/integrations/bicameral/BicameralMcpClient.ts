// BicameralMcpClient — thin MCP client wrapper for the 4 v1 tools.
// Plan: docs/plan-qor-bicameral-mcp-integration.md Phase 1.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  BicameralDecision,
  BicameralDriftStatus,
  BicameralFeatureBrief,
  BicameralPreflightResult,
  BicameralRatifyVerdict,
} from './types';

interface ToolCallResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

interface BicameralMcpClientOptions {
  command: string;
  args?: string[];
  cwd: string;
  /** Test seam: override the underlying MCP client (mocks). */
  clientFactory?: () => Client;
  /** Test seam: override the transport constructor. */
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

export class BicameralMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private readonly opts: BicameralMcpClientOptions;

  constructor(opts: BicameralMcpClientOptions) {
    this.opts = opts;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  async connect(): Promise<void> {
    if (this.client) return;
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
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try { await this.client.close(); } catch { /* noop */ }
    this.client = null;
    this.transport = null;
  }

  async history(): Promise<BicameralFeatureBrief[]> {
    const result = await this.call('bicameral.history', {});
    return parseFeatureBriefs(result);
  }

  async preflight(filePath: string): Promise<BicameralPreflightResult> {
    const result = await this.call('bicameral.preflight', { file: filePath });
    return parsePreflightResult(result);
  }

  async drift(filePath: string): Promise<BicameralDriftStatus[]> {
    const result = await this.call('bicameral.drift', { file_path: filePath });
    return parseDriftStatuses(result);
  }

  async ratify(decisionId: string, verdict: BicameralRatifyVerdict): Promise<void> {
    await this.call('bicameral.ratify', { decision_id: decisionId, verdict });
  }

  private async call(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (!this.client) throw new Error('BicameralMcpClient not connected');
    const result = await this.client.callTool({ name, arguments: args }) as ToolCallResult;
    if (result.isError) {
      throw new Error(`bicameral tool ${name} reported isError=true`);
    }
    return result;
  }
}

// ── Parsers ─────────────────────────────────────────────────────────────
// MCP results come back as either structuredContent (when server emits JSON)
// or content[].text (when server emits text blocks). Bicameral tools generally
// return JSON via content[0].text — we parse defensively.

function parseJsonContent(result: ToolCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const first = result.content?.[0];
  if (!first || typeof first.text !== 'string') return null;
  try { return JSON.parse(first.text); } catch { return null; }
}

function parseFeatureBriefs(result: ToolCallResult): BicameralFeatureBrief[] {
  const raw = parseJsonContent(result);
  if (!raw || typeof raw !== 'object') return [];
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.filter((f): f is BicameralFeatureBrief => {
    return !!f && typeof f === 'object' && typeof (f as BicameralFeatureBrief).feature === 'string'
      && Array.isArray((f as BicameralFeatureBrief).decisions);
  });
}

function parsePreflightResult(result: ToolCallResult): BicameralPreflightResult {
  const raw = parseJsonContent(result);
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    priorDecisions: asDecisionArray(obj.prior_decisions),
    drifted: asDriftArray(obj.drifted),
    openQuestions: asDecisionArray(obj.open_questions),
  };
}

function parseDriftStatuses(result: ToolCallResult): BicameralDriftStatus[] {
  const raw = parseJsonContent(result);
  if (!raw || typeof raw !== 'object') return [];
  return asDriftArray((raw as { drift?: unknown }).drift);
}

function asDecisionArray(v: unknown): BicameralDecision[] {
  return Array.isArray(v) ? v.filter((d) => !!d && typeof d === 'object') as BicameralDecision[] : [];
}

function asDriftArray(v: unknown): BicameralDriftStatus[] {
  return Array.isArray(v) ? v.filter((d) => !!d && typeof d === 'object') as BicameralDriftStatus[] : [];
}
