// Bicameral settings readers and the per-server wiring state shared by the client rewire and
// the startup auto-connect (bootstrapBicameral.ts), split out for the Section 4 razor.
import * as vscode from "vscode";
import type { BicameralMcpClient, probeInstallState } from "../integrations/bicameral";
import type { ConsoleServerSurface } from "./bootstrapBicameralTypes";
import { userLevelValue } from "../shared/userSetting";

/**
 * B-BIC-7: read the operator-configured extra anchored absolute roots accepted
 * for the bicameral command path. Non-array / non-string entries are dropped.
 */
export function readBicameralExtraRoots(
  cfg: vscode.WorkspaceConfiguration,
): string[] {
  const raw = userLevelValue<string[]>(cfg.inspect<string[]>("extraCommandRoots"), []);
  return Array.isArray(raw) ? raw.filter((r) => typeof r === "string") : [];
}

/** LD15: the command and auto-connect are read only from user settings (machine scope). */
export const readCommand = (cfg: vscode.WorkspaceConfiguration): string =>
  userLevelValue<string>(cfg.inspect<string>("command"), "bicameral-mcp") || "bicameral-mcp";
export const readAutoConnect = (cfg: vscode.WorkspaceConfiguration): boolean =>
  userLevelValue<boolean>(cfg.inspect<boolean>("autoConnect"), false) === true;

/** LD16 (a): the latest rewire per server; only that one assigns a client. */
export const wireGenerations = new WeakMap<ConsoleServerSurface, number>();
/** The latest in-flight rewire, so auto-connect cannot outrun bootstrap or a settings change. */
export const clientWireTasks = new WeakMap<ConsoleServerSurface, Promise<void>>();

/**
 * B233: allow a startup connect only after the latest configured client is wired.
 * A configuration change can start another rewire while this one is awaiting.
 */
export async function awaitCurrentWiring(server: ConsoleServerSurface): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const task = clientWireTasks.get(server);
    if (!task) return false;
    await task;
    if (clientWireTasks.get(server) === task) return true;
  }
  return false;
}

/** The opted-in command when the install is configured but not running; otherwise undefined. */
export async function autoConnectCommand(
  workspaceRoot: string, inspectInstall: typeof probeInstallState,
): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration("failsafe.integrations.bicameral");
  if (!readAutoConnect(cfg)) return undefined;
  const command = readCommand(cfg);
  const probe = await inspectInstall({
    command,
    workspaceRoot,
    extraRoots: readBicameralExtraRoots(cfg),
  });
  return probe.state === "configured-not-running" ? command : undefined;
}

/** B233: the connect may publish only while this exact governed binding is still current. */
export function governedBindingCheck(
  consoleServer: ConsoleServerSurface, client: BicameralMcpClient, command: string,
): () => boolean {
  const generation = wireGenerations.get(consoleServer);
  return (): boolean => {
    const currentCfg = vscode.workspace.getConfiguration("failsafe.integrations.bicameral");
    return generation === wireGenerations.get(consoleServer)
      && consoleServer.getBicameralClient() === client
      && readAutoConnect(currentCfg)
      && readCommand(currentCfg) === command
      && (!consoleServer.getMcpInterceptor
        || consoleServer.getMcpInterceptor()?.getClient() === client);
  };
}
