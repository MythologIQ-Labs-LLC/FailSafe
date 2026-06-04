// ACP proxy client-facing Agent handler (GH #172 Part 2). In the MITM proxy this
// is the `toAgent` handler that DEVIN (the real client/editor) calls into — the
// proxy presents itself to Devin AS the agent. It is a TRANSPARENT RELAY: every
// client→agent request (initialize / newSession / prompt / cancel / …) is
// forwarded unchanged to the REAL agent via the forwarder (the SDK
// `ClientSideConnection` at runtime).
//
// Governance does NOT live on this direction. The governable ACP effects
// (permission, fs write, terminal create) all travel agent→client and are
// handled by AcpProxyClientHandler. Client→agent requests carry no side effect
// the proxy needs to withhold, so relaying them verbatim preserves agent
// behavior while keeping the governance seam on the effect path.
//
// SDK types are `import type` ONLY — erased at compile, so this module and its
// tests carry NO runtime dependency on the ESM `@agentclientprotocol/sdk`.

import type {
  Agent,
  InitializeRequest, InitializeResponse,
  NewSessionRequest, NewSessionResponse,
  LoadSessionRequest, LoadSessionResponse,
  ListSessionsRequest, ListSessionsResponse,
  ResumeSessionRequest, ResumeSessionResponse,
  SetSessionModeRequest, SetSessionModeResponse,
  AuthenticateRequest, AuthenticateResponse,
  PromptRequest, PromptResponse,
  CancelNotification,
} from '@agentclientprotocol/sdk';

/** The agent-direction surface the proxy RELAYS to the real agent (backed by the
 *  SDK `ClientSideConnection`, which `implements Agent`, at runtime). Optional
 *  members mirror the agent's advertised capabilities. */
export interface AcpAgentForwarder {
  initialize(params: InitializeRequest): Promise<InitializeResponse>;
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse | void>;
  prompt(params: PromptRequest): Promise<PromptResponse>;
  cancel(params: CancelNotification): Promise<void>;
  loadSession?(params: LoadSessionRequest): Promise<LoadSessionResponse>;
  listSessions?(params: ListSessionsRequest): Promise<ListSessionsResponse>;
  resumeSession?(params: ResumeSessionRequest): Promise<ResumeSessionResponse>;
  setSessionMode?(params: SetSessionModeRequest): Promise<SetSessionModeResponse | void>;
  extMethod?(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  extNotification?(method: string, params: Record<string, unknown>): Promise<void>;
}

/**
 * Transparent relay of the client→agent direction. Constructed with a LAZY
 * forwarder resolver because the real forwarder (the `ClientSideConnection`)
 * does not exist yet when this handler is built — the proxy wires the two SDK
 * connections in a mutually-recursive pair (see AcpProxyMain). The resolver is
 * read on first use, by which time wiring is complete.
 */
export class AcpProxyAgentHandler implements Agent {
  private resolved: AcpAgentForwarder | undefined;

  constructor(private readonly resolve: () => AcpAgentForwarder) {}

  private get agent(): AcpAgentForwarder {
    if (!this.resolved) this.resolved = this.resolve();
    return this.resolved;
  }

  initialize(params: InitializeRequest): Promise<InitializeResponse> {
    return this.agent.initialize(params);
  }

  newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.agent.newSession(params);
  }

  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse | void> {
    return this.agent.authenticate(params);
  }

  prompt(params: PromptRequest): Promise<PromptResponse> {
    return this.agent.prompt(params);
  }

  cancel(params: CancelNotification): Promise<void> {
    return this.agent.cancel(params);
  }

  // Optional, capability-gated methods are `async` so an unsupported call becomes
  // a clean promise REJECTION (not a synchronous throw) — the JSON-RPC layer maps
  // it to a method error, and callers can `.catch` it uniformly.
  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const a = this.agent;
    if (!a.loadSession) throw new Error('loadSession not supported by agent');
    return a.loadSession(params);
  }

  async listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
    const a = this.agent;
    if (!a.listSessions) throw new Error('listSessions not supported by agent');
    return a.listSessions(params);
  }

  async resumeSession(params: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    const a = this.agent;
    if (!a.resumeSession) throw new Error('resumeSession not supported by agent');
    return a.resumeSession(params);
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse | void> {
    const a = this.agent;
    if (!a.setSessionMode) throw new Error('setSessionMode not supported by agent');
    return a.setSessionMode(params);
  }

  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = this.agent;
    if (!a.extMethod) return Promise.resolve({});
    return a.extMethod(method, params);
  }

  extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const a = this.agent;
    if (!a.extNotification) return Promise.resolve();
    return a.extNotification(method, params);
  }
}
