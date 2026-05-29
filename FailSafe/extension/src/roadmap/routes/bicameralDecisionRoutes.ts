// Bicameral decision-feed + governed routes (B-INT-6 decomposition).
// history · drift · ratify · open-binding. The first three are governed
// through the universal McpInterceptor (B151) via governToolCall; drift +
// ratify additionally emit bicameral.verdict events and feed L3/ledger.

import { Request, Response } from "express";
import {
  type BicameralRouteDeps,
  governToolCall,
  emitDriftVerdicts,
  parseVerdict,
} from "./bicameralRouteShared";

export function registerBicameralDecisionRoutes(
  app: import("express").Application,
  deps: BicameralRouteDeps,
): void {
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
      // B-BIC-17/18 (Batch 4): emit one bicameral.verdict event per drifted/
      // in-sync decision so Sentinel classification + the Risks Register
      // mirror pick them up. Additive, non-blocking, absent-eventBus-safe.
      emitDriftVerdicts(deps, drift);
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
      // B-BIC-17/18 (Batch 4): emit a bicameral.verdict event so a ratified
      // decision closes its mirrored Risks Register entry. Additive, non-
      // blocking, absent-eventBus-safe.
      if (deps.eventBus) {
        try {
          deps.eventBus.emit("bicameral.verdict", {
            decisionId,
            verdict: "ratified",
          });
        } catch {
          /* a faulty subscriber must not break the ratify route (Batch 4) */
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
}
