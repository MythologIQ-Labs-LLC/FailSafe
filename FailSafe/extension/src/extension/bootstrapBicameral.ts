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
import { DriftToL3Mediator } from "../integrations/bicameral/DriftToL3Mediator";
import { UpstreamMonitor } from "../integrations/bicameral/UpstreamMonitor";
import { httpFetchShim } from "../integrations/bicameral/http-fetch-shim";
import type { EventBus } from "../shared/EventBus";
import type { Logger } from "../shared/Logger";
import type { L3ApprovalRequest } from "../shared/types/l3-approval";

interface ConsoleServerSurface {
  setBicameralAutoConnect(value: boolean): void;
  setBicameralCommand(cmd: string): void;
  setBicameralClient(c: BicameralMcpClient | null): void;
  setBicameralAutoConnectWriter(fn: (value: boolean) => Promise<void>): void;
  broadcastEvent(data: Record<string, unknown>): void;
  /** B-BIC-2: typed accessor for the lazily-wired MCP client. */
  getBicameralClient(): BicameralMcpClient | null;
  /** B-BIC-16: setter for the drift-to-L3 mediator so the BicameralRoute
   *  drift handler can forward results without threading the mediator
   *  through every call site. Null when no mediator wired (test fixtures). */
  setDriftToL3Mediator?(m: DriftToL3Mediator | null): void;
  /** Phase 4: setter for the upstream monitor. Null when test fixtures don't
   *  wire it (e.g. unit tests that don't exercise the upstream route). */
  setUpstreamMonitor?(m: UpstreamMonitor | null): void;
}

interface L3QueueDeps {
  queueL3Approval(
    request: Omit<L3ApprovalRequest, "id" | "state" | "queuedAt" | "slaDeadline">,
  ): Promise<string>;
}

interface ConfigProviderLike {
  getNumber?(key: string, defaultValue: number): number;
  getString?(key: string, defaultValue: string): string;
}

export interface BicameralIntegrationDeps {
  l3Service?: L3QueueDeps;
  eventBus?: EventBus;
  logger?: Logger;
  /** Phase 4: optional config provider for UpstreamMonitor. When absent,
   *  the monitor uses defaults (24h poll, BicameralAI/bicameral-mcp). */
  configProvider?: ConfigProviderLike;
}

export function wireBicameralIntegration(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  deps: BicameralIntegrationDeps = {},
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
    consoleServer.setBicameralClient(new BicameralMcpClient({
      command,
      cwd: workspaceRoot,
      // B-BIC-9: idle disconnect TTL (default 15min, 0 disables).
      idleDisconnectMs: cfg.get<number>("idleDisconnectMs", 900_000),
    }));
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

  // B-BIC-16: drift-to-L3 mediator. Wired only when all three deps are
  // supplied (production path through bootstrapServers). Test fixtures that
  // don't provide deps get no mediator — the integration is opt-in.
  if (deps.l3Service && deps.eventBus && deps.logger && consoleServer.setDriftToL3Mediator) {
    const client = consoleServer.getBicameralClient();
    if (client) {
      const mediator = new DriftToL3Mediator({
        client,
        l3Service: deps.l3Service,
        eventBus: deps.eventBus,
        logger: deps.logger,
      });
      consoleServer.setDriftToL3Mediator(mediator);
      context.subscriptions.push({ dispose: () => mediator.dispose() });
    }
  }

  // Phase 4: upstream monitor. Wired only when logger is present so error
  // paths can warn. configProvider falls back to defaults (24h poll,
  // BicameralAI/bicameral-mcp).
  //
  // RC1: never let this non-critical 24h background poller abort extension
  // activation. The whole construction is wrapped in try/catch, and the
  // HTTP transport is feature-detected — the extension-host Node runtime
  // does not reliably expose a global `fetch`, so we fall back to a tiny
  // node:https GET shim that satisfies the subset of the Response API the
  // UpstreamMonitor consumes.
  if (deps.logger && consoleServer.setUpstreamMonitor) {
    wireUpstreamMonitor(context, consoleServer, deps.configProvider, deps.logger);
  }
}

/**
 * Construct + start the UpstreamMonitor. Isolated + fail-safe: any error here
 * (bad config, transport init failure, future regression) is caught and
 * logged — it must NEVER bubble up and abort extension activation, because
 * the monitor is a non-critical background poller.
 */
function wireUpstreamMonitor(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  configProvider: ConfigProviderLike | undefined,
  logger: Logger,
): void {
  try {
    // RC1: feature-detect the global `fetch`. Falls back to the node:https
    // shim on hosts (e.g. some vscode-test electron runtimes) that lack it.
    const httpFetch: typeof fetch =
      typeof fetch === "function" ? fetch : httpFetchShim;
    const monitor = new UpstreamMonitor({
      httpFetch,
      configProvider: configProvider ?? {},
      logger,
    });
    monitor.start();
    consoleServer.setUpstreamMonitor?.(monitor);
    context.subscriptions.push({ dispose: () => monitor.dispose() });
  } catch (err) {
    logger.warn("UpstreamMonitor wiring skipped (non-critical)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
