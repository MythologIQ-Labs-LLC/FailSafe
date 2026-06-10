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
import { buildGovernanceDashboard } from "../../qorlogic/governance-dashboard";
import { parseMetaLedgerEntries } from "../../qorlogic/meta-ledger-model";
import { reconstructGenomeFromLedger } from "../../qorlogic/genome-reconstruction";
import { mergeGenomes } from "../../qorlogic/genome-merge";

export function registerQorRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get("/api/qor/runtime", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    res.json(await deps.qorRuntimeService.fetchSnapshot());
  });

  // Read-only Shadow Genome dashboard. Ingests BOTH the real (recorded) genome and
  // a reconstructed appendix derived from historical governance (META_LEDGER, #454) —
  // merged per-record (recorded wins). Always 200 (degrade-safe): no genome AND no
  // ledger ⇒ the zeroed `enabled:false` payload. Determinism lives in the pure pieces.
  app.get("/api/qor/governance-dashboard", async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const result = deps.loadShadowGenome
      ? await deps.loadShadowGenome()
      : { ok: true, localOnly: true };
    const real = result.ok && result.graph ? result.graph : { nodes: [], edges: [] };
    const ledger = deps.loadMetaLedger ? deps.loadMetaLedger() : "";
    const appendix = ledger
      ? reconstructGenomeFromLedger(parseMetaLedgerEntries(ledger))
      : { nodes: [], edges: [] };
    const merged = mergeGenomes(real, appendix);
    const effective = merged.nodes.length > 0 ? { ok: true as const, graph: merged } : result;
    res.json(buildGovernanceDashboard(effective, { generatedAt: new Date().toISOString() }));
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
