import express, { type Application, type Request, type Response } from "express";
import * as crypto from "crypto";
import type { ApiRouteDeps } from "./types";
import { confirmBoundOperation, withFooter } from "../../extension/operatorConfirmation";
import { isCanonicalAudioId } from "../services/AudioVaultService";

async function storeAudio(req: Request, res: Response, deps: ApiRouteDeps) {
  if (deps.rejectIfRemote(req, res)) return;
  try {
    // The raw-body parser must provide a Buffer. Never let an array, string or
    // object supplied as request data influence the capture description or file.
    const incoming: unknown = req.body;
    if (!Buffer.isBuffer(incoming)) {
      res.status(415).json({ error: "Expected binary audio/webm" }); return;
    }
    if (incoming.length === 0) { res.status(400).json({ error: "Empty body" }); return; }
    // Own these bytes across the asynchronous operator modal. The request body
    // may be mutated by another middleware while the operator is deciding.
    const buffer = Buffer.from(incoming);
    const digest = crypto.createHash("sha256").update(buffer).digest("hex");
    const displaySize = buffer.byteLength;
    const displayDigest = digest.slice(0, 16);
    // #465: an HTTP request is not recording consent. Require one live VS Code
    // modal for this exact capture. No approval or client disconnect -> no write.
    const approved = await confirmBoundOperation(
      deps.confirmOperatorAction,
      { bytes: buffer.length, digest },
      (_capture, operationId) => ({
        title: "Save this Mind Map audio recording to disk?",
        approveLabel: "Save recording",
        detail: withFooter([
          `Capture: ${displaySize} bytes; SHA-256 ${displayDigest}…`,
          `Request: ${operationId}`,
          "Destination: this workspace's .failsafe/audio directory.",
          "The original recording is kept even if transcription fails.",
          "No automatic deletion or retention deadline is currently configured.",
          "Nothing is saved unless you explicitly choose Save recording.",
        ]),
      }),
      res,
    );
    if (!approved) return;
    if (!res.socket || res.socket.destroyed || res.writableEnded) return;
    if (crypto.createHash("sha256").update(buffer).digest("hex") !== approved.operation.digest) {
      res.status(409).json({ error: "Audio changed while awaiting approval" });
      return;
    }
    const hash = await deps.audioVaultService.storeAudio(buffer);
    res.json({ audioHash: hash });
  } catch {
    res.status(500).json({ error: "Storage failed" });
  }
}

async function getAudio(req: Request, res: Response, deps: ApiRouteDeps) {
  if (deps.rejectIfRemote(req, res)) return;
  try {
    const hash = req.params.hash;
    if (!isCanonicalAudioId(hash)) { res.status(400).send("Invalid audio id"); return; }
    const audio = await deps.audioVaultService.getAudio(hash);
    if (!audio) { res.status(404).send("Not found"); return; }
    res.setHeader("Content-Type", "audio/webm");
    res.send(audio);
  } catch {
    res.status(500).send("Fetch error");
  }
}

async function retryPending(req: Request, res: Response, deps: ApiRouteDeps) {
  if (deps.rejectIfRemote(req, res)) return;
  try {
    const results = await deps.brainstormService.retryPending();
    for (const result of results) {
      if (result.extraction) {
        deps.broadcast({ type: "brainstorm.update", payload: result.extraction });
      }
    }
    res.json({ processed: results.length, results });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: "retry_failed", detail });
  }
}

export function setupBrainstormPendingRoutes(app: Application, deps: ApiRouteDeps): void {
  app.post("/api/v1/brainstorm/audio", express.raw({ type: "audio/webm", limit: "50mb" }),
    (req, res) => storeAudio(req, res, deps));
  app.get("/api/v1/brainstorm/audio/:hash", (req, res) => getAudio(req, res, deps));
  app.get("/api/v1/brainstorm/pending", (req, res) => {
    if (!deps.rejectIfRemote(req, res)) {
      res.json({ pending: deps.brainstormService.getPendingTranscripts() });
    }
  });
  app.post("/api/v1/brainstorm/retry", (req, res) => retryPending(req, res, deps));
}
