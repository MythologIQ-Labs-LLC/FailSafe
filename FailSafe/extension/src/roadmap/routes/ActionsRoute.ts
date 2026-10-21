import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { L3ApprovalRequest } from "../../shared/types/l3-approval";
import type { ApiRouteDeps } from "./types";
import { consoleRequestGuard } from "./consoleRequestGuard";
import {
  authorizeOperatorAction, authorizationFields, newInstallLimiter, resolveScaffoldOperation, thaw,
  type InstallOperation,
} from "./installAuthorization";
import {
  requireOperatorConfirmation,
  confirmationFailure,
  isConfirmationOpen,
  type ConfirmOperatorAction,
  l3DecisionRequest,
  l3BatchRequest,
  panicStopRequest,
} from "../../extension/operatorConfirmation";

/**
 * Hub action-button routes: resume monitoring, panic stop,
 * integrity verification, and L3 batch approval.
 * Extracted from ConsoleServer (lines 841-940).
 */
export function setupActionsRoutes(
  app: import("express").Application,
  deps: ApiRouteDeps,
): void {
  const guard = consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res));
  // Lane D: L3 decision budgets per minute, after the guard so refused cross-site requests spend none.
  const limiter = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: false, legacyHeaders: false });
  app.post(
    "/api/actions/resume-monitoring",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) {
        return;
      }
      try {
        if (!deps.sentinelDaemon.isRunning()) {
          await deps.sentinelDaemon.start();
        }
        deps.recordCheckpoint({
          checkpointType: "monitoring.resumed",
          actor: "system",
          phase: deps.inferPhaseKeyFromPlan(deps.planManager.getActivePlan()),
          status: "validated",
          policyVerdict: "PASS",
          evidenceRefs: [],
          payload: { action: "resume-monitoring" },
        });
        deps.broadcast({ type: "hub.refresh" });
        res.json({ ok: true, status: deps.sentinelDaemon.getStatus() });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error) });
      }
    },
  );

  // #514: stopping the Sentinel needs a modal VS Code confirmation. Lane D: behind the Console
  // request guard; no limiter, so the emergency stop cannot be starved.
  app.post("/api/actions/panic-stop", guard, async (_req: Request, res: Response) => {
    if (!(await requireOperatorConfirmation(deps.confirmOperatorAction, panicStopRequest(), res))) {
      return;
    }
    try {
      deps.sentinelDaemon.stop();
      deps.recordCheckpoint({
        checkpointType: "monitoring.stopped",
        actor: "system",
        phase: deps.inferPhaseKeyFromPlan(deps.planManager.getActivePlan()),
        status: "validated",
        policyVerdict: "WARN",
        evidenceRefs: [],
        payload: { action: "panic-stop" },
      });
      deps.broadcast({ type: "hub.refresh" });
      res.json({ ok: true, status: deps.sentinelDaemon.getStatus() });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // Manual checkpoint chain integrity verification
  app.post(
    "/api/actions/verify-integrity",
    (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) {
        return;
      }
      try {
        const chainValid = deps.verifyCheckpointChain();
        const verifiedAt = new Date().toISOString();
        deps.setCachedChainValid(chainValid, verifiedAt);
        deps.broadcast({ type: "hub.refresh" });
        res.json({ ok: true, chainValid, verifiedAt });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error) });
      }
    },
  );

  // Scaffold governance skills into workspace. #538: Console request guard before the
  // limiter; validated hosts/scope/skills are confirmed in a modal VS Code dialog first.
  app.post("/api/actions/scaffold-skills", consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res)), newInstallLimiter(), async (req: Request, res: Response) => {
    if (!deps.scaffoldSkills && !deps.scaffoldWithWebOptions) {
      res.status(501).json({ error: "Scaffold not available" });
      return;
    }
    const resolved = resolveScaffoldOperation(req.body);
    if (!resolved.ok) { res.status(resolved.status).json({ ok: false, error: resolved.error }); return; }
    const needs = resolved.operation.kind === "qorlogic-skills-install" ? deps.scaffoldWithWebOptions : deps.scaffoldSkills;
    if (!needs) { res.status(501).json({ error: "Scaffold not available" }); return; }
    const approved = await authorizeOperatorAction(
      { ...deps, getLedgerManager: () => deps.qorelogicManager.getLedgerManager?.() },
      res, resolved.operation, "/api/actions/scaffold-skills",
    );
    if (!approved) return;
    try {
      const report = await runScaffold(deps, approved.operation, approved.operationId, res);
      if (!report) return;
      res.json({ ok: report.ok, report, ...authorizationFields(approved) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e), ...authorizationFields(approved) });
    }
  });

  // Focus the FailSafe (QorLogic) OutputChannel from the Settings card
  // "Show Output" button. Round 2 / Issue #49.
  app.post("/api/actions/show-output", (_req: Request, res: Response) => {
    if (!deps.showOutput) {
      res.status(501).json({ error: "Output channel not available" });
      return;
    }
    deps.showOutput();
    res.status(204).end();
  });

  // Process all pending L3 approvals in batch. #514: the operator confirms a
  // snapshot of the queue; only the ids in that snapshot are decided, with the
  // confirmed verb. Items queued while the dialog is open stay queued. Lane D: behind the Console
  // request guard and a limiter; the architecture lookup runs after every cheap refusal.
  app.post(
    "/api/actions/approve-l3-batch",
    guard,
    limiter(10),
    async (req: Request, res: Response) => {
      if (rejectBodyConditions(req, res)) return;
      const decision: "APPROVED" | "REJECTED" =
        req.body?.decision === "REJECTED" ? "REJECTED" : "APPROVED";
      const snapshot: L3ApprovalRequest[] = [...deps.qorelogicManager.getL3Queue()];
      if (!snapshot.length) {
        res.json({ ok: true, processed: 0 });
        return;
      }
      const confirm = deps.confirmOperatorAction;
      if (refuseBeforeDialog(confirm, res)) return;
      // B311: warn-only affected architecture decisions, 10 lines in total; never blocks the decision.
      const architecture = await architectureLines(deps, snapshot.map((i) => i.filePath), BATCH_ARCHITECTURE_LINES);
      if (!(await requireOperatorConfirmation(
        confirm, l3BatchRequest(snapshot, decision, architecture), res,
      ))) {
        return;
      }
      const results = await processL3Queue(snapshot, deps, decision);
      deps.broadcast({ type: "l3.batch_processed", payload: { results } });
      res.json({ ok: true, processed: results.length, results });
    },
  );

  // B-OD-8: per-item L3 decision. Unlike approve-l3-batch (all-or-nothing),
  // this decides a single queued item by id — required so the operator can
  // approve/reject one pending tool call (e.g. open-design-create-artifact)
  // without acting on every other queued item.
  app.post(
    "/api/actions/decide-l3",
    guard,
    limiter(30),
    async (req: Request, res: Response) => {
      const id: unknown = req.body?.id;
      if (typeof id !== "string" || id.length === 0) {
        res.status(400).json({ ok: false, error: "id (string) required" });
        return;
      }
      if (rejectBodyConditions(req, res)) return;
      const decision: "APPROVED" | "REJECTED" =
        req.body?.decision === "REJECTED" ? "REJECTED" : "APPROVED";
      // #514: unknown ids answer 404 before any dialog; the dialog shows the
      // queue entry's server-side fields and the requested verb.
      const item = (deps.qorelogicManager.getL3Queue() as L3ApprovalRequest[])
        .find((q) => q.id === id);
      if (!item) {
        res.status(404).json({ ok: false, error: `L3 request not found: ${id}` });
        return;
      }
      const confirm = deps.confirmOperatorAction;
      if (refuseBeforeDialog(confirm, res)) return;
      const architecture = await architectureLines(deps, [item.filePath]);
      if (!(await requireOperatorConfirmation(
        confirm, l3DecisionRequest(item, decision, architecture), res,
      ))) {
        return;
      }
      try {
        await deps.qorelogicManager.processL3Decision(id, decision, {
          method: "vscode-modal-confirmation", channel: "console:/api/actions/decide-l3",
        });
      } catch (e: unknown) {
        res.status(404).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      deps.broadcast({ type: "l3.decided", payload: { id, decision } });
      res.json({ ok: true, id, decision });
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * #514: conditions recorded with an L3 decision would come only from the
 * request, so loopback L3 routes refuse them (400) rather than record them.
 */
function rejectBodyConditions(req: Request, res: Response): boolean {
  if (req.body?.conditions === undefined) return false;
  res.status(400).json({
    ok: false,
    error: "conditions are not accepted on this route; decide conditional approvals in the VS Code L3 panel",
  });
  return true;
}

/**
 * Lane D: answer no confirmer (503) and a dialog already open (429) before the architecture
 * lookup. requireOperatorConfirmation still decides; a dialog opened meanwhile still gives busy.
 */
function refuseBeforeDialog(confirm: ConfirmOperatorAction | undefined, res: Response): boolean {
  const result = !confirm ? "unwired" : isConfirmationOpen(confirm) ? "busy" : null;
  if (!result) return false;
  const failure = confirmationFailure(result);
  res.status(failure.status).json(failure.body);
  return true;
}

/** Run the approved scaffold operation; callees get mutable copies of the frozen values (#538). */
async function runScaffold(
  deps: ApiRouteDeps,
  operation: Extract<InstallOperation, { kind: "qorlogic-skills-install" | "qorlogic-skills-prompt" }>,
  operationId: string,
  res: Response,
): Promise<import("../../extension/installSkillsReport").QorLogicInstallReport | null> {
  if (operation.kind === "qorlogic-skills-install" && deps.scaffoldWithWebOptions) {
    return deps.scaffoldWithWebOptions(thaw(operation.hosts), operation.scope, thaw(operation.skillFilter), { operationId });
  }
  if (operation.kind === "qorlogic-skills-prompt" && deps.scaffoldSkills) {
    const report = await deps.scaffoldSkills();
    if (report === null) { res.json({ ok: true, cancelled: true, operationId }); return null; }
    return report;
  }
  res.status(501).json({ error: "Scaffold not available" });
  return null;
}

async function processL3Queue(
  queue: L3ApprovalRequest[],
  deps: ApiRouteDeps,
  decision: "APPROVED" | "REJECTED",
): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of queue) {
    try {
      await deps.qorelogicManager.processL3Decision(item.id, decision, {
        method: "vscode-modal-confirmation", channel: "console:/api/actions/approve-l3-batch",
      });
      results.push({ id: item.id, ok: true });
    } catch (e: any) {
      results.push({ id: item.id, ok: false, error: e.message });
    }
  }
  return results;
}

/** B311: the batch dialog's affected-architecture lines are capped at this many in total. */
const BATCH_ARCHITECTURE_LINES = 10;

/**
 * B311: warn-only affected-architecture lines for the files of a decision. No describe, or one that
 * throws or rejects, gives none, so the dialog is unchanged and the decision proceeds.
 */
async function architectureLines(deps: ApiRouteDeps, paths: string[], maxLines?: number): Promise<string[]> {
  if (!deps.describeArchitecture) return [];
  try {
    const d = await deps.describeArchitecture(paths, maxLines === undefined ? undefined : { maxLines });
    return Array.isArray(d?.lines) ? d.lines : [];
  } catch {
    return [];
  }
}
