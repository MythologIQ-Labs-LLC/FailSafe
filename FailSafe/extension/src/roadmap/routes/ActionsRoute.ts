import { Request, Response } from "express";
import type { QorLogicHost } from "../../qorlogic/hostLayouts";
import type { ApiRouteDeps } from "./types";

/**
 * Hub action-button routes: resume monitoring, panic stop,
 * integrity verification, and L3 batch approval.
 * Extracted from ConsoleServer (lines 841-940).
 */
export function setupActionsRoutes(
  app: import("express").Application,
  deps: ApiRouteDeps,
): void {
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

  app.post("/api/actions/panic-stop", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) {
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

  // Scaffold governance skills into workspace
  app.post("/api/actions/scaffold-skills", async (req: Request, res: Response) => {
    if (!deps.scaffoldSkills && !deps.scaffoldWithWebOptions) {
      res.status(501).json({ error: "Scaffold not available" });
      return;
    }
    try {
      const bodyHosts = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
      const bodyScope = req.body?.scope === "global" ? "global" as const : "repo" as const;
      const skillFilter = isSkillFilterMap(req.body?.skillFilter) ? req.body.skillFilter : undefined;
      const report = await runScaffold(deps, bodyHosts as QorLogicHost[], bodyScope, skillFilter, res);
      if (!report) return;
      res.json({ ok: report.ok, report });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
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

  // Process all pending L3 approvals in batch
  app.post(
    "/api/actions/approve-l3-batch",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      const decision: "APPROVED" | "REJECTED" =
        req.body.decision === "REJECTED" ? "REJECTED" : "APPROVED";
      const conditions: string[] = Array.isArray(req.body.conditions)
        ? req.body.conditions
        : [];
      const queue = deps.qorelogicManager.getL3Queue();
      if (!queue.length) {
        res.json({ ok: true, processed: 0 });
        return;
      }
      const results = await processL3Queue(
        queue,
        deps,
        decision,
        conditions,
      );
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
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      const id: unknown = req.body?.id;
      if (typeof id !== "string" || id.length === 0) {
        res.status(400).json({ ok: false, error: "id (string) required" });
        return;
      }
      const decision: "APPROVED" | "REJECTED" =
        req.body?.decision === "REJECTED" ? "REJECTED" : "APPROVED";
      const conditions: string[] = Array.isArray(req.body?.conditions)
        ? req.body.conditions
        : [];
      try {
        await deps.qorelogicManager.processL3Decision(id, decision, conditions);
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

function isSkillFilterMap(raw: unknown): raw is Record<string, string[]> {
  if (!raw || typeof raw !== "object") return false;
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) return false;
  }
  return true;
}

async function runScaffold(
  deps: ApiRouteDeps,
  hosts: QorLogicHost[],
  scope: "repo" | "global",
  skillFilter: Record<string, string[]> | undefined,
  res: Response,
): Promise<import("../../extension/installSkillsReport").QorLogicInstallReport | null> {
  if (hosts.length > 0 && deps.scaffoldWithWebOptions) {
    return deps.scaffoldWithWebOptions(hosts, scope, skillFilter);
  }
  if (deps.scaffoldSkills) {
    const report = await deps.scaffoldSkills();
    if (report === null) { res.json({ ok: true, cancelled: true }); return null; }
    return report;
  }
  res.status(501).json({ error: "Scaffold not available" });
  return null;
}

async function processL3Queue(
  queue: any[],
  deps: ApiRouteDeps,
  decision: "APPROVED" | "REJECTED",
  conditions: string[],
): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of queue) {
    try {
      await deps.qorelogicManager.processL3Decision(
        item.id,
        decision,
        conditions,
      );
      results.push({ id: item.id, ok: true });
    } catch (e: any) {
      results.push({ id: item.id, ok: false, error: e.message });
    }
  }
  return results;
}
