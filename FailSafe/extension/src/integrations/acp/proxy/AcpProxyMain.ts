// ACP enforce-proxy entrypoint (GH #172 Part 2). This is the program Devin Desktop
// launches in place of the real ACP agent (the governed registry entry points its
// cmd/args here, followed by `-- <realAgentCmd> <args…>`). It spawns the real agent
// as a child and sits as a MITM on the JSON-RPC stdio stream:
//
//   Devin ⇄ [AgentSideConnection]  proxy  [ClientSideConnection] ⇄ real agent
//
//   • client→agent requests (initialize/prompt/…) → AcpProxyAgentHandler → real agent  (transparent relay)
//   • agent→client effects (permission/fs write/terminal) → AcpProxyClientHandler → AcpProxyGovernor (GOVERNED)
//
// The two SDK connections reference each other, so they are wired with lazy
// resolvers (the agent handler reads `clientSide` only on first call, by which
// time both exist).
//
// GOVERNANCE BACKING SEAM: `runAcpProxy` takes an injected `AcpGovernanceBacking`.
// The proxy runs as a SEPARATE process (no VS Code runtime), so the backing must be
// constructed from file-backed, vscode-free providers reading the workspace
// `.failsafe` governance state (config mode + active intent + ledger path). That
// bootstrap (`createWorkspaceAcpBacking`) is the remaining wiring before the proxy
// enforces end-to-end; see FEATURE_INDEX FX853 and the acp/README.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { AgentSideConnection, ClientSideConnection } from '@agentclientprotocol/sdk';
import type { IGovernanceInterceptor } from '../../../governance/interceptor/IGovernanceInterceptor';
import { AcpInterceptor } from '../AcpInterceptor';
import { AcpProxyGovernor, type AcpEffectiveMode, type AcpLedgerSink } from './AcpProxyGovernor';
import { AcpProxyClientHandler } from './AcpProxyClientHandler';
import { AcpProxyAgentHandler } from './AcpProxyAgentHandler';
import { AcpProxyForwarder, type AcpAgentSideConnLike } from './AcpProxyForwarder';
import { nodeStdioToAcpStream } from './AcpStreamFactory';
import { parseProxyArgs, type ParsedProxyArgs } from './AcpProxyArgs';

export { parseProxyArgs, type ParsedProxyArgs };

/** The governance dependencies the proxy process must supply (built from
 *  file-backed, vscode-free providers in a standalone bootstrap). */
export interface AcpGovernanceBacking {
  governanceInterceptor: IGovernanceInterceptor;
  effectiveMode: () => AcpEffectiveMode;
  ledger?: AcpLedgerSink;
}

export interface RunAcpProxyOptions {
  incoming: NodeJS.ReadableStream;
  outgoing: NodeJS.WritableStream;
  agentCommand: string;
  agentArgs: string[];
  backing: AcpGovernanceBacking;
  /** Injectable for tests; defaults to node:child_process spawn. */
  spawnFn?: (cmd: string, args: string[]) => ChildProcessWithoutNullStreams;
}

export interface AcpProxyRun {
  child: ChildProcessWithoutNullStreams;
  agentSide: AgentSideConnection;
  clientSide: ClientSideConnection;
}

/**
 * Wire the MITM proxy: spawn the real agent and connect both stdio halves through
 * the governance seam. Returns the live connections (caller awaits child exit).
 */
export function runAcpProxy(opts: RunAcpProxyOptions): AcpProxyRun {
  const spawnFn = opts.spawnFn ?? ((c, a) => spawn(c, a, { stdio: 'pipe' }) as ChildProcessWithoutNullStreams);
  const child = spawnFn(opts.agentCommand, opts.agentArgs);

  const governor = new AcpProxyGovernor(
    new AcpInterceptor(opts.backing.governanceInterceptor),
    { effectiveMode: opts.backing.effectiveMode, ledger: opts.backing.ledger },
  );

  // Lazy ref (const holder): the agent handler relays to the client-side
  // connection, which is constructed AFTER the agent-side connection below.
  const ref: { clientSide?: ClientSideConnection } = {};

  // Devin half — the proxy presents itself to Devin as the agent.
  const devinStream = nodeStdioToAcpStream(opts.incoming as never, opts.outgoing as never);
  const agentSide = new AgentSideConnection(
    () => new AcpProxyAgentHandler(() => {
      if (!ref.clientSide) throw new Error('acp-proxy: agent connection not ready');
      return ref.clientSide;
    }),
    devinStream,
  );

  // Real-agent half — the proxy is the agent's client; effects govern here.
  const forwarder = new AcpProxyForwarder(agentSide as unknown as AcpAgentSideConnLike);
  const clientHandler = new AcpProxyClientHandler(governor, forwarder);
  const agentStream = nodeStdioToAcpStream(child.stdout, child.stdin);
  ref.clientSide = new ClientSideConnection(() => clientHandler, agentStream);

  return { child, agentSide, clientSide: ref.clientSide };
}
