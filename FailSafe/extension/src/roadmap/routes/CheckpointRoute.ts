import { Request, Response } from "express";
import type { ApiRouteDeps } from "./types";
import {
  requireOperatorConfirmation,
  rollbackRequest,
  sanitizeDialogText,
  REASON_LIMIT,
} from "../../extension/operatorConfirmation";

/** Shape passed to RevertService.revert() */
interface RevertRequest {
  targetCheckpoint: any;
  reason: string;
  actor: string;
}

/**
 * Checkpoint listing, detail, and rollback routes.
 * Extracted from ConsoleServer (lines 776-839).
 */
export function setupCheckpointRoutes(
  app: import("express").Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/checkpoints", (req: Request, res: Response) => {
    const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, limitRaw))
      : 50;
    res.json({
      checkpoints: deps.getRecentCheckpoints(limit),
      chainValid: deps.verifyCheckpointChain(),
    });
  });

  // API: Get a single checkpoint by ID
  app.get("/api/checkpoints/:id", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const id = String(req.params.id || "");
    if (!id) {
      res.status(400).json({ ok: false, error: "id required" });
      return;
    }
    const checkpoint = deps.getCheckpointById(id);
    res.json({ ok: true, checkpoint });
  });

  // API: Rollback to a checkpoint. #514: order is body validation (400),
  // checkpoint lookup (404), revert availability (503), then a modal VS Code
  // confirmation; the reason sealed is exactly the sanitized reason shown.
  app.post(
    "/api/actions/rollback",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      const { checkpointId, reason: rawReason } = (req.body ?? {}) as {
        checkpointId?: string;
        reason?: string;
      };
      if (!checkpointId) {
        res.status(400).json({ ok: false, error: "checkpointId required" });
        return;
      }
      const actor = "user.local";
      const reason = sanitizeDialogText(rawReason ?? "", REASON_LIMIT);
      const checkpoint = deps.getCheckpointById(checkpointId);
      if (!checkpoint) {
        res.status(404).json({ ok: false, error: "checkpoint not found" });
        return;
      }
      if (!deps.revertService) {
        res
          .status(503)
          .json({ ok: false, error: "revert service unavailable" });
        return;
      }
      if (!(await requireOperatorConfirmation(
        deps.confirmOperatorAction, rollbackRequest(checkpointId, checkpoint, reason), res,
      ))) {
        return;
      }
      try {
        const request: RevertRequest = {
          targetCheckpoint: checkpoint,
          reason,
          actor,
        };
        const result = await deps.revertService.revert(request);
        deps.broadcast({ type: "hub.refresh" });
        res.json({ ok: result.success, result });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error) });
      }
    },
  );
}
