/**
 * bootstrapOpenDesignMcp — wires the Open Design v1.1 surfaces into the
 * VS Code extension lifecycle.
 *
 * Registers the `failsafe.openDesign.registerMcp` operator wizard command.
 * The MCP server is launched ONLY with a command the operator confirmed (#481):
 * the wizard fetches the daemon's own launch spec (`GET /api/mcp/install-info`),
 * validates it, checks the runtime paths exist locally, shows the full command
 * line and every env pair in a modal, and stores the accepted spec in
 * user-scoped globalState. When `failsafe.integrations.openDesign.mcpEnabled`
 * is true, activation builds (but does not connect) a client from a stored
 * spec; with no stored spec it builds nothing.
 *
 * The daemon is NOT auto-probed on activation — avoids surprise network
 * activity. The probe runs only inside the wizard.
 *
 * Plan: plan-open-design-integration-v1.1.md Phase 2; FX725. #481: plan-od-runtime-compat-481.md.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { OpenDesignMcpClient } from '../integrations/open-design/OpenDesignMcpClient';
import { OpenDesignDaemonProbe } from '../integrations/open-design/OpenDesignDaemonProbe';
import { OpenDesignSseClient } from '../integrations/open-design/OpenDesignSseClient';
import { OpenDesignMcpAllowlist } from '../integrations/open-design/OpenDesignMcpAllowlist';
import {
  LAUNCH_SPEC_STATE_KEY,
  fetchLaunchSpec,
  formatCommandLine,
  parseLaunchSpec,
  sameSpec,
  type OpenDesignLaunchSpec,
} from '../integrations/open-design/OpenDesignLaunchSpec';
import {
  OpenDesignL3Executor,
  type OpenDesignLedgerLike,
} from '../integrations/open-design/OpenDesignL3Executor';
import type { EventBus } from '../shared/EventBus';

export interface OpenDesignBootstrapHandle {
  mcpClient: OpenDesignMcpClient | null;
  probe: OpenDesignDaemonProbe;
  sseClient: OpenDesignSseClient;
  /** B-OD-8: present only when an eventBus dep was supplied. */
  l3Executor: OpenDesignL3Executor | null;
}

/** B-OD-8 governance deps. Optional so existing 2-arg callers/tests stay valid. */
export interface OpenDesignBootstrapDeps {
  eventBus?: EventBus;
  ledgerManager?: OpenDesignLedgerLike;
  /** Push the live client to ConsoleServer so the route/executor can reach it. */
  onClient?: (client: OpenDesignMcpClient | null) => void;
  /** Test seam for the local runtime-path check. */
  existsSync?: (p: string) => boolean;
}

const ALLOW = 'Allow';

function storedSpec(context: vscode.ExtensionContext): OpenDesignLaunchSpec | null {
  const parsed = parseLaunchSpec(context.globalState.get<unknown>(LAUNCH_SPEC_STATE_KEY));
  return parsed.ok ? parsed.spec : null;
}

export function bootstrapOpenDesignMcp(
  context: vscode.ExtensionContext,
  _workspaceRoot: string,
  deps: OpenDesignBootstrapDeps = {},
): OpenDesignBootstrapHandle {
  const cfg = vscode.workspace.getConfiguration('failsafe');
  const mcpEnabled = cfg.get<boolean>('integrations.openDesign.mcpEnabled', false);
  const existsSync = deps.existsSync ?? fs.existsSync;
  const storageDir = context.globalStorageUri.fsPath;

  let mcpClient: OpenDesignMcpClient | null = null;
  let clientSpec: OpenDesignLaunchSpec | null = null;
  const probe = new OpenDesignDaemonProbe();
  const sseClient = new OpenDesignSseClient();

  const buildClient = (spec: OpenDesignLaunchSpec): OpenDesignMcpClient => {
    clientSpec = spec;
    return new OpenDesignMcpClient({ command: spec.command, args: spec.args, env: spec.env, cwd: storageDir });
  };

  const initial = mcpEnabled ? storedSpec(context) : null;
  if (initial) mcpClient = buildClient(initial);
  // Push the (possibly null) client to the host so the open-design-create-artifact
  // route + executor resolve the live client; re-pushed after the wizard connects.
  deps.onClient?.(mcpClient);

  // B-OD-8: the Buffer & auto-execute listener. Reads the live `mcpClient`
  // (which the wizard may (re)construct) via the getClient closure.
  const l3Executor = deps.eventBus
    ? new OpenDesignL3Executor({
        eventBus: deps.eventBus,
        getClient: () => mcpClient,
        ledgerManager: deps.ledgerManager,
      })
    : null;
  if (l3Executor) {
    context.subscriptions.push({ dispose: () => l3Executor.dispose() });
  }

  /** Fetch, validate and locally verify the daemon's spec; null after telling the operator why. */
  const resolveSpec = async (): Promise<OpenDesignLaunchSpec | null> => {
    const fetched = await fetchLaunchSpec();
    if (!fetched.ok) {
      await vscode.window.showErrorMessage(`Open Design launch command rejected: ${fetched.reason}`);
      return null;
    }
    const missing = [fetched.spec.command, fetched.spec.args[0]].find((p) => !existsSync(p));
    if (missing) {
      await vscode.window.showErrorMessage(`Open Design runtime not found at ${missing}. Reinstall Open Design, then re-run this command.`);
      return null;
    }
    return fetched.spec;
  };

  const confirm = async (spec: OpenDesignLaunchSpec): Promise<boolean> =>
    (await vscode.window.showWarningMessage(
      `Allow FailSafe to start the Open Design MCP server with this command?\n\n${formatCommandLine(spec)}`,
      { modal: true },
      ALLOW,
    )) === ALLOW;

  const useSpec = async (spec: OpenDesignLaunchSpec): Promise<OpenDesignMcpClient> => {
    if (mcpClient && !sameSpec(clientSpec, spec)) {
      if (mcpClient.isConnected()) await mcpClient.disconnect().catch(() => undefined);
      mcpClient = null;
    }
    if (!mcpClient) {
      mcpClient = buildClient(spec);
      // Re-push so the route/executor see the wizard-constructed client.
      deps.onClient?.(mcpClient);
    }
    return mcpClient;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.openDesign.registerMcp', async () => {
      const probeResult = await probe.probe();
      if (!probeResult.alive) {
        await vscode.window.showWarningMessage(
          `Open Design daemon unreachable at 127.0.0.1:7456 (${probeResult.reason}). Start the daemon then re-run this command.`,
        );
        return;
      }
      const spec = await resolveSpec();
      if (!spec || !(await confirm(spec))) return;
      await context.globalState.update(LAUNCH_SPEC_STATE_KEY, spec);
      const client = await useSpec(spec);
      try {
        fs.mkdirSync(storageDir, { recursive: true });
        await client.connect();
        const reads = [...client.getCapabilities()].filter((t) => OpenDesignMcpAllowlist.isReadOnly(t)).length;
        await vscode.window.showInformationMessage(
          `Open Design MCP connected (daemon ${probeResult.version}). ${reads} read-only tools available.`,
        );
      } catch (e) {
        await vscode.window.showErrorMessage(`Open Design MCP connect failed: ${(e as Error).message}`);
      }
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      if (mcpClient?.isConnected()) {
        void mcpClient.disconnect().catch(() => undefined);
      }
    },
  });

  return { mcpClient, probe, sseClient, l3Executor };
}
