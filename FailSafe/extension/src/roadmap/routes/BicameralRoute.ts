// Bicameral MCP integration routes.
// Phase 3 polish — wires install, status probe, connect/disconnect, and the
// four v1 tools (history/drift/ratify/preflight) to the Integrations tab UI.
// Install is the only spawn-boundary route (delegates argv validation to
// install-handler). Tool routes call BicameralMcpClient when it has been
// wired by bootstrapServers; otherwise return 503 not-wired.
//
// B151: the 3 tool routes (history/drift/ratify) are governed through the
// universal McpInterceptor when one is wired. The interceptor yields a B190
// ReceiptContract; a non-ALLOW verdict short-circuits the route via the
// receipt→HTTP table below. When no interceptor is wired (legacy fixtures)
// the routes behave exactly as before migration.

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
import type { McpInterceptor, McpEnvelope } from "../../governance/interceptor";
import type { ReceiptContract } from "../../contracts";

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
  /**
   * B-BIC-16: optional drift-to-L3 mediator. When provided, the drift handler
   * forwards results so newly-drifted decisions auto-enqueue L3 entries.
   */
  driftToL3Mediator?: {
    onDriftResult(drifted: import("../../integrations/bicameral/types").BicameralDriftStatus[]): Promise<void>;
  };
  /**
   * Phase 4: optional upstream monitor. When provided, the
   * /api/integrations/bicameral/upstream route returns the latest snapshot
   * (release version + open-issue count) or 503 if no poll has completed.
   */
  upstreamMonitor?: {
    getSnapshot(): import("../../integrations/bicameral/types").UpstreamSnapshot | null;
  };
  /**
   * B151: optional universal governance interceptor. When provided, the 3 tool
   * routes (history/drift/ratify) govern their tool call through it before
   * touching the bicameral client. A non-ALLOW receipt short-circuits via the
   * receipt→HTTP table. Null/absent → routes behave exactly as pre-migration.
   */
  getMcpInterceptor?: () => McpInterceptor | null;
  /**
   * B-BIC-12: optional editor-open dep. When provided, the
   * /api/actions/bicameral-open-binding route opens a decision's bound source
   * file in the editor. Wired in bootstrapBicameral.ts to vscode.open so
   * BicameralRoute.ts never imports vscode. Absent → that route 503s.
   */
  openFileInEditor?: (filePath: string, startLine?: number) => Promise<void>;
}

/**
 * B151: receipt→HTTP mapping for non-ALLOW verdicts. ALLOW is absent — it
 * means "proceed", handled by the caller. Each entry maps a blocking verdict
 * to the HTTP status + error envelope returned in its place.
 */
const RECEIPT_HTTP_TABLE: Record<string, { status: number }> = {
  BLOCK: { status: 403 },
  ESCALATE: { status: 409 },
  MODIFY: { status: 409 },
  QUARANTINE: { status: 500 },
};

/**
 * B151: govern a bicameral tool call through the optional McpInterceptor.
 * Returns `null` when the route may proceed (no interceptor wired, or an ALLOW
 * verdict). Returns `true` when the request has been answered by a non-ALLOW
 * receipt (the caller must stop). Pure HTTP side effect on the `res`.
 */
async function governToolCall(
  deps: BicameralRouteDeps,
  envelope: McpEnvelope,
  res: Response,
): Promise<boolean> {
  const interceptor = deps.getMcpInterceptor?.() ?? null;
  if (!interceptor) return false;
  const receipt: ReceiptContract = await interceptor.intercept(envelope);
  if (receipt.verdict === "ALLOW") return false;
  const mapped = RECEIPT_HTTP_TABLE[receipt.verdict] ?? { status: 500 };
  res.status(mapped.status).json({
    ok: false,
    error: receipt.verdictRationale ?? `governance verdict: ${receipt.verdict}`,
    verdict: receipt.verdict,
  });
  return true;
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
      // B151: govern the tool call through the universal interceptor.
      if (await governToolCall(deps, { name: "bicameral.history", arguments: {} }, res)) {
        return;
      }
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
      // B151: govern the tool call through the universal interceptor.
      if (await governToolCall(
        deps,
        { name: "bicameral.drift", arguments: { file_path: filePath } },
        res,
      )) {
        return;
      }
      const drift = await client.drift(filePath);
      res.json({ ok: true, drift });
      // B-BIC-16: forward to drift-to-L3 mediator AFTER responding so a slow
      // L3 queue write doesn't delay the route response. Non-blocking;
      // mediator's own enqueue is wrapped in a try/catch with logger.warn.
      if (deps.driftToL3Mediator) {
        void deps.driftToL3Mediator.onDriftResult(drift).catch(() => undefined);
      }
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
      // B151: govern the tool call through the universal interceptor.
      if (await governToolCall(
        deps,
        { name: "bicameral.ratify", arguments: { decision_id: decisionId, verdict } },
        res,
      )) {
        return;
      }
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

  // POST /api/actions/bicameral-open-binding — open a decision's bound source
  // file in the editor. B-BIC-12: additive route, not interceptor-governed (it
  // opens an editor file, not an MCP tool call). The injected openFileInEditor
  // dep resolves the path via vscode.Uri.file (no shell); 503 when unwired.
  app.post("/api/actions/bicameral-open-binding", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    if (!deps.openFileInEditor) {
      res.status(503).json({ ok: false, error: "openFileInEditor not wired" });
      return;
    }
    const filePath = typeof req.body?.filePath === "string" ? req.body.filePath : "";
    if (!filePath) {
      res.status(400).json({ ok: false, error: "filePath required (non-empty string)" });
      return;
    }
    const startLine = typeof req.body?.startLine === "number" ? req.body.startLine : undefined;
    try {
      await deps.openFileInEditor(filePath, startLine);
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

function parseInstallMode(raw: unknown): InstallMode | null {
  if (raw === "solo" || raw === "team") return raw;
  return null;
}

function parseVerdict(raw: unknown): BicameralRatifyVerdict | null {
  if (raw === "ratify" || raw === "reject") return raw;
  return null;
}
