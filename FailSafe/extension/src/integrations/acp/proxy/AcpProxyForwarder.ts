// ACP proxy forwarder adapter (GH #172 Part 2). Adapts the SDK
// `AgentSideConnection` (the proxy's link to DEVIN, the real client) to the
// `AcpDevinForwarder` shape the client handler relays through.
//
// Why an adapter and not the raw connection: the SDK exposes terminal LIFECYCLE
// (output / wait / kill / release) on the `TerminalHandle` returned by
// `createTerminal`, NOT on the connection. The real agent, however, drives those
// by `terminalId` over JSON-RPC. So this adapter owns the
// `terminalId → TerminalHandle` map: a governed `createTerminal` stores the
// handle and returns its id; later lifecycle calls resolve the handle by id.
//
// SDK types are `import type` ONLY — the adapter constructs no SDK object (it
// only calls methods on the connection/handles Devin hands back), so this module
// stays free of any runtime ESM SDK dependency and is unit-testable with a mock
// connection.

import type {
  RequestPermissionRequest, RequestPermissionResponse,
  WriteTextFileRequest, WriteTextFileResponse,
  CreateTerminalRequest, CreateTerminalResponse,
  ReadTextFileRequest, ReadTextFileResponse,
  TerminalOutputRequest, TerminalOutputResponse,
  WaitForTerminalExitRequest, WaitForTerminalExitResponse,
  KillTerminalRequest, KillTerminalResponse,
  ReleaseTerminalRequest, ReleaseTerminalResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type { AcpDevinForwarder } from './AcpProxyClientHandler';

/** The subset of the SDK `TerminalHandle` this adapter drives (by structural
 *  type — the real handle is supplied by the live connection). */
export interface AcpTerminalHandleLike {
  id: string;
  currentOutput(): Promise<TerminalOutputResponse>;
  waitForExit(): Promise<WaitForTerminalExitResponse>;
  kill(): Promise<KillTerminalResponse>;
  release(): Promise<ReleaseTerminalResponse | void>;
}

/** The subset of the SDK `AgentSideConnection` this adapter consumes. The real
 *  `AgentSideConnection` satisfies it structurally. */
export interface AcpAgentSideConnLike {
  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse>;
  sessionUpdate(params: SessionNotification): Promise<void>;
  writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
  readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  createTerminal(params: CreateTerminalRequest): Promise<AcpTerminalHandleLike>;
  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  extNotification(method: string, params: Record<string, unknown>): Promise<void>;
}

export class AcpProxyForwarder implements AcpDevinForwarder {
  private readonly terminals = new Map<string, AcpTerminalHandleLike>();

  constructor(private readonly conn: AcpAgentSideConnLike) {}

  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return this.conn.requestPermission(params);
  }

  sessionUpdate(params: SessionNotification): Promise<void> {
    return this.conn.sessionUpdate(params);
  }

  writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    return this.conn.writeTextFile(params);
  }

  readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    return this.conn.readTextFile(params);
  }

  /** Create the real terminal on Devin, retain the handle by id, return the id. */
  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const handle = await this.conn.createTerminal(params);
    this.terminals.set(handle.id, handle);
    return { terminalId: handle.id } as CreateTerminalResponse;
  }

  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    return this.handle(params.terminalId).currentOutput();
  }

  async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    return this.handle(params.terminalId).waitForExit();
  }

  async killTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse | void> {
    return this.handle(params.terminalId).kill();
  }

  /** Release frees the handle and drops it from the map (id becomes invalid). */
  async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | void> {
    const h = this.terminals.get(params.terminalId);
    if (!h) throw new Error(`unknown terminalId: ${params.terminalId}`);
    this.terminals.delete(params.terminalId);
    return h.release();
  }

  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.conn.extMethod(method, params);
  }

  extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    return this.conn.extNotification(method, params);
  }

  private handle(terminalId: string): AcpTerminalHandleLike {
    const h = this.terminals.get(terminalId);
    if (!h) throw new Error(`unknown terminalId: ${terminalId}`);
    return h;
  }
}
