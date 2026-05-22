import express, { Request, Response } from "express";
import type { ApiRouteDeps } from "./types";
import { NODE_LABEL_MAX, withTruncationInfo } from "./brainstorm-label-truncation";

/**
 * Voice-brainstorm routes: transcript processing, audio vault,
 * graph CRUD, and pending-transcript management.
 * Extracted from ConsoleServer (lines 563-774).
 */
export function setupBrainstormRoutes(
  app: express.Application,
  deps: ApiRouteDeps,
): void {
  app.post(
    "/api/v1/brainstorm/transcript",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      const transcript = String(req.body.transcript || "")
        .slice(0, 10000)
        .trim();
      if (!transcript) {
        res.status(400).json({ error: "Empty transcript" });
        return;
      }
      try {
        const result =
          await deps.brainstormService.processTranscript(transcript);
        if (result.extraction) {
          deps.broadcast({
            type: "brainstorm.update",
            payload: result.extraction,
          });
          res.json(result.extraction);
        } else if (result.queued) {
          res.status(202).json({
            status: "queued",
            message:
              "LLM returned invalid output or is unavailable — transcript queued",
            queued: result.queued,
          });
        }
      } catch (err) {
        handleTranscriptError(err, deps, transcript, res);
      }
    },
  );

  app.post(
    "/api/v1/brainstorm/audio",
    express.raw({ type: "audio/webm", limit: "50mb" }),
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      try {
        const _buffer = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from("");
        if (_buffer.length === 0) {
          res.status(400).json({ error: "Empty body" });
          return;
        }
        const hash = await deps.audioVaultService.storeAudio(_buffer);
        res.json({ audioHash: hash });
      } catch (err) {
        res.status(500).json({ error: "Storage failed" });
      }
    },
  );

  app.get(
    "/api/v1/brainstorm/audio/:hash",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      try {
        const audioBuffer = await deps.audioVaultService.getAudio(
          String(req.params.hash),
        );
        if (!audioBuffer) {
          res.status(404).send("Not found");
          return;
        }
        res.setHeader("Content-Type", "audio/webm");
        res.send(audioBuffer);
      } catch (err) {
        res.status(500).send("Fetch error");
      }
    },
  );

  // API: Brainstorm - add manual node
  app.post("/api/v1/brainstorm/node", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const rawLabel = String(req.body.label || "");
    const label = rawLabel.slice(0, NODE_LABEL_MAX).trim();
    if (!label) {
      res.status(400).json({ error: "Label required" });
      return;
    }
    const type = String(req.body.type || "Feature").slice(0, 50);
    const clientId = req.body.id
      ? String(req.body.id).slice(0, 100)
      : undefined;
    const node = deps.brainstormService.addNode(label, type, clientId);
    deps.broadcast({
      type: "brainstorm.update",
      payload: { nodes: [node], edges: [] },
    });
    res.json(withTruncationInfo(node, rawLabel));
  });

  // API: Brainstorm - update a node
  app.patch(
    "/api/v1/brainstorm/node/:id",
    (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      const rawLabel = String(req.body.label || "");
      const label = rawLabel.slice(0, NODE_LABEL_MAX).trim();
      const type = String(req.body.type || "Feature").slice(0, 50);
      if (!label) {
        res.status(400).json({ error: "Label required" });
        return;
      }
      const node = deps.brainstormService.updateNode(
        String(req.params.id),
        label,
        type,
      );
      if (!node) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      deps.broadcast({
        type: "brainstorm.update",
        payload: { nodes: [node], edges: [] },
      });
      res.json(withTruncationInfo(node, rawLabel));
    },
  );

  // API: Brainstorm - remove a node
  app.delete(
    "/api/v1/brainstorm/node/:id",
    (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      const removed = deps.brainstormService.removeNode(
        String(req.params.id),
      );
      if (!removed) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      deps.broadcast({
        type: "brainstorm.node-removed",
        payload: { id: String(req.params.id) },
      });
      res.json({ ok: true });
    },
  );

  // API: Brainstorm - get full graph
  app.get("/api/v1/brainstorm/graph", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    res.json(deps.brainstormService.getGraph());
  });

  // API: Brainstorm - clear graph
  app.delete(
    "/api/v1/brainstorm/graph",
    (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      deps.brainstormService.reset();
      deps.broadcast({ type: "brainstorm.reset" });
      res.json({ ok: true });
    },
  );

  // API: Brainstorm - list queued transcripts awaiting LLM
  app.get(
    "/api/v1/brainstorm/pending",
    (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      res.json({ pending: deps.brainstormService.getPendingTranscripts() });
    },
  );

  // API: Brainstorm - retry all pending transcripts
  app.post(
    "/api/v1/brainstorm/retry",
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;
      try {
        const results = await deps.brainstormService.retryPending();
        for (const r of results) {
          if (r.extraction) {
            deps.broadcast({
              type: "brainstorm.update",
              payload: r.extraction,
            });
          }
        }
        res.json({ processed: results.length, results });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        res.status(502).json({ error: "retry_failed", detail });
      }
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function handleTranscriptError(
  err: unknown,
  deps: ApiRouteDeps,
  transcript: string,
  res: Response,
): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error("[Brainstorm] Transcript processing error:", detail);
  const isConnectivity =
    detail.includes("ECONNREFUSED") ||
    detail.includes("reachable") ||
    detail.includes("not available") ||
    detail.includes("No LLM");
  if (isConnectivity) {
    const queued = deps.brainstormService.queueTranscript(transcript);
    res.status(202).json({
      status: "queued",
      message: "LLM unavailable — transcript queued",
      queued,
    });
    return;
  }
  res.status(502).json({ error: "extraction_failed", detail });
}
