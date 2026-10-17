/**
 * Managed architecture index routes (#531 LD4). Design: docs/architecture/MANAGED_ARCHITECTURE_INDEX.md.
 *
 *   GET  /api/v1/architecture/index                 snapshot + ledger state (read-only)
 *   POST /api/actions/architecture-index/bootstrap  {mode:'create'}: create the index once, never overwriting
 *   POST /api/actions/architecture-index/propose    {path, action, supersededBy?}: PROPOSAL entry + one L3 item
 *   POST /api/actions/architecture-index/open       {path}: open a snapshot document in the editor ("Use existing")
 *
 * Every route is loopback-only and rate limited. Only bootstrap writes a file, after a modal
 * confirmation. Propose records a decision request and writes nothing; with no usable ledger it
 * answers 503 and queues nothing, because processL3Decision records the decision in the ledger.
 */

import type { Application, Request, Response } from "express";
import * as fs from "fs";
import { rateLimit } from "express-rate-limit";
import { confirmationFailure, type ConfirmOperatorAction } from "../../extension/operatorConfirmation";
import type { L3ApprovalRequest } from "../../shared/types/l3-approval";
import {
  discoverArchitectureIndex, resolveInsideWorkspace, type ArchitectureGit, type ArchitectureIndexSnapshot,
} from "../../governance/architecture/ArchitectureIndexDiscovery";
import {
  appendArchitectureProposal, ARCHITECTURE_AGENT_DID, runArchitectureIndexBootstrap, sha256, sourceShaOf, usableLedger,
  type BootstrapResult,
} from "../../governance/architecture/ArchitectureIndexBootstrap";

export interface ArchitectureIndexRouteDeps {
  rejectIfRemote(req: Request, res: Response): boolean;
  workspaceRoot: string;
  /** `failsafe.architecture.indexPath`, read at request time. */
  getIndexPathSetting?: () => string | undefined;
  /** Read at request time; null, disabled and stub ledgers all count as unavailable. */
  getLedgerManager: () => unknown;
  queueL3Approval: (request: Omit<L3ApprovalRequest, "id" | "state" | "queuedAt" | "slaDeadline">) => Promise<string>;
  /** Modal confirmer; a lazy getter on the registrar's deps (routes register before bootstrap wires it). */
  confirmOperatorAction?: ConfirmOperatorAction;
  /** Opens an absolute path that has passed the snapshot and containment checks. */
  openFileInEditor: (absPath: string) => Promise<void>;
  broadcast?: (data: Record<string, unknown>) => void;
  git?: ArchitectureGit;
}

const ACTIONS = new Set(["register", "supersede"]);
const PROPOSABLE = new Set(["present", "present-with-problems"]);

function snapshotOf(deps: ArchitectureIndexRouteDeps): ArchitectureIndexSnapshot {
  return discoverArchitectureIndex({
    workspaceRoot: deps.workspaceRoot, indexPathSetting: deps.getIndexPathSetting?.(), git: deps.git,
  });
}

/** HTTP status + body for a bootstrap result. The three 409 bodies are distinct. */
export function bootstrapResponse(result: BootstrapResult): { status: number; body: Record<string, unknown> } {
  switch (result.status) {
    case "created": return { status: 200, body: { ok: true, ...result } };
    case "reuse": return { status: 409, body: { ok: false, reuse: result.path, state: result.state } };
    case "appeared": return { status: 409, body: { ok: false, exists: "appeared", path: result.path } };
    case "confirmation": {
      const f = confirmationFailure(result.confirmation);
      return { status: f.status, body: f.body };
    }
    case "refused": return { status: 422, body: { ok: false, refused: result.state, detail: result.detail ?? null } };
    case "outside-workspace": return { status: 422, body: { ok: false, refused: "outside-workspace", path: result.path } };
    default: return { status: 500, body: { ok: false, error: "write-failed", path: result.path } };
  }
}

const badRequest = (res: Response, error: string): void => { res.status(400).json({ ok: false, error }); };

/** The workspace-relative paths a request may name: candidates, registered docs and their suggestions. */
function knownPaths(snap: ArchitectureIndexSnapshot): Set<string> {
  const out = new Set<string>();
  for (const c of snap.candidates) { out.add(c.path); for (const s of c.suggestions) out.add(s); }
  for (const r of snap.rows) if (r.docPath) out.add(r.docPath);
  return out;
}

async function propose(req: Request, res: Response, deps: ArchitectureIndexRouteDeps): Promise<void> {
  const body = (req.body ?? {}) as { path?: unknown; action?: unknown; supersededBy?: unknown };
  const action = typeof body.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!action) { badRequest(res, "action must be register or supersede"); return; }
  const docPath = typeof body.path === "string" ? body.path : "";
  const snap = snapshotOf(deps);
  if (!PROPOSABLE.has(snap.state)) { res.status(409).json({ ok: false, state: snap.state }); return; }
  const candidate = snap.candidates.find((c) => c.path === docPath);
  const row = snap.rows.find((r) => r.docPath === docPath);
  let successor: string | null = null;
  if (action === "register") {
    if (!candidate) { badRequest(res, "path is not an unregistered architecture document in this workspace"); return; }
  } else {
    if (!candidate && !row) { badRequest(res, "path is not an architecture document in this workspace"); return; }
    const next = snap.rows.find((r) => r.id === body.supersededBy && r.docPath);
    if (!next || next.docPath === docPath) { badRequest(res, "supersededBy must name another registered row id"); return; }
    successor = next.id;
  }
  const located = resolveInsideWorkspace(deps.workspaceRoot, docPath);
  if (!located || !located.inside) { badRequest(res, "path does not resolve inside the workspace"); return; }

  const ledger = usableLedger(deps.getLedgerManager());
  if (!ledger) { res.status(503).json({ ok: false, ledger: "unavailable", error: "The FailSafe ledger is unavailable; nothing was queued." }); return; }
  const kind = action === "register" ? "architecture-doc-proposal" : "architecture-doc-supersede";
  const { sourceSha, sourceShaReason } = sourceShaOf(deps.workspaceRoot, deps.git);
  const docSha256 = sha256(fs.readFileSync(located.abs));
  const suggestions = candidate?.suggestions ?? [];
  const payload: Record<string, unknown> = {
    kind, path: docPath, action, supersededBy: successor, sourceSha, ...(sourceShaReason ? { sourceShaReason } : {}),
    docSha256, suggestions,
  };
  const record = await appendArchitectureProposal(ledger, docPath, docSha256, payload);
  if (record === "unavailable") { res.status(503).json({ ok: false, ledger: "unavailable", error: "The FailSafe ledger is unavailable; nothing was queued." }); return; }
  if (record === "failed") { res.status(500).json({ ok: false, ledger: "failed", error: "The proposal could not be recorded; nothing was queued." }); return; }
  const verb = action === "register" ? "Register" : `Supersede with ${successor}:`;
  const approvalId = await deps.queueL3Approval({
    filePath: docPath, riskGrade: "L3", agentDid: ARCHITECTURE_AGENT_DID, agentTrust: 0,
    sentinelSummary: `Architecture index proposal. ${verb} ${docPath}. Approving records the decision; it does not edit the index.`,
    flags: ["architecture-index"], kind, meta: { ...payload, proposalEntryId: record.entryId },
    sourceLedgerEntryId: record.entryId,
  });
  deps.broadcast?.({ type: "hub.refresh", reason: "architecture-proposal" });
  res.status(202).json({ ok: true, approvalId, ledgerEntryId: record.entryId, kind, path: docPath });
}

async function open(req: Request, res: Response, deps: ArchitectureIndexRouteDeps): Promise<void> {
  const docPath = typeof (req.body ?? {}).path === "string" ? String(req.body.path) : "";
  const snap = snapshotOf(deps);
  if (!docPath || !knownPaths(snap).has(docPath)) { badRequest(res, "path is not an architecture document in this workspace"); return; }
  const located = resolveInsideWorkspace(deps.workspaceRoot, docPath);
  if (!located || !located.inside) { badRequest(res, "path does not resolve inside the workspace"); return; }
  try {
    await deps.openFileInEditor(located.abs);
  } catch {
    res.status(503).json({ ok: false, error: "The editor could not be reached." });
    return;
  }
  res.json({ ok: true, path: docPath });
}

export function setupArchitectureIndexRoutes(app: Application, deps: ArchitectureIndexRouteDeps): void {
  // CodeQL js/missing-rate-limiting: the read lists repository paths and runs git; the actions write,
  // queue or open. One limiter per route, so opening documents cannot starve a proposal.
  const limiter = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: false, legacyHeaders: false });
  const readLimiter = limiter(60);

  app.get("/api/v1/architecture/index", readLimiter, (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    const snap = snapshotOf(deps);
    res.json({ ...snap, ledger: usableLedger(deps.getLedgerManager()) ? "available" : "unavailable" });
  });

  app.post("/api/actions/architecture-index/bootstrap", limiter(5), async (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    if ((req.body ?? {}).mode !== "create") { badRequest(res, "mode must be create"); return; }
    const result = await runArchitectureIndexBootstrap({
      workspaceRoot: deps.workspaceRoot, indexPathSetting: deps.getIndexPathSetting?.(), git: deps.git,
      confirm: deps.confirmOperatorAction, source: "console", ledger: deps.getLedgerManager(),
    });
    if (result.status === "created") deps.broadcast?.({ type: "architecture.index.changed", path: result.path });
    const { status, body } = bootstrapResponse(result);
    res.status(status).json(body);
  });

  app.post("/api/actions/architecture-index/propose", limiter(10), async (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    try { await propose(req, res, deps); } catch {
      if (!res.headersSent) res.status(500).json({ ok: false, error: "The proposal could not be queued." });
    }
  });

  app.post("/api/actions/architecture-index/open", limiter(30), async (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    await open(req, res, deps);
  });
}
