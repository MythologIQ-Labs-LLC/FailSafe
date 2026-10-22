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
import type { ReworkEntry } from "../governance/types/IntentTypes";
import { isBookkeepingPath } from "../governance/delivery/reworkBookkeeping";

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

/** B381: the live open state of each confirmer built here, read through an accessor. */
const OPEN_STATE = new WeakMap<ConfirmOperatorAction, () => boolean>();

/** True while a confirmer built by createOperatorConfirmer has its dialog open; false for any other. */
export function isConfirmationOpen(confirm: ConfirmOperatorAction | undefined): boolean {
  return confirm ? OPEN_STATE.get(confirm)?.() === true : false;
}

export function createOperatorConfirmer(window: ConfirmationWindow): ConfirmOperatorAction {
  let open = false;
  const confirm: ConfirmOperatorAction = async (request) => {
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
  OPEN_STATE.set(confirm, () => open);
  return confirm;
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
  /** #532 B344: VETOs superseded by a declared, verified rework. */
  reworks?: ReworkEntry[];
}

/** U+FFFD, what a byte sequence that is not UTF-8 decodes to. */
const REPLACEMENT_CHAR = String.fromCodePoint(0xfffd);
/**
 * Every control, format, unassigned or private-use code point (\p{C}), every space separator
 * (\p{Zs}; U+0020 is kept inside a path), line and paragraph separator, every default-ignorable code
 * point (variation selectors, joiners, fillers), the fillers U+3164, U+FFA0 and U+2800 that render
 * blank, U+FFFD and backslash.
 */
const PATH_ESCAPES = new RegExp(`[\\p{C}\\p{Zs}\\p{Zl}\\p{Zp}\\p{Default_Ignorable_Code_Point}\\u{3164}\\u{FFA0}\\u{2800}\\\\${REPLACEMENT_CHAR}]`, "gu");

/**
 * #532 B344 (plan-b344 LD5, review folds): a path exactly as git names it, with nothing cut or
 * collapsed. Each code point that could reshape, hide or pass for blank space in the dialog is
 * written as \u{XXXX}: controls, format characters, separators, default-ignorable code points,
 * blank fillers, U+FFFD, every space other than U+0020 (U+00A0 looks like U+0020) and a U+0020 at
 * either end of the path (it would not be seen). A backslash is written as \\, so every backslash
 * shown is half of "\\" or starts "\u{". The escaping is injective: two different code point
 * sequences never show the same text. It does not normalize or judge look-alikes: a name in NFC and
 * the same name in NFD, or a Cyrillic letter beside the Latin one it resembles, show different text
 * that can look alike (out of scope, B385). sanitizeDialogText is never used for paths.
 */
export function escapeDialogPath(path: string): string {
  return path.replace(PATH_ESCAPES, (ch: string, at: number) =>
    ch === "\\" ? "\\\\"
      : ch === " " && at > 0 && at < path.length - 1 ? " "
        : `\\u{${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}}`);
}

/**
 * #532 B344 D4 fold: the longest run of a shown path on one dialog line. The owner ruling allows at
 * most 64; 40 because the native dialog cuts a run of 48 wide capitals (M, W) and shows 44.
 */
export const REWORK_PATH_CHUNK = 40;
/**
 * Starts each continuation line of a shown path. In escaped text every backslash is half of "\\" or
 * starts "\u{", so "\>" after a space or at a line start is only ever this marker.
 */
export const REWORK_CONTINUATION = "\\>";
/** One escaped unit: "\\", a "\u{...}" escape or a single code point, never split across chunks. */
const ESCAPED_UNIT = /\\\\|\\u\{[0-9A-F]+\}|[\s\S]/gu;
/** A U+0020 as the escape escapeDialogPath writes for one at a path's edge. */
const SPACE_ESCAPE = "\\u{0020}";

/**
 * #532 B344 D4 fold (owner ruling 2026-10-21): the native dialog wraps only at spaces and cuts a
 * longer unbroken run with an ellipsis, so an escaped path is split into chunks of at most
 * REWORK_PATH_CHUNK characters, after the last '/' that fits when the rest does not, otherwise at the
 * limit, and never inside an escape. A U+0020 at a line's edge would not be seen, so a break is
 * moved back off a U+0020 when it can be; when it cannot (a run of spaces leaves no clean break),
 * the chunk shows each U+0020 at its start or end as \u{0020}, counted in its length. A shown chunk
 * therefore never starts or ends with a U+0020, and every chunk decodes to its part of the path.
 */
export function chunkDialogPath(escaped: string): string[] {
  const units = escaped.match(ESCAPED_UNIT) ?? [];
  const chunks: string[] = [];
  let i = 0;
  while (i < units.length) {
    let j = i;
    let length = 0;
    let lastSlash = -1;
    while (j < units.length && length + units[j].length <= REWORK_PATH_CHUNK) {
      length += units[j].length;
      if (units[j] === "/") lastSlash = j;
      j++;
    }
    if (j < units.length && lastSlash >= i) j = lastSlash + 1;
    let k = j;
    while (k < units.length && k > i + 1 && (units[k - 1] === " " || units[k] === " ")) k--;
    if (!(k < units.length && (units[k - 1] === " " || units[k] === " "))) j = k;
    // Edge spaces shown as \u{0020} are longer; shorten the chunk until it fits again.
    while (j > i + 1 && shownChunk(units.slice(i, j)).length > REWORK_PATH_CHUNK) j--;
    chunks.push(shownChunk(units.slice(i, j)));
    i = j;
  }
  return chunks.length ? chunks : [""];
}

/** The units of one chunk, with each U+0020 at its start or end written as \u{0020}. */
function shownChunk(units: string[]): string {
  let a = 0;
  let b = units.length;
  while (a < b && units[a] === " ") a++;
  while (b > a && units[b - 1] === " ") b--;
  return SPACE_ESCAPE.repeat(a) + units.slice(a, b).join("") + SPACE_ESCAPE.repeat(units.length - b);
}

/** A path line ("    <status> <chunk>") and one continuation line per further chunk. */
function pathLines(status: string, path: string): string[] {
  const [first, ...rest] = chunkDialogPath(escapeDialogPath(path));
  return [`    ${status} ${first}`, ...rest.map((c) => `      ${REWORK_CONTINUATION} ${c}`)];
}

/**
 * #532 B344 (plan-b344 LD5): the "Superseded by rework" section of a review dialog, shown before the
 * supersedes list and never truncated (buildReviewPlan refuses one over REWORK_DIALOG_LIMIT, counted
 * with the chunked paths). Empty when there is no declared rework.
 */
export function reworkSectionLines(reworks: ReworkEntry[]): string[] {
  if (!reworks.length) return [];
  const lines = [`Superseded by rework (${reworks.length}): each declared rework has an identical diff (rebased), or the same parent and more than half of the vetoed commit's non-bookkeeping paths, with at least half of its own among them (amended); bookkeeping files are listed but not counted (a line starting ${REWORK_CONTINUATION} continues the path above it):`];
  for (const r of reworks) {
    const e = r.evidence;
    lines.push(
      `- VETO #${r.vetoEntryId} ${sanitizeDialogText(r.vetoEntryHash, 70)} on ${r.vetoCommit}, superseded by rework ${r.reworkCommit} (${r.relation})`,
      `  Parents: vetoed ${e.vetoParent}, rework ${e.reworkParent}`,
      `  Diff ids: vetoed ${e.vetoDiffId ?? "none"}, rework ${e.reworkDiffId ?? "none"}`,
      `  Paths: the vetoed commit changes ${e.vetoPathCount}, the rework changes ${e.reworkPathCount}`,
    );
    if (r.relation === "amended") {
      const counted = (p: { path: string }): boolean => !isBookkeepingPath(p.path);
      const shared = e.shared.filter(counted);
      const onlyInVeto = e.onlyInVeto.filter(counted);
      const onlyInRework = e.onlyInRework.filter(counted);
      const bookkeeping = [
        ...e.shared.filter((p) => !counted(p)).map((p) => ({ status: `${p.vetoStatus}/${p.reworkStatus}`, path: p.path })),
        ...e.onlyInVeto.filter((p) => !counted(p)).map((p) => ({ status: `${p.status}/-`, path: p.path })),
        ...e.onlyInRework.filter((p) => !counted(p)).map((p) => ({ status: `-/${p.status}`, path: p.path })),
      ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      lines.push(`  Shared (${shared.length}), status in the vetoed commit/the rework:`, ...shared.flatMap((p) => pathLines(`${p.vetoStatus}/${p.reworkStatus}`, p.path)));
      lines.push(`  Only in the vetoed commit (${onlyInVeto.length}):`, ...onlyInVeto.flatMap((p) => pathLines(p.status, p.path)));
      lines.push(`  Only in the rework (${onlyInRework.length}):`, ...onlyInRework.flatMap((p) => pathLines(p.status, p.path)));
      if (bookkeeping.length) {
        lines.push(`  Bookkeeping files, not counted (${bookkeeping.length}), status in the vetoed commit/the rework (- where unchanged):`, ...bookkeeping.flatMap((p) => pathLines(p.status, p.path)));
      }
    }
  }
  return lines;
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
  const reworks = facts.reworks ?? [];
  if (reworks.length) lines.push("", ...reworkSectionLines(reworks));
  if (facts.superseded.length) {
    lines.push("", `Supersedes (${facts.superseded.length}); this PASS clears exactly these and nothing else:`);
    for (const s of facts.superseded.slice(0, BATCH_LIST_LIMIT)) {
      const rework = s.kind === "veto" ? reworks.find((r) => r.vetoEntryId === s.id) : undefined;
      const commit = !s.commitSha ? "commit unknown"
        : rework ? `on ${s.commitSha}, superseded by rework ${rework.reworkCommit} (see above)`
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
      : "A VETO blocks this delivery until a later PASS names it: a PASS on this commit or a descendant of it, or a PASS on a declared rework with this commit's diff (rebased), or with its parent, more than half of its non-bookkeeping paths, and at least half of its own non-bookkeeping paths among them (amended).",
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
