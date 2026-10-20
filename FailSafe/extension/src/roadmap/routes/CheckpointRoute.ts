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
  // #532 (plan-532c LD8a): before the dialog the revert service checks the
  // checkpoint (a commit, an untampered row, a clean tree, an ancestor of HEAD)
  // and computes what the dialog shows; the reset (`git reset --keep`) runs
  // only while the workspace still matches it.
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
      const prepared = await deps.revertService.prepare(checkpointId);
      if (!prepared.ok) {
        res.status(prepared.status).json({ ok: false, error: prepared.error });
        return;
      }
      if (!(await requireOperatorConfirmation(
        deps.confirmOperatorAction, rollbackRequest(checkpointId, checkpoint, reason, prepared.plan), res,
      ))) {
        return;
      }
      try {
        const request: RevertRequest = {
          targetCheckpoint: checkpoint,
          reason,
          actor,
        };
        const result = await deps.revertService.revert(request, prepared.plan);
        deps.broadcast({ type: "hub.refresh" });
        res.status(!result.success && result.status ? result.status : 200)
          .json({ ok: result.success, result, ...(result.success ? {} : { error: result.error }) });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error) });
      }
    },
  );
}
