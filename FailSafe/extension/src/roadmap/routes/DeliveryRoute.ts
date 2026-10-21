/**
 * #532 part B (plan-532b LD7): delivery assessment routes.
 *
 *   GET  /api/v1/delivery/intents          the active intent and archived sealed intents
 *   GET  /api/v1/delivery/intents/:id      one intent's edges and five-step assessment
 *   GET  /api/v1/delivery/candidates       registered architecture rows and HEAD's 50 recent commits
 *   POST /api/actions/delivery/link        {intentId, edge, target}: record an edge after the modal
 *   POST /api/actions/delivery/unlink      {intentId, edge, target}: remove an edge after the modal
 *   POST /api/actions/delivery/review      {intentId, verdict, commitSha, note}: record a delivery
 *                                          review after a bound modal (plan-b320 LD3)
 *
 * Every route is loopback-only and rate limited. Writes act only after the operator approves a
 * modal VS Code dialog built from server-side values; a declined, busy or unwired confirmation
 * records nothing. The review route also passes the Console request guard (Host, Origin, JSON) and
 * binds the approval to the operation it showed (confirmBoundOperation). Nothing leaves the machine.
 */

import type { Application, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import {
  confirmBoundOperation, deliveryLinkRequest, deliveryReviewRequest, requireOperatorConfirmation, type ConfirmOperatorAction,
} from "../../extension/operatorConfirmation";
import { consoleRequestGuard } from "./consoleRequestGuard";
import {
  buildReviewPlan, parseReviewRequest, recordDeliveryReview, type RecordHooks,
} from "../../governance/delivery/deliveryReview";
import type { ArchitectureGit } from "../../governance/architecture/ArchitectureIndexDiscovery";
import type { EdgeWriteRefusal } from "../../governance/IntentService";
import { IntentIdSchema } from "../../governance/types/IntentTypes";
import {
  assessIntentDelivery, deliveryCandidates, parseDeliveryRequest, prepareDeliveryEdge, writeDeliveryEdge,
  type DeliveryContext, type DeliveryIntents, type EdgeAction,
} from "../../governance/delivery/deliveryService";

export interface DeliveryRouteDeps {
  rejectIfRemote(req: Request, res: Response): boolean;
  workspaceRoot: string;
  /** Read at request time (bootstrapServers wires it after the routes register); absent -> 503. */
  getIntentService: () => DeliveryIntents | null | undefined;
  /** Read at request time; null, disabled and stub ledgers all count as unavailable. */
  getLedgerManager: () => unknown;
  /** `failsafe.architecture.indexPath`, read at request time. */
  getIndexPathSetting?: () => string | undefined;
  /** Modal confirmer; a lazy getter on the registrar's deps. Absent -> writes answer 503. */
  confirmOperatorAction?: ConfirmOperatorAction;
  broadcast?: (data: Record<string, unknown>) => void;
  git?: ArchitectureGit;
  /** Tests shorten the bound confirmation's deadline. */
  confirmationDeadlineMs?: number;
  /** Test seams for the review write (a clock, a hook between the rebuild and the append). */
  reviewHooks?: RecordHooks;
}

const NO_SERVICE = { ok: false, error: "The FailSafe intent service is not available." };

/** Why a confirmed write was still refused (the state changed between the check and the write). */
const WRITE_REFUSAL: Record<EdgeWriteRefusal, string> = {
  integrity: "The intent history failed its chain check; nothing was recorded.",
  "no-active-intent": "There is no active intent; nothing was recorded.",
  "not-active": "This intent is no longer the active intent; nothing was recorded.",
  sealed: "This intent is sealed; nothing was recorded.",
  duplicate: "That link is already recorded.",
  absent: "That link is not recorded.",
  invalid: "The link could not be recorded.",
};

function contextOf(deps: DeliveryRouteDeps, res: Response): DeliveryContext | null {
  const intents = deps.getIntentService();
  if (!intents) { res.status(503).json(NO_SERVICE); return null; }
  return {
    workspaceRoot: deps.workspaceRoot, intents, ledger: deps.getLedgerManager(), git: deps.git,
    indexPathSetting: deps.getIndexPathSetting?.(), now: deps.reviewHooks?.now,
  };
}

/** plan-b320 LD3: build the review from server state, confirm the bound operation, then record it. */
async function writeReview(req: Request, res: Response, deps: DeliveryRouteDeps): Promise<void> {
  const parsed = parseReviewRequest(req.body);
  if (typeof parsed === "string") { res.status(400).json({ ok: false, error: parsed }); return; }
  const ctx = contextOf(deps, res);
  if (!ctx) return;
  const built = await buildReviewPlan(ctx, parsed, ctx.now ? ctx.now() : Date.now());
  if (!built.ok) { res.status(built.status).json({ ok: false, error: built.error }); return; }
  const bound = await confirmBoundOperation(
    deps.confirmOperatorAction, built.plan, (plan, id) => deliveryReviewRequest(plan, id, "console"), res,
    { deadlineMs: deps.confirmationDeadlineMs },
  );
  if (!bound) return;
  const recorded = await recordDeliveryReview(ctx, parsed, bound.operation, { operationId: bound.operationId, channel: "console" }, deps.reviewHooks);
  if (res.writableEnded) return;
  res.status(recorded.status).json({ ...recorded.body, operationId: bound.operationId });
  if (recorded.status === 200) deps.broadcast?.({ type: "delivery.changed", intentId: parsed.intentId });
}

async function writeEdge(req: Request, res: Response, deps: DeliveryRouteDeps, action: EdgeAction): Promise<void> {
  const parsed = parseDeliveryRequest(req.body);
  if (typeof parsed === "string") { res.status(400).json({ ok: false, error: parsed }); return; }
  const ctx = contextOf(deps, res);
  if (!ctx) return;
  const prepared = await prepareDeliveryEdge(ctx, action, parsed);
  if (!prepared.ok) { res.status(prepared.status).json({ ok: false, error: prepared.error }); return; }
  const request = deliveryLinkRequest(action, prepared.edge, prepared.intent, prepared.facts, "console");
  if (!(await requireOperatorConfirmation(deps.confirmOperatorAction, request, res))) return;
  const written = await writeDeliveryEdge(ctx, prepared, "user");
  if (!written.ok) { res.status(409).json({ ok: false, refused: written.reason, error: WRITE_REFUSAL[written.reason] }); return; }
  deps.broadcast?.({ type: "delivery.changed", intentId: prepared.intent.id });
  res.json({ ok: true, action, intentId: prepared.intent.id, edge: prepared.edge, target: prepared.target });
}

export function setupDeliveryRoutes(app: Application, deps: DeliveryRouteDeps): void {
  // CodeQL js/missing-rate-limiting: the reads run git and read the ledger; the writes append to
  // the intent history. One limiter per route, so reads cannot starve a write.
  const limiter = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: false, legacyHeaders: false });

  app.get("/api/v1/delivery/intents", limiter(60), async (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    const intents = deps.getIntentService();
    if (!intents) { res.status(503).json(NO_SERVICE); return; }
    res.json(await intents.listIntents());
  });

  app.get("/api/v1/delivery/intents/:id", limiter(60), async (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    const id = IntentIdSchema.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ ok: false, error: "id must be an intent id" }); return; }
    const ctx = contextOf(deps, res);
    if (!ctx) return;
    const view = await assessIntentDelivery(ctx, id.data);
    if (view.integrity === "valid" && !view.found) { res.status(404).json({ ok: false, error: "No such intent in this workspace." }); return; }
    res.json(view);
  });

  app.get("/api/v1/delivery/candidates", limiter(60), (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    const ctx = contextOf(deps, res);
    if (!ctx) return;
    res.json(deliveryCandidates(ctx));
  });

  app.post("/api/actions/delivery/review", consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res)), limiter(10), async (req, res) => {
    try { await writeReview(req, res, deps); } catch {
      if (!res.headersSent) res.status(500).json({ ok: false, error: "The review could not be recorded." });
    }
  });

  for (const action of ["link", "unlink"] as const) {
    app.post(`/api/actions/delivery/${action}`, limiter(20), async (req, res) => {
      if (deps.rejectIfRemote(req, res)) return;
      try { await writeEdge(req, res, deps, action); } catch {
        if (!res.headersSent) res.status(500).json({ ok: false, error: "The link could not be recorded." });
      }
    });
  }
}
