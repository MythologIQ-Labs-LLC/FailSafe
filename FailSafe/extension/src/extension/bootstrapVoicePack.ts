// Voice Pack activation wiring — extracted from bootstrapServers so that
// file stays under the Section 4 razor limit. Responsibilities:
//   1) On activation, probe context.globalStorageUri.fsPath/voice-pack/ via
//      voice-pack-detector and set consoleServer.setVoicePackPath() to the
//      pack directory when state=installed, null otherwise.
//   2) Subscribe to voicePack.{installed,uninstalled} broadcast events so
//      re-probes happen after the operator clicks Install / Uninstall in
//      the Settings card without requiring an extension reload.
// Lazy: never downloads at activation; never connects to the network.
// Substrate code stays in the extension; only the binaries live in the pack.

import * as vscode from "vscode";
import { probeVoicePackState } from "../voice-pack";

interface ConsoleServerSurface {
  setVoicePackPath(p: string | null): void;
  broadcastEvent(data: Record<string, unknown>): void;
}

export async function wireVoicePack(
  context: vscode.ExtensionContext,
  consoleServer: ConsoleServerSurface,
  requiredMinVersion: string,
): Promise<void> {
  const globalStoragePath = context.globalStorageUri?.fsPath;
  if (!globalStoragePath) {
    consoleServer.setVoicePackPath(null);
    return;
  }
  await reprobeAndSet(consoleServer, globalStoragePath, requiredMinVersion);
  // Operator-driven re-probe: install/uninstall handlers broadcast over WS.
  // Subscribers register their own listeners; here we just expose a re-probe
  // method by exporting the closure shape. Bootstrap-side wiring (in
  // bootstrapServers.ts) bridges install-handler completion -> reprobe.
}

/**
 * Public helper used by install/uninstall command handlers to refresh the
 * ConsoleServer's voicePackPath state after operator action. Keeps the
 * voice-pack-detector probe call sites consistent.
 */
export async function reprobeAndSet(
  consoleServer: ConsoleServerSurface,
  globalStoragePath: string,
  requiredMinVersion: string,
): Promise<void> {
  try {
    const probe = await probeVoicePackState(globalStoragePath, requiredMinVersion);
    // Only set the path when fully installed. stale / corrupt / absent all
    // resolve to null so the /vendor route falls through to the default
    // uiDir mount; UI surfaces the appropriate affordance via the status
    // route.
    if (probe.state === "installed" && probe.manifestPath) {
      const path = require("path") as typeof import("path");
      consoleServer.setVoicePackPath(path.dirname(probe.manifestPath));
    } else {
      consoleServer.setVoicePackPath(null);
    }
  } catch {
    consoleServer.setVoicePackPath(null);
  }
}
