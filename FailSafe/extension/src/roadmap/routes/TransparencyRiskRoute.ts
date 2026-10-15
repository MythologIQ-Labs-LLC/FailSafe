import { Request, Response } from "express";
import * as crypto from "crypto";
import type { ApiRouteDeps } from "./types";
import { RiskStoreError } from "../../shared/risk-store";

/**
 * Transparency audit stream and risk-register CRUD routes.
 * Extracted from ConsoleServer (lines 494-561).
 *
 * #517: create/update/delete run inside mutateRiskRegister, under the risk
 * store lock against the freshly read durable list, so a write from another
 * window or importer between a read and a write can never be lost.
 */

/** #517 LD9: store refusals are 503 (retryable or operator-fixable), CONFLICT 409. */
function statusFor(error: unknown): number {
  if (!(error instanceof RiskStoreError)) return 500;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "REENTRANT" || error.code === "ASYNC_MUTATOR") return 500;
  return 503;
}

function sendFailure(res: Response, error: unknown): void {
  res.status(statusFor(error)).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
}

function notFound(res: Response, id: unknown): void {
  // The explanatory body serves raw API consumers; the Console UI no
  // longer renders mutation affordances on backlog-derived rows.
  res.status(404).json({ ok: false, error: String(id).startsWith("backlog:")
    ? "backlog-derived rows are read-only; edit docs/BACKLOG.md"
    : "risk not found" });
}

/** risk-MILLIS-6HEX: two windows creating in the same millisecond never collide. */
function newRiskId(risks: Array<{ id?: unknown }>): string {
  for (;;) {
    const id = `risk-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    if (!risks.some((r) => r.id === id)) return id;
  }
}

export function setupTransparencyRiskRoutes(
  app: import("express").Application,
  deps: ApiRouteDeps,
): void {
  // API: Get transparency events (prompt lifecycle audit stream)
  app.get("/api/transparency", (_req: Request, res: Response) => {
    const events = deps.getTransparencyEvents(50);
    res.json({ events });
  });

  // API: Get risk register
  app.get("/api/risks", (_req: Request, res: Response) => {
    const risks = deps.getRiskRegister();
    res.json({ risks });
  });

  // API: Create risk
  app.post("/api/v1/risks", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const { title, severity, status, description } = req.body;
    if (!title || !severity) {
      res
        .status(400)
        .json({ ok: false, error: "title and severity required" });
      return;
    }
    const fields = {
      title: String(title).slice(0, 200),
      severity: String(severity),
      status: String(status || "open"),
      description: String(description || "").slice(0, 2000),
      createdAt: new Date().toISOString(),
    };
    // #377: mutations read the DURABLE store, never getRiskRegister()'s
    // display view — reading the BACKLOG.md fallback here durably promoted
    // the entire projection on the first write (#241 F-6 sibling).
    let risk: Record<string, unknown>;
    try {
      risk = deps.mutateRiskRegister((risks) => {
        const created = { id: newRiskId(risks), ...fields };
        risks.push(created);
        return created;
      });
    } catch (error) {
      sendFailure(res, error);
      return;
    }
    deps.broadcast({ type: "risk.created", payload: risk });
    res.json({ ok: true, risk });
  });

  // API: Update risk
  app.put("/api/v1/risks/:id", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const id = req.params.id;
    let updated: Record<string, unknown> | null;
    try {
      updated = deps.mutateRiskRegister((risks) => {
        const idx = risks.findIndex((r: any) => r.id === id);
        if (idx === -1) return null;
        risks[idx] = { ...risks[idx], ...req.body, id };
        return risks[idx];
      });
    } catch (error) {
      sendFailure(res, error);
      return;
    }
    if (!updated) {
      notFound(res, id);
      return;
    }
    deps.broadcast({ type: "risk.updated", payload: updated });
    res.json({ ok: true, risk: updated });
  });

  // API: Delete risk
  app.delete("/api/v1/risks/:id", (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const id = req.params.id;
    let deleted: boolean;
    try {
      deleted = deps.mutateRiskRegister((risks) => {
        const idx = risks.findIndex((r: any) => r.id === id);
        if (idx === -1) return false;
        risks.splice(idx, 1);
        return true;
      });
    } catch (error) {
      sendFailure(res, error);
      return;
    }
    if (!deleted) {
      notFound(res, id);
      return;
    }
    deps.broadcast({ type: "risk.deleted", payload: { id } });
    res.json({ ok: true });
  });
}
