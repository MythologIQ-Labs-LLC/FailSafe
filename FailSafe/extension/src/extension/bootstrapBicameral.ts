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
import type { DriftToL3Mediator } from "../integrations/bicameral/DriftToL3Mediator";
import type { RiskRegisterDeps } from "../integrations/bicameral/DriftToRiskMediator";
import type { PreflightToL3Mediator } from "../integrations/bicameral/PreflightToL3Mediator";
import type { UpstreamMonitor } from "../integrations/bicameral/UpstreamMonitor";
import { EngineBackedInterceptor, McpInterceptor } from "../governance/interceptor";
import type { EnforcementEngineLike } from "../governance/interceptor/EngineBackedInterceptor";
import type { EventBus } from "../shared/EventBus";
import type { Logger } from "../shared/Logger";
import type { L3ApprovalRequest } from "../shared/types/l3-approval";
import { wireMediators, wireUpstreamMonitor } from "./bootstrapBicameralWiring";

/** B151: DID stamped onto receipts issued by this extension's interceptor. */
const INTERCEPTOR_ISSUED_BY = "did:failsafe:instance:extension";

/**
 * B-BIC-7: read the operator-configured extra anchored absolute roots accepted
 * for the bicameral command path. Non-array / non-string entries are dropped.
 */
function readBicameralExtraRoots(
  cfg: vscode.WorkspaceConfiguration,
): string[] {
  const raw = cfg.get<string[]>("extraCommandRoots", []);
  return Array.isArray(raw) ? raw.filter((r) => typeof r === "string") : [];
}

export interface ConsoleServerSurface {
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
  /** B-BIC-12: register the editor-open dep so the bicameral-open-binding
   *  route can open a decision's bound source file. Optional on the surface so
   *  older test fixtures that don't expose it are tolerated. */
  setBicameralOpenFileInEditor?(
    fn: ((filePath: string, startLine?: number) => Promise<void>) | null,
  ): void;
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

/** B-INT-2: L3 surface needed to wire the preflight mediator — attach
 *  evidence + register the mediator. Optional dep; absent → no preflight. */
interface L3PreflightWiringDeps {
  attachPreflightEvidence(
    approvalId: string,
    preflightMeta: Record<string, unknown>,
    flag: string,
  ): Promise<void>;
  setPreflightMediator(mediator: PreflightToL3Mediator | null): void;
}

interface ConfigProviderLike {
  getNumber?(key: string, defaultValue: number): number;
  getString?(key: string, defaultValue: string): string;
}

export interface BicameralIntegrationDeps {
  l3Service?: L3QueueDeps;
  /** B-INT-2: L3 service surface for the preflight mediator. When supplied,
   *  tier-3 actions are preflight-checked against bicameral decisions. */
  l3PreflightService?: L3PreflightWiringDeps;
  eventBus?: EventBus;
  logger?: Logger;
  /** B151: enforcement engine backing the universal governance interceptor.
   *  When provided, the bicameral tool routes govern through an McpInterceptor
   *  wrapping an EngineBackedInterceptor. Absent → routes behave un-governed. */
  enforcementEngine?: EnforcementEngineLike;
  /** Phase 4: optional config provider for UpstreamMonitor. When absent,
   *  the monitor uses defaults (24h poll, BicameralAI/bicameral-mcp). */
  configProvider?: ConfigProviderLike;
  /** B-BIC-18 (Batch 4): Risks Register surface for the DriftToRiskMediator.
   *  When supplied alongside eventBus, bicameral drift verdicts are mirrored
   *  into the Risks Register and ratify verdicts close them. Absent → no
   *  risk mirror (opt-in, same as the other mediators). */
  riskRegister?: RiskRegisterDeps;
}

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

/** B-BIC-6/7/9: validate the configured command through the symlink-resolving
 *  validator, then (re)construct the BicameralMcpClient + interceptor. The
 *  prior client is disconnected so its stdio subprocess is not orphaned. */
async function wireFromConfig(
  consoleServer: ConsoleServerSurface,
  workspaceRoot: string,
  deps: BicameralIntegrationDeps,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("failsafe.integrations.bicameral");
  const command = cfg.get<string>("command", "bicameral-mcp") || "bicameral-mcp";
  consoleServer.setBicameralAutoConnect(cfg.get<boolean>("autoConnect", false));
  const prior = consoleServer.getBicameralClient();
  const safe = await isSafeBicameralCommandResolved(command, {
    extraRoots: readBicameralExtraRoots(cfg),
  });
  if (!safe) {
    consoleServer.setBicameralCommand("bicameral-mcp");
    consoleServer.setBicameralClient(null);
    wireInterceptor(consoleServer, deps, null);
    void prior?.disconnect().catch(() => undefined);
    return;
  }
  consoleServer.setBicameralCommand(command);
  const client = new BicameralMcpClient({
    command,
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
  void wireFromConfig(consoleServer, workspaceRoot, deps);
  consoleServer.setBicameralOpenFileInEditor?.(openBicameralBinding);
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
        || e.affectsConfiguration("failsafe.integrations.bicameral.extraCommandRoots")
      ) {
        void wireFromConfig(consoleServer, workspaceRoot, deps);
      }
    }),
  );
  // B-BIC-2: deactivate disposer — terminates the stdio subprocess so it does
  // not outlive its parent. .catch() swallows any disconnect error.
  context.subscriptions.push({
    dispose: () => {
      void consoleServer.getBicameralClient()?.disconnect().catch(() => undefined);
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
    // B-BIC-7 (audit Finding A): thread extraCommandRoots through the probe so
    // auto-connect honours custom roots, not just the auto-applied defaults.
    try {
      const probe = await probeInstallState({
        command,
        workspaceRoot,
        extraRoots: readBicameralExtraRoots(cfg),
      });
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
