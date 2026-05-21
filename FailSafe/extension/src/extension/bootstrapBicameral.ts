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
import { EngineBackedInterceptor, McpInterceptor } from "../governance/interceptor";
import type { EnforcementEngineLike } from "../governance/interceptor/EngineBackedInterceptor";
import type { EventBus } from "../shared/EventBus";
import type { Logger } from "../shared/Logger";
import type { L3ApprovalRequest } from "../shared/types/l3-approval";

/** B151: DID stamped onto receipts issued by this extension's interceptor. */
const INTERCEPTOR_ISSUED_BY = "did:failsafe:instance:extension";

interface ConsoleServerSurface {
  setBicameralAutoConnect(value: boolean): void;
  setBicameralCommand(cmd: string): void;
  setBicameralClient(c: BicameralMcpClient | null): void;
  setBicameralAutoConnectWriter(fn: (value: boolean) => Promise<void>): void;
  broadcastEvent(data: Record<string, unknown>): void;
  /** B-BIC-2: typed accessor for the lazily-wired MCP client. */
  getBicameralClient(): BicameralMcpClient | null;
  /** B151: register the universal governance interceptor that the bicameral
   *  tool routes govern through. Null when no enforcement engine is wired. */
  setMcpInterceptor?(i: McpInterceptor | null): void;
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
  /** B151: enforcement engine backing the universal governance interceptor.
   *  When provided, the bicameral tool routes govern through an McpInterceptor
   *  wrapping an EngineBackedInterceptor. Absent → routes behave un-governed. */
  enforcementEngine?: EnforcementEngineLike;
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
  // B151: register the universal governance interceptor wrapping the freshly
  // wired client. Skipped when no enforcement engine is available or the
  // ConsoleServer surface doesn't expose the setter (older test fixtures).
  const wireInterceptor = (client: BicameralMcpClient | null): void => {
    if (!consoleServer.setMcpInterceptor) return;
    if (!client || !deps.enforcementEngine) {
      consoleServer.setMcpInterceptor(null);
      return;
    }
    const backing = new EngineBackedInterceptor(deps.enforcementEngine, INTERCEPTOR_ISSUED_BY);
    consoleServer.setMcpInterceptor(new McpInterceptor(client, backing));
  };

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
      wireInterceptor(null);
      void prior?.disconnect().catch(() => undefined);
      return;
    }
    consoleServer.setBicameralCommand(command);
    const client = new BicameralMcpClient({
      command,
      cwd: workspaceRoot,
      // B-BIC-9: idle disconnect TTL (default 15min, 0 disables).
      idleDisconnectMs: cfg.get<number>("idleDisconnectMs", 900_000),
    });
    consoleServer.setBicameralClient(client);
    wireInterceptor(client);
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
  // BicameralAI/bicameral-mcp). HTTP via global fetch (Node 18+).
  if (deps.logger && consoleServer.setUpstreamMonitor) {
    const monitor = new UpstreamMonitor({
      httpFetch: fetch,
      configProvider: deps.configProvider ?? {},
      logger: deps.logger,
    });
    monitor.start();
    consoleServer.setUpstreamMonitor(monitor);
    context.subscriptions.push({ dispose: () => monitor.dispose() });
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
