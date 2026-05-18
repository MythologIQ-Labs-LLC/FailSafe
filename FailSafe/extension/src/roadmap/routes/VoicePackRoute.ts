// Voice Pack integration routes.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 3.
// Mirrors BicameralRoute.ts shape: status probe + install/uninstall actions.

import { Request, Response } from "express";
import {
  probeVoicePackState,
  installVoicePack,
  uninstallVoicePack,
} from "../../voice-pack";
import type { InstallProgressEvent } from "../../voice-pack";

export interface VoicePackRouteDeps {
  rejectIfRemote: (req: Request, res: Response) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  /** Operator's globalStorage path; pack directory is `<path>/voice-pack/`. */
  globalStoragePath: string;
  /** Extension version — used as the version pin for both probe and install. */
  extensionVersion: string;
  /** Called after install/uninstall completes to refresh the ConsoleServer
   *  voicePackPath so the /vendor static mount picks up the new state. */
  onPackStateChanged: () => Promise<void> | void;
}

export function setupVoicePackRoutes(
  app: import("express").Application,
  deps: VoicePackRouteDeps,
): void {
  // GET /api/integrations/voice-pack/status — install probe (state + version
  // + manifestPath + missingFiles when corrupt + requiredMinVersion). Safe
  // to poll; pure-fs read, no spawn, no network.
  app.get("/api/integrations/voice-pack/status", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    try {
      const probe = await probeVoicePackState(deps.globalStoragePath, deps.extensionVersion);
      const diskUsageBytes = probe.state === "installed" && probe.manifestPath
        ? safeDiskUsage(probe.manifestPath)
        : undefined;
      res.json({
        ok: true,
        state: probe.state,
        version: probe.version,
        manifestPath: probe.manifestPath,
        missingFiles: probe.missingFiles,
        requiredMinVersion: deps.extensionVersion,
        diskUsageBytes,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/actions/install-voice-pack — operator-triggered install bridge.
  // Browser cannot fetch + spawn; this route is the boundary. Final report
  // returns in the response body; per-step progress broadcast over WebSocket.
  app.post("/api/actions/install-voice-pack", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    try {
      const report = await installVoicePack({
        globalStoragePath: deps.globalStoragePath,
        version: deps.extensionVersion,
        onProgress: (evt: InstallProgressEvent) => {
          deps.broadcast({
            type: evt.status === "error" ? "voicePack.install.error" : "voicePack.install.progress",
            invocation: evt,
          });
        },
      });
      await deps.onPackStateChanged();
      deps.broadcast({ type: "voicePack.install.complete", report });
      res.json({ ok: true, report });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      deps.broadcast({ type: "voicePack.install.error", error });
      res.status(500).json({ ok: false, error });
    }
  });

  // POST /api/actions/uninstall-voice-pack — operator-triggered uninstall.
  // Synchronous fs rmSync; broadcasts so the Settings card + Integrations
  // tab re-probe immediately.
  app.post("/api/actions/uninstall-voice-pack", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    try {
      uninstallVoicePack(deps.globalStoragePath);
      await deps.onPackStateChanged();
      deps.broadcast({ type: "voicePack.uninstalled" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}

function safeDiskUsage(manifestPath: string): number | undefined {
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const dir = path.dirname(manifestPath);
    let total = 0;
    const walk = (p: string) => {
      for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
        const child = path.join(p, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.isFile()) total += fs.statSync(child).size;
      }
    };
    walk(dir);
    return total;
  } catch {
    return undefined;
  }
}
