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

export interface OpenDesignBootstrapHandle {
  mcpClient: OpenDesignMcpClient | null;
  probe: OpenDesignDaemonProbe;
  sseClient: OpenDesignSseClient;
}

export function bootstrapOpenDesignMcp(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
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

  return { mcpClient, probe, sseClient };
}
