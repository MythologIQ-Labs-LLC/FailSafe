// ACP proxy argv parsing (GH #172 Part 2). SDK-free + pure so it stays
// headless-testable, separate from the SDK-runtime wiring in AcpProxyMain.

export interface ParsedProxyArgs {
  agentCommand: string;
  agentArgs: string[];
}

/**
 * Parse the proxy's own argv into the real-agent command tail. Everything after the
 * first bare `--` is the agent invocation: `acp-proxy [proxyflags…] -- agent arg1 arg2`.
 * Pure + total — throws a precise error when no agent tail is present (fail-closed:
 * the proxy must never start without a real agent to wrap).
 */
export function parseProxyArgs(argv: string[]): ParsedProxyArgs {
  const sep = argv.indexOf('--');
  if (sep === -1 || sep === argv.length - 1) {
    throw new Error('acp-proxy: missing real-agent command (expected `-- <agentCmd> [args…]`)');
  }
  const [agentCommand, ...agentArgs] = argv.slice(sep + 1);
  return { agentCommand, agentArgs };
}
