import type { Application, Request, Response } from "express";
import type { ApiRouteDeps } from "./types";
import { NODE_LABEL_MAX, withTruncationInfo } from "./brainstorm-label-truncation";
import { seedGraphFromGenome } from "../services/brainstorm-seed";
import { reconstructGenomeFromLedger } from "../../qorlogic/genome-reconstruction";
import { mergeGenomes } from "../../qorlogic/genome-merge";

function addNode(req: Request, res: Response, deps: ApiRouteDeps): void {
  if (deps.rejectIfRemote(req, res)) return;
  const rawLabel = String(req.body.label || "");
  const label = rawLabel.slice(0, NODE_LABEL_MAX).trim();
  if (!label) { res.status(400).json({ error: "Label required" }); return; }
  const type = String(req.body.type || "Feature").slice(0, 50);
  const clientId = req.body.id ? String(req.body.id).slice(0, 100) : undefined;
  const node = deps.brainstormService.addNode(label, type, clientId);
  deps.broadcast({ type: "brainstorm.update", payload: { nodes: [node], edges: [] } });
  res.json(withTruncationInfo(node, rawLabel));
}

function updateNode(req: Request, res: Response, deps: ApiRouteDeps): void {
  if (deps.rejectIfRemote(req, res)) return;
  const rawLabel = String(req.body.label || "");
  const label = rawLabel.slice(0, NODE_LABEL_MAX).trim();
  const type = String(req.body.type || "Feature").slice(0, 50);
  if (!label) { res.status(400).json({ error: "Label required" }); return; }
  const node = deps.brainstormService.updateNode(String(req.params.id), label, type);
  if (!node) { res.status(404).json({ error: "Node not found" }); return; }
  deps.broadcast({ type: "brainstorm.update", payload: { nodes: [node], edges: [] } });
  res.json(withTruncationInfo(node, rawLabel));
}

function removeNode(req: Request, res: Response, deps: ApiRouteDeps): void {
  if (deps.rejectIfRemote(req, res)) return;
  const id = String(req.params.id);
  if (!deps.brainstormService.removeNode(id)) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  deps.broadcast({ type: "brainstorm.node-removed", payload: { id } });
  res.json({ ok: true });
}

async function seedGraph(req: Request, res: Response, deps: ApiRouteDeps) {
  if (deps.rejectIfRemote(req, res)) return;
  const result = deps.loadShadowGenome
    ? await deps.loadShadowGenome()
    : { ok: true as const, localOnly: true };
  const graph = result.ok && result.graph ? result.graph : { nodes: [], edges: [] };
  // #233 (FX892): consume the adapter envelope — entries arrive parsed and
  // classified; any non-ok state degrades to an empty appendix explicitly.
  const envelope = deps.readMetaLedgerEnvelope ? deps.readMetaLedgerEnvelope() : null;
  const appendix = envelope && envelope.state === "ok" && envelope.data
    ? reconstructGenomeFromLedger(envelope.data)
    : { nodes: [], edges: [] };
  res.json(seedGraphFromGenome(mergeGenomes(graph, appendix)));
}

export function setupBrainstormGraphRoutes(app: Application, deps: ApiRouteDeps): void {
  app.post("/api/v1/brainstorm/node", (req, res) => addNode(req, res, deps));
  app.patch("/api/v1/brainstorm/node/:id", (req, res) => updateNode(req, res, deps));
  app.delete("/api/v1/brainstorm/node/:id", (req, res) => removeNode(req, res, deps));
  app.get("/api/v1/brainstorm/graph", (req, res) => {
    if (!deps.rejectIfRemote(req, res)) res.json(deps.brainstormService.getGraph());
  });
  app.get("/api/v1/brainstorm/seed", (req, res) => seedGraph(req, res, deps));
  app.delete("/api/v1/brainstorm/graph", (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    deps.brainstormService.reset();
    deps.broadcast({ type: "brainstorm.reset" });
    res.json({ ok: true });
  });
}
