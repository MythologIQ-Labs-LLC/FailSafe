// ACP proxy agent-facing Client handler (GH #172 Part 2). In the MITM proxy this
// is the `toClient` handler the REAL agent calls into (the proxy is the agent's
// client). It is where governance lives on the agent→client path: the agent's
// `requestPermission` / `writeTextFile` / `createTerminal` calls run through the
// AcpProxyGovernor; everything else (session updates, reads, terminal lifecycle,
// ext) is relayed transparently to Devin (the real client) via the forwarder.
//
// SDK types are imported `import type` ONLY — erased at compile, so this module
// (and its tests) carry NO runtime dependency on the ESM `@agentclientprotocol/sdk`
// and run headlessly. The SDK runtime lives only in the proxy entrypoint that
// constructs the connections.

import type {
  Client, RequestPermissionRequest, RequestPermissionResponse,
  WriteTextFileRequest, WriteTextFileResponse,
  CreateTerminalRequest, CreateTerminalResponse,
  ReadTextFileRequest, ReadTextFileResponse,
  TerminalOutputRequest, TerminalOutputResponse,
  WaitForTerminalExitRequest, WaitForTerminalExitResponse,
  KillTerminalRequest, KillTerminalResponse,
  ReleaseTerminalRequest, ReleaseTerminalResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type { AcpProxyGovernor } from './AcpProxyGovernor';
import type { AcpPermissionRequest, AcpPermissionOption, AcpPermissionOptionKind } from '../acpTypes';

/** The client-direction surface the proxy RELAYS toward Devin (the real client).
 *  Backed at runtime by `AcpProxyForwarder` (which adapts the SDK
 *  `AgentSideConnection` + owns the terminalId→TerminalHandle map); a mock in
 *  tests. The lifecycle/ext methods are optional — a client need not support them. */
export interface AcpDevinForwarder {
  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse>;
  sessionUpdate(params: SessionNotification): Promise<void>;
  writeTextFile?(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
  readTextFile?(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  createTerminal?(params: CreateTerminalRequest): Promise<CreateTerminalResponse>;
  terminalOutput?(params: TerminalOutputRequest): Promise<TerminalOutputResponse>;
  waitForTerminalExit?(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse>;
  killTerminal?(params: KillTerminalRequest): Promise<KillTerminalResponse | void>;
  releaseTerminal?(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | void>;
  extMethod?(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  extNotification?(method: string, params: Record<string, unknown>): Promise<void>;
}

/** Thrown when the governor withholds an effect under an enforcing mode — the
 *  proxy surfaces it to the agent as a JSON-RPC error rather than performing it. */
export class AcpGovernanceDenied extends Error {
  constructor(public readonly method: string, public readonly verdict: string, rationale?: string) {
    super(`FailSafe blocked ${method} (${verdict})${rationale ? `: ${rationale}` : ''}`);
    this.name = 'AcpGovernanceDenied';
  }
}

/** Map an SDK `RequestPermissionRequest` → our defensive `AcpPermissionRequest`. */
function mapPermissionRequest(p: RequestPermissionRequest): AcpPermissionRequest {
  const raw = p as unknown as { sessionId?: unknown; toolName?: unknown; toolCall?: unknown; options?: unknown };
  const tc = raw.toolCall as { toolCallId?: string; title?: string; rawInput?: Record<string, unknown> } | undefined;
  const options: AcpPermissionOption[] = Array.isArray(raw.options)
    ? (raw.options as Array<{ optionId: string; name: string; kind: string }>).map((o) => ({
        optionId: String(o.optionId), name: String(o.name), kind: o.kind as AcpPermissionOptionKind,
      }))
    : [];
  return {
    sessionId: String(raw.sessionId ?? ''),
    toolName: typeof raw.toolName === 'string' ? raw.toolName : undefined,
    toolCall: tc ? { toolCallId: String(tc.toolCallId ?? ''), title: tc.title, rawInput: tc.rawInput } : undefined,
    options,
  };
}

export class AcpProxyClientHandler implements Client {
  constructor(
    private readonly governor: AcpProxyGovernor,
    private readonly devin: AcpDevinForwarder,
  ) {}

  /** GOVERNED. FailSafe is the permission authority — the governor's outcome is
   *  returned to the agent (its shape matches the SDK `RequestPermissionOutcome`). */
  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const { outcome } = await this.governor.governPermission(mapPermissionRequest(params));
    return { outcome } as unknown as RequestPermissionResponse;
  }

  /** GOVERNED. A withheld write (deny under enforce) throws; otherwise relay to Devin. */
  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    const dec = await this.governor.governEffect({
      type: 'fs_write',
      params: { sessionId: String(params.sessionId), path: params.path, content: params.content },
    });
    if (dec.blocked) throw new AcpGovernanceDenied('fs/write_text_file', dec.receipt.verdict, dec.record.rationale);
    if (!this.devin.writeTextFile) return {} as WriteTextFileResponse;
    return this.devin.writeTextFile(params);
  }

  /** GOVERNED. A withheld terminal (deny under enforce) throws; otherwise relay. */
  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const dec = await this.governor.governEffect({
      type: 'terminal_create',
      params: {
        sessionId: String(params.sessionId), command: params.command,
        args: params.args ?? [], cwd: params.cwd ?? null,
      },
    });
    if (dec.blocked) throw new AcpGovernanceDenied('terminal/create', dec.receipt.verdict, dec.record.rationale);
    if (!this.devin.createTerminal) throw new AcpGovernanceDenied('terminal/create', 'NO_CLIENT_SUPPORT');
    return this.devin.createTerminal(params);
  }

  /** RELAYED — tool-call reports/plans flow through to Devin unchanged. */
  async sessionUpdate(params: SessionNotification): Promise<void> {
    return this.devin.sessionUpdate(params);
  }

  /** RELAYED — reads are not governed here (low-risk; path scoping is engine work). */
  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    if (!this.devin.readTextFile) return { content: '' } as unknown as ReadTextFileResponse;
    return this.devin.readTextFile(params);
  }

  // ── Terminal lifecycle — RELAYED. These operate on a terminal whose CREATION
  //    was already governed; re-governing output/wait/kill/release would add no
  //    enforcement value, so they pass through to the live terminal handle. ──
  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    if (!this.devin.terminalOutput) throw new AcpGovernanceDenied('terminal/output', 'NO_CLIENT_SUPPORT');
    return this.devin.terminalOutput(params);
  }

  async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    if (!this.devin.waitForTerminalExit) throw new AcpGovernanceDenied('terminal/wait_for_exit', 'NO_CLIENT_SUPPORT');
    return this.devin.waitForTerminalExit(params);
  }

  async killTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse | void> {
    if (!this.devin.killTerminal) return;
    return this.devin.killTerminal(params);
  }

  async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | void> {
    if (!this.devin.releaseTerminal) return;
    return this.devin.releaseTerminal(params);
  }

  /** RELAYED — arbitrary extension method (not part of the governed ACP surface). */
  async extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.devin.extMethod) return {};
    return this.devin.extMethod(method, params);
  }

  /** RELAYED — arbitrary extension notification. */
  async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.devin.extNotification) return;
    return this.devin.extNotification(method, params);
  }
}
