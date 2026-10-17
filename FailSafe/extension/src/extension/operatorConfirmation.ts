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

import type { Response } from "express";
import type { L3ApprovalRequest } from "../shared/types/l3-approval";

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
/** Default per-field cap for dialog text. */
export const FIELD_LIMIT = 200;
/** Cap for free-text values the operator records (rollback reason, ratify rationale). */
export const REASON_LIMIT = 500;
const BATCH_LIST_LIMIT = 20;

// C0 + C1 controls, ALM, LRM/RLM, LRE..RLO embeddings/overrides, LRI..PDI isolates.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

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

function withFooter(lines: string[]): string {
  return [...lines, "", LOOPBACK_FOOTER].join("\n");
}

function decisionVerb(decision: "APPROVED" | "REJECTED"): "Approve" | "Reject" {
  return decision === "REJECTED" ? "Reject" : "Approve";
}

export function l3DecisionRequest(item: L3ApprovalRequest, decision: "APPROVED" | "REJECTED"): OperatorActionRequest {
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
    ]),
  };
}

export function l3BatchRequest(items: L3ApprovalRequest[], decision: "APPROVED" | "REJECTED"): OperatorActionRequest {
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

export function rollbackRequest(checkpointId: string, checkpoint: CheckpointSummary, reason: string): OperatorActionRequest {
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
      "Files changed since the checkpoint are reverted.",
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

export type ConfirmationFailure = "unwired" | "busy" | "declined";

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
  return { status: 409, body: { ok: false, confirmation: result, error: "Not confirmed in VS Code; nothing was recorded." } };
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
