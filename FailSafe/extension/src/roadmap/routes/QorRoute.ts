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

export function registerQorRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/qor/runtime", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    res.json(await deps.qorRuntimeService.fetchSnapshot());
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
