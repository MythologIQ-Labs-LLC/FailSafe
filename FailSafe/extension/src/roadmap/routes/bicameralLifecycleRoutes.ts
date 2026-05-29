// Bicameral lifecycle + config routes (B-INT-6 decomposition).
// status probe · install bridge · connect/disconnect · auto-connect toggle ·
// upstream snapshot. None of these are interceptor-governed tool calls.

import { Request, Response } from "express";
import { runBicameralInstall, probeInstallState } from "../../integrations/bicameral";
import type { InstallProgressEvent } from "../../integrations/bicameral";
import { type BicameralRouteDeps, parseInstallMode } from "./bicameralRouteShared";

export function registerBicameralLifecycleRoutes(
  app: import("express").Application,
  deps: BicameralRouteDeps,
): void {
  // GET /api/integrations/bicameral/status — install-state probe.
  // Used by both the Integrations tab (initial detect) and the Settings card
  // (version display). No spawn beyond `<command> --version`; safe for repeat.
  app.get("/api/integrations/bicameral/status", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    try {
      const probe = await probeInstallState({
        command: deps.getBicameralCommand(),
        workspaceRoot: deps.workspaceRoot,
      });
      const client = deps.getBicameralClient();
      const connected = client?.isConnected() === true;
      // If the MCP client is currently connected, the effective state is
      // 'running' regardless of the underlying config probe.
      const state = connected ? "running" : probe.state;
      // B-BIC-13: surface the client's tool capability set so the Integrations
      // empty-state can gate the /bicameral-ingest hint. Empty array when no
      // client is wired, the client predates getCapabilities (partial stubs),
      // or capabilities haven't been populated.
      const capabilities =
        typeof client?.getCapabilities === "function" ? [...client.getCapabilities()] : [];
      res.json({
        ok: true,
        state,
        version: probe.version,
        configPath: probe.configPath,
        connected,
        capabilities,
        autoConnect: deps.getAutoConnect(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/actions/bicameral-install — install bridge.
  // Browser cannot spawn child_process; this route is the boundary. Final
  // InstallProgressEvent returns in the response body; per-step progress is
  // broadcast over WebSocket for live render.
  app.post("/api/actions/bicameral-install", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const mode = parseInstallMode(req.body?.mode);
    if (!mode) {
      res.status(400).json({ ok: false, error: 'mode must be "solo" or "team"' });
      return;
    }
    try {
      const result = await runBicameralInstall(
        {
          workspaceRoot: deps.workspaceRoot,
          onProgress: (evt: InstallProgressEvent) => {
            deps.broadcast({
              type: evt.done ? "bicameral.install.complete" : "bicameral.install.progress",
              invocation: evt,
            });
          },
        },
        mode,
      );
      res.json({ ok: result.ok === true, report: result });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/actions/bicameral-connect — open MCP stdio session.
  app.post("/api/actions/bicameral-connect", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const client = deps.getBicameralClient();
    if (!client) {
      res.status(503).json({ ok: false, error: "Bicameral client not wired" });
      return;
    }
    try {
      await client.connect();
      deps.broadcast({ type: "bicameral.connected" });
      res.json({ ok: true, connected: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/actions/bicameral-disconnect — close MCP stdio session.
  app.post("/api/actions/bicameral-disconnect", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const client = deps.getBicameralClient();
    if (!client) {
      res.status(503).json({ ok: false, error: "Bicameral client not wired" });
      return;
    }
    try {
      await client.disconnect();
      deps.broadcast({ type: "bicameral.disconnected" });
      res.json({ ok: true, connected: false });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/integrations/bicameral/auto-connect — flip the autoConnect VS
  // Code setting from the Settings card without a separate command palette
  // trip. Body { enabled: boolean }.
  app.post("/api/integrations/bicameral/auto-connect", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const enabled = req.body?.enabled === true;
    try {
      await deps.setAutoConnect(enabled);
      res.json({ ok: true, autoConnect: enabled });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // GET /api/integrations/bicameral/upstream — Phase 4 / B-INT-3 extension.
  // Returns the latest UpstreamSnapshot (release version + open-issue count)
  // or 503 when no poll has completed yet. Local-only via rejectIfRemote.
  app.get("/api/integrations/bicameral/upstream", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const monitor = deps.upstreamMonitor;
    if (!monitor) {
      res.status(503).json({ ok: false, error: "UpstreamMonitor not wired" });
      return;
    }
    const snapshot = monitor.getSnapshot();
    if (!snapshot) {
      res.status(503).json({ ok: false, error: "Upstream snapshot not yet available" });
      return;
    }
    res.json({ ok: true, snapshot });
  });
}
