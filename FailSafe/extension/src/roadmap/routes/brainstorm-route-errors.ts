import type { Response } from "express";
import type { ApiRouteDeps } from "./types";

/**
 * Transcript-processing error helpers relocated verbatim from
 * BrainstormRoute.ts:231-258 (#238 LD5 split). Connectivity failures queue
 * the transcript for retry (202); everything else is a 502 extraction error.
 */
export function handleTranscriptError(
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
