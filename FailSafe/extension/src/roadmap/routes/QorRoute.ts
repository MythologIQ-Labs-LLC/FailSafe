/**
 * QorRoute - Express handlers for the `/api/qor/*` family plus
 * `/api/sprint/:id` and `/api/plans`.
 *
 * Extracted from ConsoleServer.registerQorRoutes (B166 Phase 2 /
 * plan-v4.10.1a-no-b132). Behavior preserved verbatim: every endpoint
 * URL, response shape, and `rejectIfRemote` short-circuit are identical
 * to the inline original.
 */
import type { Application, Request, Response } from "express";
import type { ApiRouteDeps } from "./types";
import { buildGovernanceDashboard } from "../../qorlogic/governance-dashboard";

export function registerQorRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/qor/runtime", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    res.json(await deps.qorRuntimeService.fetchSnapshot());
  });

  // #196 Phase 1: read-only Shadow Genome dashboard over the FX863 data layer.
  // Always 200 (degrade-safe): an absent/off/degraded loader yields a zeroed
  // `enabled:false` payload. Determinism lives in the pure builder.
  app.get("/api/qor/governance-dashboard", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const result = deps.loadShadowGenome
      ? await deps.loadShadowGenome()
      : { ok: true, localOnly: true };
    res.json(buildGovernanceDashboard(result, { generatedAt: new Date().toISOString() }));
  });

  app.get("/api/qor/health", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    await deps.qorRuntimeService.proxy(req, res, "/health");
  });

  app.post("/api/qor/evaluate", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    await deps.qorRuntimeService.proxy(req, res, "/evaluate", "POST");
  });

  app.get("/api/sprint/:id", (req: Request, res: Response) => {
    const sprintId = String(req.params.id || "");
    const sprint = deps.planManager.getSprint(sprintId);
    const plan = sprint ? deps.planManager.getPlan(sprint.planId) : null;
    res.json({ sprint, plan });
  });

  app.get("/api/plans", (_req: Request, res: Response) => {
    res.json({ plans: deps.planManager.getAllPlans() });
  });
}
