// ACP enforce-proxy runnable entrypoint (GH #172 Part 2). This is the program
// the governed Devin registry entry launches:
//
//   node acp-proxy.js --workspace <root> -- <realAgentCmd> [args…]
//
// It builds the workspace governance backing (file-backed, reusing the real
// EnforcementEngine) and runs the MITM bridge, forwarding the child's exit code.
//
// This module is bundled to `dist/acp-proxy.js` (esbuild, ESM/node) and is the
// ONLY place the runtime ESM SDK + child-process spawn execute.

import { createWorkspaceAcpBacking } from './backing/createWorkspaceAcpBacking';
import { parseProxyArgs, parseWorkspaceArg } from './AcpProxyArgs';
import * as os from 'os';
import { runAcpProxy } from './AcpProxyMain';
import { configureTrustedExecutables, repoRootsFor } from '../../../shared/exec/trustedExecutable';

export async function main(argv: string[], cwd: string): Promise<number> {
  const { agentCommand, agentArgs } = parseProxyArgs(argv);
  const workspaceRoot = parseWorkspaceArg(argv, cwd);
  const backing = createWorkspaceAcpBacking(workspaceRoot);
  // B211 (review delta LD16): nothing inside the governed workspace, or the
  // repository that contains it, is started as the agent.
  configureTrustedExecutables({ workspaceDirs: [workspaceRoot, ...repoRootsFor([workspaceRoot], os.homedir())] });

  let run: ReturnType<typeof runAcpProxy>;
  try {
    run = runAcpProxy({
      incoming: process.stdin,
      outgoing: process.stdout,
      agentCommand,
      agentArgs,
      backing,
    });
  } catch (err) {
    process.stderr.write(`acp-proxy: no trusted agent executable: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  const { child } = run;

  // Surface the real agent's diagnostics without polluting the governed stdout
  // JSON-RPC stream.
  child.stderr.pipe(process.stderr);

  return new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      process.stderr.write(`acp-proxy: failed to launch agent: ${err.message}\n`);
      resolve(1);
    });
  });
}
// The process-level bootstrap (reads process.argv, calls process.exit) lives in
// `acpProxyBootstrap.ts` — the esbuild entrypoint — so this module stays a pure,
// importable, side-effect-free function for tests.
