// Bicameral MCP integration routes.
// Phase 3 polish — wires install, status probe, connect/disconnect, and the
// four v1 tools (history/drift/ratify/preflight) to the Integrations tab UI.
// Install is the only spawn-boundary route (delegates argv validation to
// install-handler). Tool routes call BicameralMcpClient when it has been
// wired by bootstrapServers; otherwise return 503 not-wired.

import { Request, Response } from "express";
import {
  runBicameralInstall,
  probeInstallState,
} from "../../integrations/bicameral";
import type {
  InstallMode,
  InstallProgressEvent,
  BicameralRatifyVerdict,
  BicameralMcpClient,
} from "../../integrations/bicameral";

export interface BicameralRouteDeps {
  rejectIfRemote: (req: Request, res: Response) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  workspaceRoot: string;
  /** Returns the bicameral CLI command (operator-overridable via VS Code settings). */
  getBicameralCommand: () => string;
  /**
   * Returns the lazily-constructed MCP client. May return null when bootstrap
   * hasn't wired one (e.g., unit test contexts). Routes must 503 when null.
   */
  getBicameralClient: () => BicameralMcpClient | null;
  /** Read the operator-facing autoConnect setting. */
  getAutoConnect: () => boolean;
  /**
   * Persist the autoConnect toggle. Implemented in bootstrap as a VS Code
   * configuration.update(); tests can stub. May reject; route surfaces error.
   */
  setAutoConnect: (value: boolean) => Promise<void>;
  /**
   * B-BIC-1: optional ledger handle. When provided, the ratify handler appends
   * a USER_OVERRIDE entry so the operator's intentional acceptance is Merkle-
   * anchored. Non-blocking — ledger write failures don't break the ratify
   * response.
   */
  ledgerManager?: {
    isAvailable(): boolean;
    appendEntry(entry: {
      eventType: string;
      agentDid: string;
      payload: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

export function setupBicameralRoutes(
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
      res.json({
        ok: true,
        state,
        version: probe.version,
        configPath: probe.configPath,
        connected,
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

  // POST /api/actions/bicameral-history — fetch feature briefs.
  app.post("/api/actions/bicameral-history", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const client = deps.getBicameralClient();
    if (!client) {
      res.status(503).json({ ok: false, error: "Bicameral client not wired" });
      return;
    }
    if (!client.isConnected()) {
      res.status(409).json({ ok: false, error: "Bicameral not connected — POST /bicameral-connect first" });
      return;
    }
    try {
      const features = await client.history();
      res.json({ ok: true, features });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/actions/bicameral-drift — fetch drift status for a file path.
  app.post("/api/actions/bicameral-drift", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const client = deps.getBicameralClient();
    if (!client) {
      res.status(503).json({ ok: false, error: "Bicameral client not wired" });
      return;
    }
    if (!client.isConnected()) {
      res.status(409).json({ ok: false, error: "Bicameral not connected" });
      return;
    }
    const filePath = typeof req.body?.filePath === "string" ? req.body.filePath : "";
    if (!filePath) {
      res.status(400).json({ ok: false, error: "filePath required (string)" });
      return;
    }
    try {
      const drift = await client.drift(filePath);
      res.json({ ok: true, drift });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // POST /api/actions/bicameral-ratify — ratify or reject a decision.
  app.post("/api/actions/bicameral-ratify", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const client = deps.getBicameralClient();
    if (!client) {
      res.status(503).json({ ok: false, error: "Bicameral client not wired" });
      return;
    }
    if (!client.isConnected()) {
      res.status(409).json({ ok: false, error: "Bicameral not connected" });
      return;
    }
    const decisionId = typeof req.body?.decisionId === "string" ? req.body.decisionId : "";
    const verdict = parseVerdict(req.body?.verdict);
    if (!decisionId) {
      res.status(400).json({ ok: false, error: "decisionId required (string)" });
      return;
    }
    if (!verdict) {
      res.status(400).json({ ok: false, error: 'verdict must be "ratify" or "reject"' });
      return;
    }
    try {
      await client.ratify(decisionId, verdict);
      // B-BIC-1: anchor the operator's ratify decision into META_LEDGER as a
      // USER_OVERRIDE entry. Ratify is the canonical "operator intentionally
      // accepted X" event. Non-blocking — a ledger write failure must not
      // break the ratify response (the bicameral side has already accepted).
      if (deps.ledgerManager?.isAvailable()) {
        const rationale =
          typeof req.body?.rationale === "string" ? req.body.rationale : "";
        try {
          await deps.ledgerManager.appendEntry({
            eventType: "USER_OVERRIDE",
            agentDid: "vscode-user",
            payload: {
              action: "bicameral.ratify",
              decisionId,
              verdict,
              rationale,
            },
          });
        } catch {
          /* ledger write failure is non-blocking by design (B-BIC-1) */
        }
      }
      res.json({ ok: true });
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
}

function parseInstallMode(raw: unknown): InstallMode | null {
  if (raw === "solo" || raw === "team") return raw;
  return null;
}

function parseVerdict(raw: unknown): BicameralRatifyVerdict | null {
  if (raw === "ratify" || raw === "reject") return raw;
  return null;
}
