/**
 * HookRoute - Express handlers for the workspace hook toggle.
 *
 * Extracted from ConsoleServer.registerHookRoutes (B166 Phase 2 /
 * plan-v4.10.1a-no-b132). Behavior preserved verbatim: read uses
 * `isHookEnabled(workspaceRoot)`, write uses `syncHookSentinel`. Body
 * validation rejects non-boolean `enabled` with HTTP 400. Both
 * endpoints apply the local-only `rejectIfRemote` short-circuit.
 */
import type { Application, Request, Response } from "express";
import { syncHookSentinel, isHookEnabled } from "../../shared/hookSentinel";
import type { ApiRouteDeps } from "./types";

export function registerHookRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/hooks/status", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    res.json({ enabled: isHookEnabled(deps.workspaceRoot) });
  });

  app.post("/api/hooks/toggle", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    syncHookSentinel(deps.workspaceRoot, req.body.enabled);
    res.json({ enabled: req.body.enabled });
  });
}
