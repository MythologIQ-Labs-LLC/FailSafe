/**
 * #514 (FX960): operator confirmation for loopback actions that record an
 * operator decision, revert workspace files, or stop or disable governance.
 *
 * The Console reaches the extension over loopback HTTP, which any local process
 * can also do. A gated route therefore acts only after the operator approves a
 * modal VS Code dialog. Context in the dialog comes from server-side state;
 * every value the route records that only the request supplied is shown,
 * labelled "as requested", and recorded exactly as shown. This proves a human
 * clicked the dialog; it does not authenticate which local process asked.
 *
 * No `vscode` import: the window is injected (bootstrapServers passes
 * vscode.window) so routes and tests can use this module directly.
 */

import { randomUUID } from "crypto";
import type { Response } from "express";
import type { L3ApprovalRequest } from "../shared/types/l3-approval";
import type { RollbackPlan } from "../governance/revert/types";

export interface OperatorActionRequest {
  title: string;
  detail: string;
  approveLabel: string;
}

/** approved | declined | busy (another confirmation is already open). */
export type OperatorConfirmation = "approved" | "declined" | "busy";

export type ConfirmOperatorAction = (request: OperatorActionRequest) => Promise<OperatorConfirmation>;

/** The slice of vscode.window this module needs (injectable for tests). */
export interface ConfirmationWindow {
  showWarningMessage(
    message: string,
    options: { modal: boolean; detail?: string },
    ...items: string[]
  ): Thenable<string | undefined>;
}

export const LOOPBACK_FOOTER =
  "Requested from the FailSafe Console over loopback. If you did not just ask for this, choose Cancel.";
/** #532 B320: a command called with arguments (any extension can call a VS Code command). */
export const COMMAND_CALL_FOOTER =
  "Requested by a command call. If you did not just ask for this, choose Cancel.";
/** Default per-field cap for dialog text. */
export const FIELD_LIMIT = 200;
/** Cap for free-text values the operator records (rollback reason, ratify rationale). */
export const REASON_LIMIT = 500;
export const BATCH_LIST_LIMIT = 20;

// C0 + C1 controls, LS/PS line and paragraph separators, ALM, LRM/RLM, LRE..RLO embeddings/overrides, LRI..PDI isolates.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029؜‎‏‪-‮⁦-⁩]/g;

/** Replace control and bidi-override characters and cap length so request
 *  text cannot reshape the dialog. Idempotent for its own output. */
export function sanitizeDialogText(value: unknown, limit = FIELD_LIMIT): string {
  const text = String(value ?? "").replace(UNSAFE_CHARS, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function createOperatorConfirmer(window: ConfirmationWindow): ConfirmOperatorAction {
  let open = false;
  return async (request) => {
    if (open) return "busy";
    open = true;
    try {
      const choice = await window.showWarningMessage(
        request.title,
        { modal: true, detail: request.detail },
        request.approveLabel,
      );
      return choice === request.approveLabel ? "approved" : "declined";
    } catch {
      return "declined";
    } finally {
      open = false;
    }
  };
}

export function withFooter(lines: string[]): string {
  return [...lines, "", LOOPBACK_FOOTER].join("\n");
}

function decisionVerb(decision: "APPROVED" | "REJECTED"): "Approve" | "Reject" {
  return decision === "REJECTED" ? "Reject" : "Approve";
}

export function l3DecisionRequest(item: L3ApprovalRequest, decision: "APPROVED" | "REJECTED", architecture?: string[]): OperatorActionRequest {
  const verb = decisionVerb(decision);
  return {
    title: `${verb} this L3 item?`,
    approveLabel: verb,
    detail: withFooter([
      `Decision (as requested): ${verb}`,
      `Kind: ${sanitizeDialogText(item.kind ?? "file change")}`,
      `File: ${sanitizeDialogText(item.filePath)}`,
      `Risk grade: ${sanitizeDialogText(item.riskGrade)}`,
      `Agent: ${sanitizeDialogText(item.agentDid)}`,
      `Sentinel summary: ${sanitizeDialogText(item.sentinelSummary)}`,
      `Flags: ${item.flags?.length ? sanitizeDialogText(item.flags.join(", ")) : "none"}`,
      ...architectureBlock(architecture),
    ]),
  };
}

export function l3BatchRequest(items: L3ApprovalRequest[], decision: "APPROVED" | "REJECTED", architecture?: string[]): OperatorActionRequest {
  const verb = decisionVerb(decision);
  const lines = items
    .slice(0, BATCH_LIST_LIMIT)
    .map((i) => `- ${sanitizeDialogText(i.kind ?? "file change", 60)}: ${sanitizeDialogText(i.filePath, 120)}`);
  if (items.length > BATCH_LIST_LIMIT) lines.push(`- and ${items.length - BATCH_LIST_LIMIT} more`);
  const noun = items.length === 1 ? "item" : "items";
  return {
    title: `${verb} all ${items.length} queued L3 ${noun}?`,
    approveLabel: `${verb} ${items.length}`,
    detail: withFooter([
      `Decision (as requested): ${verb}`,
      ...lines,
      "",
      "Only the items listed here are decided; items queued after you confirm stay queued.",
      ...architectureBlock(architecture),
    ]),
  };
}

export function ratifyRequest(decisionId: string, verdict: "ratify" | "reject", rationale: string): OperatorActionRequest {
  const verb = verdict === "reject" ? "Reject" : "Ratify";
  const shownRationale = sanitizeDialogText(rationale, REASON_LIMIT);
  return {
    title: `${verb} this bicameral decision under your name?`,
    approveLabel: verb,
    detail: withFooter([
      "FailSafe cannot look this decision up. Every value below was supplied by the requester and is recorded in the FailSafe ledger under your name exactly as shown.",
      "",
      `Decision id (as requested): ${sanitizeDialogText(decisionId)}`,
      `Verdict (as requested): ${verdict}`,
      `Rationale (as requested): ${shownRationale || "(none)"}`,
    ]),
  };
}

export interface CheckpointSummary {
  checkpointId?: string;
  checkpointType?: string;
  phase?: string;
  status?: string;
  timestamp?: string;
}

/**
 * #532 (plan-532c LD8a): `plan` is computed on the server (the revert service's prepare): the work
 * tree, branch, HEAD, the checkpoint commit with its subject and date, and the commits leaving the
 * branch. The rollback runs `git reset --keep` only while the workspace still matches it.
 */
export function rollbackRequest(checkpointId: string, checkpoint: CheckpointSummary, reason: string, plan: RollbackPlan): OperatorActionRequest {
  const shownReason = sanitizeDialogText(reason, REASON_LIMIT);
  const type = checkpoint.checkpointType ?? [checkpoint.phase, checkpoint.status].filter(Boolean).join(" / ");
  return {
    title: "Roll back the workspace to this checkpoint?",
    approveLabel: "Roll back",
    detail: withFooter([
      `Checkpoint: ${sanitizeDialogText(checkpoint.checkpointId ?? checkpointId)}`,
      `Type: ${sanitizeDialogText(type || "not recorded")}`,
      `Recorded: ${sanitizeDialogText(checkpoint.timestamp ?? "not recorded")}`,
      `Reason (as requested): ${shownReason || "(none)"}`,
      "",
      `Work tree: ${sanitizeDialogText(plan.workTree, 400)}`,
      `Branch: ${plan.branch ? sanitizeDialogText(plan.branch) : "none (detached HEAD)"}`,
      `Current HEAD: ${sanitizeDialogText(plan.head)}`,
      `Checkpoint commit: ${sanitizeDialogText(plan.target)} ${sanitizeDialogText(plan.targetSubject, 120)} (${sanitizeDialogText(plan.targetDate, 40)})`,
      `Commits leaving the branch: ${plan.leaving}`,
      "",
      "git reset --keep moves the branch to the checkpoint commit and updates the tracked files that differ between the two commits; " +
        "it stops without changing anything if one of those files has local changes. " +
        `The ${plan.leaving} commit(s) leaving the branch stay recoverable through git reflog for a limited time. ` +
        "Ignored files at paths the checkpoint commit tracks can be overwritten. Rollback is refused while there are uncommitted changes.",
    ]),
  };
}

export function hooksDisableRequest(): OperatorActionRequest {
  return {
    title: "Turn off FailSafe agent hooks for this workspace?",
    approveLabel: "Turn off hooks",
    detail: withFooter([
      "Governed agents stop being checked by the FailSafe hook until it is turned back on.",
    ]),
  };
}

export function panicStopRequest(): OperatorActionRequest {
  return {
    title: "Stop the FailSafe Sentinel?",
    approveLabel: "Stop Sentinel",
    detail: withFooter([
      "The Sentinel stops monitoring workspace changes until monitoring is resumed.",
    ]),
  };
}

/** #531: title of the bootstrap dialog (the extension-host test answers only this one). */
export const ARCHITECTURE_BOOTSTRAP_TITLE = "Create the architecture index?";

/**
 * #531 LD4/LD5: create the managed architecture index. Every value shown comes
 * from server-side discovery; the list of proposed rows is capped like the L3
 * batch dialog. The loopback footer is shown only for Console requests.
 */
export function architectureIndexBootstrapRequest(
  indexPath: string,
  candidates: string[],
  source: "console" | "command",
): OperatorActionRequest {
  const rows = candidates.slice(0, BATCH_LIST_LIMIT).map((c) => `- ${sanitizeDialogText(c, 160)}`);
  if (candidates.length > BATCH_LIST_LIMIT) rows.push(`- and ${candidates.length - BATCH_LIST_LIMIT} more`);
  const lines = [
    `File: ${sanitizeDialogText(indexPath)}`,
    "FailSafe writes this one new file. It never overwrites an existing file.",
    "",
    candidates.length
      ? `Rows: the index itself, plus ${candidates.length} existing document(s) as proposed:`
      : "Rows: the index itself; no existing architecture documents were found.",
    ...rows,
    "",
    "The creation is recorded in the FailSafe ledger when the ledger is available.",
  ];
  return {
    title: ARCHITECTURE_BOOTSTRAP_TITLE,
    approveLabel: "Create index",
    detail: source === "console" ? withFooter(lines) : lines.join("\n"),
  };
}

/** #532 part B: dialog titles for the delivery link routes (by action and edge). */
export const DELIVERY_LINK_TITLES = {
  implements: "Link this architecture document to the active intent?",
  "committed-under": "Link this commit to the active intent?",
  unlink: "Remove this link from the active intent?",
} as const;

/**
 * #532 part B (plan-532b LD7): record or remove a delivery edge. `facts` are server-side values
 * (document path and hash, HEAD at link time, commit, tree, branch), recorded exactly as shown.
 */
export function deliveryLinkRequest(
  action: "link" | "unlink",
  edge: "implements" | "committed-under",
  intent: { id: string; purpose: string },
  facts: string[],
  source: "console" | "command" = "console",
): OperatorActionRequest {
  const lines = [
    `Intent: ${sanitizeDialogText(intent.purpose)} (${sanitizeDialogText(intent.id, 60)})`,
    `Relationship: ${edge === "implements" ? "implements an architecture document" : "committed under a commit"}`,
    ...facts.map((f) => sanitizeDialogText(f)),
    "",
    action === "link"
      ? "FailSafe records this link in the intent history. Nothing leaves this machine."
      : "FailSafe records the removal in the intent history; the original link entry stays in the history.",
  ];
  return {
    title: action === "unlink" ? DELIVERY_LINK_TITLES.unlink : DELIVERY_LINK_TITLES[edge],
    approveLabel: action === "unlink" ? "Remove link" : "Link",
    detail: source === "console" ? withFooter(lines) : lines.join("\n"),
  };
}

/** #538: `expired` (approval after the deadline) and `cancelled` (client gone) come from confirmBoundOperation. */
export type ConfirmationFailure = "unwired" | "busy" | "declined" | "expired" | "cancelled";

/** HTTP status + body for a non-approved confirmation; nothing was recorded. */
export function confirmationFailure(result: ConfirmationFailure): {
  status: number;
  body: { ok: false; confirmation: ConfirmationFailure; error: string };
} {
  if (result === "unwired") {
    return { status: 503, body: { ok: false, confirmation: result, error: "Operator confirmation is not available; nothing was recorded." } };
  }
  if (result === "busy") {
    return { status: 429, body: { ok: false, confirmation: result, error: "Another confirmation is open in VS Code; nothing was recorded." } };
  }
  if (result === "expired") {
    return { status: 410, body: { ok: false, confirmation: result, error: "The VS Code confirmation expired; nothing was run. Send the request again to be asked again." } };
  }
  if (result === "cancelled") {
    // 499 (client closed request) is written only if the socket is still open, which it normally is not.
    return { status: 499, body: { ok: false, confirmation: result, error: "The request was closed before it was confirmed; nothing was run." } };
  }
  return { status: 409, body: { ok: false, confirmation: "declined", error: "Not confirmed in VS Code; nothing was recorded." } };
}

/** #538: how long a bound confirmation waits for the operator. */
export const CONFIRMATION_DEADLINE_MS = 120_000;

/** #538: a fresh id per request, shown in the dialog and recorded with the action. */
export function newOperationId(): string {
  return `op_${randomUUID()}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export interface BoundOperation<T> {
  operationId: string;
  /** The deep-frozen copy the dialog showed; the caller executes only this. */
  operation: T;
}

/**
 * #538 (plan-538b LD2/LD3): confirm one server-built operation and bind the approval to it.
 * The operation is copied and deep-frozen before the dialog is built, `confirm` is called
 * exactly once, and the frozen copy is returned only for an approval that arrives before
 * the deadline while the client is still connected. Every other outcome is answered here
 * (once) and returns null; nothing is cached, so each request needs its own approval.
 * A modal cannot be closed from the extension: an expired dialog stays open (and keeps the
 * single-open guard) until the operator dismisses it, and approving it then does nothing.
 */
export async function confirmBoundOperation<T>(
  confirm: ConfirmOperatorAction | undefined,
  operation: T,
  describe: (operation: T, operationId: string) => OperatorActionRequest,
  res: Response,
  options: { deadlineMs?: number } = {},
): Promise<BoundOperation<T> | null> {
  if (!confirm) {
    const failure = confirmationFailure("unwired");
    res.status(failure.status).json(failure.body);
    return null;
  }
  const operationId = newOperationId();
  const frozen = deepFreeze(structuredClone(operation));
  const request = describe(frozen, operationId);
  const socketGone = () => !res.socket || res.socket.destroyed;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => settle("expired"), options.deadlineMs ?? CONFIRMATION_DEADLINE_MS);
    const onClose = () => { if (!res.writableEnded) settle("cancelled"); };
    function settle(result: OperatorConfirmation | "expired" | "cancelled"): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.off("close", onClose);
      if (result === "approved") { resolve({ operationId, operation: frozen }); return; }
      if (result !== "cancelled" && !socketGone() && !res.headersSent) {
        const failure = confirmationFailure(result);
        res.status(failure.status).json({ ...failure.body, operationId });
      }
      resolve(null);
    }
    if (socketGone()) { settle("cancelled"); return; }
    res.once("close", onClose);
    Promise.resolve()
      .then(() => confirm(request))
      .then(
        (result) => settle(result === "approved" && socketGone() ? "cancelled" : result),
        () => settle("declined"),
      );
  });
}

/**
 * #532 B320 (plan-b320 LD3): confirmBoundOperation for a VS Code command, which has no HTTP
 * response to answer or watch. The same binding: the operation is copied and deep-frozen before the
 * dialog is built, `confirm` is called exactly once (never skipped), and the frozen copy is
 * returned only for an approval that arrives before the deadline. Every other outcome is returned
 * as a failure and the caller writes nothing.
 */
export async function confirmBoundCommand<T>(
  confirm: ConfirmOperatorAction | undefined,
  operation: T,
  describe: (operation: T, operationId: string) => OperatorActionRequest,
  options: { deadlineMs?: number } = {},
): Promise<{ ok: true; bound: BoundOperation<T> } | { ok: false; failure: Exclude<ConfirmationFailure, "cancelled">; operationId: string | null }> {
  if (!confirm) return { ok: false, failure: "unwired", operationId: null };
  const operationId = newOperationId();
  const frozen = deepFreeze(structuredClone(operation));
  const request = describe(frozen, operationId);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => settle("expired"), options.deadlineMs ?? CONFIRMATION_DEADLINE_MS);
    function settle(result: OperatorConfirmation | "expired"): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result === "approved" ? { ok: true, bound: { operationId, operation: frozen } } : { ok: false, failure: result, operationId });
    }
    Promise.resolve()
      .then(() => confirm(request))
      .then((result) => settle(result), () => settle("declined"));
  });
}

/**
 * Show the confirmation and answer the request when it is not approved.
 * Returns true only when the operator approved; the caller then acts.
 */
export async function requireOperatorConfirmation(
  confirm: ConfirmOperatorAction | undefined,
  request: OperatorActionRequest,
  res: Response,
): Promise<boolean> {
  const result: OperatorConfirmation | "unwired" = confirm ? await confirm(request) : "unwired";
  if (result === "approved") return true;
  const failure = confirmationFailure(result);
  res.status(failure.status).json(failure.body);
  return false;
}

/** #532 B320: dialog titles for a delivery review (the extension-host test answers only these). */
export const DELIVERY_REVIEW_TITLES = {
  PASS: "Record a review PASS for this commit?",
  VETO: "Record a review VETO for this commit?",
} as const;

/** #532 B320: one item a review PASS supersedes, as its dialog shows it. */
export interface DeliveryReviewSuperseded {
  kind: string;
  id: number;
  hash: string;
  label: string;
  verdict: string | null;
  commitSha: string | null;
  commitTrusted: boolean;
  timestamp: string | null;
  note: string | null;
}

/** #532 B320: what a review records, as the dialog shows it (deliveryReview.buildReviewPlan). */
export interface DeliveryReviewFacts {
  intent: { id: string; purpose: string };
  verdict: "PASS" | "VETO";
  commit: { sha: string; subject: string | null; tree: string; branch: string | null };
  linked: Array<{ commitSha: string }>;
  binding: { evidenceDigest: string; evidenceCount: number };
  superseded: DeliveryReviewSuperseded[];
  note: string;
  reviewerDid: string;
}

/**
 * #532 B320 (plan-b320 LD3): record a delivery review. Every value is server-side except the
 * verdict, the commit choice and the note, which are labelled by where they came from ("as
 * requested" from the Console or a command call, "your pick" from the command palette) and
 * recorded exactly as shown. Each item a PASS supersedes is listed with its commit; only a sealed
 * VETO's commit is trusted, so it is shown with its relation to the reviewed commit, and every other
 * item's commit is "recorded, unverified".
 */
export function deliveryReviewRequest(
  facts: DeliveryReviewFacts,
  operationId: string,
  source: "console" | "command-arguments" | "command-palette",
): OperatorActionRequest {
  const how = source === "command-palette" ? "your pick" : "as requested";
  const lines = [
    `Operation: ${operationId}`,
    `Intent: ${sanitizeDialogText(facts.intent.purpose)} (${sanitizeDialogText(facts.intent.id, 60)})`,
    `Verdict (${how}): ${facts.verdict}`,
    `Commit (${how}): ${facts.commit.sha}`,
    `Subject: ${facts.commit.subject === null ? "unknown (git could not read it)" : sanitizeDialogText(facts.commit.subject, 160)}`,
    `Tree: ${facts.commit.tree}`,
    `Branch: ${facts.commit.branch ? sanitizeDialogText(facts.commit.branch) : "none recorded"}`,
  ];
  if (facts.verdict === "PASS") {
    const covered = facts.linked.slice(0, BATCH_LIST_LIMIT).map((l) => `- ${l.commitSha}`);
    if (facts.linked.length > BATCH_LIST_LIMIT) covered.push(`- and ${facts.linked.length - BATCH_LIST_LIMIT} more`);
    lines.push(`Covers every linked commit (${facts.linked.length}):`, ...covered);
  }
  lines.push(`Governance evidence: ${facts.binding.evidenceCount} ledger entr${facts.binding.evidenceCount === 1 ? "y" : "ies"}, digest ${facts.binding.evidenceDigest}`);
  if (facts.superseded.length) {
    lines.push("", `Supersedes (${facts.superseded.length}); this PASS clears exactly these and nothing else:`);
    for (const s of facts.superseded.slice(0, BATCH_LIST_LIMIT)) {
      const commit = !s.commitSha ? "commit unknown"
        : s.commitTrusted ? `on ${s.commitSha} (${s.commitSha === facts.commit.sha ? "the reviewed commit" : "an ancestor of the reviewed commit"})`
          : `commit ${s.commitSha} (recorded, unverified)`;
      const what = s.kind === "veto" ? "VETO" : "unverifiable record";
      lines.push(`- ${what}, ${s.kind} #${s.id} ${sanitizeDialogText(s.hash, 70)}, ${commit}${s.timestamp ? `, at ${sanitizeDialogText(s.timestamp, 40)}` : ""}${s.note ? `, note: ${sanitizeDialogText(s.note, 120)}` : ""}`);
    }
    if (facts.superseded.length > BATCH_LIST_LIMIT) lines.push(`- and ${facts.superseded.length - BATCH_LIST_LIMIT} more (all of them are recorded as superseded)`);
  }
  lines.push(
    "",
    `Reviewer: ${facts.reviewerDid}`,
    `Note (${how}): ${facts.note || "(none)"}`,
    "",
    "This proves a person approved a VS Code dialog; it does not identify who.",
    facts.verdict === "PASS"
      ? "A PASS is current only while the linked commits, their trees and the governance evidence stay as shown; new evidence will need a fresh review. The receipt stays unavailable (#467)."
      : "A VETO blocks this delivery until a later PASS on this commit or a descendant of it names it.",
    "FailSafe records this review in its ledger and the intent history. Nothing leaves this machine.",
  );
  const footer = source === "console" ? LOOPBACK_FOOTER : source === "command-arguments" ? COMMAND_CALL_FOOTER : null;
  return {
    title: DELIVERY_REVIEW_TITLES[facts.verdict],
    approveLabel: facts.verdict === "PASS" ? "Record PASS" : "Record VETO",
    detail: footer ? [...lines, "", footer].join("\n") : lines.join("\n"),
  };
}

/** #531 slice 2: the dialog title for an architecture supersession proposal. */
export const ARCHITECTURE_SUPERSEDE_TITLE = "Propose this architecture supersession?";

/** #531 slice 2: paths up to this length are recorded and shown in full (longer ones are refused). */
export const ARCHITECTURE_PATH_LIMIT = 1024;

/** A registry row as the supersession dialog shows it (server-side facts). */
export interface ArchitectureRowFacts {
  id: string;
  docPath: string | null;
  line: number;
  docSha256: string | null;
}

/** #531 slice 2 (plan-531b LD7): what a supersession proposal records, as the dialog shows it. */
export interface ArchitectureSupersessionFacts {
  action: "register" | "supersede";
  /** The domain through renderDomainForReview; null for an unregistered superseded document. */
  domainShown: string | null;
  /** "request": the operator typed it (register); "index": it is the superseded row's cell. */
  domainSource: "request" | "index";
  status: string | null;
  path: string;
  docSha256: string;
  replaced: ArchitectureRowFacts[];
  successor: ArchitectureRowFacts | null;
  sourceSha: string | null;
  sourceShaReason?: string;
  indexPath: string;
  indexSha256: string | null;
}

function rowLine(label: string, r: ArchitectureRowFacts): string {
  const where = sanitizeDialogText(r.docPath ?? "(no safe link)", ARCHITECTURE_PATH_LIMIT);
  return `${label}: ${sanitizeDialogText(r.id, 120)} ${where} line ${r.line} sha256 ${r.docSha256 ?? "unreadable"}`;
}

/**
 * #531 slice 2 (plan-531b LD7): propose a supersession. Every value is server-side except the
 * domain and status of a registration, which are shown "as requested" and recorded exactly as
 * shown (the route accepts only domains this dialog shows unchanged). Paths are shown in full up to
 * ARCHITECTURE_PATH_LIMIT, the same limit the route records. Always a Console request.
 */
export function architectureSupersessionRequest(facts: ArchitectureSupersessionFacts, operationId: string): OperatorActionRequest {
  const lines = [`Operation: ${operationId}`];
  if (facts.domainShown !== null) {
    lines.push(facts.domainSource === "request"
      ? `Domain (as requested): ${sanitizeDialogText(facts.domainShown, 1100)}`
      : `Domain (from the index): ${sanitizeDialogText(facts.domainShown, 1100)}`);
  }
  if (facts.status) lines.push(`Status (as requested): ${sanitizeDialogText(facts.status)}`);
  for (const r of facts.replaced) lines.push(rowLine("Replaces", r));
  if (facts.successor) lines.push(rowLine("Successor", facts.successor));
  lines.push(
    `${facts.action === "register" ? "Proposed document" : "Superseded document"}: ` +
      `${sanitizeDialogText(facts.path, ARCHITECTURE_PATH_LIMIT)} sha256 ${facts.docSha256}`,
    `Source HEAD: ${facts.sourceSha ?? facts.sourceShaReason ?? "unavailable"}`,
    `Index: ${sanitizeDialogText(facts.indexPath, ARCHITECTURE_PATH_LIMIT)} sha256 ${facts.indexSha256 ?? "unavailable"}`,
    "",
    "FailSafe records this proposal in its ledger and queues it for an L3 decision. Approving the L3 item records the decision; FailSafe never edits the index.",
  );
  return { title: ARCHITECTURE_SUPERSEDE_TITLE, approveLabel: "Propose", detail: withFooter(lines) };
}

/** B311: the heading of the warn-only affected-architecture lines in the L3 dialogs. */
export const L3_ARCHITECTURE_HEADING = "Architecture decisions for these files (warn-only):";

/**
 * B311: the affected-architecture block of l3DecisionRequest and l3BatchRequest (`architecture`:
 * lines from describeAffectedArchitecture, already review text and capped; the batch caller caps
 * them at 10 in total). Without lines the dialogs are unchanged.
 */
function architectureBlock(architecture: string[] | undefined): string[] {
  return architecture && architecture.length ? ["", L3_ARCHITECTURE_HEADING, ...architecture] : [];
}
