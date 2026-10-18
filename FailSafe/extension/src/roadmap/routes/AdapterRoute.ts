/**
 * AdapterRoute - REST API endpoints for the agent-failsafe adapter
 *
 * Provides status checking, installation, uninstallation, health checks,
 * and configuration management for the Python adapter that bridges
 * FailSafe to Microsoft's Agent Governance Toolkit.
 */
import { Request, Response } from "express";
import { ADAPTER_UNINSTALL_ARGS, adapterInstallPlan, type AdapterService } from "../services/AdapterService";
import { consoleRequestGuard } from "./consoleRequestGuard";
import { authorizeOperatorAction, authorizationFields, newInstallLimiter, type OperatorActionDeps } from "./installAuthorization";

export type AdapterRouteDeps = OperatorActionDeps & {
  rejectIfRemote: (req: Request, res: Response) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  adapterService: AdapterService;
};

export function setupAdapterRoutes(
  app: import("express").Application,
  deps: AdapterRouteDeps,
): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/adapter/status - Check adapter state (Python, pip, adapter, toolkit)
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/adapter/status", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

    try {
      const state = await deps.adapterService.checkState();
      res.json({ status: "ok", state });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: "error", error: errorMsg });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/adapter/cached-status - Get cached state without re-checking
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/adapter/cached-status", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

    const cached = deps.adapterService.getCachedState();
    if (cached) {
      res.json({ status: "ok", state: cached, fromCache: true });
    } else {
      res.json({ status: "ok", state: null, fromCache: true });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/adapter/install - Install the adapter (and optionally toolkit)
  // ═══════════════════════════════════════════════════════════════════════════
  // #538: the Console request guard runs before the limiter; both routes act only after a
  // modal VS Code confirmation of the pip3 argv they run. Flags are strict booleans.
  const guard = consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res));
  const installLimiter = newInstallLimiter();
  app.post("/api/adapter/install", guard, installLimiter, async (req: Request, res: Response) => {
    const installToolkit = req.body?.installToolkit === true;
    const upgradeIfExists = req.body?.upgradeIfExists === true;
    const plan = adapterInstallPlan({ installToolkit, upgradeIfExists });
    const approved = await authorizeOperatorAction(deps, res, {
      kind: "adapter-install", upgrade: upgradeIfExists, installToolkit, commands: [plan.adapter, ...plan.toolkit],
    }, "/api/adapter/install");
    if (!approved) return;
    const op = approved.operation;
    const operationId = approved.operationId;

    // Broadcast installation started
    deps.broadcast({
      type: "adapter.installing",
      operationId,
      payload: { installToolkit: op.installToolkit, upgradeIfExists: op.upgrade },
    });

    try {
      const result = await deps.adapterService.install(
        { installToolkit: op.installToolkit, upgradeIfExists: op.upgrade },
        (progress) => {
          deps.broadcast({
            type: "adapter.progress",
            operationId,
            payload: progress,
          });
        },
      );

      if (result.success) {
        deps.broadcast({
          type: "adapter.installed",
          operationId,
          payload: { success: true },
        });
        res.json({ status: "ok", success: true, ...authorizationFields(approved) });
      } else {
        deps.broadcast({
          type: "adapter.failed",
          operationId,
          payload: { error: result.error },
        });
        res.status(500).json({ status: "error", error: result.error, ...authorizationFields(approved) });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      deps.broadcast({
        type: "adapter.failed",
        operationId,
        payload: { error: errorMsg },
      });
      res.status(500).json({ status: "error", error: errorMsg, ...authorizationFields(approved) });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/adapter/uninstall - Uninstall the adapter
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/adapter/uninstall", guard, installLimiter, async (req: Request, res: Response) => {
    const approved = await authorizeOperatorAction(deps, res, {
      kind: "adapter-uninstall", commands: [[...ADAPTER_UNINSTALL_ARGS]],
    }, "/api/adapter/uninstall");
    if (!approved) return;
    const operationId = approved.operationId;

    deps.broadcast({
      type: "adapter.uninstalling",
      operationId,
      payload: {},
    });

    try {
      const result = await deps.adapterService.uninstall((progress) => {
        deps.broadcast({
          type: "adapter.progress",
          operationId,
          payload: progress,
        });
      });

      if (result.success) {
        deps.broadcast({
          type: "adapter.uninstalled",
          operationId,
          payload: { success: true },
        });
        res.json({ status: "ok", success: true, ...authorizationFields(approved) });
      } else {
        deps.broadcast({
          type: "adapter.failed",
          operationId,
          payload: { error: result.error },
        });
        res.status(500).json({ status: "error", error: result.error, ...authorizationFields(approved) });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      deps.broadcast({
        type: "adapter.failed",
        operationId,
        payload: { error: errorMsg },
      });
      res.status(500).json({ status: "error", error: errorMsg, ...authorizationFields(approved) });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/adapter/health - Run health check on installed adapter
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/adapter/health", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

    try {
      const healthCheck = await deps.adapterService.healthCheck();
      res.json({ status: "ok", health: healthCheck });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: "error", error: errorMsg });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/adapter/config - Get adapter configuration
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/adapter/config", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

    try {
      const config = deps.adapterService.getConfig();
      res.json({ status: "ok", config });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: "error", error: errorMsg });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/adapter/config - Save adapter configuration
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/adapter/config", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;

    const config = req.body;
    if (!config || typeof config !== "object") {
      res.status(400).json({ status: "error", error: "Invalid config" });
      return;
    }

    try {
      await deps.adapterService.saveConfig(config);
      deps.broadcast({
        type: "adapter.config.updated",
        payload: { config },
      });
      res.json({ status: "ok", success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: "error", error: errorMsg });
    }
  });
}
