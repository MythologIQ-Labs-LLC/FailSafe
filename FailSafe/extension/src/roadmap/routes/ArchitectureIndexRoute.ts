/**
 * Managed architecture index routes (#531 LD4; slice 2: plan-531b LD5-LD8). Design:
 * docs/architecture/MANAGED_ARCHITECTURE_INDEX.md.
 *
 *   GET  /api/v1/architecture/index                 snapshot + ledger state + authority findings (read-only)
 *   POST /api/actions/architecture-index/bootstrap  {mode:'create'}: create the index once, never overwriting
 *   POST /api/actions/architecture-index/propose    {path, action:'register', domain, status, supersedes?} or
 *                                                   {path, action:'supersede', supersededBy}: PROPOSAL entry + one L3 item
 *   POST /api/actions/architecture-index/open       {path}: open a snapshot document in the editor ("Use existing")
 *
 * Every route is loopback-only and rate limited; propose also runs the Console request guard.
 * Only bootstrap writes a file, after a modal confirmation. Propose records a decision request and
 * writes nothing: it refuses competing canonical authority (in the index, or pending in the L3 queue
 * or approved and not yet in the index), needs a modal confirmation for every supersession, and
 * re-checks the index, the documents and HEAD under a per-workspace lock before it records. With no
 * usable ledger it answers 503 and queues nothing, because processL3Decision records the decision.
 */

import type { Application, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import {
  architectureSupersessionRequest, confirmBoundOperation, confirmationFailure, type ConfirmOperatorAction,
} from "../../extension/operatorConfirmation";
import type { L3ApprovalRequest } from "../../shared/types/l3-approval";
import { describeOperatorAuthentication } from "../../shared/types/operatorAuthentication";
import {
  discoverArchitectureIndex, INDEX_PRESENT_STATES, resolveInsideWorkspace, type ArchitectureGit, type ArchitectureIndexSnapshot,
} from "../../governance/architecture/ArchitectureIndexDiscovery";
import {
  runArchitectureIndexBootstrap, usableLedger, type ArchitectureLedger, type BootstrapResult,
} from "../../governance/architecture/ArchitectureIndexBootstrap";
import { assessArchitectureAuthority } from "../../governance/architecture/architectureAuthority";
import {
  freshnessProblem, ledgerReader, loadApprovedProposals, pendingAuthority, pendingRefusal, planArchitectureProposal,
  recordArchitectureProposal, supersessionFacts, withProposalLock, type ArchitectureLedgerReader, type ConfirmationRecord,
  type ProposalOperation, type Refusal,
} from "../../governance/architecture/ArchitectureIndexProposal";
import { consoleRequestGuard } from "./consoleRequestGuard";

export interface ArchitectureIndexRouteDeps {
  rejectIfRemote(req: Request, res: Response): boolean;
  workspaceRoot: string;
  /** `failsafe.architecture.indexPath`, read at request time. */
  getIndexPathSetting?: () => string | undefined;
  /** Read at request time; null, disabled and stub ledgers all count as unavailable. */
  getLedgerManager: () => unknown;
  queueL3Approval: (request: Omit<L3ApprovalRequest, "id" | "state" | "queuedAt" | "slaDeadline">) => Promise<string>;
  /** #531 slice 2: read-only L3 queue (pending authority). Absent or throwing: propose answers 503 pending unknown. */
  getL3Queue?: () => L3ApprovalRequest[];
  /** Modal confirmer; a lazy getter on the registrar's deps (routes register before bootstrap wires it). */
  confirmOperatorAction?: ConfirmOperatorAction;
  /** #531 slice 2: the bound supersession confirmation's deadline (tests shorten it). */
  confirmationDeadlineMs?: number;
  /** Opens an absolute path that has passed the snapshot and containment checks. */
  openFileInEditor: (absPath: string) => Promise<void>;
  broadcast?: (data: Record<string, unknown>) => void;
  git?: ArchitectureGit;
}

const PROPOSE_CHANNEL = "console:/api/actions/architecture-index/propose";

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

/** The workspace-relative paths a request may name: candidates, registered docs, their suggestions and the index. */
function knownPaths(snap: ArchitectureIndexSnapshot): Set<string> {
  const out = new Set<string>();
  for (const c of snap.candidates) { out.add(c.path); for (const s of c.suggestions) out.add(s); }
  for (const r of snap.rows) if (r.docPath) out.add(r.docPath);
  if (INDEX_PRESENT_STATES.has(snap.state) && snap.state !== "present-elsewhere") out.add(snap.indexPath);
  return out;
}

const PENDING_UNKNOWN: Refusal = {
  status: 503,
  body: {
    ok: false, pending: "unknown",
    error: "FailSafe could not read the L3 queue or the ledger, so it cannot tell whether this authority is already pending; nothing was recorded.",
  },
};

/** Pending authority from the queue and the ledger; a reader that is missing or throws is 503 unknown. */
async function pendingCheck(
  deps: ArchitectureIndexRouteDeps, op: ProposalOperation, snap: ArchitectureIndexSnapshot, reader: ArchitectureLedgerReader,
): Promise<Refusal | null> {
  try {
    if (!deps.getL3Queue) return PENDING_UNKNOWN;
    const queue = deps.getL3Queue();
    const approved = await loadApprovedProposals(reader);
    return pendingRefusal(op, pendingAuthority(op, { queue, approved, snapshot: snap }));
  } catch {
    return PENDING_UNKNOWN;
  }
}

const STALE_TEXT: Record<string, string> = {
  state: "The index can no longer take proposals",
  index: "The index changed",
  document: "A document in this proposal changed",
  head: "HEAD moved",
};

async function propose(req: Request, res: Response, deps: ArchitectureIndexRouteDeps): Promise<void> {
  const root = deps.workspaceRoot;
  const plan = planArchitectureProposal(snapshotOf(deps), req.body, { workspaceRoot: root, git: deps.git });
  if (plan.refuse) { res.status(plan.refuse.status).json(plan.refuse.body); return; }
  let op = plan.op;
  const manager = deps.getLedgerManager();
  const ledger: ArchitectureLedger | null = usableLedger(manager);
  const reader = ledgerReader(manager);
  if (!ledger || !reader) { res.status(503).json({ ok: false, ledger: "unavailable", error: "The FailSafe ledger is unavailable; nothing was queued." }); return; }
  const early = await pendingCheck(deps, op, snapshotOf(deps), reader);
  if (early) { res.status(early.status).json(early.body); return; }

  let confirmation: ConfirmationRecord = {};
  if (op.supersession) {
    const bound = await confirmBoundOperation(
      deps.confirmOperatorAction, op, (o, id) => architectureSupersessionRequest(supersessionFacts(o), id), res,
      { deadlineMs: deps.confirmationDeadlineMs },
    );
    if (!bound) return;
    op = bound.operation;
    confirmation = {
      operationId: bound.operationId,
      authentication: { ...describeOperatorAuthentication({ method: "vscode-modal-confirmation", channel: PROPOSE_CHANNEL }) },
    };
  }

  const frozen = op;
  const result = await withProposalLock(root, async (): Promise<Refusal> => {
    const now = snapshotOf(deps);
    const stale = freshnessProblem(frozen, now, { workspaceRoot: root, git: deps.git });
    if (stale) {
      return { status: 409, body: { ok: false, stale, error: `${STALE_TEXT[stale]} while you were confirming; nothing was recorded. Propose again.` } };
    }
    const pending = await pendingCheck(deps, frozen, now, reader);
    if (pending) return pending;
    return recordArchitectureProposal(frozen, ledger, deps.queueL3Approval, confirmation);
  });
  if (res.writableEnded) return;
  res.status(result.status).json(result.body);
  if (result.status === 202) deps.broadcast?.({ type: "hub.refresh", reason: "architecture-proposal" });
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
    res.json({
      ...snap, ledger: usableLedger(deps.getLedgerManager()) ? "available" : "unavailable",
      authority: assessArchitectureAuthority(snap, { workspaceRoot: deps.workspaceRoot, git: deps.git }),
    });
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

  // #531 slice 2: propose can raise a modal, so the Console request guard (loopback socket, Host,
  // Origin, JSON) runs before its limiter.
  app.post("/api/actions/architecture-index/propose", consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res)), limiter(10), async (req, res) => {
    try { await propose(req, res, deps); } catch {
      if (!res.headersSent) res.status(500).json({ ok: false, error: "The proposal could not be queued." });
    }
  });

  app.post("/api/actions/architecture-index/open", limiter(30), async (req, res) => {
    if (deps.rejectIfRemote(req, res)) return;
    await open(req, res, deps);
  });
}
