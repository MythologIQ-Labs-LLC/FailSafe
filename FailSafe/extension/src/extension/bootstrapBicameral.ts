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
  isSafeBicameralCommandResolved,
  probeInstallState,
} from "../integrations/bicameral";
import { EngineBackedInterceptor, McpInterceptor } from "../governance/interceptor";
import {
  connectWiredBicameral,
  type BicameralIntegrationDeps,
  type ConsoleServerSurface,
} from "./bootstrapBicameralTypes";
import { wireMediators, wireUpstreamMonitor } from "./bootstrapBicameralWiring";
import { trustedCommandPath } from "../shared/exec/trustedExecutable";
import {
  autoConnectCommand,
  awaitCurrentWiring,
  clientWireTasks,
  governedBindingCheck,
  readAutoConnect,
  readBicameralExtraRoots,
  readCommand,
  wireGenerations,
} from "./bootstrapBicameralSettings";

export { connectWiredBicameral } from "./bootstrapBicameralTypes";
export type { BicameralIntegrationDeps, ConsoleServerSurface } from "./bootstrapBicameralTypes";

/** B151: DID stamped onto receipts issued by this extension's interceptor. */
const INTERCEPTOR_ISSUED_BY = "did:failsafe:instance:extension";

export function wireBicameralIntegration(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  deps: BicameralIntegrationDeps = {},
): void {
  wireBicameralClient(context, consoleServer, workspaceRoot, deps);
  wireMediators(context, consoleServer, deps);
  wireUpstreamMonitor(context, consoleServer, deps);
}

/** B151: register the universal governance interceptor wrapping the freshly
 *  wired client. Skipped when no enforcement engine is available or the
 *  ConsoleServer surface doesn't expose the setter (older test fixtures). */
function wireInterceptor(
  consoleServer: ConsoleServerSurface,
  deps: BicameralIntegrationDeps,
  client: BicameralMcpClient | null,
): void {
  if (!consoleServer.setMcpInterceptor) return;
  if (!client || !deps.enforcementEngine) {
    consoleServer.setMcpInterceptor(null);
    return;
  }
  const backing = new EngineBackedInterceptor(deps.enforcementEngine, INTERCEPTOR_ISSUED_BY);
  consoleServer.setMcpInterceptor(new McpInterceptor(client, backing));
}

function logBicameral(deps: BicameralIntegrationDeps, what: string, err: unknown): void {
  if (deps.logger) deps.logger.warn(`[bicameral] ${what}`, err);
  else console.warn(`[bicameral] ${what}: ${String(err)}`);
}

/** B-BIC-6/7/9: validate the configured command through the symlink-resolving
 *  validator, then (re)construct the BicameralMcpClient + interceptor. The
 *  prior client is disconnected so its stdio subprocess is not orphaned. */
async function wireFromConfig(
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  deps: BicameralIntegrationDeps,
): Promise<void> {
  const token = (wireGenerations.get(consoleServer) ?? 0) + 1;
  wireGenerations.set(consoleServer, token);
  const cfg = vscode.workspace.getConfiguration("failsafe.integrations.bicameral");
  const command = readCommand(cfg);
  consoleServer.setBicameralAutoConnect(readAutoConnect(cfg));
  const safe = await isSafeBicameralCommandResolved(command, {
    extraRoots: readBicameralExtraRoots(cfg),
  });
  // A rewire that started during the await assigns instead of this one.
  if (wireGenerations.get(consoleServer) !== token) return;
  // Read after the await, so the client being replaced is the one disconnected.
  const prior = consoleServer.getBicameralClient();
  // B211 (review delta LD14 (c)): the client only ever gets the trusted absolute file.
  let resolved: string | undefined;
  if (safe) {
    try { resolved = trustedCommandPath(command, workspaceRoot); } catch { resolved = undefined; }
  }
  if (!safe || !resolved) {
    consoleServer.setBicameralCommand("bicameral-mcp");
    consoleServer.setBicameralClient(null);
    wireInterceptor(consoleServer, deps, null);
    void prior?.disconnect().catch(() => undefined);
    return;
  }
  consoleServer.setBicameralCommand(command);
  const client = new BicameralMcpClient({
    command: resolved,
    cwd: workspaceRoot,
    idleDisconnectMs: cfg.get<number>("idleDisconnectMs", 900_000),
  });
  consoleServer.setBicameralClient(client);
  wireInterceptor(consoleServer, deps, client);
  void prior?.disconnect().catch(() => undefined);
}

/** B-BIC-12: open a decision's bound source file in the editor via
 *  vscode.Uri.file (no shell); scrolls to startLine via the open selection. */
async function openBicameralBinding(filePath: string, startLine?: number): Promise<void> {
  const line = Math.max(0, (startLine ?? 1) - 1);
  const position = new vscode.Position(line, 0);
  await vscode.commands.executeCommand(
    "vscode.open",
    vscode.Uri.file(filePath),
    { selection: new vscode.Range(position, position) },
  );
}

/** Wire the lazy BicameralMcpClient + autoConnect setting into ConsoleServer,
 *  the editor-open dep, the config-change rewire watcher and the deactivate
 *  disposer. Extracted from wireBicameralIntegration for the razor limit. */
function wireBicameralClient(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  deps: BicameralIntegrationDeps,
): void {
  // LD16: every rewire logs a failure instead of leaving an unhandled rejection;
  // the install route awaits this one, so it never rejects.
  const rewire = (): Promise<void> => {
    const task = wireFromConfig(consoleServer, workspaceRoot, deps)
      .catch((err) => logBicameral(deps, "rewire failed", err));
    clientWireTasks.set(consoleServer, task);
    return task;
  };
  void rewire();
  consoleServer.setBicameralRewire?.(rewire);
  consoleServer.setBicameralOpenFileInEditor?.(openBicameralBinding);
  consoleServer.setBicameralAutoConnectWriter(async (value) => {
    await vscode.workspace
      .getConfiguration("failsafe.integrations.bicameral")
      .update("autoConnect", value, vscode.ConfigurationTarget.Global);
  });
  watchBicameralSettings(context, rewire);
  registerBicameralDisposer(context, consoleServer);
}

/** Re-resolve the command when its settings or the open folders change. */
function watchBicameralSettings(context: vscode.ExtensionContext, rewire: () => Promise<void>): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("failsafe.integrations.bicameral.command")
        || e.affectsConfiguration("failsafe.integrations.bicameral.autoConnect")
        || e.affectsConfiguration("failsafe.integrations.bicameral.extraCommandRoots")
      ) {
        void rewire();
      }
    }),
    // The excluded folders follow the open folders, so the command is resolved again.
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void rewire();
    }),
  );
}

/** B-BIC-2: deactivate disposer — terminates the stdio subprocess so it does
 *  not outlive its parent. .catch() swallows any disconnect error. */
function registerBicameralDisposer(context: vscode.ExtensionContext, consoleServer: ConsoleServerSurface): void {
  context.subscriptions.push({
    dispose: () => {
      // LD16 (a): a rewire still awaiting is superseded, so nothing is wired after deactivate.
      wireGenerations.set(consoleServer, (wireGenerations.get(consoleServer) ?? 0) + 1);
      clientWireTasks.delete(consoleServer);
      void consoleServer.getBicameralClient()?.disconnect().catch(() => undefined);
    },
  });
}

/**
 * Background auto-connect attempt. Called after consoleServer.start() so the
 * broadcast reaches subscribers. Reuses the configured, interceptor-bound client
 * instead of constructing an ungoverned replacement (B233).
 */
export function maybeAutoConnectBicameral(
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  output: { appendLine: (msg: string) => void },
  /** Internal test seam: production always uses the trusted install-state probe. */
  inspectInstall: typeof probeInstallState = probeInstallState,
): void {
  void (async () => {
    try {
      const command = await autoConnectCommand(workspaceRoot, inspectInstall);
      if (command === undefined) return;
      // The startup rewire, not a second client constructor, owns the interceptor.
      if (!(await awaitCurrentWiring(consoleServer))) {
        output.appendLine("[bicameral] auto-connect skipped: client wiring is unavailable or changing");
        return;
      }
      const client = consoleServer.getBicameralClient();
      if (!client) return;
      const isCurrent = governedBindingCheck(consoleServer, client, command);
      if (!isCurrent()) {
        output.appendLine("[bicameral] auto-connect skipped: governed client binding changed");
        return;
      }
      await connectWiredBicameral(client, isCurrent, () =>
        consoleServer.broadcastEvent({ type: "bicameral.connected" }));
    } catch (err) {
      output.appendLine(`[bicameral] auto-connect failed: ${String(err)}`);
    }
  })();
}
