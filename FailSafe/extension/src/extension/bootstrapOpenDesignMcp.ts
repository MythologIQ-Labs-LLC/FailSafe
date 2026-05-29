/**
 * bootstrapOpenDesignMcp — wires the Open Design v1.1 surfaces into the
 * VS Code extension lifecycle.
 *
 * Registers the `failsafe.openDesign.registerMcp` operator wizard command.
 * When the setting `failsafe.integrations.openDesign.mcpEnabled` is true,
 * pre-constructs an OpenDesignMcpClient at activation time; otherwise the
 * client is lazily constructed when the operator runs the wizard.
 *
 * The daemon is NOT auto-probed on activation — avoids surprise network
 * activity. The probe runs only inside the wizard.
 *
 * Plan: plan-open-design-integration-v1.1.md Phase 2; FX725.
 */

import * as vscode from 'vscode';
import { OpenDesignMcpClient } from '../integrations/open-design/OpenDesignMcpClient';
import { OpenDesignDaemonProbe } from '../integrations/open-design/OpenDesignDaemonProbe';
import { OpenDesignSseClient } from '../integrations/open-design/OpenDesignSseClient';
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
}

export function bootstrapOpenDesignMcp(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  deps: OpenDesignBootstrapDeps = {},
): OpenDesignBootstrapHandle {
  const cfg = vscode.workspace.getConfiguration('failsafe');
  const mcpEnabled = cfg.get<boolean>('integrations.openDesign.mcpEnabled', false);

  let mcpClient: OpenDesignMcpClient | null = null;
  const probe = new OpenDesignDaemonProbe();
  const sseClient = new OpenDesignSseClient();

  if (mcpEnabled) {
    mcpClient = new OpenDesignMcpClient({
      command: 'od',
      args: ['mcp'],
      cwd: workspaceRoot,
    });
  }
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

  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.openDesign.registerMcp', async () => {
      const probeResult = await probe.probe();
      if (!probeResult.alive) {
        await vscode.window.showWarningMessage(
          `Open Design daemon unreachable at 127.0.0.1:7456 (${probeResult.reason}). Start the daemon then re-run this command.`,
        );
        return;
      }
      if (!mcpClient) {
        mcpClient = new OpenDesignMcpClient({
          command: 'od',
          args: ['mcp'],
          cwd: workspaceRoot,
        });
        // Re-push so the route/executor see the wizard-constructed client.
        deps.onClient?.(mcpClient);
      }
      try {
        await mcpClient.connect();
        const tools = mcpClient.getCapabilities();
        await vscode.window.showInformationMessage(
          `Open Design MCP connected. ${tools.size} tools available (read-only v1.1).`,
        );
      } catch (e) {
        await vscode.window.showErrorMessage(
          `Open Design MCP connect failed: ${(e as Error).message}`,
        );
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
