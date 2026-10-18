// Bicameral lifecycle + config routes (B-INT-6 decomposition).
// status probe · install bridge · connect/disconnect · auto-connect toggle ·
// upstream snapshot. None of these are interceptor-governed tool calls.

import { Request, Response } from "express";
import { runBicameralInstall, probeInstallState } from "../../integrations/bicameral";
import type { InstallProgressEvent } from "../../integrations/bicameral";
import { BICAMERAL_PIP_SPEC } from "../../integrations/bicameral/install-handler";
import { type BicameralRouteDeps, parseInstallMode } from "./bicameralRouteShared";
import { consoleRequestGuard } from "./consoleRequestGuard";
import { authorizeOperatorAction, authorizationFields, newInstallLimiter } from "./installAuthorization";

export function registerBicameralLifecycleRoutes(
  app: import("express").Application,
  deps: BicameralRouteDeps,
): void {
  const rejectIfRemote = (req: Request, res: Response) => deps.rejectIfRemote(req, res);
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
  // #538: guard before the limiter; the install runs only after the operator approves the
  // pinned pip spec and setup command in a modal VS Code dialog. `mode` is the only input.
  app.post("/api/actions/bicameral-install", consoleRequestGuard(rejectIfRemote), newInstallLimiter(), async (req: Request, res: Response) => {
    const requested = parseInstallMode(req.body?.mode);
    if (!requested) {
      res.status(400).json({ ok: false, error: 'mode must be "solo" or "team"' });
      return;
    }
    const approved = await authorizeOperatorAction(
      { ...deps, getLedgerManager: () => deps.ledgerManager },
      res,
      { kind: "bicameral-install", mode: requested, pipSpec: BICAMERAL_PIP_SPEC, setupCommand: `bicameral-mcp setup --mode ${requested}` },
      "/api/actions/bicameral-install",
    );
    if (!approved) return;
    const { mode } = approved.operation;
    const operationId = approved.operationId;
    try {
      const result = await (deps.runInstall ?? runBicameralInstall)(
        {
          workspaceRoot: deps.workspaceRoot,
          // GH #165: team-mode setup needs an interactive TTY for the Google
          // Drive OAuth — route it through the integrated terminal bridge.
          // Resolved at request time (the runner is wired lazily by bootstrap);
          // undefined when no terminal is available → handler errors with guidance.
          runInTerminal: deps.getRunInTerminal?.() ?? undefined,
          onProgress: (evt: InstallProgressEvent) => {
            deps.broadcast({
              type: evt.done ? "bicameral.install.complete" : "bicameral.install.progress",
              operationId,
              invocation: evt,
            });
          },
        },
        mode,
      );
      // LD16 (b): a client is wired only for a command that resolves, so a
      // successful install re-wires it; Connect then works without a reload.
      if (result.ok === true) await deps.rewireBicameral?.();
      res.json({ ok: result.ok === true, report: result, ...authorizationFields(approved) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e), ...authorizationFields(approved) });
    }
  });

  // POST /api/actions/bicameral-connect — open MCP stdio session.
  // #538: Host and Origin are checked (the Console sends this body-less, so no JSON check).
  app.post("/api/actions/bicameral-connect", consoleRequestGuard(rejectIfRemote, { requireJson: false }), async (req: Request, res: Response) => {
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
  // #538: Host and Origin are checked; the Settings card already sends JSON, so it is required.
  app.post("/api/integrations/bicameral/auto-connect", consoleRequestGuard(rejectIfRemote), async (req: Request, res: Response) => {
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
