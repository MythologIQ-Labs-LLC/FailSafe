import type { Application, Request, Response } from "express";
import type { ApiRouteDeps } from "./types";
import { handleTranscriptError } from "./brainstorm-route-errors";

async function processTranscript(req: Request, res: Response, deps: ApiRouteDeps) {
  if (deps.rejectIfRemote(req, res)) return;
  const transcript = String(req.body.transcript || "").slice(0, 10000).trim();
  if (!transcript) {
    res.status(400).json({ error: "Empty transcript" });
    return;
  }
  try {
    const result = await deps.brainstormService.processTranscript(transcript);
    if (result.extraction) {
      deps.broadcast({ type: "brainstorm.update", payload: result.extraction });
      res.json(result.extraction);
      return;
    }
    if (result.queued) {
      res.status(202).json({
        status: "queued",
        message: "LLM returned invalid output or is unavailable — transcript queued",
        queued: result.queued,
      });
      return;
    }
    if (result.rejected) {
      res.status(422).json({ status: "rejected", reason: result.rejected.reason });
    }
  } catch (error) {
    handleTranscriptError(error, deps, transcript, res);
  }
}

export function setupBrainstormTranscriptRoutes(app: Application, deps: ApiRouteDeps): void {
  app.post("/api/v1/brainstorm/transcript",
    (req: Request, res: Response) => processTranscript(req, res, deps));
}
