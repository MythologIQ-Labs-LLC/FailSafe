// Bicameral MCP integration wiring — extracted from bootstrapServers so that
// file stays under the Section 4 razor limit. Two responsibilities:
//   1) Wire the lazy BicameralMcpClient + autoConnect setting into ConsoleServer
//      and re-wire on relevant configuration changes.
//   2) Optional auto-connect: when the operator has opted in and the workspace
//      is configured, open the MCP session in the background after server start.
// No new dependencies; consumes the same VS Code config tree as the Settings card.

import * as vscode from "vscode";
import {
  BicameralMcpClient,
  isSafeBicameralCommand,
  probeInstallState,
} from "../integrations/bicameral";

interface ConsoleServerSurface {
  setBicameralAutoConnect(value: boolean): void;
  setBicameralCommand(cmd: string): void;
  setBicameralClient(c: BicameralMcpClient | null): void;
  setBicameralAutoConnectWriter(fn: (value: boolean) => Promise<void>): void;
  broadcastEvent(data: Record<string, unknown>): void;
  /** B-BIC-2: typed accessor for the lazily-wired MCP client. Used by the
   *  rewire-cleanup path (disconnect prior client before assigning a new one)
   *  and by the context.subscriptions disposer (terminate stdio child on
   *  extension deactivate). */
  getBicameralClient(): BicameralMcpClient | null;
}

export function wireBicameralIntegration(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
): void {
  const wireFromConfig = (): void => {
    const cfg = vscode.workspace.getConfiguration("failsafe.integrations.bicameral");
    const command = cfg.get<string>("command", "bicameral-mcp") || "bicameral-mcp";
    consoleServer.setBicameralAutoConnect(cfg.get<boolean>("autoConnect", false));
    // B-BIC-2: disconnect the prior client (if any) before replacing it so
    // the previous stdio subprocess doesn't get orphaned by config rewire.
    const prior = consoleServer.getBicameralClient();
    if (!isSafeBicameralCommand(command)) {
      consoleServer.setBicameralCommand("bicameral-mcp");
      consoleServer.setBicameralClient(null);
      void prior?.disconnect().catch(() => undefined);
      return;
    }
    consoleServer.setBicameralCommand(command);
    consoleServer.setBicameralClient(new BicameralMcpClient({ command, cwd: workspaceRoot }));
    void prior?.disconnect().catch(() => undefined);
  };

  wireFromConfig();
  consoleServer.setBicameralAutoConnectWriter(async (value) => {
    await vscode.workspace
      .getConfiguration("failsafe.integrations.bicameral")
      .update("autoConnect", value, vscode.ConfigurationTarget.Workspace);
  });
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("failsafe.integrations.bicameral.command")
        || e.affectsConfiguration("failsafe.integrations.bicameral.autoConnect")
      ) {
        wireFromConfig();
      }
    }),
  );
  // B-BIC-2: extension-deactivate disposer — terminates the stdio subprocess
  // so it doesn't outlive its parent. .catch() swallows any disconnect error
  // (extension teardown must not throw).
  context.subscriptions.push({
    dispose: () => {
      const client = consoleServer.getBicameralClient();
      void client?.disconnect().catch(() => undefined);
    },
  });
}

/**
 * Background auto-connect attempt. Called after consoleServer.start() so any
 * resulting `bicameral.connected` broadcast reaches subscribers. Failures land
 * in the supplied output channel; never thrown — activation must not break.
 */
export function maybeAutoConnectBicameral(
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  output: { appendLine: (msg: string) => void },
): void {
  void (async () => {
    const cfg = vscode.workspace.getConfiguration("failsafe.integrations.bicameral");
    if (!cfg.get<boolean>("autoConnect", false)) return;
    const command = cfg.get<string>("command", "bicameral-mcp") || "bicameral-mcp";
    try {
      const probe = await probeInstallState({ command, workspaceRoot });
      if (probe.state !== "configured-not-running") return;
      const client = new BicameralMcpClient({ command, cwd: workspaceRoot });
      await client.connect();
      consoleServer.setBicameralClient(client);
      consoleServer.broadcastEvent({ type: "bicameral.connected" });
    } catch (err) {
      output.appendLine(`[bicameral] auto-connect failed: ${String(err)}`);
    }
  })();
}
