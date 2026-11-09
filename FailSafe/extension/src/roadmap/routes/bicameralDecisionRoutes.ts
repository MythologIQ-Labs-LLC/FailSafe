// Bicameral decision-feed + governed routes (B-INT-6 decomposition).
// history · drift · ratify · open-binding. The first three are governed
// through the universal McpInterceptor (B151) via governToolCall; drift +
// ratify additionally emit bicameral.verdict events and feed L3/ledger.

import { Request, Response } from "express";
import {
  type BicameralRouteDeps,
  governToolCall,
  rejectStaleBicameralClient,
  emitDriftVerdicts,
  parseVerdict,
} from "./bicameralRouteShared";
import {
  requireOperatorConfirmation,
  ratifyRequest,
  sanitizeDialogText,
  REASON_LIMIT,
} from "../../extension/operatorConfirmation";

type Client = NonNullable<ReturnType<BicameralRouteDeps["getBicameralClient"]>>;

/** 503 when no client is wired, 409 when it is not connected; otherwise the client. */
function connectedClient(deps: BicameralRouteDeps, res: Response, notConnected: string): Client | null {
  const client = deps.getBicameralClient();
  if (!client) {
    res.status(503).json({ ok: false, error: "Bicameral client not wired" });
    return null;
  }
  if (!client.isConnected()) {
    res.status(409).json({ ok: false, error: notConnected });
    return null;
  }
  return client;
}

/**
 * Govern one tool call, then confirm the client and evaluator did not change across the awaited
 * decision. True when the call may proceed; otherwise a response was already sent.
 */
async function governedProceed(
  deps: BicameralRouteDeps, res: Response, client: Client,
  call: { name: string; arguments: Record<string, unknown> },
): Promise<boolean> {
  // Snapshot both client and evaluator across the awaited governance call.
  const evaluator = deps.getMcpInterceptor?.() ?? null;
  if (await governToolCall(deps, call, res, client)) return false;
  return !rejectStaleBicameralClient(deps, client, res, true, evaluator);
}

// POST /api/actions/bicameral-history — fetch feature briefs.
async function historyRoute(deps: BicameralRouteDeps, req: Request, res: Response): Promise<void> {
  if (deps.rejectIfRemote(req, res)) return;
  const client = connectedClient(deps, res, "Bicameral not connected — POST /bicameral-connect first");
  if (!client) return;
  try {
    if (!(await governedProceed(deps, res, client, { name: "bicameral.history", arguments: {} }))) return;
    const features = await client.history();
    res.json({ ok: true, features });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

// POST /api/actions/bicameral-drift — fetch drift status for a file path.
async function driftRoute(deps: BicameralRouteDeps, req: Request, res: Response): Promise<void> {
  if (deps.rejectIfRemote(req, res)) return;
  const client = connectedClient(deps, res, "Bicameral not connected");
  if (!client) return;
  const filePath = typeof req.body?.filePath === "string" ? req.body.filePath : "";
  if (!filePath) {
    res.status(400).json({ ok: false, error: "filePath required (string)" });
    return;
  }
  try {
    const call = { name: "bicameral.drift", arguments: { file_path: filePath } };
    if (!(await governedProceed(deps, res, client, call))) return;
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
}

type RatifyInput = { decisionId: string; verdict: NonNullable<ReturnType<typeof parseVerdict>>; rationale: string };

/** Validate the ratify body; 400 and null on any problem. */
function parseRatifyBody(req: Request, res: Response): RatifyInput | null {
  const decisionId = typeof req.body?.decisionId === "string" ? req.body.decisionId : "";
  const verdict = parseVerdict(req.body?.verdict);
  if (!decisionId) {
    res.status(400).json({ ok: false, error: "decisionId required (string)" });
    return null;
  }
  if (!verdict) {
    res.status(400).json({ ok: false, error: 'verdict must be "ratify" or "reject"' });
    return null;
  }
  // Upstream and the ledger must record the id the dialog showed.
  if (sanitizeDialogText(decisionId) !== decisionId) {
    res.status(400).json({ ok: false, error: "decisionId contains control characters or is too long" });
    return null;
  }
  const rationale = sanitizeDialogText(
    typeof req.body?.rationale === "string" ? req.body.rationale : "",
    REASON_LIMIT,
  );
  return { decisionId, verdict, rationale };
}

/**
 * B-BIC-1: anchor the operator's ratify decision into META_LEDGER as a
 * USER_OVERRIDE entry. Ratify is the canonical "operator intentionally
 * accepted X" event. Non-blocking — a ledger write failure must not
 * break the ratify response (the bicameral side has already accepted).
 */
async function recordRatifyOverride(deps: BicameralRouteDeps, input: RatifyInput): Promise<void> {
  const { decisionId, verdict, rationale } = input;
  if (!deps.ledgerManager?.isAvailable()) return;
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

/**
 * B-BIC-17/18 (Batch 4): emit a bicameral.verdict event so a ratified
 * decision closes its mirrored Risks Register entry. Additive, non-
 * blocking, absent-eventBus-safe.
 */
function emitRatifiedVerdict(deps: BicameralRouteDeps, decisionId: string): void {
  if (!deps.eventBus) return;
  try {
    deps.eventBus.emit("bicameral.verdict", {
      decisionId,
      verdict: "ratified",
    });
  } catch {
    /* a faulty subscriber must not break the ratify route (Batch 4) */
  }
}

// POST /api/actions/bicameral-ratify — ratify or reject a decision.
// #514: records a USER_OVERRIDE as the operator, so it acts only after a
// modal VS Code confirmation. There is no server-side decision lookup: the
// dialog shows exactly the requester-supplied decisionId, verdict and
// sanitized rationale that are then recorded.
async function ratifyRoute(deps: BicameralRouteDeps, req: Request, res: Response): Promise<void> {
  if (deps.rejectIfRemote(req, res)) return;
  const input = parseRatifyBody(req, res);
  if (!input) return;
  const { decisionId, verdict, rationale } = input;
  const client = connectedClient(deps, res, "Bicameral not connected");
  if (!client) return;
  if (!(await requireOperatorConfirmation(
    deps.confirmOperatorAction, ratifyRequest(decisionId, verdict, rationale), res,
  ))) {
    return;
  }
  try {
    const call = { name: "bicameral.ratify", arguments: { decision_id: decisionId, verdict } };
    if (!(await governedProceed(deps, res, client, call))) return;
    await client.ratify(decisionId, verdict);
    await recordRatifyOverride(deps, input);
    emitRatifiedVerdict(deps, decisionId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

// POST /api/actions/bicameral-open-binding — open a decision's bound source
// file in the editor. B-BIC-12: additive route, not interceptor-governed (it
// opens an editor file, not an MCP tool call). The injected openFileInEditor
// dep resolves the path via vscode.Uri.file (no shell); 503 when unwired.
async function openBindingRoute(deps: BicameralRouteDeps, req: Request, res: Response): Promise<void> {
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
}

export function registerBicameralDecisionRoutes(
  app: import("express").Application,
  deps: BicameralRouteDeps,
): void {
  app.post("/api/actions/bicameral-history", (req: Request, res: Response) => historyRoute(deps, req, res));
  app.post("/api/actions/bicameral-drift", (req: Request, res: Response) => driftRoute(deps, req, res));
  app.post("/api/actions/bicameral-ratify", (req: Request, res: Response) => ratifyRoute(deps, req, res));
  app.post("/api/actions/bicameral-open-binding", (req: Request, res: Response) => openBindingRoute(deps, req, res));
}
