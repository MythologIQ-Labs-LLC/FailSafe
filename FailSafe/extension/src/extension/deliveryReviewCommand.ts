/**
 * #532 B320 (plan-b320 LD3): `failsafe.delivery.recordReview` ("FailSafe: Record a Delivery Review").
 *
 * Records a PASS or VETO on one linked commit of the active intent through the same functions as
 * POST /api/actions/delivery/review: the review is built from server state, the operator approves a
 * bound modal VS Code dialog (confirmBoundCommand over the shared confirmer, so the Console routes
 * and this command share one busy guard), and only then are the sealed ledger row and its
 * intent-history mirror written. Confirmation is never skipped.
 *
 * From the command palette it asks for the verdict, one of the linked commits and a note, and
 * (#532 B344) once for each VETO the reviewed commit does not contain, which linked commit reworks
 * it. Any extension can also call the command with arguments ({ verdict, commitSha, note, reworks });
 * those values are shown "as requested" with a footer saying a command call asked, and recorded
 * exactly as shown. Declined, busy, unwired and expired write nothing. Nothing leaves the machine.
 */

import * as vscode from "vscode";
import type { ArchitectureGit } from "../governance/architecture/ArchitectureIndexDiscovery";
import type { DeliveryContext, DeliveryIntents } from "../governance/delivery/deliveryService";
import {
  buildReviewPlan, parseReviewRequest, recordDeliveryReview, REVIEW_NOTE_LIMIT, type RecordHooks, type ReviewRequest,
} from "../governance/delivery/deliveryReview";
import { confirmBoundCommand, deliveryReviewRequest, type ConfirmOperatorAction } from "./operatorConfirmation";

export const DELIVERY_REVIEW_COMMAND = "failsafe.delivery.recordReview";

/** The palette prompts (injectable for tests). Each returns undefined when the operator dismisses it. */
export interface ReviewCommandUi {
  pickVerdict(): Promise<"PASS" | "VETO" | undefined>;
  pickCommit(commits: Array<{ sha: string; label: string }>): Promise<string | undefined>;
  inputNote(): Promise<string | undefined>;
  info(message: string): void;
  /** #532 B344: asked once per VETO that is not in the reviewed commit's history; a linked commit, or undefined to stop. */
  pickRework?(veto: { entryId: number; commitSha: string }, commits: Array<{ sha: string; label: string }>): Promise<string | undefined>;
}

export interface DeliveryReviewCommandDeps {
  workspaceRoot: string;
  intents: DeliveryIntents;
  getLedger: () => unknown;
  /** The shared modal confirmer (bootstrapServers); absent -> unwired, nothing written. */
  confirm: ConfirmOperatorAction | undefined;
  getIndexPathSetting?: () => string | undefined;
  git?: ArchitectureGit;
  ui?: ReviewCommandUi;
  deadlineMs?: number;
  hooks?: RecordHooks;
  broadcast?: (data: Record<string, unknown>) => void;
}

export type DeliveryReviewOutcome =
  | "recorded" | "refused" | "invalid" | "no-active-intent" | "dismissed"
  | "declined" | "busy" | "unwired" | "expired";

export interface DeliveryReviewCommandResult {
  outcome: DeliveryReviewOutcome;
  detail: string;
  status?: number;
  operationId?: string | null;
  reviewId?: string;
  ledgerEntryId?: number;
}

const vscodeUi: ReviewCommandUi = {
  pickVerdict: async () => {
    const pick = await vscode.window.showQuickPick(
      [{ label: "PASS", description: "the implementation on this commit is accepted" }, { label: "VETO", description: "the implementation on this commit is rejected" }],
      { title: "Record a Delivery Review: verdict", ignoreFocusOut: true },
    );
    return pick?.label === "PASS" || pick?.label === "VETO" ? pick.label : undefined;
  },
  pickCommit: async (commits) => {
    const pick = await vscode.window.showQuickPick(commits.map((c) => ({ label: c.label, sha: c.sha })),
      { title: "Record a Delivery Review: linked commit", ignoreFocusOut: true });
    return pick?.sha;
  },
  inputNote: async () => vscode.window.showInputBox({
    title: "Record a Delivery Review: note (optional)", prompt: `At most ${REVIEW_NOTE_LIMIT} characters; recorded exactly as the dialog shows it.`,
    ignoreFocusOut: true,
  }),
  info: (message) => { void vscode.window.showInformationMessage(message); },
  pickRework: async (veto, commits) => {
    const pick = await vscode.window.showQuickPick(commits.map((c) => ({ label: c.label, sha: c.sha })), {
      title: `Record a Delivery Review: which linked commit reworks the VETO in ledger entry #${veto.entryId} (on ${veto.commitSha.slice(0, 12)})?`,
      placeHolder: "Git must show it is that commit amended or rebased; dismiss to record nothing.",
      ignoreFocusOut: true,
    });
    return pick?.sha;
  },
};

const hasArguments = (args: unknown): args is Record<string, unknown> =>
  !!args && typeof args === "object" && ["verdict", "commitSha", "note", "reworks"].some((k) => k in (args as Record<string, unknown>));

/** The command body; registerDeliveryReviewCommand wires it to VS Code. */
export async function runDeliveryReviewCommand(deps: DeliveryReviewCommandDeps, args?: unknown): Promise<DeliveryReviewCommandResult> {
  const ui = deps.ui ?? vscodeUi;
  const finish = (r: DeliveryReviewCommandResult): DeliveryReviewCommandResult => { ui.info(`FailSafe: ${r.detail}`); return r; };
  const active = await deps.intents.getActiveIntent();
  if (!active || active.status === "SEALED") return finish({ outcome: "no-active-intent", detail: "there is no active intent to review." });

  let request: ReviewRequest;
  const source = hasArguments(args) ? "command-arguments" : "command-palette";
  if (source === "command-arguments") {
    const a = args as Record<string, unknown>;
    const parsed = parseReviewRequest({ intentId: active.id, verdict: a.verdict, commitSha: a.commitSha, note: a.note, reworks: a.reworks });
    if (typeof parsed === "string") return finish({ outcome: "invalid", detail: `nothing was recorded: ${parsed}.` });
    request = parsed;
  } else {
    const lookup = await deps.intents.getIntentRecord(active.id);
    const linked = lookup.integrity === "valid" && lookup.record
      ? lookup.record.edges.filter((e) => e.edge === "committed-under") : [];
    if (!linked.length) return finish({ outcome: "refused", detail: "no commit is linked to the active intent; link one in Workspace > Delivery first." });
    const verdict = await ui.pickVerdict();
    if (!verdict) return { outcome: "dismissed", detail: "nothing was recorded." };
    const commitSha = await ui.pickCommit(linked.map((e) => ({ sha: e.target, label: `${e.target.slice(0, 12)} linked ${e.linkedAt}` })));
    if (!commitSha) return { outcome: "dismissed", detail: "nothing was recorded." };
    const note = await ui.inputNote();
    if (note === undefined) return { outcome: "dismissed", detail: "nothing was recorded." };
    request = { intentId: active.id, verdict, commitSha, note };
  }

  const ctx: DeliveryContext = {
    workspaceRoot: deps.workspaceRoot, intents: deps.intents, ledger: deps.getLedger(), git: deps.git,
    indexPathSetting: deps.getIndexPathSetting?.(), now: deps.hooks?.now,
  };
  let built = await buildReviewPlan(ctx, request, ctx.now ? ctx.now() : Date.now());
  // #532 B344: from the palette, a VETO outside the reviewed commit's history is asked about once.
  const asked = new Set<number>();
  while (!built.ok && source === "command-palette" && built.code === "veto-not-ancestor" && built.veto && ui.pickRework && !asked.has(built.veto.entryId)) {
    const veto = built.veto;
    asked.add(veto.entryId);
    const lookup = await deps.intents.getIntentRecord(request.intentId);
    const commits = (lookup.integrity === "valid" && lookup.record ? lookup.record.edges : [])
      .filter((e) => e.edge === "committed-under" && e.target !== veto.commitSha)
      .map((e) => ({ sha: e.target, label: `${e.target.slice(0, 12)} linked ${e.linkedAt}` }));
    const reworkCommit = await ui.pickRework(veto, commits);
    if (!reworkCommit) return { outcome: "dismissed", detail: "nothing was recorded." };
    request = { ...request, reworks: [...(request.reworks ?? []), { vetoEntryId: veto.entryId, reworkCommit }] };
    built = await buildReviewPlan(ctx, request, ctx.now ? ctx.now() : Date.now());
  }
  if (!built.ok) return finish({ outcome: "refused", status: built.status, detail: built.error });
  const confirmed = await confirmBoundCommand(deps.confirm, built.plan, (plan, id) => deliveryReviewRequest(plan, id, source),
    { deadlineMs: deps.deadlineMs });
  if (!confirmed.ok) {
    const text = confirmed.failure === "unwired" ? "operator confirmation is not available; nothing was recorded."
      : confirmed.failure === "busy" ? "another confirmation is open in VS Code; nothing was recorded."
        : confirmed.failure === "expired" ? "the confirmation expired; nothing was recorded. Run the command again to be asked again."
          : "not confirmed in VS Code; nothing was recorded.";
    return finish({ outcome: confirmed.failure, detail: text, operationId: confirmed.operationId });
  }
  const recorded = await recordDeliveryReview(ctx, request, confirmed.bound.operation,
    { operationId: confirmed.bound.operationId, channel: "command" }, deps.hooks);
  const body = recorded.body as { error?: string; reviewId?: string; ledgerEntryId?: number };
  if (recorded.status !== 200) {
    return finish({ outcome: "refused", status: recorded.status, detail: String(body.error ?? "the review was not recorded."), operationId: confirmed.bound.operationId, ledgerEntryId: body.ledgerEntryId });
  }
  deps.broadcast?.({ type: "delivery.changed", intentId: request.intentId });
  return finish({
    outcome: "recorded", status: 200, operationId: confirmed.bound.operationId, reviewId: body.reviewId, ledgerEntryId: body.ledgerEntryId,
    detail: `review ${request.verdict} on ${request.commitSha.slice(0, 12)} recorded as ledger entry #${body.ledgerEntryId}.`,
  });
}

export function registerDeliveryReviewCommand(context: vscode.ExtensionContext, deps: DeliveryReviewCommandDeps): void {
  context.subscriptions.push(vscode.commands.registerCommand(DELIVERY_REVIEW_COMMAND,
    (args?: unknown): Promise<DeliveryReviewCommandResult> => runDeliveryReviewCommand(deps, args)));
}
